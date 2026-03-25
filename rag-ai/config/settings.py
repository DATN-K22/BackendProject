from __future__ import annotations

import os
from dataclasses import dataclass

from dotenv import load_dotenv

load_dotenv()


@dataclass(frozen=True)
class Settings:
    app_name: str
    host: str
    port: int
    redis_url: str
    gateway_shared_secret: str | None
    chat_model: str
    embedding_model: str
    qdrant_url: str
    qdrant_api_key: str | None
    qdrant_collection: str
    qdrant_vector_size: int
    qdrant_distance: str


def load_settings() -> Settings:
    return Settings(
        app_name=os.getenv("APP_NAME", "rag-assistant"),
        host=os.getenv("HOST", "0.0.0.0"),
        port=int(os.getenv("PORT", "8090")),
        redis_url=os.getenv("REDIS_URL", "redis://localhost:6379/1"),
        gateway_shared_secret=os.getenv("GATEWAY_SHARED_SECRET"),
        chat_model=os.getenv("CHAT_MODEL", "openai/gpt-5-nano"),
        embedding_model=os.getenv("EMBEDDING_MODEL", "text-embedding-3-small"),
        qdrant_url=os.getenv("QDRANT_URL", "http://localhost:6333"),
        qdrant_api_key=os.getenv("QDRANT_API_KEY") or None,
        qdrant_collection=os.getenv("QDRANT_COLLECTION", "edu_rag_dev"),
        qdrant_vector_size=int(os.getenv("QDRANT_VECTOR_SIZE", "1536")),
        qdrant_distance=os.getenv("QDRANT_DISTANCE", "Cosine"),
    )
