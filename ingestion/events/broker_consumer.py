from __future__ import annotations

from abc import ABC, abstractmethod
from collections.abc import Iterator

from events.event_schema import DocumentUploadEvent


class UploadEventConsumer(ABC):
    @abstractmethod
    def consume(self) -> Iterator[DocumentUploadEvent]:
        raise NotImplementedError
