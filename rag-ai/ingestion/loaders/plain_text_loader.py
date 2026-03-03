from __future__ import annotations

from ingestion.interfaces.data_loader import DataLoader
from ingestion.models.document import DocumentBlob, ParsedDocument, ParsedPage


class PlainTextDataLoader(DataLoader):
    def supports(self, blob: DocumentBlob) -> bool:
        pass

    def load(self, blob: DocumentBlob) -> ParsedDocument:
        pass
