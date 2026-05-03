from __future__ import annotations

from io import BytesIO

from interfaces.data_loader import DataLoader
from models.document import DocumentBlob, ParsedDocument, ParsedPage

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore[assignment]


class PyPDFDataLoader(DataLoader):
    def supports(self, blob: DocumentBlob) -> bool:
        content_type = (blob.content_type or "").lower()
        filename = (blob.filename or "").lower()
        return "pdf" in content_type or filename.endswith(".pdf")

    def load(self, blob: DocumentBlob) -> ParsedDocument:
        if PdfReader is None:
            raise RuntimeError("PyPDFDataLoader requires `pypdf` package.")

        reader = PdfReader(BytesIO(blob.content))
        pages: list[ParsedPage] = []
        for index, page in enumerate(reader.pages, start=1):
            pages.append(
                ParsedPage(
                    page_number=index,
                    text=(page.extract_text() or "").strip(),
                    metadata={"loader": "pypdf"},
                )
            )

        return ParsedDocument(
            document_id=blob.document_id,
            source_uri=blob.source_uri,
            pages=pages,
            metadata={**blob.metadata, "loader": "pypdf"},
        )
