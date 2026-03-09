from __future__ import annotations

import httpx

from security.middleware import get_forwarded_identity_headers

_remote_agent_http_client: httpx.AsyncClient | None = None


async def _inject_identity_headers(request: httpx.Request) -> None:
    identity_headers = get_forwarded_identity_headers()
    for name, value in identity_headers.items():
        if value and name not in request.headers:
            request.headers[name] = value


def get_remote_agent_http_client() -> httpx.AsyncClient:
    global _remote_agent_http_client
    if _remote_agent_http_client is None:
        _remote_agent_http_client = httpx.AsyncClient(
            timeout=httpx.Timeout(30.0),
            event_hooks={"request": [_inject_identity_headers]},
        )
    return _remote_agent_http_client


async def close_remote_agent_http_client() -> None:
    global _remote_agent_http_client
    if _remote_agent_http_client is not None:
        await _remote_agent_http_client.aclose()
        _remote_agent_http_client = None
