from __future__ import annotations

import os
import logging
import sys

from dotenv import load_dotenv
load_dotenv()  # Load .env before any os.getenv() calls

import warnings
warnings.filterwarnings("ignore", category=UserWarning, module="pydantic")
warnings.filterwarnings("ignore", category=UserWarning, module="google.adk")

import uvicorn
from starlette.applications import Starlette
from starlette.middleware import Middleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

# ADK core
from google.adk.a2a.utils.agent_to_a2a import to_a2a
from google.adk.artifacts import InMemoryArtifactService
from google.adk.runners import Runner

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
HOST = os.getenv("HOST", "0.0.0.0")
PORT = int(os.getenv("PORT", "8080"))
APP_NAME = "edu-assistant"


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
        # Check Redis connection if available
        session_service = getattr(request.app.state, "session_service", None)
        if session_service and hasattr(session_service, "_client"):
            # Quick ping to verify Redis is responsive
            if session_service._client:
                await session_service._client.ping()
        
        return JSONResponse({
            "status": "ready",
            "service": APP_NAME
        })
    except Exception as e:
        logger.error(f"Readiness check failed: {e}")
        return JSONResponse(
            {"status": "not ready", "error": str(e)},
            status_code=503
        )


# ---------------------------------------------------------------------------
# Build the application
# ---------------------------------------------------------------------------

async def build_app() -> Starlette:
    """
    Initialise services and return the fully configured Starlette ASGI app.

    Call order matters:
      1. Connect Redis (async)
      2. Create the root agent
      3. Wrap with to_a2a() — passes our session/artifact services in
      4. Layer GatewaySecurityMiddleware on top
      5. Add health check routes
    """

    # 1. Redis session service with error handling
    session_service = RedisSessionService(redis_url=REDIS_URL)
    try:
        await session_service.connect()
        logger.info("Redis session service connected at %s", REDIS_URL)
    except Exception as e:
        logger.error(f"Failed to connect to Redis at {REDIS_URL}: {e}")
        logger.error("Service will start but session persistence will fail")
        # In production, you might want to fail fast instead:
        # raise RuntimeError(f"Cannot start without Redis: {e}") from e

    # 2. Root agent (course_agent + schedule_agent as sub-agents)
    root_agent = create_root_agent()

    # 3. to_a2a() — the ADK-native way to expose an agent via A2A protocol
    #
    #    Build a Runner with our custom session/artifact services first,
    #    then pass it to to_a2a() via the runner= kwarg.
    runner = Runner(
        agent=root_agent,
        app_name=APP_NAME,
        session_service=session_service,
        artifact_service=InMemoryArtifactService(),
    )

    a2a_app: Starlette = to_a2a(
        root_agent,
        port=PORT,
        runner=runner,
    )
    logger.info("to_a2a() wrapped root_agent as A2A Starlette app.")

    # 4. Wrap with security middleware
    #    Starlette middleware wraps the entire app, so every route — including
    #    the A2A JSON-RPC endpoint and the agent card endpoint — is protected.
    #    Requests that did not pass through the API gateway (missing the
    #    X-Forwarded-By-Gateway header) are rejected with 401 before reaching
    #    any ADK code.
    a2a_app.add_middleware(
        GatewaySecurityMiddleware,
        trusted_gateway_secret=os.getenv("GATEWAY_SHARED_SECRET"),
    )
    logger.info("GatewaySecurityMiddleware applied.")

    # 5. Add health check routes
    #    Mount health endpoints that bypass security middleware for k8s probes
    #    We'll create a new route and mount it
    a2a_app.routes.insert(0, Route("/health", health_check, methods=["GET"]))
    a2a_app.routes.insert(1, Route("/ready", readiness_check, methods=["GET"]))
    for i, route in enumerate(DOCS_ROUTES):
        a2a_app.routes.insert(2 + i, route)
    logger.info("Health check endpoints added at /health and /ready")
    logger.info("API docs available at /docs")

    # Store session service in app state for readiness check
    a2a_app.state.session_service = session_service

    return a2a_app


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    import asyncio

    async def main():
        app = await build_app()
        config = uvicorn.Config(
            app=app,
            host=HOST,
            port=PORT,
            log_level="info",
        )
        server = uvicorn.Server(config)
        await server.serve()

    asyncio.run(main())