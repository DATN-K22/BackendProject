#!/usr/bin/env python3
"""Run Vertex AI agent evaluation for the A2A orchestrator system.

Implements the flow from Vertex docs:
1) Generate responses with `client.evals.run_inference(...)` (preferred)
2) Evaluate with `client.evals.create_evaluation_run(...)`

Also supports a local A2A endpoint fallback for response generation when an
Agent Engine resource is not available yet.
"""

from __future__ import annotations

import argparse
import json
import os
import re
import sys
import uuid
from pathlib import Path
from typing import Any

import pandas as pd
import requests

try:
    from vertexai import Client, types
except Exception as exc:  # pragma: no cover
    raise RuntimeError(
        "vertexai SDK is not installed. Install with: "
        "pip install 'google-cloud-aiplatform[agent_engines]'"
    ) from exc

try:
    from langsmith.run_helpers import get_current_run_tree, traceable
except Exception:  # pragma: no cover
    def get_current_run_tree() -> Any:
        return None

    def traceable(*args: Any, **kwargs: Any):  # type: ignore
        def _decorator(fn):
            return fn
        return _decorator


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Run Vertex agent evaluation end-to-end.")

    parser.add_argument(
        "--dataset",
        type=Path,
        default=Path("orchestrator-ai/eval/data/vertex_eval_dataset_chat.jsonl"),
        help="Path to input dataset JSONL.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("orchestrator-ai/eval/out"),
        help="Directory for output artifacts.",
    )

    parser.add_argument("--project-id", default=os.getenv("GOOGLE_CLOUD_PROJECT"), help="Google Cloud project ID.")
    parser.add_argument("--location", default=os.getenv("GOOGLE_CLOUD_LOCATION", "us-central1"), help="Vertex location.")
    parser.add_argument(
        "--credentials",
        default=os.getenv("GOOGLE_APPLICATION_CREDENTIALS"),
        help="Path to service-account JSON. Optional if ADC is already configured.",
    )

    parser.add_argument(
        "--agent-engine-resource",
        default=os.getenv("AGENT_ENGINE_RESOURCE_NAME"),
        help="Deployed Agent Engine resource name for run_inference (preferred path).",
    )
    parser.add_argument(
        "--local-a2a-endpoint",
        default=os.getenv("LOCAL_A2A_ENDPOINT"),
        help="Fallback local A2A endpoint (e.g. http://localhost:3007/). Used only if --agent-engine-resource is unset.",
    )

    parser.add_argument(
        "--metrics",
        default="FINAL_RESPONSE_QUALITY,TOOL_USE_QUALITY,HALLUCINATION",
        help="Comma-separated managed rubric metrics.",
    )
    parser.add_argument(
        "--eval-run-name",
        default=f"a2a-eval-{uuid.uuid4().hex[:8]}",
        help="Evaluation run display name.",
    )
    parser.add_argument(
        "--eval-dest",
        default=os.getenv("VERTEX_EVAL_DEST"),
        help=(
            "Required GCS URI prefix to store evaluation artifacts, "
            "for example gs://my-bucket/vertex-evals"
        ),
    )
    parser.add_argument(
        "--session-inputs-json",
        default=None,
        help="Optional JSON object passed as session_inputs for each row during run_inference.",
    )
    parser.add_argument(
        "--skip-inference",
        action="store_true",
        help="Skip run_inference and evaluate dataset as-is (expects response already present).",
    )

    return parser.parse_args()


