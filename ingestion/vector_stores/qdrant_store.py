from __future__ import annotations

import logging
from typing import Any

from qdrant_client import QdrantClient, models
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.models import FieldCondition, Filter, MatchValue, PointStruct

from ingestion.interfaces.vector_store import VectorStore
from ingestion.models.document import VectorPoint
from config.settings import Settings


logger = logging.getLogger(__name__)





def build_qdrant_client(settings: Settings) -> QdrantClient:
    return QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key,
    )


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
 
        # FIX 1: Không gọi connect() trong __init__ nữa — lazy connect
        # Collection sẽ được đảm bảo tồn tại khi lần đầu thực sự cần dùng
        self._collection_ready: bool = False
 
    # ── Internal helpers ──────────────────────────────────────────────────
 
    def _ensure_collection(self) -> None:
        """Đảm bảo collection tồn tại. Chỉ tạo mới nếu thực sự chưa có (404).
        Các lỗi khác (500, auth, network) sẽ được raise lên caller."""
        if self._collection_ready:
            return
 
        try:
            self._client.get_collection(self._collection_name)
            self._collection_ready = True
        except UnexpectedResponse as exc:
            # FIX 2: Chỉ tạo collection khi status 404 (chưa tồn tại)
            # Không nuốt các lỗi khác như 500, 401, network error
            if exc.status_code != 404:
                logger.error(
                    "Unexpected error checking collection %r: %s %s",
                    self._collection_name, exc.status_code, exc.reason_phrase,
                )
                raise
 
            logger.info(
                "Collection %r not found, creating with size=%d distance=%s",
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
                sparse_vectors_config= {
                    "sparse": models.SparseVectorParams(
                        index=models.SparseIndexParams(on_disk=False),
                        modifier=models.Modifier.IDF
                    )
                }
            )
            self._collection_ready = True
 
    # ── Public API ────────────────────────────────────────────────────────
 
    def connect(self) -> None:
        """Backward-compatible: gọi _ensure_collection tường minh nếu cần."""
        self._ensure_collection()
 
    def upsert(
        self,
        points: list[VectorPoint],
        namespace: str | None = None,
        batch_size: int = 100,
    ) -> None:
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
                        "sparse": models.SparseVector(
                            indices=point.sparse_indices,
                            values=point.sparse_values,
                        )
                    },
                    payload=payload,
                )
            )
 
        if not qdrant_points:
            return
 
        # FIX 3: Dùng upload_points thay vì vòng lặp tuần tự
        # Built-in batching + parallel upload, nhanh hơn đáng kể với data lớn
        self._client.upload_points(
            collection_name=self._collection_name,
            points=qdrant_points,
            batch_size=batch_size,
            parallel=4,
            wait=True,
        )
        logger.info(
            "Upserted %d points into collection %r (namespace=%r)",
            len(qdrant_points), self._collection_name, namespace,
        )
 
    def delete_document(
        self,
        document_id: str,
        namespace: str | None = None,
    ) -> int:
        """Xóa tất cả points của một document.
 
        Returns:
            Số points đã xóa (0 nếu document không tồn tại).
        """
        self._ensure_collection()
 
        must_conditions: list[FieldCondition] = [
            FieldCondition(key="document_id", match=MatchValue(value=document_id))
        ]
        if namespace:
            must_conditions.append(
                FieldCondition(key="namespace", match=MatchValue(value=namespace))
            )
 
        # FIX 5: Đếm trước để trả về số points đã xóa
        count_result = self._client.count(
            collection_name=self._collection_name,
            count_filter=Filter(must=must_conditions),
            exact=True,
        )
        count = count_result.count
 
        if count == 0:
            logger.warning(
                "delete_document: document_id=%r not found (namespace=%r)",
                document_id, namespace,
            )
            return 0
 
        self._client.delete(
            collection_name=self._collection_name,
            points_selector=models.FilterSelector(
                filter=Filter(must=must_conditions),
            ),
            wait=True,
        )
        logger.info(
            "Deleted %d points for document_id=%r (namespace=%r)",
            count, document_id, namespace,
        )
        return count
 
    def similarity_search(
        self,
        query_vector: list[float],
        *,
        limit: int = 5,
        filters: dict[str, Any] | None = None,
        namespace: str | None = None,
        score_threshold: float = 0.5,  # FIX 4: lọc kết quả kém liên quan
    ) -> list[dict[str, Any]]:
        """Tìm kiếm các điểm gần nhất với query_vector.
 
        Args:
            query_vector: Dense embedding vector của câu hỏi.
            limit: Số kết quả tối đa trả về.
            filters: Bộ lọc payload bổ sung dạng {key: value}.
            namespace: Giới hạn tìm kiếm trong một tenant cụ thể.
            score_threshold: Ngưỡng similarity tối thiểu (0.0–1.0).
                             Kết quả dưới ngưỡng này sẽ bị loại bỏ.
        """
        self._ensure_collection()
 
        must_conditions: list[FieldCondition] = []
        if namespace:
            must_conditions.append(
                FieldCondition(key="namespace", match=MatchValue(value=namespace))
            )
        if filters:
            must_conditions.extend(
                FieldCondition(key=key, match=MatchValue(value=value))
                for key, value in filters.items()
            )
 
        qdrant_filter = Filter(must=must_conditions) if must_conditions else None
 
        search_result = self._client.search(
            collection_name=self._collection_name,
            query_vector=("dense", query_vector),
            limit=limit,
            query_filter=qdrant_filter,
            score_threshold=score_threshold,
            with_payload=True,   # FIX 6: khai báo tường minh, không phụ thuộc default
            with_vectors=False,  # không cần trả vector về, tiết kiệm bandwidth
        )
 
        results = [
            {
                "id": result.id,
                "payload": result.payload or {},
                "score": result.score,
            }
            for result in search_result
        ]
 
        logger.info(
            "similarity_search: namespace=%r limit=%d threshold=%.2f → %d results",
            namespace, limit, score_threshold, len(results),
        )
        return results