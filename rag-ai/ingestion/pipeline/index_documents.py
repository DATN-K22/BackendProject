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
    pass


if __name__ == "__main__":
    main()
