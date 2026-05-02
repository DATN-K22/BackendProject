from __future__ import annotations

from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore
from qdrant_client import models

from config.settings import Settings
from retrieval.stores.qdrant_store import build_qdrant_client


def build_retriever(settings: Settings, course_id: str | None = None):
    embeddings = OpenAIEmbeddings(model=settings.embedding_model)
    client = build_qdrant_client(settings)
    vectorstore = QdrantVectorStore(
        client=client,
        collection_name=settings.qdrant_collection,
        embedding=embeddings,
    )

    search_kwargs: dict = {"k": 10}
    if course_id:
        search_kwargs["filter"] = models.Filter(
            must=[
                models.FieldCondition(
                    key="namespace",
                    match=models.MatchValue(value=course_id),
                )
            ]
        )

    return vectorstore.as_retriever(search_kwargs=search_kwargs)
