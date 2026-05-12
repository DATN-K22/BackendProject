from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from models.document import VectorPoint


class VectorWriter(ABC):
    @abstractmethod
    def upsert(self, points: list[VectorPoint], namespace: str | None = None, batch_size: int = 100) -> None:
        raise NotImplementedError

    @abstractmethod
    def delete_document(self, document_id: str, namespace: str | None = None) -> int:
        raise NotImplementedError


class VectorReader(ABC):
    @abstractmethod
    def similarity_search(
        self,
        query_vector: list[float],
        *,
        limit: int = 5,
        filters: dict[str, Any] | None = None,
        namespace: str | None = None,
        score_threshold: float = 0.5,
    ) -> list[dict[str, Any]]:
        raise NotImplementedError


class VectorStore(VectorWriter, VectorReader):
    pass
