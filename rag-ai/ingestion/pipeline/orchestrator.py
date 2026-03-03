from __future__ import annotations

from ingestion.events.event_schema import DocumentUploadEvent
from ingestion.interfaces.chunker import Chunker
from ingestion.interfaces.data_loader import DataLoader
from ingestion.interfaces.embedder import Embedder
from ingestion.interfaces.source_connector import SourceConnector
from ingestion.interfaces.vector_store import VectorWriter
from ingestion.models.document import VectorPoint


class IngestionOrchestrator:
    def __init__(
        self,
        *,
        source_connector: SourceConnector,
        data_loader: DataLoader,
        chunker: Chunker,
        embedder: Embedder,
        vector_store: VectorWriter,
    ) -> None:
        self.source_connector = source_connector
        self.data_loader = data_loader
        self.chunker = chunker
        self.embedder = embedder
        self.vector_store = vector_store

    def ingest(self, event: DocumentUploadEvent) -> int:
        pass