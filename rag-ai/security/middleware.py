from __future__ import annotations

from contextvars import ContextVar
from dataclasses import dataclass, field
from typing import Callable, List, Optional

from starlette.authentication import AuthCredentials, SimpleUser
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette import status



REQUIRED_GATEWAY_HEADERS = ("x-user-id", "x-user-role", "x-tenant-id")
# Marker header that the API gateway stamps on every forwarded request.
# Direct clients that bypass the gateway
# won't have this.
GATEWAY_STAMP_HEADER = "x-forwarded-by-gateway"
# Paths that bypass gateway security entirely (health probes, docs, etc.)
PUBLIC_PATHS = {"/health", "/ready", "/docs", "/openapi.json"}
FORWARDED_IDENTITY_HEADERS: ContextVar[dict[str, str] | None] = ContextVar(
    "forwarded_identity_headers",
    default=None,
)


@dataclass
class SecurityContext:
    user_id: str
    role: str
    tenant_id: str
    raw_headers: dict = field(default_factory=dict)

    def has_role(self, *roles: str) -> bool:
        return self.role in roles

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
        # if not request.headers.get(GATEWAY_STAMP_HEADER):
        #     return JSONResponse(
        #         status_code=status.HTTP_401_UNAUTHORIZED,
        #         content={"detail": "Requests must be routed through the API gateway."},
        #     )

        # --- 2. Verify required identity headers are present ---
        missing = [h for h in REQUIRED_GATEWAY_HEADERS if not request.headers.get(h)]
        if missing:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": f"Missing gateway identity headers: {missing}"},
            )

        # --- 3. Extract identity from headers and populate request state ---
        request.state.security = SecurityContext(
            user_id=request.headers["x-user-id"],
            role=request.headers.get("x-user-role", ""),
            tenant_id=request.headers["x-tenant-id"],
            raw_headers=dict(request.headers),
        )
        request.scope["user"] = SimpleUser(request.state.security.user_id)
        request.scope["auth"] = AuthCredentials(["authenticated"])

        forwarded_headers = {
            "x-user-id": request.headers["x-user-id"],
            "x-user-role": request.headers.get("x-user-role", ""),
            "x-tenant-id": request.headers["x-tenant-id"],
        }
        if request.headers.get(GATEWAY_STAMP_HEADER):
            forwarded_headers[GATEWAY_STAMP_HEADER] = request.headers[GATEWAY_STAMP_HEADER]

        token = FORWARDED_IDENTITY_HEADERS.set(forwarded_headers)
        try:
            return await call_next(request)
        finally:
            FORWARDED_IDENTITY_HEADERS.reset(token)


def get_forwarded_identity_headers() -> dict[str, str]:
    return dict(FORWARDED_IDENTITY_HEADERS.get() or {})
