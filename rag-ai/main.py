from __future__ import annotations

import logging
import sys

from dotenv import load_dotenv
import uvicorn
from google.adk.a2a.utils.agent_to_a2a import to_a2a
from google.adk.artifacts import InMemoryArtifactService
from google.adk.runners import Runner
from google.adk.sessions import InMemorySessionService
from starlette.applications import Starlette
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette.routing import Route

from agents.root_agent import create_root_agent
from config.settings import load_settings
from security.middleware import GatewaySecurityMiddleware
from session.redis_session_service import RedisSessionService

load_dotenv()

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s - %(name)s - %(levelname)s - %(message)s",
    handlers=[logging.StreamHandler(sys.stdout)],
)
logger = logging.getLogger(__name__)
settings = load_settings()


async def health_check(request: Request) -> JSONResponse:
    return JSONResponse({"status": "healthy", "service": settings.app_name})


async def readiness_check(request: Request) -> JSONResponse:
    try:
        session_backend = getattr(request.app.state, "session_backend", "unknown")
        session_service = getattr(request.app.state, "session_service", None)
        if session_backend == "redis" and session_service and hasattr(session_service, "_client"):
            if session_service._client:
                await session_service._client.ping()
        return JSONResponse(
            {
                "status": "ready",
                "service": settings.app_name,
                "session_backend": session_backend,
            }
        )
    except Exception as exc:
        logger.error("Readiness check failed: %s", exc)
        return JSONResponse({"status": "not ready", "error": str(exc)}, status_code=503)


async def build_app() -> Starlette:
    session_service = RedisSessionService(redis_url=settings.redis_url)
    session_backend = "redis"
    try:
        await session_service.connect()
        logger.info("Redis session service connected at %s", settings.redis_url)
    except Exception as exc:
        logger.warning("Redis unavailable (%s), using in-memory session service.", exc)
        session_service = InMemorySessionService()
        session_backend = "in-memory"

    root_agent = create_root_agent(settings.chat_model)
    runner = Runner(
        agent=root_agent,
        app_name=settings.app_name,
        session_service=session_service,
        artifact_service=InMemoryArtifactService(),
    )
    a2a_app: Starlette = to_a2a(root_agent, port=settings.port, runner=runner)
    a2a_app.add_middleware(
        GatewaySecurityMiddleware,
        trusted_gateway_secret=settings.gateway_shared_secret,
    )
    a2a_app.routes.insert(0, Route("/health", health_check, methods=["GET"]))
    a2a_app.routes.insert(1, Route("/ready", readiness_check, methods=["GET"]))
    a2a_app.state.session_service = session_service
    a2a_app.state.session_backend = session_backend
    return a2a_app


if __name__ == "__main__":
    import asyncio

    async def main() -> None:
        app = await build_app()
        config = uvicorn.Config(
            app=app,
            host=settings.host,
            port=settings.port,
            log_level="info",
        )
        server = uvicorn.Server(config)
        await server.serve()

    asyncio.run(main())
