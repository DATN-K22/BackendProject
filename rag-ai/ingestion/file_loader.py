from __future__ import annotations

from ingestion.interfaces.data_loader import DataLoader
from ingestion.loaders.plain_text_loader import PlainTextDataLoader
from ingestion.loaders.pymupdf_loader import PyMuPDFDataLoader
from ingestion.loaders.pypdf_loader import PyPDFDataLoader
from ingestion.models.document import DocumentBlob, ParsedDocument


class FileLoader(DataLoader):
    def __init__(self, loaders: list[DataLoader] | None = None) -> None:
        self._loaders = loaders or [
            PlainTextDataLoader(),
            PyMuPDFDataLoader(),
            PyPDFDataLoader(),
        ]

    def supports(self, blob: DocumentBlob) -> bool:
        return any(loader.supports(blob) for loader in self._loaders)

    def load(self, blob: DocumentBlob) -> ParsedDocument:
        for loader in self._loaders:
            if loader.supports(blob):
                return loader.load(blob)
        raise ValueError(
            f"No loader matched content_type={blob.content_type} filename={blob.filename}"
        )
