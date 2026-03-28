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
from ingestion.sources.local_file_storage import LocalFileSource
from ingestion.vector_stores.qdrant_store import QdrantVectorStore
from retrieval.stores.qdrant_store import build_qdrant_client
from ingestion.interfaces.source_connector import SourceConnector


def make_connector(source_uri: str) -> SourceConnector:
    if source_uri.startswith(("http://", "https://")):
        return HttpPresignedUrlSource()
    return LocalFileSource()

def main() -> None:
    if len(sys.argv) == 2:
        raw = sys.argv[1]
    elif not sys.stdin.isatty():
        raw = sys.stdin.read()
    else:
        print(
            "Usage: python -m ingestion.pipeline.index_documents "
            '\'{"document_id":"doc-1","source_uri":"https://...","version":"1"}\''
        )
        return

    payload = json.loads(raw)
    event = DocumentUploadEvent.from_dict(payload)
    settings = load_settings()

    orchestrator = IngestionOrchestrator(
        source_connector=make_connector(event.source_uri),
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
