from __future__ import annotations

import json
import os
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
from celery import Celery
from dotenv import load_dotenv

load_dotenv()

RABBITMQ_URL = os.getenv("RABBITMQ_URL", "amqp://guest:guest@localhost:5672//")

app = Celery('data_queue', broker=RABBITMQ_URL)

def make_connector(source_uri: str) -> SourceConnector:
    if source_uri.startswith(("http://", "https://")):
        return HttpPresignedUrlSource()
    return LocalFileSource()


@app.task(name="ingestion.index_document")
def index_document_task(*args, **kwargs) -> int:
    """Hàm này sẽ được Celery Worker thực thi ngầm"""
    if args:
        raw = args[0]
    else:
        raw = kwargs

    # Unwrap NestJS envelope if present
    if isinstance(raw, dict) and 'data' in raw:
        raw = raw['data']

    event = DocumentUploadEvent.from_dict(raw)
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
    return count

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

    raw = raw.strip().lstrip("\ufeff")
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
