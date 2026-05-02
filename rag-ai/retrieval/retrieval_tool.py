from __future__ import annotations

import hashlib
import logging
import os
from typing import Any

from openai import OpenAI
from qdrant_client import models

from config.settings import Settings
from retrieval.qdrant_store import build_qdrant_client
from retrieval.qdrant_store import QdrantVectorStore  # class tự viết đã fix
from security.middleware import FORWARDED_IDENTITY_HEADERS

logger = logging.getLogger(__name__)

# ── Reranker (module-level singleton, lazy load) ──────────────────────────────
_reranker = None


def _get_reranker():
    global _reranker
    if _reranker is None:
        try:
            from sentence_transformers import CrossEncoder
            _reranker = CrossEncoder("cross-encoder/ms-marco-MiniLM-L-6-v2")
            logger.info("Reranker loaded: cross-encoder/ms-marco-MiniLM-L-6-v2")
        except Exception as exc:
            logger.warning("Reranker unavailable, skipping rerank step: %s", exc)
    return _reranker


# ── Query expansion ───────────────────────────────────────────────────────────

def _expand_query(query: str, openai_client: OpenAI) -> list[str]:
    """Dùng LLM sinh thêm 2 biến thể câu hỏi để tăng recall."""
    try:
        resp = openai_client.chat.completions.create(
            model="gpt-4o-mini",
            messages=[{
                "role": "user",
                "content": (
                    "Viết 2 cách diễn đạt khác cho câu hỏi sau, "
                    "mỗi cách trên một dòng, không đánh số:\n"
                    f"{query}"
                ),
            }],
            max_tokens=120,
            temperature=0.3,
        )
        variants = resp.choices[0].message.content.strip().splitlines()
        expanded = [query] + [v.strip() for v in variants if v.strip()]
        logger.info("Query expansion: %d variants for %r", len(expanded), query)
        return expanded
    except Exception as exc:
        logger.warning("Query expansion failed, using original query: %s", exc)
        return [query]


# ── Cache helpers ─────────────────────────────────────────────────────────────

def _cache_key(query: str, tenant_id: str | None, top_k: int) -> str:
    raw = f"{query}|{tenant_id}|{top_k}"
    return hashlib.md5(raw.encode()).hexdigest()


def _evict_if_needed(cache: dict, max_size: int = 512) -> None:
    """Xóa entry cũ nhất nếu cache vượt giới hạn (FIFO)."""
    while len(cache) >= max_size:
        oldest = next(iter(cache))
        del cache[oldest]


# ── Main factory ──────────────────────────────────────────────────────────────

