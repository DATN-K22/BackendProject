from __future__ import annotations

import logging
from concurrent.futures import ThreadPoolExecutor, as_completed
from typing import Any

from qdrant_client import QdrantClient, models
from qdrant_client.http.exceptions import UnexpectedResponse
from qdrant_client.models import FieldCondition, Filter, MatchValue, PointStruct

from interfaces.vector_store import VectorStore
from models.document import VectorPoint
from config.settings import Settings


logger = logging.getLogger(__name__)





def build_qdrant_client(settings: Settings) -> QdrantClient:
    return QdrantClient(
        url=settings.qdrant_url,
        api_key=settings.qdrant_api_key,
        # Default httpx timeout (5 s) is too short for large vector payloads.
        # 60 s gives headroom for dense+sparse upserts under load.
        timeout=60,
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
 
    # Payload fields to index for fast filtering (document_id, filename, namespace).
    # All three are string keyword fields — exact-match only, no tokenization.
    _INDEXED_FIELDS: tuple[str, ...] = ("document_id", "filename", "namespace")

    def _ensure_collection(self) -> None:
        """Đảm bảo collection tồn tại. Chỉ tạo mới nếu thực sự chưa có (404).
        Các lỗi khác (500, auth, network) sẽ được raise lên caller."""
        if self._collection_ready:
            return

        try:
            self._client.get_collection(self._collection_name)
            logger.info("Collection %r already exists.", self._collection_name)
        except UnexpectedResponse as exc:
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
                sparse_vectors_config={
                    "sparse": models.SparseVectorParams(
                        index=models.SparseIndexParams(on_disk=False),
                        modifier=models.Modifier.IDF,
                    )
                },
            )

        # Always ensure payload indexes exist — this is idempotent:
        # Qdrant returns HTTP 200 with no error if the index already exists.
        self._ensure_payload_indexes()
        self._collection_ready = True

    def _ensure_payload_indexes(self) -> None:
        """Create keyword payload indexes for filtering fields if they don't exist.

        Safe to call on an existing collection — Qdrant is idempotent here.
        These indexes speed up delete_document() and similarity_search() filters.
        """
        for field in self._INDEXED_FIELDS:
            try:
                self._client.create_payload_index(
                    collection_name=self._collection_name,
                    field_name=field,
                    field_schema=models.PayloadSchemaType.KEYWORD,
                )
                logger.debug("Payload index ensured for field %r.", field)
            except UnexpectedResponse as exc:
                # 409 Conflict means the index already exists with a compatible
                # schema — safe to ignore.  Any other status is a real error.
                if exc.status_code != 409:
                    logger.error(
                        "Failed to create payload index for field %r: %s %s",
                        field, exc.status_code, exc.reason_phrase,
                    )
                    raise

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
            payload["text"] = point.text
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

        # Split into batches and upload in parallel using threads.
        # We cannot use Qdrant's built-in parallel= parameter because it uses
        # multiprocessing internally, which raises AssertionError inside Celery
        # workers (daemonic processes cannot spawn child processes).
        # Threads have no such restriction and are equally fast for I/O-bound
        # HTTP uploads to Qdrant.
        # Use a smaller per-thread batch (50) to avoid WriteTimeout on large
        # dense+sparse payloads — the caller's batch_size is the overall hint
        # but we cap each HTTP request at 50 points.
        num_parallel = 4
        thread_batch_size = min(batch_size, 50)
        batches = [
            qdrant_points[i : i + thread_batch_size]
            for i in range(0, len(qdrant_points), thread_batch_size)
        ]

        def _upload_batch(batch: list[PointStruct]) -> int:
            self._client.upsert(
                collection_name=self._collection_name,
                points=batch,
                wait=True,
            )
            return len(batch)

        with ThreadPoolExecutor(max_workers=num_parallel) as executor:
            futures = [executor.submit(_upload_batch, batch) for batch in batches]
            for future in as_completed(futures):
                future.result()  # re-raise any upload exception immediately

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