from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any


@dataclass(frozen=True)
class DocumentBlob:
    document_id: str
    source_uri: str
    content: bytes
    content_type: str | None = None
    filename: str | None = None
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedPage:
    page_number: int
    text: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class ParsedDocument:
    document_id: str
    source_uri: str
    pages: list[ParsedPage]
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class TextChunk:
    chunk_id: str
    document_id: str
    text: str
    metadata: dict[str, Any] = field(default_factory=dict)


@dataclass(frozen=True)
class VectorPoint:
    point_id: str
    vector: list[float]
    payload: dict[str, Any]
