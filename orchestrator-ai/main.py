from __future__ import annotations

import logging
import sys
import os
from contextlib import asynccontextmanager
from typing import AsyncIterator

from dotenv import load_dotenv
if not os.getenv("DOPPLER_PROJECT"):
    load_dotenv()
import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
from uuid import uuid4

# A2A server
from a2a.server.apps import A2AStarletteApplication
from a2a.server.request_handlers import DefaultRequestHandler
from a2a.server.tasks import InMemoryPushNotificationConfigStore, InMemoryTaskStore
from a2a.server.agent_execution.context import RequestContext

# ADK core
from google.adk.a2a.utils.agent_card_builder import AgentCardBuilder
from google.adk.a2a.executor.a2a_agent_executor import A2aAgentExecutor
from google.adk.a2a.executor.config import A2aAgentExecutorConfig
from google.adk.a2a.converters.request_converter import (
    AgentRunRequest,
    convert_a2a_request_to_agent_run_request,
)
from google.adk.artifacts import InMemoryArtifactService
from google.adk.events.event import Event
from google.adk.events.event_actions import EventActions
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from google.adk.sessions.database_session_service import DatabaseSessionService
from google.adk.apps.app import EventsCompactionConfig, App

# LangSmith
from langsmith.integrations.google_adk import configure_google_adk
from langsmith import Client

# Local
from agents.root_agent import create_root_agent
from agents.remote_http_client import close_remote_agent_http_client
from docs.openapi import DOCS_ROUTES
from security.middleware import GatewaySecurityMiddleware
from session.redis_session_service import RedisSessionService
from models.chat_model import ChatHistoryResponse, PendingApproval, get_chat_history

# Pass the warning filter to the entire module to suppress warnings from pydantic and google.adk
import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")
warnings.filterwarnings("ignore", category=UserWarning, module="google.adk")

# ---------------------------------------------------------------------------
# Logging Configuration
# ---------------------------------------------------------------------------
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(name)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(sys.stdout)
    ]
)
logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Configuration
# ---------------------------------------------------------------------------
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
REDIS_PASSWORD = os.getenv("REDIS_PASSWORD")
DATABASE_URL = os.getenv("DATABASE_URL", "sqlite:///./test.db")
HOST = os.getenv("HOST", "0.0.0.0")
ADK_HOST = os.getenv("ADK_HOST", "orchestrator-ai.local")
PORT = int(os.getenv("PORT", "8080"))
APP_NAME = "edu_assistant"
LANGSMITH_PROJECT = os.getenv("LANGSMITH_PROJECT", "default")


# ---------------------------------------------------------------------------
# State Bridge — inject adk_state metadata into session state on every message
# ---------------------------------------------------------------------------

def _convert_request_with_state_bridge(request: RequestContext, part_converter) -> AgentRunRequest:
    """Custom request converter that reads adk_state from A2A message metadata
    and applies it as a state_delta so the orchestrator's session is always
    up-to-date without a separate /session_state endpoint call."""
    run_request = convert_a2a_request_to_agent_run_request(request, part_converter)
    metadata = request.metadata or {}
    adk_state = metadata.get("adk_state")
    if isinstance(adk_state, dict):
        state_delta = {k: v for k, v in adk_state.items() if v is not None}
        if state_delta:
            run_request.state_delta = state_delta
    return run_request

# ---------------------------------------------------------------------------
# Health Check
# ---------------------------------------------------------------------------

async def health_check(request: Request) -> JSONResponse:
    """Health check endpoint for container orchestration."""
    return JSONResponse({
        "status": "healthy",
        "service": APP_NAME,
        "version": "1.0.0"
    })


async def readiness_check(request: Request) -> JSONResponse:
    """Readiness check - verifies dependencies are available."""
    try:
        session_backend = getattr(request.app.state, "session_backend", "unknown")
        session_service = getattr(request.app.state, "session_service", None)
        if session_backend == "redis" and session_service and hasattr(session_service, "_client"):
            if session_service._client:
                await session_service._client.ping()

        if session_backend == "in-memory":
            return JSONResponse(
                {
                    "status": "ready",
                    "service": APP_NAME,
                    "session_backend": session_backend,
                    "mode": "degraded",
                }
            )

        return JSONResponse(
            {
                "status": "ready",
                "service": APP_NAME,
                "session_backend": session_backend,
            }
        )
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return JSONResponse(
            {"status": "not ready", "error": str(e)},
            status_code=503
        )
        
