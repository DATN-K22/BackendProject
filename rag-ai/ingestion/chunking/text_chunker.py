from __future__ import annotations

from ingestion.interfaces.chunker import Chunker
from ingestion.models.document import ParsedDocument, TextChunk


class FixedWindowChunker(Chunker):
    def __init__(self, chunk_size: int = 1_000, overlap: int = 200) -> None:
        if chunk_size <= 0:
            raise ValueError("chunk_size must be greater than 0")
        if overlap < 0:
            raise ValueError("overlap must be greater than or equal to 0")
        if overlap >= chunk_size:
            raise ValueError("overlap must be smaller than chunk_size")
        self.chunk_size = chunk_size
        self.overlap = overlap

    def chunk(self, document: ParsedDocument) -> list[TextChunk]:
        """Chunk the parsed document

        Args:
            document (ParsedDocument): The document to chunk
            document_id: str
            source_uri: str
            pages: list[ParsedPage]
            metadata: dict[str, Any] = field(default_factory=dict)

        Returns:
            list[TextChunk]: The list of text chunks
            chunk_id: str
            document_id: str
            text: str
            metadata: dict[str, Any] = field(default_factory=dict)
            
        """
        chunks = []
        chunk_idx = 0
        for page in document.pages:
            text = page.text
            start = 0
            while start < len(text):
                end = min(start + self.chunk_size, len(text))
                chunk_text = text[start:end]
                if not chunk_text.strip():
                    start += self.chunk_size - self.overlap
                    continue
                chunk_id = f"{document.document_id}_page{page.page_number}_chunk{chunk_idx}"
                chunk_idx += 1
                chunks.append(TextChunk(chunk_id=chunk_id, document_id=document.document_id, text=chunk_text, metadata={"page_number": page.page_number}))
                start += self.chunk_size - self.overlap
        return chunks
        
        
        
