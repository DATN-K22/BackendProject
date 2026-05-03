from __future__ import annotations

from abc import ABC, abstractmethod

from models.document import DocumentBlob, ParsedDocument


class DataLoader(ABC):
    @abstractmethod
    def supports(self, blob: DocumentBlob) -> bool:
        raise NotImplementedError

    @abstractmethod
    def load(self, blob: DocumentBlob) -> ParsedDocument:
        raise NotImplementedError
