from __future__ import annotations

import mimetypes
from pathlib import Path
from typing import Any, Mapping


from interfaces.source_connector import SourceConnector
from models.document import DocumentBlob



class LocalFileSource(SourceConnector):
    def fetch (self, source_uri, *, document_id, metadata: Mapping[str, Any] | None = None ) -> DocumentBlob:
        path = Path(source_uri)
        content = path.read_bytes()
        content_type, _ = mimetypes.guess_type(path.name)
        
        return DocumentBlob(
            document_id=document_id,
            source_uri=source_uri,
            content=content,
            content_type=content_type or "application/octet-stream",
            filename=path.name,
            metadata=dict(metadata or {}),
        )