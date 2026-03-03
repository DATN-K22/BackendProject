from __future__ import annotations

from typing import Any, Mapping
from urllib.parse import unquote, urlparse
from urllib.request import Request, urlopen

from ingestion.interfaces.source_connector import SourceConnector
from ingestion.models.document import DocumentBlob


class HttpPresignedUrlSource(SourceConnector):
    def __init__(self, timeout_seconds: int = 30, max_bytes: int = 25_000_000) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_bytes = max_bytes

    def fetch(
        self,
        source_uri: str,
        *,
        document_id: str,
        metadata: Mapping[str, Any] | None = None,
    ) -> DocumentBlob:
        pass

def _resolve_filename(content_disposition: str | None, source_uri: str) -> str:
    pass
