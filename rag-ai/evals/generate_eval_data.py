from __future__ import annotations

import argparse
import hashlib
import json
import random
import sys
from dataclasses import asdict, dataclass
from pathlib import Path
from dotenv import load_dotenv

load_dotenv()
import os
from langchain_google_genai import ChatGoogleGenerativeAI
from pydantic import BaseModel, Field

REPO_PY_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_PY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_PY_ROOT))

from ingestion.chunking.text_chunker import FixedWindowChunker  # noqa: E402
from ingestion.file_loader import FileLoader  # noqa: E402
from ingestion.models.document import DocumentBlob, TextChunk  # noqa: E402


# ---------------------------------------------------------------------------
# Data models
# ---------------------------------------------------------------------------

@dataclass
class QASample:
    course_id: str
    question: str
    answer: str
    context: str
    source_doc: str
    document_id: str
    page_number: int | None
    chunk_id: str
    groundedness_score: int | None = None
    groundedness_eval: str | None = None
    relevance_score: int | None = None
    relevance_eval: str | None = None
    standalone_score: int | None = None
    standalone_eval: str | None = None


# ---------------------------------------------------------------------------
# Prompts
# ---------------------------------------------------------------------------

QA_GENERATION_PROMPT = """You are helping build an evaluation dataset for a RAG system.
Given the context, generate exactly one factoid question-answer pair that is explicitly supported by the context.

Rules:
- The question must be specific and answerable from the context alone.
- The answer must be short (max 80 words), factual, and copied/paraphrased from context only.
- Do not invent information not present in context.

Context:
{context}
"""

GROUNDEDNESS_CRITIQUE_PROMPT = """You will be given a context and a question.
Score how well the question is answerable from the context, from 1 to 5.

Context:
{context}

Question:
{question}
"""

RELEVANCE_CRITIQUE_PROMPT = """You will be given a question.
Score how relevant this question is for an AWS learning dataset, from 1 to 5.

Question:
{question}
"""

STANDALONE_CRITIQUE_PROMPT = """You will be given a question.
Score how standalone and unambiguous the question is without extra conversation context, from 1 to 5.

Question:
{question}
"""


# ---------------------------------------------------------------------------
# Pydantic output schemas
# ---------------------------------------------------------------------------

