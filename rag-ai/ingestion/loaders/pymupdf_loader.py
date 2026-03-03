from __future__ import annotations

from ingestion.interfaces.data_loader import DataLoader
from ingestion.models.document import DocumentBlob, ParsedDocument, ParsedPage

try:
    import fitz
except ImportError:  # pragma: no cover
    fitz = None  # type: ignore[assignment]


class PyMuPDFDataLoader(DataLoader):
    def supports(self, blob: DocumentBlob) -> bool:
        pass

    def load(self, blob: DocumentBlob) -> ParsedDocument:
        pass
