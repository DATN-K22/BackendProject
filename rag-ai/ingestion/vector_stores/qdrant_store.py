from __future__ import annotations

from typing import Any

from qdrant_client import QdrantClient, models
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.models import FieldCondition, Filter, MatchValue, PointStruct

from ingestion.interfaces.vector_store import VectorStore
from ingestion.models.document import VectorPoint


class QdrantVectorStore(VectorStore):
    def __init__(
        self,
        client: QdrantClient,
        collection_name: str,
        vector_size: int = 1536,
        distance: models.Distance | str = models.Distance.COSINE,
    ) -> None:
        self._client = client
        self._collection_name = collection_name
        self._vector_size = vector_size
        if isinstance(distance, str):
            self._distance = models.Distance[distance.upper()]
        else:
            self._distance = distance
        self.connect()

    def connect(self) -> None:
        try:
            self._client.get_collection(self._collection_name)
        except UnexpectedResponse:
            self._client.create_collection(
                collection_name=self._collection_name,
                vectors_config=models.VectorParams(
                    size=self._vector_size,
                    distance=self._distance,
                ),
            )

    def upsert(self, points: list[VectorPoint], namespace: str | None = None, batch_size: int = 100) -> None:
        qdrant_points: list[PointStruct] = []
        for point in points:
            payload = dict(point.payload)
            if namespace:
                payload["namespace"] = namespace
            qdrant_points.append(
                PointStruct(
                    id=point.point_id,
                    vector=point.vector,
                    payload=payload,
                )
            )

        if not qdrant_points:
            return

        for i in range(0, len(qdrant_points), batch_size):
            batch = qdrant_points[i : i + batch_size]
            self._client.upsert(
                collection_name=self._collection_name,
                points=batch,
                wait=True,
            )

    def delete_document(self, document_id: str, namespace: str | None = None) -> None:
        must_conditions = [
            FieldCondition(
                key="document_id",
                match=MatchValue(value=document_id),
            )
        ]
        if namespace:
            must_conditions.append(
                FieldCondition(
                    key="namespace",
                    match=MatchValue(value=namespace),
                )
            )

        self._client.delete(
            collection_name=self._collection_name,
            points_selector=models.FilterSelector(
                filter=Filter(must=must_conditions),
            ),
        )

    def similarity_search(
        self,
        query_vector: list[float],
        *,
        limit: int = 5,
        filters: dict[str, Any] | None = None,
        namespace: str | None = None,
    ) -> list[dict[str, Any]]:
        must_conditions: list[FieldCondition] = []
        if namespace:
            must_conditions.append(
                FieldCondition(
                    key="namespace",
                    match=MatchValue(value=namespace),
                )
            )

        if filters:
            must_conditions.extend(
                [
                    FieldCondition(
                        key=key,
                        match=MatchValue(value=value),
                    )
                    for key, value in filters.items()
                ]
            )

        qdrant_filter = Filter(must=must_conditions) if must_conditions else None

        search_result = self._client.search(
            collection_name=self._collection_name,
            query_vector=query_vector,
            limit=limit,
            query_filter=qdrant_filter,
        )

        return [
            {
                "id": result.id,
                "payload": result.payload or {},
                "score": result.score,
            }
            for result in search_result
        ]