async def chat_history(request: Request) -> JSONResponse:
    """Endpoint to retrieve chat history for a session."""
    try:
        session_id = request.query_params.get("session_id")
        app_name = APP_NAME
        user_id = request.headers.get("x-user-id", "anonymous")  # Assuming user ID is passed in headers; adjust as needed
        if not session_id or not app_name or not user_id:
            return JSONResponse({"error": "Missing required query parameters"}, status_code=400)

        session_service = getattr(request.app.state, "session_service", None)
        if not session_service:
            return JSONResponse({"error": "Session service not available"}, status_code=503)

        chat_history = await get_chat_history(
            session_id=session_id,
            app_name=app_name,
            user_id=user_id,
            service=session_service
        )

        return JSONResponse({
            "session_id": session_id,
            "chat_history": [e.model_dump(mode="json") for e in chat_history.messages]
        })
    except Exception as e:
        logger.error(f"Failed to retrieve chat history: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)
    
    
async def get_list_of_sessions(request: Request) -> JSONResponse:
    """Endpoint to retrieve list of sessions for a user."""
    try:
        app_name = APP_NAME
        user_id = request.headers.get("x-user-id", "anonymous")  # Assuming user ID is passed in headers; adjust as needed
        if not app_name or not user_id:
            return JSONResponse({"error": "Missing required parameters"}, status_code=400)

        session_service = getattr(request.app.state, "session_service", None)
        if not session_service:
            return JSONResponse({"error": "Session service not available"}, status_code=503)

        sessions = await session_service.list_sessions(app_name=app_name, user_id=user_id)
        
        return JSONResponse({
            "user_id": user_id,
            "sessions": sessions.model_dump(mode="json")["sessions"]
        })
    except Exception as e:
        logger.error(f"Failed to retrieve sessions: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)
async def session_state_update(request: Request) -> JSONResponse:
    """Endpoint to update session state with conversation title, timezone and course id."""
    try:
        data = await request.json()
        session_id = data.get("session_id")
        conversation_title = data.get("conversation_title")
        timezone = data.get("timezone")
        course_id = data.get("course_id")
        user_id = request.headers.get("x-user-id", "anonymous")

        if not session_id:
            session_id = str(uuid4())  # Generate a new session ID if not provided

        session_service = getattr(request.app.state, "session_service", None)
        if not session_service:
            return JSONResponse({"error": "Session service not available"}, status_code=503)

        session = await session_service.get_session(
            app_name=APP_NAME,
            user_id=user_id,
            session_id=session_id,
        )
        if not session:
            session = await session_service.create_session(
                app_name=APP_NAME,
                user_id=user_id,
                session_id=session_id,
            )

        state_delta = {}
        if conversation_title is not None:
            state_delta["conversation_title"] = conversation_title
        if timezone is not None:
            state_delta["timezone"] = timezone
        if course_id is not None:
            state_delta["course_id"] = course_id

        if not state_delta:
            return JSONResponse(
                {"error": "No state fields to update"}, status_code=400
            )

        await session_service.append_event(
            session,
            Event(
                author="system",
                actions=EventActions(state_delta=state_delta),
            ),
        )

        return JSONResponse({"status": "success", "state_delta": state_delta, "session_id": session_id})
    except Exception as e:
        logger.error(f"Failed to update session state: {e}")
        return JSONResponse({"error": str(e)}, status_code=500)


# ---------------------------------------------------------------------------
# Build the application
# ---------------------------------------------------------------------------

@asynccontextmanager
async def app_lifespan(app: Starlette) -> AsyncIterator[None]:
    """Run startup/shutdown tasks for the app lifecycle."""
    logger.info("Application startup initiated.")
    configure_google_adk()
    try:
        app.state.langsmith_client = Client()
        logger.info("LangSmith client initialised for project '%s'.", LANGSMITH_PROJECT)
    except Exception as exc:
        logger.warning("LangSmith initialisation failed: %s", exc)
        app.state.langsmith_client = None

    try:
        yield
    finally:
        logger.info("Application shutdown initiated.")
        await close_remote_agent_http_client()


def build_app() -> Starlette:
    """
    Build and return the fully configured Starlette ASGI app.

    Call order matters:
      1. Create session service (DatabaseSessionService / Postgres)
      2. Create the root agent, App, and Runner
      3. Wire A2aAgentExecutor with the state-bridge request converter
      4. Build the A2AStarletteApplication and mount routes
      5. Layer GatewaySecurityMiddleware on top
    """
    session_service = DatabaseSessionService(DATABASE_URL, connect_args={
        "server_settings": {
            "search_path": "ai_service"   # your schema name
        },
        "ssl": True
    })
    # Redis alternative (uncomment to switch):
    # session_service = RedisSessionService(
    #     redis_url=REDIS_URL,
    #     redis_password=REDIS_PASSWORD,
    # )
    session_backend = "postgres"  # Update this if you switch to Redis or another backend

    root_agent = create_root_agent()

    app = App(
        name=APP_NAME,
        root_agent=root_agent,
        events_compaction_config=EventsCompactionConfig(
            compaction_interval=8,  # Trigger compaction every 8 new invocations.
            overlap_size=3          # Include last invocation from the previous window.
        )
    )

    runner = Runner(
        app=app,
        session_service=session_service,
        artifact_service=InMemoryArtifactService(),
    )

    # Wire the custom executor so adk_state metadata is applied to session state
    # on every incoming message — no separate /session_state call needed.
    agent_executor = A2aAgentExecutor(
        runner=runner,
        config=A2aAgentExecutorConfig(
            request_converter=_convert_request_with_state_bridge,
        ),
    )
    request_handler = DefaultRequestHandler(
        agent_executor=agent_executor,
        task_store=InMemoryTaskStore(),
        push_config_store=InMemoryPushNotificationConfigStore(),
    )

    async def _setup_a2a(app: Starlette) -> None:
        card_builder = AgentCardBuilder(
            agent=root_agent,
            rpc_url=f"http://{ADK_HOST}:{PORT}/",
        )
        agent_card = await card_builder.build()
        A2AStarletteApplication(
            agent_card=agent_card,
            http_handler=request_handler,
        ).add_routes_to_app(app)

    @asynccontextmanager
    async def _combined_lifespan(app: Starlette) -> AsyncIterator[None]:
        await _setup_a2a(app)
        async with app_lifespan(app):
            yield

    a2a_app: Starlette = Starlette(lifespan=_combined_lifespan)
    logger.info("Custom A2A app initialized with request metadata -> state bridge.")

    a2a_app.add_middleware(
        GatewaySecurityMiddleware,
        trusted_gateway_secret=os.getenv("GATEWAY_SHARED_SECRET"),
    )
    logger.info("GatewaySecurityMiddleware applied.")

    a2a_app.routes.insert(0, Route("/health", health_check, methods=["GET"]))
    a2a_app.routes.insert(1, Route("/ready", readiness_check, methods=["GET"]))
    a2a_app.routes.insert(2, Route("/chat_history", chat_history, methods=["GET"]))
    a2a_app.routes.insert(3, Route("/sessions", get_list_of_sessions, methods=["GET"]))
    a2a_app.routes.insert(4, Route("/session_state", session_state_update, methods=["POST"]))
    for i, route in enumerate(DOCS_ROUTES):
        a2a_app.routes.insert(5 + i, route)

    logger.info("Routes added: /health, /ready, /chat_history, /sessions, /session_state")
    logger.info("API docs available at /docs")

    a2a_app.state.session_service = session_service
    a2a_app.state.session_backend = session_backend
    a2a_app.state.runner = runner

    return a2a_app


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def create_app() -> Starlette:
    """Sync app factory for uvicorn --factory (supports --reload)."""
    return build_app()


if __name__ == "__main__":
    app = build_app()
    config = uvicorn.Config(
        app=app,
        host=HOST,
        port=PORT,
        log_level="info",
    )
    server = uvicorn.Server(config)
    server.run()
