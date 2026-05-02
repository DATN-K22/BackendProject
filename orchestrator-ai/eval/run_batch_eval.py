#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
load_dotenv()  # Load .env before any os.getenv() calls

from langsmith import Client


DEFAULT_MODEL = "gpt-4.1-mini"


def _read_text(path: Path) -> str:
    return path.read_text(encoding="utf-8")


def _json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def _extract_user_input(inputs: Any) -> str:
    if isinstance(inputs, dict):
        for key in ("input", "message", "query", "prompt", "text"):
            if isinstance(inputs.get(key), str) and inputs[key].strip():
                return inputs[key].strip()

        msg = inputs.get("message")
        if isinstance(msg, dict):
            parts = msg.get("parts")
            if isinstance(parts, list):
                texts = []
                for p in parts:
                    if isinstance(p, dict) and isinstance(p.get("text"), str):
                        texts.append(p["text"])
                if texts:
                    return "\n".join(texts).strip()
    return _json_dumps(inputs)[:4000]


def _extract_final_output(outputs: Any) -> str:
    if isinstance(outputs, dict):
        for key in ("output", "answer", "text", "response"):
            if isinstance(outputs.get(key), str) and outputs[key].strip():
                return outputs[key].strip()

        result = outputs.get("result")
        if isinstance(result, dict):
            for key in ("output", "answer", "text"):
                if isinstance(result.get(key), str) and result[key].strip():
                    return result[key].strip()
    return _json_dumps(outputs)[:6000]


def _build_tool_trace(client: Client, run_id: str, max_children: int = 80) -> list[dict[str, Any]]:
    children = list(client.list_runs(parent_run_id=run_id, limit=max_children))
    tool_events: list[dict[str, Any]] = []
    for child in children:
        if getattr(child, "run_type", "") != "tool":
            continue
        tool_events.append(
            {
                "name": child.name,
                "start_time": str(getattr(child, "start_time", "")),
                "inputs": getattr(child, "inputs", None),
                "outputs": getattr(child, "outputs", None),
                "error": getattr(child, "error", None),
            }
        )
    return tool_events


def _call_judge_model(
    model: str,
    system_prompt: str,
    schema: dict[str, Any],
    payload: dict[str, Any],
    timeout_sec: int = 90,
) -> dict[str, Any]:
    api_key = os.getenv("OPENAI_API_KEY")
    if not api_key:
        raise RuntimeError("Missing OPENAI_API_KEY for judge model call.")

    body = {
        "model": model,
        "input": [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": _json_dumps(payload)},
        ],
        "text": {
            "format": {
                "type": "json_schema",
                "name": "judge_result",
                "strict": True,
                "schema": schema,
            }
        },
    }

    req = urllib.request.Request(
        url="https://api.openai.com/v1/responses",
        data=json.dumps(body).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
            raw = resp.read().decode("utf-8")
    except urllib.error.HTTPError as e:
        detail = e.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Judge model HTTPError {e.code}: {detail}") from e

    data = json.loads(raw)
    text_out = data.get("output_text")
    if text_out:
        return json.loads(text_out)

    # Fallback: parse text/json from Responses API output blocks.
    for item in data.get("output", []) or []:
        for content in item.get("content", []) or []:
            # Common text block
            candidate = content.get("text")
            if isinstance(candidate, str) and candidate.strip():
                return json.loads(candidate)

            # Some responses expose structured JSON directly
            candidate_json = content.get("json")
            if isinstance(candidate_json, dict):
                return candidate_json

            # Some SDK/API variants use output_text at content level
            candidate_out_text = content.get("output_text")
            if isinstance(candidate_out_text, str) and candidate_out_text.strip():
                return json.loads(candidate_out_text)

    raise RuntimeError(f"Judge response missing parseable text/json output: {raw[:2000]}")


def main() -> int:
    parser = argparse.ArgumentParser(description="Batch LLM-as-a-judge from LangSmith traces.")
    parser.add_argument("--project", required=True, help="LangSmith project name")
    parser.add_argument("--limit", type=int, default=20, help="Number of recent runs to evaluate")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Judge model")
    parser.add_argument("--root-agent-name", default=None, help="Optional filter by root run name")
    parser.add_argument("--output-dir", default="evals/out", help="Output directory")
    parser.add_argument("--sleep-ms", type=int, default=150, help="Delay between judge calls")
    args = parser.parse_args()

    base_dir = Path(__file__).resolve().parent
    system_prompt = _read_text(base_dir / "judge_prompt.txt")
    schema = json.loads(_read_text(base_dir / "judge_schema.json"))

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    out_jsonl = out_dir / f"judge_results_{ts}.jsonl"
    out_summary = out_dir / f"judge_summary_{ts}.json"

    client = Client()

    # Root traces: parent_run_id is None
    runs = list(client.list_runs(project_name=args.project, limit=args.limit))
    if args.root_agent_name:
        runs = [r for r in runs if getattr(r, "name", "") == args.root_agent_name]

    if not runs:
        print("No runs found with given filters.", file=sys.stderr)
        return 1

    rows: list[dict[str, Any]] = []
    for idx, run in enumerate(runs, start=1):
        run_id = str(run.id)
        user_input = _extract_user_input(getattr(run, "inputs", {}))
        final_output = _extract_final_output(getattr(run, "outputs", {}))
        tool_events = _build_tool_trace(client, run_id)

        judge_input = {
            "run_id": run_id,
            "run_name": getattr(run, "name", ""),
            "start_time": str(getattr(run, "start_time", "")),
            "user_input": user_input,
            "final_output": final_output,
            "tool_events": tool_events,
        }

        try:
            judge = _call_judge_model(
                model=args.model,
                system_prompt=system_prompt,
                schema=schema,
                payload=judge_input,
            )
            error = None
        except Exception as e:  # noqa: BLE001
            judge = None
            error = str(e)

        row = {
            "run_id": run_id,
            "run_name": getattr(run, "name", ""),
            "judge": judge,
            "error": error,
        }
        rows.append(row)
        with out_jsonl.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

        print(f"[{idx}/{len(runs)}] run_id={run_id} done")
        time.sleep(max(args.sleep_ms, 0) / 1000.0)

    valid = [r for r in rows if r["judge"] is not None]
    summary: dict[str, Any] = {
        "project": args.project,
        "model": args.model,
        "total_runs": len(rows),
        "valid_judged_runs": len(valid),
        "failed_runs": len(rows) - len(valid),
        "output_jsonl": str(out_jsonl),
    }

    if valid:
        metrics = ["routing_correctness", "tool_use_correctness", "groundedness", "policy_safety"]
        for m in metrics:
            vals = [r["judge"][m]["score"] for r in valid if m in r["judge"]]
            if vals:
                summary[f"{m}_avg"] = round(statistics.mean(vals), 4)

        overall_vals = [r["judge"]["overall"]["score"] for r in valid if "overall" in r["judge"]]
        if overall_vals:
            summary["overall_avg"] = round(statistics.mean(overall_vals), 4)

        pass_vals = [bool(r["judge"]["overall"]["pass"]) for r in valid if "overall" in r["judge"]]
        if pass_vals:
            summary["pass_rate"] = round(sum(pass_vals) / len(pass_vals), 4)

    out_summary.write_text(_json_dumps(summary), encoding="utf-8")
    print(_json_dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
