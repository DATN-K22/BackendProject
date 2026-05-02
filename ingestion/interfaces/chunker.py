from __future__ import annotations

from abc import ABC, abstractmethod

from ingestion.models.document import ParsedDocument, TextChunk


class Chunker(ABC):
    @abstractmethod
    def chunk(self, document: ParsedDocument) -> list[TextChunk]:
        raise NotImplementedError
