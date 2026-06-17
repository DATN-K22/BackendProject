from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class DocumentUploadEvent:
    document_id: str
    source_uri: str
    version: str
    tenant_id: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)

    @classmethod
    def from_dict(cls, payload: dict[str, Any]) -> "DocumentUploadEvent":
        metadata = payload.get("metadata") or {}
        if not isinstance(metadata, dict):
            raise ValueError("metadata must be a dictionary")

        return cls(
            document_id=str(payload["document_id"]),
            source_uri=str(payload["source_uri"]),
            version=str(payload.get("version", "1")),
            tenant_id=payload.get("tenant_id"),
            metadata=metadata,
        )
        