def build_retrieval_tool(settings: Settings):
    # Lazy init — chưa kết nối Qdrant hay OpenAI cho đến khi gọi lần đầu
    _vectorstore: QdrantVectorStore | None = None
    _embeddings_client: OpenAI | None = None
    _init_error: str | None = None
    _result_cache: dict[str, Any] = {}

    def _get_deps() -> tuple[QdrantVectorStore, OpenAI] | tuple[None, None]:
        nonlocal _vectorstore, _embeddings_client, _init_error

        if _init_error is not None:
            return None, None

        if _vectorstore is None:
            try:
                if not os.environ.get("OPENAI_API_KEY"):
                    raise RuntimeError(
                        "OPENAI_API_KEY is not set — embeddings will fail. "
                        "Set the environment variable before starting the service."
                    )
                qdrant_client = build_qdrant_client(settings)
                _vectorstore = QdrantVectorStore(
                    client=qdrant_client,
                    collection_name=settings.qdrant_collection,
                    vector_size=settings.qdrant_vector_size,  # e.g. 1536
                )
                _embeddings_client = OpenAI()
                logger.info("QdrantVectorStore initialized for collection %r", settings.qdrant_collection)
            except Exception as exc:
                _init_error = str(exc)
                logger.error("Failed to initialize QdrantVectorStore: %s", exc)
                return None, None

        return _vectorstore, _embeddings_client

    # ── retrieve_context ──────────────────────────────────────────────────

    def retrieve_context(
        query: str,
        top_k: int = 5,
        tenant_id: str | None = None,
        use_expansion: bool = True,    # mặc định bật
        use_rerank: bool = True,       # mặc định bật
        score_threshold: float = 0.5,
    ) -> dict[str, Any]:
        """
        Retrieve relevant chunks from the vector store for a user query.

        Args:
            query: Natural language question to search against indexed chunks.
            top_k: Maximum number of chunks to return (1-10).
            tenant_id: Optional tenant isolation (mapped to payload.namespace).
            use_expansion: Sinh biến thể câu hỏi để tăng recall (1 LLM call thêm).
            use_rerank: Dùng cross-encoder rerank sau khi fetch.
            score_threshold: Ngưỡng similarity tối thiểu (0.0–1.0).
        """
        if not query or not query.strip():
            return {"query": query, "count": 0, "results": []}

        # ── 1. Validate top_k ─────────────────────────────────────────────
        try:
            safe_top_k = max(1, min(int(top_k), 10))
        except (TypeError, ValueError):
            safe_top_k = 5

        # ── 2. Cache check ────────────────────────────────────────────────
        key = _cache_key(query, tenant_id, safe_top_k)
        if key in _result_cache:
            logger.info("Cache hit: query=%r tenant=%r", query, tenant_id)
            return _result_cache[key]

        # ── 3. Lazy init ──────────────────────────────────────────────────
        vectorstore, openai_client = _get_deps()
        if vectorstore is None:
            return {
                "query": query,
                "count": 0,
                "results": [],
                "error": f"retrieval_unavailable: {_init_error}",
            }

        # ── 4. Tenant filter ──────────────────────────────────────────────
        # Ưu tiên: tham số tenant_id > header x-tenant-id từ middleware
        effective_tenant = tenant_id
        if effective_tenant is None:
            headers = FORWARDED_IDENTITY_HEADERS.get()
            if headers:
                effective_tenant = headers.get("x-tenant-id")
            else:
                logger.warning(
                    "retrieve_context: no tenant_id provided and no request context found "
                    "(ContextVar is None). Query will run without tenant isolation — "
                    "potential cross-tenant data exposure if called outside a request."
                )

        # ── 5. Embed query ────────────────────────────────────────────────
        queries = _expand_query(query, openai_client) if use_expansion else [query]

        try:
            resp = openai_client.embeddings.create(
                model=settings.embedding_model,
                input=queries,
            )
            query_vectors = [item.embedding for item in resp.data]
        except Exception as exc:
            return {
                "query": query,
                "count": 0,
                "results": [],
                "error": f"embedding_failed: {exc}",
            }

        # ── 6. Hybrid search — fetch nhiều hơn để rerank ──────────────────
        OVER_FETCH = 4
        seen_ids: set = set()
        all_docs: list[dict[str, Any]] = []

        try:
            for vector in query_vectors:
                results = vectorstore.similarity_search(
                    query_vector=vector,
                    limit=safe_top_k * OVER_FETCH,
                    namespace=effective_tenant,
                    score_threshold=score_threshold,
                )
                for doc in results:
                    doc_id = doc["payload"].get("document_id", doc["id"])
                    if doc_id not in seen_ids:
                        seen_ids.add(doc_id)
                        all_docs.append(doc)
        except Exception as exc:
            return {
                "query": query,
                "count": 0,
                "results": [],
                "error": f"retrieval_failed: {exc}",
            }

        # ── 7. Reranking ──────────────────────────────────────────────────
        reranker = _get_reranker() if use_rerank else None

        if reranker and all_docs:
            pairs = [
                (query, doc["payload"].get("text", ""))
                for doc in all_docs
            ]
            scores = reranker.predict(pairs)
            ranked = sorted(zip(scores, all_docs), key=lambda x: x[0], reverse=True)
            final_docs = [doc for _, doc in ranked[:safe_top_k]]
            logger.info(
                "Reranked %d → %d docs for query=%r",
                len(all_docs), len(final_docs), query,
            )
        else:
            final_docs = all_docs[:safe_top_k]

        # ── 8. Format output ──────────────────────────────────────────────
        results: list[dict[str, Any]] = []
        for index, doc in enumerate(final_docs, start=1):
            payload = doc["payload"]
            content = payload.get("text", "").strip()
            if len(content) > 2000:
                content = content[:2000] + "..."
            results.append({
                "rank": index,
                "score": round(doc["score"], 4),
                "content": content,
                "document_id": payload.get("document_id"),
                "page_number": payload.get("page_number"),
                "metadata": payload,
            })

        output: dict[str, Any] = {
            "query": query,
            "count": len(results),
            "results": results,
        }

        logger.info(
            "retrieve_context done: query=%r tenant=%r "
            "fetched=%d returned=%d reranked=%s expanded=%s",
            query, effective_tenant,
            len(all_docs), len(results),
            reranker is not None, use_expansion,
        )

        # ── 9. Lưu cache ──────────────────────────────────────────────────
        _evict_if_needed(_result_cache)
        _result_cache[key] = output

        return output

    return retrieve_context