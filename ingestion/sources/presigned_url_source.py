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
        try: 
            request = Request(source_uri, method="GET")
            with urlopen(request, timeout=self.timeout_seconds) as response:
                content = response.read(self.max_bytes + 1)
                if len(content) > self.max_bytes:
                    raise ValueError(
                        f"File exceeds {self.max_bytes} bytes limit from source {source_uri}"
                    )
                content_type = response.headers.get_content_type()
                filename = _resolve_filename(response.headers.get("Content-Disposition"), source_uri)

            return DocumentBlob(
                document_id=document_id,
                source_uri=source_uri,
                content=content,
                content_type=content_type,
                filename=filename,
                metadata=dict(metadata or {}),
            )
        except Exception as e:
            raise ValueError(f"Failed to fetch document from {source_uri}: {str(e)}") from e


def _resolve_filename(content_disposition: str | None, source_uri: str) -> str:
    if content_disposition and "filename=" in content_disposition:
        filename = content_disposition.split("filename=", 1)[1].strip('" ')
        if filename:
            return filename

    path = urlparse(source_uri).path
    tail = path.rsplit("/", 1)[-1]
    return unquote(tail) if tail else "document"