class QAGeneration(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class CritiqueResult(BaseModel):
    evaluation: str = Field(min_length=1)
    score: int = Field(ge=1, le=5)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _stable_document_id(path: Path, course_id: str) -> str:
    """Return a stable, human-readable document ID scoped to a course."""
    stem = path.stem.strip()
    leading = stem.split("_", 1)[0]
    if leading.isdigit():
        return f"{course_id}-doc-{int(leading)}"
    return hashlib.sha1(str(path).encode("utf-8")).hexdigest()[:16]


def _load_chunks(
    course_dir: Path,
    course_id: str,
    chunk_size: int,
    overlap: int,
) -> list[TextChunk]:
    """Load and chunk all PDFs found recursively under *course_dir*."""
    loader = FileLoader()
    chunker = FixedWindowChunker(chunk_size=chunk_size, overlap=overlap)
    chunks: list[TextChunk] = []

    for pdf_path in sorted(course_dir.rglob("*.pdf")):
        content = pdf_path.read_bytes()
        doc_id = _stable_document_id(pdf_path, course_id)
        blob = DocumentBlob(
            document_id=doc_id,
            source_uri=str(pdf_path),
            content=content,
            content_type="application/pdf",
            filename=pdf_path.name,
            metadata={"source_doc": pdf_path.name, "course_id": course_id},
        )
        parsed = loader.load(blob)
        doc_chunks = chunker.chunk(parsed)
        for c in doc_chunks:
            c.metadata["source_doc"] = pdf_path.name
            c.metadata["course_id"] = course_id
        chunks.extend(doc_chunks)

    return chunks


def _score_question(
    critique_llm,
    context: str,
    question: str,
) -> dict[str, tuple[int, str]]:
    grounded = critique_llm.invoke(
        GROUNDEDNESS_CRITIQUE_PROMPT.format(context=context, question=question)
    )
    relevance = critique_llm.invoke(RELEVANCE_CRITIQUE_PROMPT.format(question=question))
    standalone = critique_llm.invoke(STANDALONE_CRITIQUE_PROMPT.format(question=question))
    return {
        "groundedness": (int(grounded.score), str(grounded.evaluation)),
        "relevance": (int(relevance.score), str(relevance.evaluation)),
        "standalone": (int(standalone.score), str(standalone.evaluation)),
    }


# ---------------------------------------------------------------------------
# Per-course generation
# ---------------------------------------------------------------------------

def _generate_for_course(
    course_dir: Path,
    course_id: str,
    output_dir: Path,
    qa_llm,
    critique_llm,
    samples: int,
    seed: int,
    chunk_size: int,
    overlap: int,
    min_score: int,
) -> dict:
    """Generate eval data for a single course. Returns a summary dict."""
    chunks = _load_chunks(course_dir, course_id, chunk_size, overlap)
    if not chunks:
        print(f"  [SKIP] No PDFs found in {course_dir}")
        return {"course_id": course_id, "raw": 0, "filtered": 0}

    rng = random.Random(seed)
    pool = [c for c in chunks if len(c.text.strip()) >= 300]
    if not pool:
        print(f"  [SKIP] No chunks with enough text in {course_dir}")
        return {"course_id": course_id, "raw": 0, "filtered": 0}

    sampled_chunks = rng.sample(pool, k=min(samples, len(pool)))
    total = len(sampled_chunks)

    raw_rows: list[QASample] = []
    failures = {
        "qa_parse_error": 0,
        "qa_missing_fields": 0,
        "answer_too_long": 0,
        "score_error": 0,
        "qa_exception_samples": [],
    }

    for idx, chunk in enumerate(sampled_chunks, start=1):
        source_doc = chunk.metadata.get("source_doc", "unknown")
        print(f"  [{idx}/{total}] {source_doc}", end=" ... ", flush=True)
        try:
            qa = qa_llm.invoke(QA_GENERATION_PROMPT.format(context=chunk.text))
            question = qa.question.strip()
            answer = qa.answer.strip()
            if not question or not answer:
                failures["qa_missing_fields"] += 1
                print("SKIP (empty Q/A)")
                continue
            if len(answer) > 500:
                failures["answer_too_long"] += 1
                print("SKIP (answer too long)")
                continue

            try:
                scores = _score_question(critique_llm, context=chunk.text, question=question)
            except Exception:
                failures["score_error"] += 1
                print("SKIP (score error)")
                continue

            g = scores["groundedness"][0]
            r = scores["relevance"][0]
            s = scores["standalone"][0]

            row = QASample(
                course_id=course_id,
                question=question,
                answer=answer,
                context=chunk.text,
                source_doc=source_doc,
                document_id=chunk.document_id,
                page_number=chunk.metadata.get("page_number"),
                chunk_id=chunk.chunk_id,
                groundedness_score=g,
                groundedness_eval=scores["groundedness"][1],
                relevance_score=r,
                relevance_eval=scores["relevance"][1],
                standalone_score=s,
                standalone_eval=scores["standalone"][1],
            )
            raw_rows.append(row)
            print(f"OK  g={g} r={r} s={s}  | Q: {question[:80]}")
        except Exception as exc:
            failures["qa_parse_error"] += 1
            exc_samples = failures["qa_exception_samples"]
            if len(exc_samples) < 5:
                exc_samples.append(str(exc))
            print(f"ERROR ({exc})")
            continue

    filtered_rows = [
        row
        for row in raw_rows
        if (row.groundedness_score or 0) >= min_score
        and (row.relevance_score or 0) >= min_score
        and (row.standalone_score or 0) >= min_score
    ]

    # -- Write per-course files -------------------------------------------
    course_output_dir = output_dir / course_id
    course_output_dir.mkdir(parents=True, exist_ok=True)

    raw_path = course_output_dir / f"{course_id}_eval_raw.jsonl"
    with raw_path.open("w", encoding="utf-8") as f:
        for row in raw_rows:
            f.write(json.dumps(asdict(row), ensure_ascii=False) + "\n")

    filtered_path = course_output_dir / f"{course_id}_eval_filtered.jsonl"
    with filtered_path.open("w", encoding="utf-8") as f:
        for row in filtered_rows:
            f.write(json.dumps(asdict(row), ensure_ascii=False) + "\n")

    langsmith_rows = [
        {
            "inputs": {"question": row.question},
            "outputs": {"answer": row.answer},
            "metadata": {
                "course_id": row.course_id,
                "source_doc": row.source_doc,
                "document_id": row.document_id,
                "page_number": row.page_number,
                "chunk_id": row.chunk_id,
            },
        }
        for row in filtered_rows
    ]
    langsmith_path = course_output_dir / f"{course_id}_eval_langsmith.jsonl"
    with langsmith_path.open("w", encoding="utf-8") as f:
        for row in langsmith_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"  raw={len(raw_rows)} -> {raw_path}")
    print(f"  filtered={len(filtered_rows)} -> {filtered_path}")
    print(f"  langsmith={len(langsmith_rows)} -> {langsmith_path}")
    print(f"  drop stats: {json.dumps(failures)}")

    return {
        "course_id": course_id,
        "raw": len(raw_rows),
        "filtered": len(filtered_rows),
        "failures": failures,
        "raw_rows": raw_rows,
        "filtered_rows": filtered_rows,
        "langsmith_rows": langsmith_rows,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def generate_dataset(
    mock_file_root: Path,
    output_dir: Path,
    model: str,
    project: str | None,
    location: str,
    samples: int,
    seed: int,
    chunk_size: int,
    overlap: int,
    min_score: int,
    course_ids: list[str] | None,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)

    # Discover course directories
    all_course_dirs = sorted(mock_file_root.glob("course_*/"))
    if not all_course_dirs:
        raise RuntimeError(f"No course_* directories found under {mock_file_root}")

    # Filter to requested courses if --course-ids was given
    if course_ids:
        requested = set(course_ids)
        all_course_dirs = [
            d for d in all_course_dirs
            if d.name.split("_", 1)[-1] in requested  # "course_21" -> "21"
        ]
        if not all_course_dirs:
            raise RuntimeError(
                f"None of the requested course IDs {course_ids} were found under {mock_file_root}"
            )

    print(f"Processing {len(all_course_dirs)} course(s): {[d.name for d in all_course_dirs]}\n")

    llm = ChatGoogleGenerativeAI(
        model=model,
        temperature=0,
        vertexai=True,
        project=project or os.environ.get("GOOGLE_CLOUD_PROJECT"),
        location=location,
    )
    qa_llm = llm.with_structured_output(QAGeneration)
    critique_llm = llm.with_structured_output(CritiqueResult)

    all_raw_rows: list[QASample] = []
    all_filtered_rows: list[QASample] = []
    all_langsmith_rows: list[dict] = []
    summaries = []

    for course_dir in all_course_dirs:
        course_id = course_dir.name  # e.g. "course_21"
        print(f"[{course_id}] Starting...")
        result = _generate_for_course(
            course_dir=course_dir,
            course_id=course_id,
            output_dir=output_dir,
            qa_llm=qa_llm,
            critique_llm=critique_llm,
            samples=samples,
            seed=seed,
            chunk_size=chunk_size,
            overlap=overlap,
            min_score=min_score,
        )
        summaries.append({"course_id": course_id, "raw": result["raw"], "filtered": result["filtered"]})
        all_raw_rows.extend(result.get("raw_rows", []))
        all_filtered_rows.extend(result.get("filtered_rows", []))
        all_langsmith_rows.extend(result.get("langsmith_rows", []))
        print()

    # -- Write combined files across all processed courses ------------------
    if len(all_course_dirs) > 1:
        combined_raw = output_dir / "combined_eval_raw.jsonl"
        with combined_raw.open("w", encoding="utf-8") as f:
            for row in all_raw_rows:
                f.write(json.dumps(asdict(row), ensure_ascii=False) + "\n")

        combined_filtered = output_dir / "combined_eval_filtered.jsonl"
        with combined_filtered.open("w", encoding="utf-8") as f:
            for row in all_filtered_rows:
                f.write(json.dumps(asdict(row), ensure_ascii=False) + "\n")

        combined_langsmith = output_dir / "combined_eval_langsmith.jsonl"
        with combined_langsmith.open("w", encoding="utf-8") as f:
            for row in all_langsmith_rows:
                f.write(json.dumps(row, ensure_ascii=False) + "\n")

        print(f"Combined raw      : {len(all_raw_rows)} rows -> {combined_raw}")
        print(f"Combined filtered : {len(all_filtered_rows)} rows -> {combined_filtered}")
        print(f"Combined langsmith: {len(all_langsmith_rows)} rows -> {combined_langsmith}")

    print("\nPer-course summary:")
    for s in summaries:
        print(f"  {s['course_id']}: raw={s['raw']}, filtered={s['filtered']}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic RAG eval dataset from AWS course PDFs."
    )
    parser.add_argument(
        "--mock-file-root",
        type=Path,
        default=Path("./ingestion/mock_file"),
        help="Root directory containing course_* subdirectories.",
    )
    parser.add_argument(
        "--output-dir",
        type=Path,
        default=Path("rag-ai/evals/output"),
    )
    parser.add_argument(
        "--course-ids",
        nargs="+",
        type=str,
        default=None,
        metavar="ID",
        help=(
            "Specific course IDs to process (e.g. --course-ids 21 22 23). "
            "Omit to process ALL course_* directories."
        ),
    )
    parser.add_argument(
        "--model",
        type=str,
        default="gemini-2.5-pro",
        help="Vertex AI model name (e.g. gemini-2.5-pro, gemini-2.0-flash).",
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
    parser.add_argument("--samples", type=int, default=220,
                        help="Max chunks to sample per course.")
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--chunk-size", type=int, default=1500)
    parser.add_argument("--overlap", type=int, default=200)
    parser.add_argument("--min-score", type=int, default=4)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    generate_dataset(
        mock_file_root=args.mock_file_root,
        output_dir=args.output_dir,
        model=args.model,
        project=args.project,
        location=args.location,
        samples=args.samples,
        seed=args.seed,
        chunk_size=args.chunk_size,
        overlap=args.overlap,
        min_score=args.min_score,
        course_ids=args.course_ids,
    )
