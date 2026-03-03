from __future__ import annotations

from ingestion.interfaces.chunker import Chunker
from ingestion.models.document import ParsedDocument, TextChunk


class FixedWindowChunker(Chunker):
    def __init__(self, chunk_size: int = 1_000, overlap: int = 200) -> None:
        pass

    def chunk(self, document: ParsedDocument) -> list[TextChunk]:
       pass