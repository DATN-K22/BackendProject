# RAG AI Service

RAG agent scaffold for:
- Google ADK exposed via A2A
- LangChain for retrieval/agent orchestration
- Qdrant as the vector database

## Working Directory Model

- Working directory: `rag-ai/`
- External state: Qdrant (not local files)
- Local filesystem should only hold:
  - code/config
  - prompts
  - optional ingestion cache/temp files

## Layout

```text
rag-ai/
  agents/
    root_agent.py
    rag_agent.py
  config/
    settings.py
  ingestion/
    interfaces/
      source_connector.py
      data_loader.py
      chunker.py
      embedder.py
      vector_store.py
    events/
      event_schema.py
    models/
      document.py
    sources/
      presigned_url_source.py
    loaders/
      plain_text_loader.py
      pypdf_loader.py
      pymupdf_loader.py
    chunking/
      text_chunker.py
    embeddings/
      openai_embedder.py
    vector_stores/
      qdrant_store.py
    pipeline/
      orchestrator.py
      index_documents.py
    file_loader.py
    index_documents.py
  retrieval/
    stores/
      qdrant_store.py
    qdrant_store.py
    retriever.py
  security/
    middleware.py
  session/
    redis_session_service.py
  main.py
  requirements.txt
  .env.example
```

## Environment

Copy `.env.example` to `.env` and set your values.

Key points:
- `QDRANT_URL` points to external Qdrant
- `QDRANT_COLLECTION` should be environment-scoped (for example `edu_rag_dev`)
- Redis is optional for session persistence (fallback to memory if unavailable)

## Run

```bash
cd rag-ai
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
python3 main.py
```

## API

- `POST /` A2A JSON-RPC endpoint
- `GET /.well-known/agent.json` A2A agent card
- `GET /health`
- `GET /ready`

## Ingestion Event Model

RAG service expects document-ingestion events from your media service:

```json
{
  "document_id": "doc-123",
  "presigned_url": "https://storage/...signature...",
  "version": "1",
  "tenant_id": "tenant-a",
  "metadata": {
    "uploaded_by": "user-1"
  }
}
```

Run ingestion manually for one event:

```bash
python -m ingestion.pipeline.index_documents '{"document_id":"doc-123","presigned_url":"https://...","version":"1"}'
```
