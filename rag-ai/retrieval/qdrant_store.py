from __future__ import annotations

import logging
from typing import Any

from qdrant_client import QdrantClient, models
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.models import FieldCondition, Filter, MatchValue, PointStruct
from config.settings import Settings

logger = logging.getLogger(__name__)

def build_qdrant_client(settings: Settings) -> QdrantClient:
    return QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key,
    )

class VectorPoint:
    """Đại diện cho một điểm vector cần upsert vào store."""

    def __init__(
        self,
        point_id: str,
        vector: list[float],
        payload: dict[str, Any],
    ) -> None:
        self.point_id = point_id
        self.vector = vector
        self.payload = payload


class QdrantVectorStore:
    """
    Vector store dùng Qdrant, đứng độc lập — không kế thừa interface nào.

    Dùng chung cho cả ingestion pipeline và retrieval tool.
    """

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
        self._distance = (
            models.Distance[distance.upper()]
            if isinstance(distance, str)
            else distance
        )
        self._collection_ready = False

    # ── Internal ──────────────────────────────────────────────────────────

    def _ensure_collection(self) -> None:
        """Lazy init: đảm bảo collection tồn tại, chỉ tạo mới khi 404."""
        if self._collection_ready:
            return

        try:
            self._client.get_collection(self._collection_name)
            self._collection_ready = True
        except UnexpectedResponse as exc:
            if exc.status_code != 404:
                logger.error(
                    "Unexpected error checking collection %r: %s %s",
                    self._collection_name, exc.status_code, exc.reason_phrase,
                )
                raise

            logger.info(
                "Collection %r not found — creating (size=%d, distance=%s)",
                self._collection_name, self._vector_size, self._distance,
            )
            self._client.create_collection(
                collection_name=self._collection_name,
                vectors_config={
                    "dense": models.VectorParams(
                        size=self._vector_size,
                        distance=self._distance,
                    )
                },
                sparse_vectors_config={
                    "sparse": models.SparseVectorParams(
                        index=models.SparseIndexParams(on_disk=False),
                        modifier=models.Modifier.IDF
                    )
                }
            )
            self._collection_ready = True
        except Exception as exc:
            logger.error(
                "Network/connection error while ensuring collection %r: %s",
                self._collection_name, exc,
            )
            raise

    # ── Public API ────────────────────────────────────────────────────────

    def upsert(
        self,
        points: list[VectorPoint],
        namespace: str | None = None,
        batch_size: int = 100,
    ) -> None:
        """Upsert danh sách VectorPoint vào collection."""
        self._ensure_collection()

        qdrant_points: list[PointStruct] = []
        for point in points:
            payload = dict(point.payload)
            if namespace:
                payload["namespace"] = namespace
            qdrant_points.append(
                PointStruct(
                    id=point.point_id,
                    vector={
                        "dense": point.vector,
                    },
                    payload=payload,
                )
            )

        if not qdrant_points:
            return

        self._client.upload_points(
            collection_name=self._collection_name,
            points=qdrant_points,
            batch_size=batch_size,
            parallel=4,
            wait=True,
        )
        logger.info(
            "Upserted %d points → collection=%r namespace=%r",
            len(qdrant_points), self._collection_name, namespace,
        )

    def delete_document(
        self,
        document_id: str,
        namespace: str | None = None,
    ) -> int:
        """Xóa tất cả points của một document. Trả về số points đã xóa."""
        self._ensure_collection()

        must: list[FieldCondition] = [
            FieldCondition(key="document_id", match=MatchValue(value=document_id))
        ]
        if namespace:
            must.append(
                FieldCondition(key="namespace", match=MatchValue(value=namespace))
            )

        count = self._client.count(
            collection_name=self._collection_name,
            count_filter=Filter(must=must),
            exact=True,
        ).count

        if count == 0:
            logger.warning(
                "delete_document: not found document_id=%r namespace=%r",
                document_id, namespace,
            )
            return 0

        self._client.delete(
            collection_name=self._collection_name,
            points_selector=models.FilterSelector(filter=Filter(must=must)),
            wait=True,
        )
        logger.info(
            "Deleted %d points — document_id=%r namespace=%r",
            count, document_id, namespace,
        )
        return count

    def similarity_search(
        self,
        query_vector: list[float],
        *,
        limit: int = 5,
        namespace: str | None = None,
        filters: dict[str, Any] | None = None,
        score_threshold: float = 0.5,
    ) -> list[dict[str, Any]]:
        """
        Tìm kiếm các điểm gần nhất với query_vector.

        Args:
            query_vector: Dense embedding vector của câu hỏi.
            limit: Số kết quả tối đa.
            namespace: Giới hạn tìm kiếm trong một tenant cụ thể.
            filters: Bộ lọc payload bổ sung dạng {key: value}.
            score_threshold: Ngưỡng similarity tối thiểu (0.0–1.0).

        Returns:
            List các dict gồm id, score, payload.
        """
        self._ensure_collection()

        must: list[FieldCondition] = []
        if namespace:
            must.append(
                FieldCondition(key="namespace", match=MatchValue(value=namespace))
            )
        if filters:
            must.extend(
                FieldCondition(key=k, match=MatchValue(value=v))
                for k, v in filters.items()
            )

        results = self._client.search(
            collection_name=self._collection_name,
            query_vector=("dense", query_vector),
            limit=limit,
            query_filter=Filter(must=must) if must else None,
            score_threshold=score_threshold,
            with_payload=True,
            with_vectors=False,
        )

        output = [
            {
                "id": r.id,
                "score": r.score,
                "payload": r.payload or {},
            }
            for r in results
        ]

        logger.info(
            "similarity_search: namespace=%r limit=%d threshold=%.2f → %d results",
            namespace, limit, score_threshold, len(output),
        )
        return output