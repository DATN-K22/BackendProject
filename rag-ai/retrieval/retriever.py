from __future__ import annotations

from langchain_openai import OpenAIEmbeddings
from langchain_qdrant import QdrantVectorStore

from config.settings import Settings
from retrieval.stores.qdrant_store import build_qdrant_client


def build_retriever(settings: Settings):
    embeddings = OpenAIEmbeddings(model=settings.embedding_model)
    client = build_qdrant_client(settings)
    vectorstore = QdrantVectorStore(
        client=client,
        collection_name=settings.qdrant_collection,
        embedding=embeddings,
    )
    return vectorstore.as_retriever(search_kwargs={"k": 5})
