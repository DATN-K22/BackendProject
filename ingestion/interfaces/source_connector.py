from __future__ import annotations

from abc import ABC, abstractmethod
from typing import Any, Mapping

from models.document import DocumentBlob


class SourceConnector(ABC):
    @abstractmethod
    def fetch(
        self,
        source_uri: str,
        *,
        document_id: str,
        metadata: Mapping[str, Any] | None = None,
    ) -> DocumentBlob:
        raise NotImplementedError
