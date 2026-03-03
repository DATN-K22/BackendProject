from __future__ import annotations

from io import BytesIO

from ingestion.interfaces.data_loader import DataLoader
from ingestion.models.document import DocumentBlob, ParsedDocument, ParsedPage

try:
    from pypdf import PdfReader
except ImportError:  # pragma: no cover
    PdfReader = None  # type: ignore[assignment]


class PyPDFDataLoader(DataLoader):
    def supports(self, blob: DocumentBlob) -> bool:
        pass

    def load(self, blob: DocumentBlob) -> ParsedDocument:
        pass
