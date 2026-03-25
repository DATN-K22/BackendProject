from __future__ import annotations

from qdrant_client import QdrantClient

from config.settings import Settings


def build_qdrant_client(settings: Settings) -> QdrantClient:
    return QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key,
    )