def load_dataset(path: Path) -> pd.DataFrame:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")
    rows: list[dict[str, Any]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            rows.append(json.loads(line))
    if not rows:
        raise ValueError(f"Dataset is empty: {path}")
    df = pd.DataFrame(rows)
    if "prompt" not in df.columns:
        raise ValueError("Dataset must include `prompt` column.")
    if "history" not in df.columns:
        # Keep compatibility with older datasets.
        df["history"] = [[] for _ in range(len(df))]
    if "response" not in df.columns:
        df["response"] = ""
    return df


def save_jsonl(df: pd.DataFrame, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    with path.open("w", encoding="utf-8") as f:
        for row in df.to_dict(orient="records"):
            f.write(json.dumps(row, ensure_ascii=True) + "\n")


def _resolve_metric_objects(metric_names: list[str]) -> list[Any]:
    resolved: list[Any] = []
    for name in metric_names:
        key = name.strip().upper()
        if not key:
            continue
        try:
            resolved.append(getattr(types.RubricMetric, key))
        except AttributeError:
            print(f"[warn] Unknown managed metric '{key}', skipping.", file=sys.stderr)
    if not resolved:
        raise ValueError("No valid metrics resolved from --metrics.")
    return resolved


def _extract_text_response(result_obj: dict[str, Any]) -> str:
    """Extract best-effort text from an A2A JSON-RPC result payload."""
    result = result_obj.get("result", {})
    artifacts = result.get("artifacts", [])
    chunks: list[str] = []
    for artifact in artifacts:
        for part in artifact.get("parts", []):
            if part.get("kind") == "text" and isinstance(part.get("text"), str):
                chunks.append(part["text"])
    if chunks:
        return "\n".join(chunks).strip()
    # fallback to status state text if no artifact text
    state = result.get("status", {}).get("state")
    if isinstance(state, str):
        return state
    return ""


def _extract_trace_input(result_obj: dict[str, Any]) -> str:
    """Extract the effective user input from A2A result history."""
    history = result_obj.get("result", {}).get("history", [])
    if not isinstance(history, list):
        return ""
    for msg in history:
        if msg.get("role") != "user":
            continue
        parts = msg.get("parts", [])
        texts: list[str] = []
        for part in parts:
            if part.get("kind") == "text" and isinstance(part.get("text"), str):
                texts.append(part["text"])
        if texts:
            return "\n".join(texts).strip()
    return ""


def _extract_tool_trace(result_obj: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    """Extract tool calls and tool results from A2A result history."""
    history = result_obj.get("result", {}).get("history", [])
    if not isinstance(history, list):
        return [], []

    tool_calls: list[dict[str, Any]] = []
    tool_results: list[dict[str, Any]] = []
    for msg in history:
        if msg.get("role") != "agent":
            continue
        for part in msg.get("parts", []):
            if part.get("kind") != "data":
                continue
            metadata = part.get("metadata", {}) or {}
            adk_type = metadata.get("adk_type")
            data = part.get("data", {}) or {}

            if adk_type == "function_call":
                tool_calls.append(
                    {
                        "id": data.get("id"),
                        "name": data.get("name"),
                        "args": data.get("args", {}),
                    }
                )
            elif adk_type == "function_response":
                tool_results.append(
                    {
                        "id": data.get("id"),
                        "name": data.get("name"),
                        "response": data.get("response", {}),
                    }
                )
    return tool_calls, tool_results


def _attach_trace_fields_from_a2a_body(row: dict[str, Any], body: dict[str, Any]) -> None:
    """Populate trace columns required by evaluation dataset enrichment."""
    tool_calls, tool_results = _extract_tool_trace(body)
    output_text = _extract_text_response(body)

    row["trace_input"] = _extract_trace_input(body) or row.get("prompt", "")
    row["trace_tool_calls"] = tool_calls
    row["trace_tool_results"] = tool_results
    row["trace_output"] = output_text
    row["predicted_trajectory"] = [c.get("name") for c in tool_calls if c.get("name")]
    metadata = body.get("result", {}).get("metadata", {}) or {}
    row["adk_invocation_id"] = metadata.get("adk_invocation_id")
    row["adk_event_id"] = metadata.get("adk_event_id")
    row["adk_session_id"] = metadata.get("adk_session_id")


def _current_langsmith_context() -> dict[str, Any]:
    run_tree = get_current_run_tree()
    if not run_tree:
        return {}
    ctx: dict[str, Any] = {
        "langsmith_run_id": str(getattr(run_tree, "id", "")) or None,
        "langsmith_trace_id": str(getattr(run_tree, "trace_id", "")) or None,
    }
    to_headers = getattr(run_tree, "to_headers", None)
    if callable(to_headers):
        ctx["trace_headers"] = to_headers()
    get_url = getattr(run_tree, "get_url", None)
    if callable(get_url):
        try:
            ctx["langsmith_run_url"] = get_url()
        except Exception:
            pass
    return ctx


@traceable(name="a2a_eval_http_call")
def _traced_a2a_post(
    *,
    url: str,
    payload: dict[str, Any],
    headers: dict[str, str],
    timeout: int,
) -> dict[str, Any]:
    ctx = _current_langsmith_context()
    req_headers = dict(headers)
    trace_headers = ctx.get("trace_headers", {}) or {}
    for name, value in trace_headers.items():
        if value and name not in req_headers:
            req_headers[name] = value
    response = requests.post(url, json=payload, headers=req_headers, timeout=timeout)
    response.raise_for_status()
    return {
        "body": response.json(),
        "langsmith": {
            "langsmith_run_id": ctx.get("langsmith_run_id"),
            "langsmith_trace_id": ctx.get("langsmith_trace_id"),
            "langsmith_run_url": ctx.get("langsmith_run_url"),
        },
    }


def _run_local_a2a_inference(
    df: pd.DataFrame,
    endpoint: str,
) -> pd.DataFrame:
    endpoint = endpoint.rstrip("/")
    url = endpoint if endpoint.endswith("/") else endpoint + "/"
    records = df.to_dict(orient="records")
    
    for i, row in enumerate(records):
            payload = {
                "jsonrpc": "2.0",
                "id": f"eval-{i+1}",
                "method": "message/send",
                "params": {
                    "message": {
                        "role": "user",
                        "parts": [{"kind": "text", "text": row.get("prompt", "")}],
                        "messageId": f"msg-{uuid.uuid4().hex[:12]}",
                    }
                },
            }
            # Gateway headers expected by your middleware
            headers = {
                "content-type": "application/json",
                "x-user-id": "019c0d0e-e9c7-7b72-8fa8-cd37186c6974",
                "x-user-role": "student",
                "x-tenant-id": "course_21",
                "x-forwarded-by-gateway": "true",
            }
            if row.get("history"):
                # Local fallback currently ignores history replay; kept explicit for visibility.
                # row.setdefault("warnings", []).append(
                #     "history_ignored_in_local_a2a_fallback"
                # )
                for i in range(len(row["history"])):
                    history_text = row["history"][i] if isinstance(row["history"], list) and len(row["history"]) > 0 else str(row["history"])
                    print(f"[info] Sending history for row {i+1}: {history_text}")
                    history_text = re.sub(r"User:\s*", "", history_text, flags=re.IGNORECASE).strip()
                    historyPayload = {
                        "jsonrpc": "2.0",
                        "id": f"eval-{i+1}",
                        "method": "message/send",
                        "params": {
                            "message": {
                                "role": "user",
                                "parts": [{"kind": "text", "text": history_text}],
                                "messageId": f"msg-{uuid.uuid4().hex[:12]}",
                            }
                        },
                    }
                    history_result = _traced_a2a_post(
                        url=url,
                        payload=historyPayload,
                        headers=headers,
                        timeout=120,
                    )
                    history_body = history_result["body"]
                    context_id = history_body.get("result", {}).get("context_id")
                    if context_id:
                        payload["params"]["context_id"] = context_id
                    task_id = history_body.get("result", {}).get("task_id")
                    if task_id:
                        payload["params"]["task_id"] = task_id
                

                
            logging_info = {
                "message": row.get("prompt", ""),
                "endpoint": url,
                "payload": payload,
            }
            print(f"[info] Sending inference request: {json.dumps(logging_info)}")
            result = _traced_a2a_post(
                url=url,
                payload=payload,
                headers=headers,
                timeout=120,
            )
            body = result["body"]
            ls = result.get("langsmith", {})

            row["response"] = _extract_text_response(body)
            row["intermediate_events"] = body.get("result", {}).get("intermediate_events", [])
            _attach_trace_fields_from_a2a_body(row, body)
            row["langsmith_run_id"] = ls.get("langsmith_run_id")
            row["langsmith_trace_id"] = ls.get("langsmith_trace_id")
            row["langsmith_run_url"] = ls.get("langsmith_run_url")

    return pd.DataFrame(records)


def _ensure_trace_columns(df: pd.DataFrame) -> pd.DataFrame:
    """Ensure trace columns always exist for downstream eval/reporting."""
    out = df.copy()
    if "trace_input" not in out.columns:
        out["trace_input"] = out.get("prompt", "")
    if "trace_output" not in out.columns:
        out["trace_output"] = out.get("response", "")
    if "trace_tool_calls" not in out.columns:
        out["trace_tool_calls"] = [[] for _ in range(len(out))]
    if "trace_tool_results" not in out.columns:
        out["trace_tool_results"] = [[] for _ in range(len(out))]
    if "predicted_trajectory" not in out.columns:
        out["predicted_trajectory"] = [[] for _ in range(len(out))]
    return out


def main() -> None:
    args = parse_args()

    if not args.project_id:
        raise ValueError("Missing --project-id (or GOOGLE_CLOUD_PROJECT).")
    if not args.eval_dest:
        raise ValueError(
            "Missing --eval-dest (or VERTEX_EVAL_DEST). "
            "Example: --eval-dest gs://my-bucket/vertex-evals"
        )
    if not str(args.eval_dest).startswith("gs://"):
        raise ValueError("--eval-dest must be a GCS URI prefix starting with gs://")
    if args.credentials:
        os.environ["GOOGLE_APPLICATION_CREDENTIALS"] = args.credentials
    os.environ["GOOGLE_CLOUD_PROJECT"] = args.project_id
    os.environ["GOOGLE_CLOUD_LOCATION"] = args.location
    os.environ["GOOGLE_GENAI_USE_VERTEXAI"] = "True"

    args.output_dir.mkdir(parents=True, exist_ok=True)

    dataset_df = load_dataset(args.dataset)
    print(f"[info] Loaded {len(dataset_df)} rows from {args.dataset}")

    client = Client(project=args.project_id, location=args.location)
    metric_names = [m.strip() for m in args.metrics.split(",")]
    metrics = _resolve_metric_objects(metric_names)

    inference_df = dataset_df.copy()
    if args.skip_inference:
        print("[info] Skipping inference; using existing `response` values.")
    else:
        if args.agent_engine_resource:
            session_inputs = None
            if args.session_inputs_json:
                session_inputs = json.loads(args.session_inputs_json)
            if session_inputs is not None:
                inference_df["session_inputs"] = [session_inputs] * len(inference_df)

            print("[info] Running inference via Agent Engine resource...")
            inference_df = client.evals.run_inference(
                agent=args.agent_engine_resource,
                src=inference_df,
            )
        elif args.local_a2a_endpoint:
            print("[info] Running inference via local A2A endpoint fallback...")
            inference_df = _run_local_a2a_inference(
                inference_df,
                endpoint=args.local_a2a_endpoint,
            )
        else:
            raise ValueError(
                "No inference source configured. Set --agent-engine-resource "
                "(preferred) or --local-a2a-endpoint, or pass --skip-inference."
            )

    inference_df = _ensure_trace_columns(inference_df)

    inferred_path = args.output_dir / "dataset_with_inference.jsonl"
    save_jsonl(inference_df, inferred_path)
    print(f"[info] Saved inference dataset to {inferred_path}")
    
    if isinstance(inference_df, pd.DataFrame):
            eval_dataset = types.EvaluationDataset(eval_dataset_df=inference_df)
    else:
        # Nếu đi qua run_inference của SDK, nó đã là EvaluationDataset sẵn rồi
        eval_dataset = inference_df
    print("[info] Running Vertex evaluation...")
    evaluation_run = client.evals.create_evaluation_run(
        dataset=eval_dataset,
        dest=args.eval_dest.rstrip("/"),
        metrics=metrics,
        display_name=args.eval_run_name,
    )

    # Persist minimal metadata + best-effort printable report.
    meta = {
        "project_id": args.project_id,
        "location": args.location,
        "eval_run_name": args.eval_run_name,
        "eval_dest": args.eval_dest,
        "metrics": metric_names,
    }
    meta_path = args.output_dir / "evaluation_run_meta.json"
    meta_path.write_text(json.dumps(meta, ensure_ascii=True, indent=2), encoding="utf-8")
    print(f"[info] Saved evaluation metadata to {meta_path}")

    report_path = args.output_dir / "evaluation_report.txt"
    with report_path.open("w", encoding="utf-8") as f:
        f.write(str(evaluation_run))
        f.write("\n")
    print(f"[info] Saved evaluation report snapshot to {report_path}")

    # Try common rendering methods for notebooks / local scripts.
    if hasattr(evaluation_run, "show"):
        try:
            evaluation_run.show()
        except Exception:
            pass

    print("[done] Evaluation run completed.")


if __name__ == "__main__":
    main()
