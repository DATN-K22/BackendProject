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
    vector: list[float]           # dense embedding
    text: str
    payload: dict[str, Any]
    sparse_indices: list[int] = field(default_factory=list)   # BM25 token indices
    sparse_values: list[float] = field(default_factory=list)  # BM25 TF scores
