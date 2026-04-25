from __future__ import annotations

import httpx

from security.middleware import get_forwarded_identity_headers
from langsmith.run_helpers import get_current_run_tree
_remote_agent_http_client: httpx.AsyncClient | None = None


async def _inject_identity_headers(request: httpx.Request) -> None:
    identity_headers = get_forwarded_identity_headers()
    for name, value in identity_headers.items():
        if value and name not in request.headers:
            request.headers[name] = value


async def _inject_trace_headers(request: httpx.Request) -> None:
    run_tree = get_current_run_tree()
    if not run_tree:
        return
    for name, value in run_tree.to_headers().items():
        if value and name not in request.headers:
            request.headers[name] = value


async def _inject_forwarded_headers(request: httpx.Request) -> None:
    await _inject_identity_headers(request)
    await _inject_trace_headers(request)


def get_remote_agent_http_client() -> httpx.AsyncClient:
    global _remote_agent_http_client
    if _remote_agent_http_client is None:
        _remote_agent_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(120.0),
            event_hooks={"request": [_inject_forwarded_headers]},
        )
    return _remote_agent_http_client


async def close_remote_agent_http_client() -> None:
    global _remote_agent_http_client
    if _remote_agent_http_client is not None:
        await _remote_agent_http_client.aclose()
        _remote_agent_http_client = None
