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
        blob = self.source_connector.fetch(
            event.source_uri,
            document_id=event.document_id,
            metadata={**event.metadata, "version": event.version},
        )
        if not self.data_loader.supports(blob):
            raise ValueError(
                f"No supported loader for content_type={blob.content_type} filename={blob.filename}"
            )

        parsed_document = self.data_loader.load(blob)
        chunks = self.chunker.chunk(parsed_document)
        if not chunks:
            return 0

        vectors = self.embedder.embed([chunk.text for chunk in chunks])
        if len(vectors) != len(chunks):
            raise ValueError(
                "Embedder returned mismatched vector count: "
                f"{len(vectors)} vectors for {len(chunks)} chunks"
            )

        points = [
            VectorPoint(
                point_id=chunk.chunk_id,
                vector=vector,
                payload={
                    **chunk.metadata,
                    "document_id": chunk.document_id,
                    "chunk_id": chunk.chunk_id,
                    "text": chunk.text,
                },
            )
            for chunk, vector in zip(chunks, vectors, strict=True)
        ]
        self.vector_store.upsert(points, namespace=event.tenant_id)
        return len(points)
