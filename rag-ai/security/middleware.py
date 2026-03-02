from __future__ import annotations

from dataclasses import dataclass, field
from typing import Callable, List, Optional

from starlette.authentication import AuthCredentials, SimpleUser
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.requests import Request
from starlette.responses import JSONResponse
from starlette import status

REQUIRED_GATEWAY_HEADERS = ("x-user-id", "x-user-roles", "x-tenant-id")
GATEWAY_STAMP_HEADER = "x-forwarded-by-gateway"
PUBLIC_PATHS = {"/health", "/ready"}


@dataclass
class SecurityContext:
    user_id: str
    roles: List[str]
    tenant_id: str
    raw_headers: dict = field(default_factory=dict)


class GatewaySecurityMiddleware(BaseHTTPMiddleware):
    def __init__(self, app, *, trusted_gateway_secret: Optional[str] = None):
        super().__init__(app)
        self._trusted_secret = trusted_gateway_secret

    async def dispatch(self, request: Request, call_next: Callable):
        if request.url.path in PUBLIC_PATHS or request.url.path.startswith("/.well-known"):
            return await call_next(request)

        if not request.headers.get(GATEWAY_STAMP_HEADER):
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": "Requests must be routed through the API gateway."},
            )

        missing = [h for h in REQUIRED_GATEWAY_HEADERS if not request.headers.get(h)]
        if missing:
            return JSONResponse(
                status_code=status.HTTP_401_UNAUTHORIZED,
                content={"detail": f"Missing gateway identity headers: {missing}"},
            )

        roles_raw = request.headers.get("x-user-roles", "")
        request.state.security = SecurityContext(
            user_id=request.headers["x-user-id"],
            roles=[r.strip() for r in roles_raw.split(",") if r.strip()],
            tenant_id=request.headers["x-tenant-id"],
            raw_headers=dict(request.headers),
        )
        request.scope["user"] = SimpleUser(request.state.security.user_id)
        request.scope["auth"] = AuthCredentials(["authenticated"])

        return await call_next(request)
