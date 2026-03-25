# Recommendation AI Service

EduAssistant AI service for course recommendations and schedule management using Google ADK and Agent-to-Agent (A2A) protocol.

## Architecture

This service acts as the AI orchestrator for the educational platform:

- **Root Agent**: Main coordinator that routes requests to specialist sub-agents
- **Course Agent**: Handles course search, details, and personalized recommendations
- **Schedule Agent**: Manages student schedules with human-in-the-loop (HITL) approval for modifications

## Features

- 🤖 Multi-agent orchestration with Google ADK
- 🔐 Gateway security middleware with JWT validation
- 📦 Redis-backed session persistence
- 🔌 MCP (Model Context Protocol) integration for external tools
- ✅ Human-in-the-loop approval for schedule modifications
- 🏥 Health check endpoints for container orchestration

## Prerequisites

- Python 3.11+
- Redis server
- Google API Key (for Gemini)
- Course MCP server (running on port 8001)
- Schedule MCP server (running on port 8002)

## Environment Variables

```bash
GOOGLE_API_KEY=your-gemini-api-key-here
REDIS_URL=redis://localhost:6379/0
COURSE_MCP_URL=http://localhost:8001/sse
SCHEDULE_MCP_URL=http://localhost:8002/sse
GATEWAY_SHARED_SECRET=your-gateway-secret
HOST=0.0.0.0
PORT=8080
```

## Installation

```bash
# Install dependencies
pip install -r requirements.txt

# Set up environment variables
cp .env.example .env
# Edit .env with your configuration
```

## Running the Service

### Development Mode

```bash
python main.py
```

### Using Docker

```bash
docker build -f Dockerfile.dev -t recommendation-ai:dev .
docker run -p 8080:8080 --env-file .env recommendation-ai:dev
```

## API Endpoints

### A2A Protocol Endpoints

- `POST /` - JSON-RPC A2A endpoint (streaming)
- `GET /.well-known/agent.json` - Agent card metadata

### Health Checks

- `GET /health` - Basic health check
- `GET /ready` - Readiness probe (checks Redis connectivity)

## Security

This service expects to run behind an API gateway that:

1. Validates JWT tokens
2. Injects user identity headers:
   - `X-User-Id`
   - `X-User-Roles`
   - `X-Tenant-Id`
   - `X-Forwarded-By-Gateway`

Direct requests bypassing the gateway will be rejected with 401.

## Development

### Project Structure

```
recommendation-ai/
├── agents/              # Agent implementations
│   ├── root_agent.py   # Main orchestrator
│   ├── course_agent.py # Course recommendations
│   └── schedule_agent.py # Schedule management
├── mcp/                # MCP toolset factory
├── security/           # Security middleware
├── session/            # Redis session service
├── main.py            # Application entry point
└── requirements.txt   # Python dependencies
```

### Adding New Agents

1. Create agent in `agents/` directory
2. Define agent instructions and tools
3. Register in root agent's `sub_agents` list
4. Update `agents/__init__.py`

## License

Proprietary - Educational Platform Backend Project
