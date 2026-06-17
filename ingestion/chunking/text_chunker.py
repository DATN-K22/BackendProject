from __future__ import annotations

import uuid
from typing import Sequence

from langchain_text_splitters import RecursiveCharacterTextSplitter

from interfaces.chunker import Chunker
from models.document import ParsedDocument, TextChunk

_NAMESPACE = uuid.UUID("6ba7b810-9dad-11d1-80b4-00c04fd430c8")  # uuid.NAMESPACE_URL


class FixedWindowChunker(Chunker):
    def __init__(
        self,
        chunk_size: int = 1_000,
        overlap: int = 200,
        separators: Sequence[str] | None = None,
    ) -> None:
        if chunk_size <= 0:
            raise ValueError("chunk_size must be greater than 0")
        if overlap < 0:
            raise ValueError("overlap must be greater than or equal to 0")
        if overlap >= chunk_size:
            raise ValueError("overlap must be smaller than chunk_size")
        self.chunk_size = chunk_size
        self.overlap = overlap
        # Default order mirrors RecursiveCharacterTextSplitter best practice:
        # paragraph -> line -> sentence-like -> whitespace -> character fallback.
        self.separators = list(separators) if separators else ["\n\n", "\n", ". ", " ", ""]
        self._splitter = RecursiveCharacterTextSplitter(
            chunk_size=self.chunk_size,
            chunk_overlap=self.overlap,
            separators=self.separators,
            length_function=len,
        )

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
        chunks: list[TextChunk] = []
        chunk_idx = 0
        
        full_text = ""
        page_map = []  # List of tuples: (start_index, page_number)
        
        for page in document.pages:
            start_idx = len(full_text)
            full_text += page.text + "\n\n"
            page_map.append((start_idx, page.page_number))
            
        last_index = 0
        for chunk_text in self._splitter.split_text(full_text):
            if not chunk_text.strip():
                continue
                
            # Find the starting index of this chunk in the full_text
            chunk_start = full_text.find(chunk_text, last_index)
            if chunk_start != -1:
                last_index = chunk_start
            else:
                chunk_start = last_index  # Fallback
                
            # Determine the page number for this chunk based on start index
            current_page_num = 1
            for start_idx, page_num in page_map:
                if chunk_start >= start_idx:
                    current_page_num = page_num
                else:
                    break
                    
            chunk_key = f"{document.document_id}_chunk{chunk_idx}"
            chunk_id = str(uuid.uuid5(_NAMESPACE, chunk_key))
            chunk_idx += 1
            
            chunks.append(
                TextChunk(
                    chunk_id=chunk_id,
                    document_id=document.document_id,
                    text=chunk_text,
                    metadata={
                        "page_number": current_page_num,
                        **document.metadata,
                    },
                )
            )
            
        return chunks
