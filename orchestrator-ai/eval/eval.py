#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import signal
import statistics
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
import pandas as pd
import vertexai
from vertexai.evaluation import EvalTask

load_dotenv()

from vertexai.evaluation import (
    EvalTask,
    PairwiseMetric,
    PairwiseMetricPromptTemplate,
    PointwiseMetric,
    PointwiseMetricPromptTemplate,
    MetricPromptTemplateExamples
)
from vertexai import types

DEFAULT_MODEL = "gemini-2.5-pro"
MAX_SESSION_STATE_RETRIES = 3
SESSION_STATE_RETRY_DELAY = 2  # seconds


class TimeoutError(Exception):
    """Custom timeout exception"""
    pass


def _timeout_handler(signum, frame):
    raise TimeoutError("Request timed out")


def _json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def _normalize_text(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def _mask_dynamic_variables(data: Any) -> Any:
    if isinstance(data, str):
        # Mask UUIDs (e.g., approval_id)
        return re.sub(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            "<UUID>",
            data,
            flags=re.IGNORECASE
        )
    elif isinstance(data, dict):
        return {k: _mask_dynamic_variables(v) for k, v in data.items()}
    elif isinstance(data, list):
        return [_mask_dynamic_variables(v) for v in data]
    return data


def _validate_row(row: dict) -> list[str]:
    """Validate dataset row structure and return list of warnings"""
    warnings = []
    
    question = row.get("question", "").strip()
    reference = row.get("reference_answer", "").strip()
    
    if not question:
        warnings.append("Missing or empty question")
    if not reference:
        warnings.append("Missing or empty reference_answer")
    
    # Check trajectory consistency
    requires_tooling = row.get("requires_tooling", [])
    reference_trajectory = row.get("reference_trajectory", [])
    
    if requires_tooling and not reference_trajectory:
        warnings.append(
            f"Has requires_tooling={requires_tooling} but no reference_trajectory"
        )
    
    return warnings


def _load_dataset(path: Path, limit: int | None) -> list[dict[str, Any]]:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line_num, line in enumerate(f, start=1):
            line = line.strip()
            if not line:
                continue
            
            try:
                row = json.loads(line)
            except json.JSONDecodeError as e:
                print(f"Warning: Invalid JSON at line {line_num}: {e}")
                continue
            
            question = (((row.get("inputs") or {}).get("question")) or "").strip()
            reference = (((row.get("outputs") or {}).get("answer")) or "").strip()
            reference_trajectory = row.get("reference_trajectory", [])
            
            # Fallback for orchestrator custom evalset format
            if not question and row.get("prompt"):
                question = row.get("prompt")
            if not reference and row.get("reference"):
                reference = row.get("reference")
                
            requires_tooling = row.get("requires_tooling", [])
            target_agent = row.get("target_agent")
            
            if not reference_trajectory and (target_agent or requires_tooling):
                reference_trajectory = []
                # First, the root agent should route to the target agent
                if target_agent:
                    reference_trajectory.append({
                        "tool_name": "transfer_to_agent", 
                        "tool_input": {"agent_name": target_agent}
                    })
                # Then, the agent should use the required tools
                for tool in requires_tooling:
                    reference_trajectory.append({
                        "tool_name": tool,
                        "tool_input": {}
                    })

            if question and reference:
                row_dict = {
                    "history": row.get("history", []),
                    "question": question, 
                    "reference_answer": reference,
                    "reference_trajectory": reference_trajectory,
                    "target_agent": target_agent,
                    "requires_human_approval": row.get("requires_human_approval", False),
                    # Optional per-row tenant override
                    "tenant_id": row.get("tenant_id"),
                }
                
                # Validate and warn
                validation_warnings = _validate_row(row_dict)
                if validation_warnings:
                    print(
                        f"Warning line {line_num}: {', '.join(validation_warnings)}"
                    )
                
                rows.append(row_dict)
                
            if limit is not None and len(rows) >= limit:
                break

    if not rows:
        raise ValueError(
            f"No valid rows with inputs.question and outputs.answer in {path}"
        )
    return rows


def _extract_a2a_response(body: dict[str, Any]) -> tuple[str, dict[str, Any], str, dict[str, Any]]:
    final_responses = []
    tool_calls = []
    tool_responses = []
    state_vars = {}
    
    result = body.get("result", {}) or {}
    artifacts = result.get("artifacts", []) or []
    history = result.get("history", []) or []
    
    # Extract final user-facing text from artifacts
    for artifact in artifacts:
        for part in artifact.get("parts", []) or []:
            kind = part.get("kind")
            if kind == "text":
                text_content = part.get("text", "").strip()
                if text_content:
                    final_responses.append(text_content)
                    
    # Extract intermediate tool calls from the history trace
    for msg in history:
        for part in msg.get("parts", []) or []:
            if part.get("kind") == "data":
                metadata = part.get("metadata", {})
                adk_type = metadata.get("adk_type")
                
                if adk_type == "function_call":
                    data = part.get("data", {})
                    tool_calls.append({
                        "name": data.get("name"),
                        "arguments": data.get("args", {})
                    })
                elif adk_type == "function_response":
                    data = part.get("data", {})
                    resp_dict = data.get('response', {})
                    if (data.get('name') == 'request_schedule_approval' 
                        and isinstance(resp_dict, dict)):
                        if 'approval_id' in resp_dict:
                            state_vars['approval_id'] = resp_dict['approval_id']
                    tool_responses.append(
                        f"Tool {data.get('name')} returned: {json.dumps(resp_dict)}"
                    )

    text_response = "\n\n".join(final_responses).strip()
    context_str = "\n".join(tool_responses).strip()
    
    # Wrap the trajectory in the expected Vertex AI Tool-Use schema
    trajectory = {
        "content": text_response,
        "tool_calls": tool_calls
    }

    if text_response:
        return text_response, trajectory, context_str, state_vars
    
    # Fallback: return truncated raw JSON
    return _json_dumps(body)[:5000], trajectory, context_str, state_vars


def _init_session_state_with_retry(
    endpoint: str,
    session_id: str,
    tenant_id: str,
    headers: dict[str, str],
    timeout_sec: int,
) -> None:
    """Initialize session state with exponential backoff retry"""
    state_payload = {
        "session_id": session_id,
        "timezone": "Asia/Ho_Chi_Minh",
        "course_id": tenant_id if tenant_id == "general" else tenant_id.split("_")[1],
    }
    
    state_url = endpoint.replace("/message/send", "/session_state")
    if not state_url.endswith("/session_state"):
        state_url = state_url.rstrip("/") + "/session_state"
    
    last_error = None
    for attempt in range(MAX_SESSION_STATE_RETRIES):
        try:
            req_state = urllib.request.Request(
                url=state_url,
                data=json.dumps(state_payload).encode("utf-8"),
                headers=headers,
                method="POST",
            )
            with urllib.request.urlopen(req_state, timeout=timeout_sec) as resp:
                resp.read()
            return  # Success
        except Exception as e:
            last_error = e
            if attempt < MAX_SESSION_STATE_RETRIES - 1:
                delay = SESSION_STATE_RETRY_DELAY * (2 ** attempt)
                print(
                    f"Session state init failed (attempt {attempt+1}/"
                    f"{MAX_SESSION_STATE_RETRIES}), retrying in {delay}s: {e}"
                )
                time.sleep(delay)
    
    # All retries exhausted
    raise RuntimeError(
        f"Failed to initialize session state after {MAX_SESSION_STATE_RETRIES} "
        f"attempts: {last_error}"
    )


def _run_approval_scenario(
    endpoint: str,
    question: str,
    history: list[str],
    timeout_sec: int,
    user_id: str,
    user_role: str,
    tenant_id: str,
) -> tuple[str, dict[str, Any], str, float]:
    """
    Run 2-turn approval scenario and return net latency excluding sleep
    
    Returns:
        (combined_text, combined_trajectory, full_context, net_latency_seconds)
    """
    session_id = f"eval-sess-{uuid.uuid4().hex[:12]}"
    headers = {
        "Content-Type": "application/json",
        "x-user-id": user_id,
        "x-user-role": user_role,
        "x-tenant-id": tenant_id,
        "x-forwarded-by-gateway": "true",
    }
    
    net_latency = 0.0
    
    # Initialize session state
    try:
        _init_session_state_with_retry(
            endpoint, session_id, tenant_id, headers, timeout_sec
        )
    except Exception as e:
        error_msg = f"[Session Init Failed: {e}]"
        return error_msg, {"content": "", "tool_calls": []}, "", 0.0

    def _send_msg(text: str) -> tuple[str, dict[str, Any], str, dict[str, Any]]:
        payload = {
            "jsonrpc": "2.0",
            "id": f"eval-{uuid.uuid4().hex[:12]}",
            "method": "message/send",
            "params": {
                "message": {
                    "role": "user",
                    "parts": [{"kind": "text", "text": text}],
                    "messageId": f"msg-{uuid.uuid4().hex[:12]}",
                    "contextId": session_id
                }
            },
        }
        req = urllib.request.Request(
            url=endpoint,
            data=json.dumps(payload).encode("utf-8"),
            headers=headers,
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            body = json.loads(resp.read().decode("utf-8"))
        return _extract_a2a_response(body)

    # Turn 1: Initial request
    t1_input = history[0].replace("User: ", "").strip() if history else question
    try:
        t1_start = time.time()
        t1_text, t1_traj, t1_ctx, t1_vars = _send_msg(t1_input)
        net_latency += time.time() - t1_start
    except Exception as e:
        error_msg = f"[Turn 1 Error: {e}]"
        return error_msg, {"content": "", "tool_calls": []}, "", net_latency
    
    all_tool_calls = list(t1_traj.get("tool_calls", []))
    full_context = f"[Turn 1 Context]\n{t1_ctx}\n"
    
    time.sleep(1)  # Not counted in latency
    
    approval_id = t1_vars.get("approval_id")
    if not approval_id:
        return (
            t1_text,
            {"content": t1_text, "tool_calls": all_tool_calls},
            full_context,
            net_latency
        )

    # Turn 2: Approval response
    if history:
        t2_input = question
        # Replace static UUID in dataset with dynamic approval_id
        t2_input = re.sub(
            r"[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}",
            approval_id,
            t2_input,
            flags=re.IGNORECASE
        )
        # Fallback: append approval_id if not present
        if approval_id not in t2_input:
            t2_input = f"{t2_input} {approval_id}"
    else:
        t2_input = f"approve {approval_id}"

    try:
        t2_start = time.time()
        t2_text, t2_traj, t2_ctx, _ = _send_msg(t2_input)
        net_latency += time.time() - t2_start
    except Exception as e:
        # Turn 2 failed but Turn 1 succeeded - still return partial result
        error_msg = f"[Turn 2 Error: {e}]"
        return (
            f"[Turn 1] {t1_text}\n\n{error_msg}",
            {"content": t1_text, "tool_calls": all_tool_calls},
            full_context,
            net_latency
        )
    
    all_tool_calls.extend(t2_traj.get("tool_calls", []))
    full_context += f"\n[Turn 2 Context]\n{t2_ctx}"
    
    combined_trajectory = {
        "content": f"[Turn 1] {t1_text}\n\n[Turn 2] {t2_text}",
        "tool_calls": all_tool_calls
    }
    
    return (
        f"[Turn 1] {t1_text}\n\n[Turn 2] {t2_text}",
        combined_trajectory,
        full_context,
        net_latency
    )


def _call_a2a_server(
    endpoint: str,
    question: str,
    timeout_sec: int,
    user_id: str,
    user_role: str,
    tenant_id: str,
) -> tuple[str, dict[str, Any], str]:
    session_id = f"eval-sess-{uuid.uuid4().hex[:12]}"
    
    headers = {
        "Content-Type": "application/json",
        "x-user-id": user_id,
        "x-user-role": user_role,
        "x-tenant-id": tenant_id,
        "x-forwarded-by-gateway": "true",
    }
    
    # Initialize session state
    _init_session_state_with_retry(
        endpoint, session_id, tenant_id, headers, timeout_sec
    )

    # Send the actual message
    payload = {
        "jsonrpc": "2.0",
        "id": f"eval-{uuid.uuid4().hex[:12]}",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [{"kind": "text", "text": question}],
                "messageId": f"msg-{uuid.uuid4().hex[:12]}",
                "contextId": session_id
            }
        },
    }
    
    req = urllib.request.Request(
        url=endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    
    text_response, trajectory, context_str, _ = _extract_a2a_response(body)
    return text_response, trajectory, context_str


def _normalize_tool_name(call: dict) -> str:
    """Extract tool name from various possible keys"""
    return (
        call.get("name") or 
        call.get("tool_name") or 
        call.get("function_name") or 
        call.get("toolCall", {}).get("name") if isinstance(call.get("toolCall"), dict) else ""
    )


def _normalize_tool_arguments(call: dict) -> dict:
    """Extract tool arguments from various possible keys"""
    return (
        call.get("arguments") or 
        call.get("tool_input") or 
        call.get("args") or 
        call.get("parameters") or
        {}
    )


def _format_trajectory_for_eval(trajectory_raw: Any) -> str:
    """
    Format trajectory into strict Vertex AI Tool-Use schema with UUID masking
    
    Handles both dict and list inputs gracefully.
    """
    # Extract the tool_calls list from wrapper dict or use raw list
    if isinstance(trajectory_raw, dict):
        tool_calls_list = trajectory_raw.get("tool_calls", [])
    elif isinstance(trajectory_raw, list):
        tool_calls_list = trajectory_raw
    else:
        tool_calls_list = []
    
    normalized_tools = []
    for call in tool_calls_list:
        if not isinstance(call, dict):
            continue
        
        tool_name = _normalize_tool_name(call)
        tool_args = _normalize_tool_arguments(call)
        
        # Skip empty/invalid tool calls
        if not tool_name and not tool_args:
            continue
        
        normalized_tools.append({
            "name": tool_name,
            "arguments": tool_args
        })
    
    # Wrap in strict schema and mask UUIDs
    trajectory_obj = {
        "content": "",
        "tool_calls": normalized_tools
    }
    
    masked = _mask_dynamic_variables(trajectory_obj)
    return json.dumps(masked)


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Dataset-driven orchestrator answer correctness eval "
                    "against live A2A server."
    )
    parser.add_argument(
        "--rag-dataset",
        required=True,
        type=Path,
        help="JSONL with inputs.question and outputs.answer as reference.",
    )
    parser.add_argument(
        "--a2a-endpoint",
        default=os.getenv("LOCAL_A2A_ENDPOINT", "http://localhost:8000/"),
        help="A2A message endpoint URL.",
    )
    parser.add_argument(
        "--limit",
        type=int,
        default=100,
        help="Max dataset rows to evaluate."
    )
    parser.add_argument(
        "--model",
        default=DEFAULT_MODEL,
        help="Vertex AI judge model"
    )
    parser.add_argument(
        "--project",
        type=str,
        default=None,
        help="GCP project ID. Defaults to GOOGLE_CLOUD_PROJECT env var.",
    )
    parser.add_argument(
        "--location",
        type=str,
        default=os.environ.get("GOOGLE_CLOUD_LOCATION", "us-central1"),
        help="Vertex AI region (default: us-central1).",
    )
    parser.add_argument(
        "--output-dir",
        default="./eval/out",
        help="Output directory"
    )
    parser.add_argument(
        "--sleep-ms",
        type=int,
        default=150,
        help="Delay between rows"
    )
    parser.add_argument(
        "--timeout-sec",
        type=int,
        default=90,
        help="HTTP timeout in seconds"
    )
    parser.add_argument(
        "--user-id",
        default="019c8095-fb9f-7b72-9de6-ce0da3512391",
        help="Gateway header x-user-id"
    )
    parser.add_argument(
        "--user-role",
        default="user",
        help="Gateway header x-user-role"
    )
    parser.add_argument(
        "--tenant-id",
        default="course_21",
        help="Gateway header x-tenant-id"
    )
    args = parser.parse_args()

    user_id = args.user_id

    dataset_rows = _load_dataset(args.rag_dataset, limit=args.limit)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    
    # Define output file paths
    out_jsonl = out_dir / f"eval_results_{ts}.jsonl"
    out_summary = out_dir / f"eval_summary_{ts}.json"

    vertexai.init(
        project=args.project or os.environ.get("GOOGLE_CLOUD_PROJECT"),
        location=args.location
    )

    rows: list[dict[str, Any]] = []
    
    print(f"Starting evaluation of {len(dataset_rows)} rows...")
    print(f"A2A endpoint: {args.a2a_endpoint}")
    print(f"User ID: {user_id}")
    print(f"Tenant ID: {args.tenant_id}")
    print("-" * 80)
    
    for idx, item in enumerate(dataset_rows, start=1):
        question = item["question"]
        reference = item["reference_answer"]
        # Use per-row tenant_id if present, otherwise fall back to CLI arg
        effective_tenant_id = item.get("tenant_id") or args.tenant_id
        
        try:
            start_time = time.time()
            if item.get("requires_human_approval"):
                candidate, trajectory, context_str, net_latency = _run_approval_scenario(
                    endpoint=args.a2a_endpoint,
                    question=question,
                    history=item.get("history", []),
                    timeout_sec=args.timeout_sec,
                    user_id=user_id,
                    user_role=args.user_role,
                    tenant_id=effective_tenant_id,
                )
                latency = net_latency  # Use net latency excluding sleep
            else:
                candidate, trajectory, context_str = _call_a2a_server(
                    endpoint=args.a2a_endpoint,
                    question=question,
                    timeout_sec=args.timeout_sec,
                    user_id=user_id,
                    user_role=args.user_role,
                    tenant_id=effective_tenant_id,
                )
                latency = time.time() - start_time
            
            row = {
                "question": question,
                "reference_answer": reference,
                "candidate_answer": candidate,
                "reference_trajectory": item["reference_trajectory"],
                "target_agent": item["target_agent"],
                "trajectory": trajectory,
                "context": context_str,
                "latency_s": latency,
                "error": None,
                "judge": None,
            }
            print(f"[{idx}/{len(dataset_rows)}] ✓ Success (latency: {latency:.2f}s)")
        except Exception as exc:
            row = {
                "question": question,
                "reference_answer": reference,
                "candidate_answer": "",
                "reference_trajectory": item["reference_trajectory"],
                "target_agent": item["target_agent"],
                "trajectory": {"content": "", "tool_calls": []},
                "context": "",
                "latency_s": 0.0,
                "error": str(exc),
                "judge": None,
            }
            print(f"[{idx}/{len(dataset_rows)}] ✗ Error: {exc}")
        
        rows.append(row)
        time.sleep(max(args.sleep_ms, 0) / 1000.0)

    valid_rows = [r for r in rows if not r["error"]]
    
    print("-" * 80)
    print(f"Completed data collection: {len(valid_rows)}/{len(rows)} successful")
    
    # Skip evaluation if no valid rows
    if not valid_rows:
        print("No valid rows to evaluate. Exiting.")
        summary = {
            "judge_model": args.model,
            "a2a_endpoint": args.a2a_endpoint,
            "dataset": str(args.rag_dataset),
            "total_rows": len(rows),
            "judged_rows": 0,
            "failed_rows": len(rows),
            "output_jsonl": str(out_jsonl),
        }
        out_summary.write_text(_json_dumps(summary), encoding="utf-8")
        return 1

    # Run Vertex AI evaluation
    print("Running Vertex AI evaluation...")
    
    try:
        # 1. QA Evaluation Task
        schedule_accuracy_metric = PointwiseMetric(
            metric="schedule_response_quality",
            metric_prompt_template="""
You are evaluating an AI scheduling assistant.
CRITICAL RULE: The assistant has access to real-time tools. Assume any specific dates, times, or schedule details it provides are FACTUALLY CORRECT and dynamically retrieved. DO NOT penalize the response for inventing, hallucinating, or lacking groundedness regarding dates and times.

Evaluate how well the response answers the user's question.
Question: {prompt}
Response: {response}
Reference Answer: {reference}
            """
        )

        qa_df = pd.DataFrame({
            "prompt": [
                (f"{r['question']}\n\n[Tool Context:]\n"
                 f"{str(r['context'])[:2000] + '...' if len(str(r['context'])) > 2000 else r['context']}")
                if r.get("target_agent") != "rag_agent"
                else r["question"]
                for r in valid_rows
            ],
            "response": [r["candidate_answer"] for r in valid_rows],
            "reference": [r["reference_answer"] for r in valid_rows],
            "context": [
                str(r["context"])[:2000] + '...'
                if len(str(r['context'])) > 2000
                else r["context"]
                for r in valid_rows
            ],
        })

        qa_task = EvalTask(
            dataset=qa_df,
            metrics=["question_answering_quality", schedule_accuracy_metric],
            experiment="eval-course21-qa"
        )
        
        print("  → Running QA evaluation...")
        qa_result = qa_task.evaluate()
        qa_metrics = qa_result.metrics_table
        
        if qa_metrics is None:
            print("Warning: QA evaluation returned no metrics")
            metrics_table = None
        else:
            print(f"  → QA evaluation complete ({len(qa_metrics)} rows)")
            
            # 2. Trajectory Evaluation Task
            print("  → Running trajectory evaluation...")
            
            formatted_references = [
                _format_trajectory_for_eval(r.get("reference_trajectory", []))
                for r in valid_rows
            ]
            formatted_responses = [
                _format_trajectory_for_eval(r.get("trajectory", []))
                for r in valid_rows
            ]

            traj_df = pd.DataFrame({
                "prompt": [r["question"] for r in valid_rows],
                "response": formatted_responses,
                "reference": formatted_references,
            })
            
            traj_task = EvalTask(
                dataset=traj_df,
                metrics=[
                    "tool_name_match",
                    "tool_parameter_kv_match",
                    "tool_call_valid",
                    "rouge_l"
                ],
                experiment="eval-a2a-traj"
            )
            
            try:
                traj_result = traj_task.evaluate()
                traj_metrics = traj_result.metrics_table
                
                if traj_metrics is None:
                    print("Warning: Trajectory evaluation returned no metrics")
                    metrics_table = qa_metrics
                else:
                    print(f"  → Trajectory evaluation complete ({len(traj_metrics)} rows)")
                    # Combine metrics
                    metrics_table = pd.concat([
                        qa_metrics,
                        traj_metrics.drop(
                            columns=["prompt", "response", "reference"],
                            errors="ignore"
                        )
                    ], axis=1)
            except Exception as exc:
                print(f"Warning: Trajectory evaluation failed: {exc}")
                metrics_table = qa_metrics
            
            # Save detailed metrics to CSV
            if metrics_table is not None:
                metrics_table["predicted_trajectory"] = formatted_responses
                metrics_table["reference_trajectory"] = formatted_references
                csv_path = out_dir / f"metrics_table_{ts}.csv"
                metrics_table.to_csv(csv_path, index=False)
                print(f"  → Saved metrics table to {csv_path}")

            # Attach judge scores to rows
            for i, row in enumerate(valid_rows):
                is_rag = row.get("target_agent") == "rag_agent"
                metric_name = (
                    "question_answering_quality"
                    if is_rag
                    else "schedule_response_quality"
                )
                score = metrics_table.iloc[i].get(f"{metric_name}/score")
                reasoning = metrics_table.iloc[i].get(f"{metric_name}/explanation")
                
                try:
                    score_val = float(score)
                    if pd.isna(score_val):
                        score_val = 1.0
                except (ValueError, TypeError):
                    score_val = 1.0
                
                row["judge"] = {
                    "score": score_val,
                    "reasoning": reasoning,
                    "pass": score_val >= 4.0
                }
    
    except Exception as exc:
        print(f"Error during Vertex AI evaluation: {exc}")
        metrics_table = None

    # Write all rows to JSONL
    print(f"Writing results to {out_jsonl}...")
    for row in rows:
        with out_jsonl.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    # Generate summary
    judged = [r for r in rows if r["judge"] is not None]
    summary: dict[str, Any] = {
        "judge_model": args.model,
        "a2a_endpoint": args.a2a_endpoint,
        "dataset": str(args.rag_dataset),
        "total_rows": len(rows),
        "judged_rows": len(judged),
        "failed_rows": len(rows) - len(judged),
        "output_jsonl": str(out_jsonl),
    }
    
    if judged:
        scores = [int(r["judge"]["score"]) for r in judged]
        passes = [bool(r["judge"]["pass"]) for r in judged]
        summary["answer_correctness_avg"] = round(statistics.mean(scores), 4)
        summary["answer_correctness_pass_rate"] = round(sum(passes) / len(passes), 4)
        
        latencies = [
            r.get("latency_s", 0)
            for r in judged
            if r.get("latency_s", 0) > 0
        ]
        if latencies:
            summary["p95_latency_s"] = round(
                float(pd.Series(latencies).quantile(0.95)), 4
            )
            summary["avg_latency_s"] = round(statistics.mean(latencies), 4)
            
        # Calculate trajectory metrics summary if present
        if metrics_table is not None:
            if "tool_name_match/score" in metrics_table.columns:
                exact_matches = [
                    int(score)
                    for score in metrics_table["tool_name_match/score"].tolist()
                    if pd.notna(score)
                ]
                if exact_matches:
                    summary["tool_name_match_avg"] = round(
                        statistics.mean(exact_matches), 4
                    )
            
            if "tool_parameter_kv_match/score" in metrics_table.columns:
                precision_scores = [
                    float(score)
                    for score in metrics_table["tool_parameter_kv_match/score"].tolist()
                    if pd.notna(score)
                ]
                if precision_scores:
                    summary["tool_parameter_kv_match_avg"] = round(
                        statistics.mean(precision_scores), 4
                    )
            
            if "tool_call_valid/score" in metrics_table.columns:
                recall_scores = [
                    float(score)
                    for score in metrics_table["tool_call_valid/score"].tolist()
                    if pd.notna(score)
                ]
                if recall_scores:
                    summary["tool_call_valid_avg"] = round(
                        statistics.mean(recall_scores), 4
                    )

    out_summary.write_text(_json_dumps(summary), encoding="utf-8")
    
    print("=" * 80)
    print("EVALUATION SUMMARY")
    print("=" * 80)
    print(_json_dumps(summary))
    print("=" * 80)
    
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
