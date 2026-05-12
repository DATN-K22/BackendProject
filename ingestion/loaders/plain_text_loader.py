from __future__ import annotations

from interfaces.data_loader import DataLoader
from models.document import DocumentBlob, ParsedDocument, ParsedPage


class PlainTextDataLoader(DataLoader):
    def supports(self, blob: DocumentBlob) -> bool:
        content_type = (blob.content_type or "").lower()
        filename = (blob.filename or "").lower()
        return (
            content_type.startswith("text/")
            or filename.endswith(".txt")
            or filename.endswith(".md")
        )

    def load(self, blob: DocumentBlob) -> ParsedDocument:
        text = blob.content.decode("utf-8", errors="ignore").strip()
        page = ParsedPage(
            page_number=1,
            text=text,
            metadata={"loader": "text"},
        )
        return ParsedDocument(
            document_id=blob.document_id,
            source_uri=blob.source_uri,
            pages=[page],
            metadata={**blob.metadata, "loader": "text"},
        )
