#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import os
import re
import statistics
import time
import urllib.error
import urllib.request
import uuid
from pathlib import Path
from typing import Any

from dotenv import load_dotenv
from langchain_google_genai import ChatGoogleGenerativeAI
from langchain_core.messages import HumanMessage, SystemMessage

load_dotenv()

DEFAULT_MODEL = "gemini-2.5-pro"

ANSWER_CORRECTNESS_PROMPT = """###Task Description:
An instruction (might include an Input inside it), a response to evaluate, a reference answer that gets a score of 5, and a score rubric representing a evaluation criteria are given.
1. Write a detailed feedback that assess the quality of the response strictly based on the given score rubric, not evaluating in general.
2. After writing a feedback, write a score that is an integer between 1 and 5. You should refer to the score rubric.
3. The output format should look as follows: "Feedback: {{write a feedback for criteria}} [RESULT] {{an integer number between 1 and 5}}"
4. Please do not generate any other opening, closing, and explanations. Be sure to include [RESULT] in your output.

###The instruction to evaluate:
{instruction}

###Response to evaluate:
{response}

###Reference Answer (Score 5):
{reference_answer}

###Score Rubrics:
[Is the response correct, accurate, and factual based on the reference answer?]
Score 1: The response is completely incorrect, inaccurate, and/or not factual.
Score 2: The response is mostly incorrect, inaccurate, and/or not factual.
Score 3: The response is somewhat correct, accurate, and/or factual.
Score 4: The response is mostly correct, accurate, and factual.
Score 5: The response is completely correct, accurate, and factual.

###Feedback:
"""


def _json_dumps(data: Any) -> str:
    return json.dumps(data, ensure_ascii=False, indent=2)


def _normalize_text(text: str) -> str:
    text = text.strip().lower()
    text = re.sub(r"\s+", " ", text)
    return text


def _load_dataset(path: Path, limit: int | None) -> list[dict[str, str]]:
    if not path.exists():
        raise FileNotFoundError(f"Dataset not found: {path}")

    rows: list[dict[str, str]] = []
    with path.open("r", encoding="utf-8") as f:
        for line in f:
            line = line.strip()
            if not line:
                continue
            row = json.loads(line)
            question = (((row.get("inputs") or {}).get("question")) or "").strip()
            reference = (((row.get("outputs") or {}).get("answer")) or "").strip()
            if question and reference:
                rows.append({"question": question, "reference_answer": reference})
            if limit is not None and len(rows) >= limit:
                break

    if not rows:
        raise ValueError(f"No valid rows with inputs.question and outputs.answer in {path}")
    return rows


def _extract_a2a_response_text(body: dict[str, Any]) -> str:
    result = body.get("result", {}) or {}
    artifacts = result.get("artifacts", []) or []
    chunks: list[str] = []
    for artifact in artifacts:
        for part in artifact.get("parts", []) or []:
            if part.get("kind") == "text" and isinstance(part.get("text"), str):
                chunks.append(part["text"])
    if chunks:
        return "\n".join(chunks).strip()
    return _json_dumps(body)[:5000]


def _call_a2a_server(
    endpoint: str,
    question: str,
    timeout_sec: int,
    user_id: str,
    user_role: str,
    tenant_id: str,
) -> str:
    payload = {
        "jsonrpc": "2.0",
        "id": f"eval-{uuid.uuid4().hex[:12]}",
        "method": "message/send",
        "params": {
            "message": {
                "role": "user",
                "parts": [{"kind": "text", "text": question}],
                "messageId": f"msg-{uuid.uuid4().hex[:12]}",
            }
        },
    }
    headers = {
        "Content-Type": "application/json",
        "x-user-id": user_id,
        "x-user-role": user_role,
        "x-tenant-id": tenant_id,
        "x-forwarded-by-gateway": "true",
    }
    req = urllib.request.Request(
        url=endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers=headers,
        method="POST",
    )
    with urllib.request.urlopen(req, timeout=timeout_sec) as resp:
        body = json.loads(resp.read().decode("utf-8"))
    return _extract_a2a_response_text(body)


