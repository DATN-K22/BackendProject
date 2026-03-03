from __future__ import annotations

from typing import Any

from qdrant_client import QdrantClient
from qdrant_client.models import FieldCondition, Filter, MatchValue, PointStruct

from ingestion.interfaces.vector_store import VectorStore
from ingestion.models.document import VectorPoint


class QdrantVectorStore(VectorStore):
    def __init__(self, client: QdrantClient, collection_name: str) -> None:
        self._client = client
        self._collection_name = collection_name

    def upsert(self, points: list[VectorPoint], namespace: str | None = None) -> None:
        pass

    def delete_document(self, document_id: str, namespace: str | None = None) -> None:
        pass

    def similarity_search(
        self,
        query_vector: list[float],
        *,
        limit: int = 5,
        filters: dict[str, Any] | None = None,
        namespace: str | None = None,
    ) -> list[dict[str, Any]]:
        pass
