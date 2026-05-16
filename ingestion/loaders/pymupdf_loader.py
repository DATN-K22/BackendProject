from __future__ import annotations

from interfaces.data_loader import DataLoader
from models.document import DocumentBlob, ParsedDocument, ParsedPage

try:
    import pymupdf
    import pymupdf4llm
except ImportError:  # pragma: no cover
    pymupdf = None  # type: ignore[assignment]
    pymupdf4llm = None  # type: ignore[assignment]


class PyMuPDFDataLoader(DataLoader):
    def supports(self, blob: DocumentBlob) -> bool:
        content_type = (blob.content_type or "").lower()
        filename = (blob.filename or "").lower()
        return "pdf" in content_type or filename.endswith(".pdf")

    def load(self, blob: DocumentBlob) -> ParsedDocument:
        if pymupdf is None or pymupdf4llm is None:
            raise RuntimeError("PyMuPDFDataLoader requires `pymupdf` and `pymupdf4llm` packages.")

        pages: list[ParsedPage] = []
        with pymupdf.open(stream=blob.content, filetype="pdf") as doc:
            md_output = pymupdf4llm.to_markdown(doc, page_chunks=True)
            
            if isinstance(md_output, str):
                pages.append(
                    ParsedPage(
                        page_number=1,
                        text=md_output.strip(),
                        metadata={"loader": "pymupdf4llm"},
                    )
                )
            else:
                for idx, chunk in enumerate(md_output):
                    page_num = chunk.get("metadata", {}).get("page", idx + 1)
                    pages.append(
                        ParsedPage(
                            page_number=page_num,
                            text=chunk.get("text", "").strip(),
                            metadata={"loader": "pymupdf4llm"},
                        )
                    )

        return ParsedDocument(
            document_id=blob.document_id,
            source_uri=blob.source_uri,
            pages=pages,
            metadata={**blob.metadata, "filename": blob.filename, "loader": "pymupdf4llm"},
        )