def _call_judge_model(
    model: str,
    prompt: str,
    project: str | None = None,
    location: str = "us-central1",
    timeout_sec: int = 90,
) -> dict[str, Any]:
    llm = ChatGoogleGenerativeAI(
        model=model,
        temperature=0.0,
        vertexai=True,
        project=project or os.environ.get("GOOGLE_CLOUD_PROJECT"),
        location=location,
        request_timeout=timeout_sec,
    )
    messages = [
        SystemMessage(content="You are a fair evaluator language model."),
        HumanMessage(content=prompt),
    ]
    response = llm.invoke(messages)
    content = response.content

    if "[RESULT]" not in content:
        raise RuntimeError(f"Judge response missing [RESULT]: {content[:1200]}")

    feedback, _, score_part = content.partition("[RESULT]")
    feedback = feedback.replace("Feedback:", "").strip()
    try:
        score = int(score_part.strip())
    except ValueError:
        score = 1
    return {"score": score, "reasoning": feedback, "pass": score >= 4}


def main() -> int:
    parser = argparse.ArgumentParser(
        description="Dataset-driven orchestrator answer correctness eval against live A2A server."
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
    parser.add_argument("--limit", type=int, default=50, help="Max dataset rows to evaluate.")
    parser.add_argument("--model", default=DEFAULT_MODEL, help="Vertex AI judge model")
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
    parser.add_argument("--output-dir", default="orchestrator-ai/eval/out", help="Output directory")
    parser.add_argument("--sleep-ms", type=int, default=150, help="Delay between rows")
    parser.add_argument("--timeout-sec", type=int, default=90, help="HTTP timeout in seconds")
    parser.add_argument("--user-id", default="eval-user", help="Gateway header x-user-id")
    parser.add_argument("--user-role", default="student", help="Gateway header x-user-role")
    parser.add_argument("--tenant-id", default="course_21", help="Gateway header x-tenant-id")
    args = parser.parse_args()

    dataset_rows = _load_dataset(args.rag_dataset, limit=args.limit)

    out_dir = Path(args.output_dir)
    out_dir.mkdir(parents=True, exist_ok=True)
    ts = time.strftime("%Y%m%d-%H%M%S")
    out_jsonl = out_dir / f"course21_eval_langsmith.jsonl"
    out_summary = out_dir / f"answer_correctness_summary_{ts}.json"

    rows: list[dict[str, Any]] = []
    for idx, item in enumerate(dataset_rows, start=1):
        question = item["question"]
        reference = item["reference_answer"]
        try:
            candidate = _call_a2a_server(
                endpoint=args.a2a_endpoint,
                question=question,
                timeout_sec=args.timeout_sec,
                user_id="019c8095-fb9f-7b72-9de6-ce0da3512391",
                user_role="user",
                tenant_id=args.tenant_id,
            )
            eval_prompt = ANSWER_CORRECTNESS_PROMPT.format(
                instruction=question,
                response=candidate,
                reference_answer=reference,
            )
            judge = _call_judge_model(
                model=args.model,
                prompt=eval_prompt,
                project=args.project,
                location=args.location,
                timeout_sec=args.timeout_sec,
            )
            row = {
                "question": question,
                "reference_answer": reference,
                "candidate_answer": candidate,
                "judge": judge,
                "error": None,
            }
        except Exception as exc:  # noqa: BLE001
            row = {
                "question": question,
                "reference_answer": reference,
                "candidate_answer": "",
                "judge": None,
                "error": str(exc),
            }
        rows.append(row)
        with out_jsonl.open("a", encoding="utf-8") as f:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")
        print(f"[{idx}/{len(dataset_rows)}] done")
        time.sleep(max(args.sleep_ms, 0) / 1000.0)

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

    out_summary.write_text(_json_dumps(summary), encoding="utf-8")
    print(_json_dumps(summary))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
