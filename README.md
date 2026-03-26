# BackendProject - Agent Services Run Guide

This guide explains how to run the **AI agent part** of this repository:

- `orchestrator-ai`
- `rag-ai`
- `recommendation-ai`

It includes running **Redis** and **Qdrant** with Docker.

## 1. Prerequisites

- Docker Desktop (or Docker Engine + Docker Compose)
- Python 3.11+
- (Optional) Conda, if you want to use the existing `.conda` environment pattern in this repo
- An OpenAI-compatible key for LiteLLM models (`OPENAI_API_KEY`)

## 2. Start Redis and Qdrant with Docker

From project root:

```bash
docker compose -f - up -d <<'YAML'
services:
  redis:
    image: redis:7-alpine
    container_name: backend_redis
    ports:
      - "6379:6379"
    restart: unless-stopped

  qdrant:
    image: qdrant/qdrant:v1.13.4
    container_name: backend_qdrant
    ports:
      - "6333:6333"
      - "6334:6334"
    volumes:
      - qdrant_storage:/qdrant/storage
    restart: unless-stopped

volumes:
  qdrant_storage:
YAML
```

Quick checks:

```bash
# Redis should return PONG
docker exec backend_redis redis-cli ping

# Qdrant health
curl http://localhost:6333/healthz
```

## 3. Python environment and dependencies

### Option A: Use existing repo Conda environment

From project root:

```bash
conda create -y -p ./.conda python=3.11
conda activate /absolute/path/to/BackendProject/.conda

pip install -r orchestrator-ai/requirement.txt
pip install -r rag-ai/requirements.txt
pip install -r recommendation-ai/requirements.txt
```

### Option B: Use venv

```bash
python3 -m venv .venv
source .venv/bin/activate

pip install -r orchestrator-ai/requirement.txt
pip install -r rag-ai/requirements.txt
pip install -r recommendation-ai/requirements.txt
```

```ps
python3 -m venv .venv
.\.venv\Scripts\Activate.ps1

pip install -r orchestrator-ai/requirement.txt
pip install -r rag-ai/requirements.txt
pip install -r recommendation-ai/requirements.txt
```


## 4. To add mock data to qdrant
```bash
# change working direction to rag-ai
cd rag-ai

# run pipeline to adding mock data to qdrant
i=1                                                         
for f in ingestion/mock_file/course_21/*.pdf; do
  python -m ingestion.pipeline.index_documents \
    "{\"document_id\":\"course21-doc-$i\",\"source_uri\":\"$f\",\"version\":\"1\",\"tenant_id\":\"course_21\"}"
  i=$((i+1))
done
```

PowerShell equivalent:

```ps1
# change working directory to rag-ai
cd rag-ai

# run pipeline to add mock data to qdrant
$i = 1
Get-ChildItem -Path "ingestion/mock_file/course_21" -Filter *.pdf | ForEach-Object {
  $payload = @{
    document_id = "course21-doc-$i"
    source_uri  = $_.FullName
    version     = "1"
    tenant_id   = "course_21"
  } | ConvertTo-Json -Compress

  python -m ingestion.pipeline.index_documents $payload
  $i++
}
```


## 5. Environment variables

Create `.env` files in each AI service folder.

### 4.1 `orchestrator-ai/.env`

```env
HOST=0.0.0.0
PORT=3007
REDIS_URL=redis://localhost:6379/0

# Optional gateway check (set same value across all services if used)
GATEWAY_SHARED_SECRET=dev-secret

# Orchestrator -> downstream agent URLs
RECOMMENDATION_AGENT_URL=http://localhost:3009
RAG_AGENT_URL=http://localhost:3008

# LiteLLM/OpenAI
OPENAI_API_KEY=your_key_here
```

### 4.2 `recommendation-ai/.env`

```env
HOST=0.0.0.0
PORT=3009
REDIS_URL=redis://localhost:6379/2
GATEWAY_SHARED_SECRET=dev-secret

# If MCP backends are not running yet, disable for local bring-up
COURSE_MCP_ENABLED=false
SCHEDULE_MCP_ENABLED=false

# LiteLLM/OpenAI
OPENAI_API_KEY=your_key_here
```

### 4.3 `rag-ai/.env`

```env
APP_NAME=rag-assistant
HOST=0.0.0.0
PORT=3008
REDIS_URL=redis://localhost:6379/1
GATEWAY_SHARED_SECRET=dev-secret

CHAT_MODEL=openai/gpt-5-nano
EMBEDDING_MODEL=text-embedding-3-small
OPENAI_API_KEY=your_key_here

QDRANT_URL=http://localhost:6333
QDRANT_COLLECTION=edu_rag_dev
QDRANT_VECTOR_SIZE=1536
QDRANT_DISTANCE=Cosine
# QDRANT_API_KEY=
```

## 5. Run the three agent services

Open 3 terminals (with the same Python environment activated), then run:

```bash
cd orchestrator-ai && python main.py
```

```bash
cd rag-ai && python main.py
```

```bash
cd recommendation-ai && python main.py
```

Recommended startup order:

1. `recommendation-ai` (port `3009`)
2. `rag-ai` (port `3008`)
3. `orchestrator-ai` (port `3007`)

## 6. Verify services are up

```bash
curl http://localhost:3009/health
curl http://localhost:3008/health
curl http://localhost:3007/health
```

Readiness endpoints:

```bash
curl http://localhost:3009/ready
curl http://localhost:3008/ready
curl http://localhost:3007/ready
```

Agent cards:

```bash
curl http://localhost:3009/.well-known/agent.json
curl http://localhost:3008/.well-known/agent.json
curl http://localhost:3007/.well-known/agent.json
```

## 7. Stop dependencies

```bash
docker stop backend_qdrant backend_redis
docker rm backend_qdrant backend_redis
```

If you also want to remove Qdrant data volume:

```bash
docker volume rm backendproject_qdrant_storage 2>/dev/null || true
docker volume ls | grep qdrant_storage
```

## Notes

- The root `exec.sh` script starts **all** services (Node + AI). For agent-only development, use this README flow.
- Default code uses `PORT=8080` in multiple services. This guide sets unique local ports (`3007`, `3008`, `3009`) to avoid conflicts.
- Current root `Docker-compose.yml` only contains API gateway config; Redis/Qdrant are started separately here for agent development.
