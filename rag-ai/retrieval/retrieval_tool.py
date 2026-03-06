from __future__ import annotations

from typing import Any

from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore

from config.settings import Settings
from retrieval.stores.qdrant_store import build_qdrant_client


def build_retrieval_tool(settings: Settings):
    vectorstore: QdrantVectorStore | None = None
    init_error: str | None = None

    def retrieve_context(
        query: str,
        top_k: int = 5,
        tenant_id: str | None = None,
    ) -> dict[str, Any]:
        """
        Retrieve relevant chunks from the vector store for a user query.

        Args:
            query: Natural language question to search against indexed chunks.
            top_k: Maximum number of chunks to return (1-10).
            tenant_id: Optional tenant isolation value (mapped to payload.namespace).
        """
        if not query or not query.strip():
            return {"query": query, "count": 0, "results": []}

        nonlocal vectorstore, init_error

        if vectorstore is None and init_error is None:
            try:
                embeddings = OpenAIEmbeddings(model=settings.embedding_model)
                client = build_qdrant_client(settings)
                vectorstore = QdrantVectorStore(
                    client=client,
                    collection_name=settings.qdrant_collection,
                    embedding=embeddings,
                )
            except Exception as exc:
                init_error = str(exc)

        if init_error is not None:
            return {
                "query": query,
                "count": 0,
                "results": [],
                "error": f"retrieval_unavailable: {init_error}",
            }

        try:
            safe_top_k = max(1, min(int(top_k), 10))
        except (TypeError, ValueError):
            safe_top_k = 5
        search_filter = {"namespace": tenant_id} if tenant_id else None

        try:
            docs = vectorstore.similarity_search(
                query=query,
                k=safe_top_k,
                filter=search_filter,
            )
        except Exception as exc:
            return {
                "query": query,
                "count": 0,
                "results": [],
                "error": f"retrieval_failed: {exc}",
            }

        results: list[dict[str, Any]] = []
        for index, doc in enumerate(docs, start=1):
            content = doc.page_content.strip()
            if len(content) > 2000:
                content = content[:2000] + "..."
            results.append(
                {
                    "rank": index,
                    "content": content,
                    "metadata": doc.metadata,
                }
            )

        return {
            "query": query,
            "count": len(results),
            "results": results,
        }

    return retrieve_context
