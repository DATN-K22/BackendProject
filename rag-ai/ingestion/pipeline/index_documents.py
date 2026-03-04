from __future__ import annotations

import json
import sys

from config.settings import load_settings
from ingestion.chunking.text_chunker import FixedWindowChunker
from ingestion.embeddings.openai_embedder import OpenAIEmbedder
from ingestion.events.event_schema import DocumentUploadEvent
from ingestion.file_loader import FileLoader
from ingestion.pipeline.orchestrator import IngestionOrchestrator
from ingestion.sources.presigned_url_source import HttpPresignedUrlSource
from ingestion.vector_stores.qdrant_store import QdrantVectorStore
from retrieval.stores.qdrant_store import build_qdrant_client


def main() -> None:
    if len(sys.argv) != 2:
        print(
            "Usage: python -m ingestion.pipeline.index_documents "
            '\'{"document_id":"doc-1","presigned_url":"https://...","version":"1"}\''
        )
        return

    payload = json.loads(sys.argv[1])
    event = DocumentUploadEvent.from_dict(payload)
    settings = load_settings()

    orchestrator = IngestionOrchestrator(
        source_connector=HttpPresignedUrlSource(),
        data_loader=FileLoader(),
        chunker=FixedWindowChunker(),
        embedder=OpenAIEmbedder(settings.embedding_model),
        vector_store=QdrantVectorStore(
            client=build_qdrant_client(settings),
            collection_name=settings.qdrant_collection,
            vector_size=settings.qdrant_vector_size,
            distance=settings.qdrant_distance,
        ),
    )
    count = orchestrator.ingest(event)
    print(f"Indexed {count} chunks for document_id={event.document_id}")


if __name__ == "__main__":
    main()
