from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any

from ingestion.models.document import VectorPoint


class VectorWriter(ABC):
    @abstractmethod
    def upsert(self, points: list[VectorPoint], namespace: str | None = None) -> None:
        raise NotImplementedError

    @abstractmethod
    def delete_document(self, document_id: str, namespace: str | None = None) -> None:
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
    ) -> list[dict[str, Any]]:
        raise NotImplementedError


class VectorStore(VectorWriter, VectorReader):
    pass
