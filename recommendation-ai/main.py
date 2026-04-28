from __future__ import annotations

import os
import logging
import sys
from contextlib import asynccontextmanager
from typing import AsyncIterator

from dotenv import load_dotenv
load_dotenv()  # Load .env before any os.getenv() calls

import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")
warnings.filterwarnings("ignore", category=UserWarning, module="google.adk")

import uvicorn
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route
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
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from langsmith.integrations.google_adk import configure_google_adk

# LangSmith
from langsmith.integrations.otel import configure
from langsmith.middleware import TracingMiddleware

# Local modules
from agents.root_agent import create_root_agent
from docs.openapi import DOCS_ROUTES
from security.middleware import GatewaySecurityMiddleware
from session.redis_session_service import RedisSessionService

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
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8080"))
APP_NAME = "edu-assistant"

def _convert_request_with_state_bridge(request: RequestContext, part_converter) -> AgentRunRequest:
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


# ---------------------------------------------------------------------------
# Build the application
# ---------------------------------------------------------------------------

@asynccontextmanager
async def app_lifespan(app: Starlette) -> AsyncIterator[None]:
    """Run startup/shutdown tasks for the app lifecycle."""
    logger.info("Application startup initiated.")
    configure_google_adk()
    session_service = getattr(app.state, "session_service", None)
    if isinstance(session_service, RedisSessionService):
        try:
            await session_service.connect()
            logger.info("Redis session service connected at %s", REDIS_URL)
        except Exception as exc:
            logger.error("Failed to connect to Redis at %s: %s", REDIS_URL, exc)
            raise

    try:
        yield
    finally:
        logger.info("Application shutdown initiated.")
        session_service = getattr(app.state, "session_service", None)
        if session_service and hasattr(session_service, "close"):
            try:
                await session_service.close()
                logger.info("Session service closed successfully.")
            except Exception as exc:
                logger.warning("Failed to close session service: %s", exc)


def build_app() -> Starlette:
    """
    Initialise services and return the fully configured Starlette ASGI app.

    Call order matters:
      1. Connect Redis (async)
      2. Create the root agent
      3. Wrap with to_a2a() — passes our session/artifact services in
      4. Layer GatewaySecurityMiddleware on top
      5. Add health check routes
    """
    # 1. Create Redis session service (connected in lifespan startup)
    session_service = RedisSessionService(
        redis_url=REDIS_URL,
        redis_password=REDIS_PASSWORD,
    )
    session_backend = "redis"


    root_agent = create_root_agent()

    runner = Runner(
        agent=root_agent,
        app_name=APP_NAME,
        session_service=session_service,
        artifact_service=InMemoryArtifactService(),
    )

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
            rpc_url=f"http://localhost:{PORT}/",
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
    
    a2a_app.add_middleware(TracingMiddleware)
    logger.info("TracingMiddleware applied to A2A app.")
    a2a_app.add_middleware(
        GatewaySecurityMiddleware,
        trusted_gateway_secret=os.getenv("GATEWAY_SHARED_SECRET"),
    )
    logger.info("GatewaySecurityMiddleware applied.")

    a2a_app.routes.insert(0, Route("/health", health_check, methods=["GET"]))
    a2a_app.routes.insert(1, Route("/ready", readiness_check, methods=["GET"]))
    for i, route in enumerate(DOCS_ROUTES):
        a2a_app.routes.insert(2 + i, route)
    logger.info("Health check endpoints added at /health and /ready")
    logger.info("API docs available at /docs")

    a2a_app.state.session_service = session_service
    a2a_app.state.session_backend = session_backend

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
