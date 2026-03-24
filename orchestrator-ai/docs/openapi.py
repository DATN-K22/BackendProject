from __future__ import annotations

from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse
from starlette.routing import Route


GATEWAY_HEADER_PARAMETERS: list[dict] = [
    {
        "in": "header",
        "name": "x-user-id",
        "required": True,
        "schema": {"type": "string", "example": "user-123"},
        "description": "User identity injected by gateway after auth validation.",
    },
    {
        "in": "header",
        "name": "x-user-roles",
        "required": True,
        "schema": {"type": "string", "example": "student,member"},
        "description": "Comma-separated roles injected by gateway.",
    },
    {
        "in": "header",
        "name": "x-tenant-id",
        "required": True,
        "schema": {"type": "string", "example": "tenant-1"},
        "description": "Tenant context injected by gateway.",
    },
    {
        "in": "header",
        "name": "x-forwarded-by-gateway",
        "required": False,
        "schema": {"type": "string", "example": "true"},
        "description": "Optional gateway marker header (enforce if middleware enables it).",
    },
]


OPENAPI_SPEC: dict = {
    "openapi": "3.0.3",
    "info": {
        "title": "Orchestrator AI Service",
        "description": (
            "A2A-compatible orchestrator agent that routes incoming user tasks "
            "to remote/internal specialist agents.\n\n"
            "Requests are expected to be forwarded by the API gateway with "
            "trusted identity headers."
        ),
        "version": "1.0.0",
    },
    "servers": [{"url": "/", "description": "Current origin"}],
    "tags": [
        {"name": "Health", "description": "Liveness and readiness probes"},
        {"name": "A2A", "description": "Agent-to-Agent JSON-RPC endpoints"},
    ],
    "components": {
        "securitySchemes": {
            "GatewayHeaders": {
                "type": "apiKey",
                "in": "header",
                "name": "x-forwarded-by-gateway",
                "description": (
                    "Gateway marker header. Requests also require `x-user-id`, "
                    "`x-user-roles`, and `x-tenant-id`."
                ),
            }
        },
        "schemas": {
            "A2APart": {
                "type": "object",
                "required": ["kind"],
                "properties": {
                    "kind": {"type": "string", "enum": ["text", "data"], "example": "text"},
                    "text": {"type": "string", "example": "Help me plan next semester"},
                },
            },
            "A2AMessage": {
                "type": "object",
                "required": ["role", "parts", "messageId"],
                "properties": {
                    "role": {"type": "string", "enum": ["user", "agent"], "example": "user"},
                    "parts": {"type": "array", "items": {"$ref": "#/components/schemas/A2APart"}},
                    "messageId": {"type": "string", "example": "msg-1"},
                    "contextId": {
                        "type": "string",
                        "description": "Optional context/session identifier",
                        "example": "f3a4d774-5f53-454f-b8cf-cde44e63ea4b",
                    },
                },
            },
            "MessageSendRequest": {
                "type": "object",
                "required": ["jsonrpc", "id", "method", "params"],
                "properties": {
                    "jsonrpc": {"type": "string", "enum": ["2.0"]},
                    "id": {"type": "string", "example": "1"},
                    "method": {"type": "string", "enum": ["message/send"]},
                    "params": {
                        "type": "object",
                        "required": ["message"],
                        "properties": {
                            "message": {"$ref": "#/components/schemas/A2AMessage"},
                        },
                    },
                },
            },
            "A2AResponse": {
                "type": "object",
                "properties": {
                    "jsonrpc": {"type": "string", "enum": ["2.0"]},
                    "id": {"type": "string"},
                    "result": {"type": "object"},
                },
            },
        },
    },
    "security": [{"GatewayHeaders": []}],
    "paths": {
        "/health": {
            "get": {
                "tags": ["Health"],
                "summary": "Liveness check",
                "security": [],
                "responses": {
                    "200": {
                        "description": "Service is alive",
                        "content": {"application/json": {"example": {"status": "healthy"}}},
                    }
                },
            }
        },
        "/ready": {
            "get": {
                "tags": ["Health"],
                "summary": "Readiness check",
                "security": [],
                "responses": {
                    "200": {"description": "Service is ready"},
                    "503": {"description": "Service not ready"},
                },
            }
        },
        "/.well-known/agent.json": {
            "get": {
                "tags": ["A2A"],
                "summary": "A2A Agent Card",
                "parameters": GATEWAY_HEADER_PARAMETERS,
                "responses": {"200": {"description": "Agent card payload"}},
            }
        },
        "/": {
            "post": {
                "tags": ["A2A"],
                "summary": "Send A2A message",
                "parameters": GATEWAY_HEADER_PARAMETERS,
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/MessageSendRequest"}
                        }
                    },
                },
                "responses": {
                    "200": {
                        "description": "Task result",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/A2AResponse"}
                            }
                        },
                    },
                    "401": {"description": "Missing/invalid gateway headers"},
                },
            }
        },
    },
}


async def openapi_json(request: Request) -> JSONResponse:
    return JSONResponse(OPENAPI_SPEC)


async def swagger_ui(request: Request) -> HTMLResponse:
    html = """<!DOCTYPE html>
<html>
  <head>
    <title>Orchestrator AI - API Docs</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <link rel="stylesheet" type="text/css"
          href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  </head>
  <body>
    <div id="swagger-ui"></div>
    <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
    <script>
      SwaggerUIBundle({
        url: "/openapi.json",
        dom_id: "#swagger-ui",
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.SwaggerUIStandalonePreset],
        layout: "BaseLayout",
        deepLinking: true,
        tryItOutEnabled: true,
        persistAuthorization: true
      });
    </script>
  </body>
</html>"""
    return HTMLResponse(html)


DOCS_ROUTES = [
    Route("/docs", swagger_ui, methods=["GET"]),
    Route("/openapi.json", openapi_json, methods=["GET"]),
]
