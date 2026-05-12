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
from langchain_openai import ChatOpenAI
from pydantic import BaseModel, Field

REPO_PY_ROOT = Path(__file__).resolve().parents[1]
if str(REPO_PY_ROOT) not in sys.path:
    sys.path.insert(0, str(REPO_PY_ROOT))

from ingestion.chunking.text_chunker import FixedWindowChunker  # noqa: E402
from ingestion.file_loader import FileLoader  # noqa: E402
from ingestion.models.document import DocumentBlob, TextChunk  # noqa: E402


@dataclass
class QASample:
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

class QAGeneration(BaseModel):
    question: str = Field(min_length=1)
    answer: str = Field(min_length=1)


class CritiqueResult(BaseModel):
    evaluation: str = Field(min_length=1)
    score: int = Field(ge=1, le=5)


def _stable_document_id(path: Path) -> str:
    stem = path.stem.strip()
    leading = stem.split("_", 1)[0]
    if leading.isdigit():
        return f"course21-doc-{int(leading)}"
    return hashlib.sha1(str(path).encode("utf-8")).hexdigest()[:16]


def _load_chunks(input_dir: Path, chunk_size: int, overlap: int) -> list[TextChunk]:
    loader = FileLoader()
    chunker = FixedWindowChunker(chunk_size=chunk_size, overlap=overlap)
    chunks: list[TextChunk] = []

    for pdf_path in sorted(input_dir.rglob("*.pdf")):
        content = pdf_path.read_bytes()
        doc_id = _stable_document_id(pdf_path)
        blob = DocumentBlob(
            document_id=doc_id,
            source_uri=str(pdf_path),
            content=content,
            content_type="application/pdf",
            filename=pdf_path.name,
            metadata={"source_doc": pdf_path.name},
        )
        parsed = loader.load(blob)
        doc_chunks = chunker.chunk(parsed)
        for c in doc_chunks:
            c.metadata["source_doc"] = pdf_path.name
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


def generate_dataset(
    input_dir: Path,
    output_dir: Path,
    model: str,
    samples: int,
    seed: int,
    chunk_size: int,
    overlap: int,
    min_score: int,
) -> None:
    output_dir.mkdir(parents=True, exist_ok=True)
    chunks = _load_chunks(input_dir=input_dir, chunk_size=chunk_size, overlap=overlap)
    if not chunks:
        raise RuntimeError(f"No chunks found from PDFs in {input_dir}")

    rng = random.Random(seed)
    pool = [c for c in chunks if len(c.text.strip()) >= 300]
    if not pool:
        raise RuntimeError("No chunks with enough text (>=300 chars) to generate QA.")

    sampled_chunks = rng.sample(pool, k=min(samples, len(pool)))
    llm = ChatOpenAI(model=model, temperature=0)
    qa_llm = llm.with_structured_output(QAGeneration)
    critique_llm = llm.with_structured_output(CritiqueResult)

    raw_rows: list[QASample] = []
    failures = {
        "qa_parse_error": 0,
        "qa_missing_fields": 0,
        "answer_too_long": 0,
        "score_error": 0,
        "qa_exception_samples": [],
    }
    for chunk in sampled_chunks:
        try:
            qa = qa_llm.invoke(QA_GENERATION_PROMPT.format(context=chunk.text))
            question = qa.question.strip()
            answer = qa.answer.strip()
            if not question or not answer:
                failures["qa_missing_fields"] += 1
                continue
            if len(answer) > 500:
                failures["answer_too_long"] += 1
                continue

            try:
                scores = _score_question(critique_llm, context=chunk.text, question=question)
            except Exception:
                failures["score_error"] += 1
                continue
            row = QASample(
                question=question,
                answer=answer,
                context=chunk.text,
                source_doc=chunk.metadata.get("source_doc", "unknown"),
                document_id=chunk.document_id,
                page_number=chunk.metadata.get("page_number"),
                chunk_id=chunk.chunk_id,
                groundedness_score=scores["groundedness"][0],
                groundedness_eval=scores["groundedness"][1],
                relevance_score=scores["relevance"][0],
                relevance_eval=scores["relevance"][1],
                standalone_score=scores["standalone"][0],
                standalone_eval=scores["standalone"][1],
            )
            raw_rows.append(row)
        except Exception as exc:
            failures["qa_parse_error"] += 1
            samples = failures["qa_exception_samples"]
            if len(samples) < 5:
                samples.append(str(exc))
            continue

    filtered_rows = [
        row
        for row in raw_rows
        if (row.groundedness_score or 0) >= min_score
        and (row.relevance_score or 0) >= min_score
        and (row.standalone_score or 0) >= min_score
    ]

    raw_path = output_dir / "course21_eval_raw.jsonl"
    with raw_path.open("w", encoding="utf-8") as f:
        for row in raw_rows:
            f.write(json.dumps(asdict(row), ensure_ascii=False) + "\n")

    filtered_path = output_dir / "course21_eval_filtered.jsonl"
    with filtered_path.open("w", encoding="utf-8") as f:
        for row in filtered_rows:
            f.write(json.dumps(asdict(row), ensure_ascii=False) + "\n")

    # LangSmith-style light dataset format
    langsmith_rows = [
        {
            "inputs": {"question": row.question},
            "outputs": {"answer": row.answer},
            "metadata": {
                "source_doc": row.source_doc,
                "document_id": row.document_id,
                "page_number": row.page_number,
                "chunk_id": row.chunk_id,
            },
        }
        for row in filtered_rows
    ]
    langsmith_path = output_dir / "course21_eval_langsmith.jsonl"
    with langsmith_path.open("w", encoding="utf-8") as f:
        for row in langsmith_rows:
            f.write(json.dumps(row, ensure_ascii=False) + "\n")

    print(f"Generated raw rows: {len(raw_rows)} -> {raw_path}")
    print(f"Generated filtered rows: {len(filtered_rows)} -> {filtered_path}")
    print(f"Generated LangSmith rows: {len(langsmith_rows)} -> {langsmith_path}")
    print(f"Drop stats: {json.dumps(failures)}")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate synthetic RAG eval dataset from course_21 PDFs."
    )
    parser.add_argument(
        "--input-dir",
        type=Path,
        default=Path("rag-ai/ingestion/mock_file/course_21"),
    )
    parser.add_argument("--output-dir", type=Path, default=Path("rag-ai/evals/output"))
    parser.add_argument("--model", type=str, default="gpt-4.1-mini")
    parser.add_argument("--samples", type=int, default=220)
    parser.add_argument("--seed", type=int, default=42)
    parser.add_argument("--chunk-size", type=int, default=1500)
    parser.add_argument("--overlap", type=int, default=200)
    parser.add_argument("--min-score", type=int, default=4)
    return parser.parse_args()


if __name__ == "__main__":
    args = parse_args()
    generate_dataset(
        input_dir=args.input_dir,
        output_dir=args.output_dir,
        model=args.model,
        samples=args.samples,
        seed=args.seed,
        chunk_size=args.chunk_size,
        overlap=args.overlap,
        min_score=args.min_score,
    )
