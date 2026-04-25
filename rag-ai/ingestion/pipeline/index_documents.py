from __future__ import annotations

import json
import os

import pika
from dotenv import load_dotenv

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

load_dotenv()

RABBITMQ_URL = os.getenv(
    "RABBITMQ_URL",
    "amqp://guest:guest@localhost:5672/"
)

QUEUE_NAME = "data_queue"


# ---------------------------
# Connector factory
# ---------------------------
def make_connector(source_uri: str) -> SourceConnector:
    if source_uri.startswith(("http://", "https://")):
        return HttpPresignedUrlSource()
    return LocalFileSource()


# ---------------------------
# Core handler (replace Celery task)
# ---------------------------
def handle_message(body: bytes) -> int:
    payload = json.loads(body)

    # handle NestJS format
    data = payload.get("data", payload)

    event = DocumentUploadEvent.from_dict(data)

    print(f"[PROCESS] {event.document_id} - {event.source_uri}")

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

    print(f"[DONE] Indexed {count} chunks for {event.document_id}")
    return count


# ---------------------------
# RabbitMQ consumer
# ---------------------------
def start_worker():
    params = pika.URLParameters(RABBITMQ_URL)
    connection = pika.BlockingConnection(params)
    channel = connection.channel()

    channel.queue_declare(queue=QUEUE_NAME, durable=True)

    # tránh flood worker
    channel.basic_qos(prefetch_count=1)

    def callback(ch, method, properties, body):
        try:
            handle_message(body)

            # ACK khi thành công
            ch.basic_ack(delivery_tag=method.delivery_tag)

        except Exception as e:
            print(f"[ERROR] {e}")

            # reject, không retry (có thể gửi DLQ nếu cần)
            ch.basic_nack(
                delivery_tag=method.delivery_tag,
                requeue=False
            )

    channel.basic_consume(
        queue=QUEUE_NAME,
        on_message_callback=callback
    )

    print("[*] Waiting for messages...")
    channel.start_consuming()


if __name__ == "__main__":
    start_worker()