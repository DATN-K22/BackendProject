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
    index_documents.py
  retrieval/
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

