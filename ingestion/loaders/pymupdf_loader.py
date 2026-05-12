from __future__ import annotations

from interfaces.data_loader import DataLoader
from models.document import DocumentBlob, ParsedDocument, ParsedPage

try:
    import pymupdf
except ImportError:  # pragma: no cover
    pymupdf = None  # type: ignore[assignment]


class PyMuPDFDataLoader(DataLoader):
    def supports(self, blob: DocumentBlob) -> bool:
        content_type = (blob.content_type or "").lower()
        filename = (blob.filename or "").lower()
        return "pdf" in content_type or filename.endswith(".pdf")

    def load(self, blob: DocumentBlob) -> ParsedDocument:
        if pymupdf is None:
            raise RuntimeError("PyMuPDFDataLoader requires `pymupdf` package.")

        pages: list[ParsedPage] = []
        with pymupdf.open(stream=blob.content, filetype="pdf") as doc:
            for page_num in range(doc.page_count):
                page = doc.load_page(page_num)
                text = page.get_text("text").strip()
                pages.append(
                    ParsedPage(
                        page_number=page_num + 1,
                        text=text,
                        metadata={"loader": "pymupdf"},
                    )
                )

        return ParsedDocument(
            document_id=blob.document_id,
            source_uri=blob.source_uri,
            pages=pages,
            metadata={**blob.metadata, "loader": "pymupdf"},
        )
