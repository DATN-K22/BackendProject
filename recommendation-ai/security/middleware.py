"""
security/middleware.py

Post-API-gateway security layer.
The API gateway already validates JWTs and injects the decoded claims
as trusted headers (X-User-Id, X-User-Roles, X-Tenant-Id).
This middleware:
  1. Ensures those headers are present (guards against direct access bypassing gateway)
  2. Builds a SecurityContext that flows through the request
  3. Enforces role-based access at the agent / tool level
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Optional

from starlette.authentication import AuthCredentials, SimpleUser
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette import status

REQUIRED_GATEWAY_HEADERS = ("x-user-id", "x-user-roles", "x-tenant-id")

# Marker header that the API gateway stamps on every forwarded request.
# Direct clients that bypass the gateway won't have this.
GATEWAY_STAMP_HEADER = "x-forwarded-by-gateway"

# Paths that bypass gateway security entirely (health probes, docs, etc.)
PUBLIC_PATHS = {"/health", "/ready", "/docs", "/openapi.json"}


@dataclass
class SecurityContext:
    user_id: str
    roles: List[str]
    tenant_id: str
    raw_headers: dict = field(default_factory=dict)

    def has_role(self, *roles: str) -> bool:
        return any(r in self.roles for r in roles)

    def require_role(self, *roles: str) -> None:
        if not self.has_role(*roles):
            from starlette.exceptions import HTTPException
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"User '{self.user_id}' lacks required role(s): {roles}"
            )


class GatewaySecurityMiddleware(BaseHTTPMiddleware):
    """
    Validates that the request arrived via the API gateway and extracts
    the pre-validated identity claims injected by the gateway.
    """

    def __init__(self, app, *, trusted_gateway_secret: Optional[str] = None):
        super().__init__(app)
        self._trusted_secret = trusted_gateway_secret

    async def dispatch(self, request: Request, call_next: Callable):
        # --- 0. Skip security for public paths ---
        if request.url.path in PUBLIC_PATHS:
            return await call_next(request)

        # --- 1. Verify the request came through the gateway ---
        if not request.headers.get(GATEWAY_STAMP_HEADER):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Requests must be routed through the API gateway."},
            )

        # --- 2. Ensure identity headers are present ---
        missing = [h for h in REQUIRED_GATEWAY_HEADERS if not request.headers.get(h)]
        if missing:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": f"Missing gateway identity headers: {missing}"},
            )

        # --- 3. Build SecurityContext and attach to request.state ---
        roles_raw = request.headers.get("x-user-roles", "")
        request.state.security = SecurityContext(
            user_id=request.headers["x-user-id"],
            roles=[r.strip() for r in roles_raw.split(",") if r.strip()],
            tenant_id=request.headers["x-tenant-id"],
            raw_headers=dict(request.headers),
        )
        # Bridge gateway identity into Starlette auth scope so A2A/ADK can pick up
        # call_context.user.user_name from request.user via DefaultCallContextBuilder.
        request.scope["user"] = SimpleUser(request.state.security.user_id)
        request.scope["auth"] = AuthCredentials(["authenticated"])

        response = await call_next(request)
        return response


# ---------------------------------------------------------------------------
# Dependency helpers for route handlers
# ---------------------------------------------------------------------------

def get_security_context(request: Request) -> SecurityContext:
    from starlette.exceptions import HTTPException
    ctx: Optional[SecurityContext] = getattr(request.state, "security", None)
    if ctx is None:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Security context not initialised.",
        )
    return ctx
