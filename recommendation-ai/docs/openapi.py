"""
docs/openapi.py

OpenAPI 3.0 spec + Swagger UI routes for the EduAssistant AI service.
Mounted directly on the Starlette app — no extra dependencies required.
"""

from __future__ import annotations

from starlette.requests import Request
from starlette.responses import HTMLResponse, JSONResponse
from starlette.routing import Route


# ---------------------------------------------------------------------------
# OpenAPI spec
# ---------------------------------------------------------------------------

OPENAPI_SPEC: dict = {
    "openapi": "3.0.3",
    "info": {
        "title": "EduAssistant AI Service",
        "description": (
            "A2A-compatible AI service that routes educational requests "
            "to CourseAgent (course recommendations) and ScheduleAgent "
            "(schedule management with HITL approval).\n\n"
            "**Authentication**: Every request must include the gateway headers "
            "injected by the API gateway after JWT validation."
        ),
        "version": "1.0.0",
    },
    "servers": [{"url": "/", "description": "Current origin"}],
    "tags": [
        {"name": "Health", "description": "Liveness and readiness probes"},
        {"name": "A2A", "description": "Agent-to-Agent JSON-RPC 2.0 endpoints"},
    ],
    "components": {
        "securitySchemes": {
            "GatewayHeaders": {
                "type": "apiKey",
                "in": "header",
                "name": "x-forwarded-by-gateway",
                "description": (
                    "Must be present on every request. "
                    "Also requires `x-user-id`, `x-user-roles`, and `x-tenant-id` headers."
                ),
            }
        },
        "schemas": {
            "A2APart": {
                "type": "object",
                "required": ["kind"],
                "properties": {
                    "kind": {
                        "type": "string",
                        "enum": ["text", "data"],
                        "example": "text",
                    },
                    "text": {
                        "type": "string",
                        "description": "Plain-text content (when kind=text)",
                        "example": "Recommend me a Python course",
                    },
                },
            },
            "A2AMessage": {
                "type": "object",
                "required": ["role", "parts", "messageId"],
                "properties": {
                    "role": {
                        "type": "string",
                        "enum": ["user", "agent"],
                        "example": "user",
                    },
                    "parts": {
                        "type": "array",
                        "items": {"$ref": "#/components/schemas/A2APart"},
                    },
                    "messageId": {
                        "type": "string",
                        "example": "msg-1",
                    },
                    "contextId": {
                        "type": "string",
                        "description": "Existing context/session ID for multi-turn conversations",
                        "example": "45580fc9-2393-4f54-9eb7e-0039c5a07f27",
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
            "TaskResult": {
                "type": "object",
                "properties": {
                    "id": {"type": "string", "description": "Task ID"},
                    "kind": {"type": "string", "enum": ["task"]},
                    "status": {
                        "type": "object",
                        "properties": {
                            "state": {
                                "type": "string",
                                "enum": ["completed", "working", "input-required", "failed"],
                            },
                            "timestamp": {"type": "string", "format": "date-time"},
                        },
                    },
                    "artifacts": {
                        "type": "array",
                        "items": {
                            "type": "object",
                            "properties": {
                                "artifactId": {"type": "string"},
                                "parts": {
                                    "type": "array",
                                    "items": {"$ref": "#/components/schemas/A2APart"},
                                },
                            },
                        },
                    },
                    "history": {
                        "type": "array",
                        "items": {"$ref": "#/components/schemas/A2AMessage"},
                    },
                    "contextId": {"type": "string"},
                },
            },
            "A2AResponse": {
                "type": "object",
                "properties": {
                    "jsonrpc": {"type": "string", "enum": ["2.0"]},
                    "id": {"type": "string"},
                    "result": {"$ref": "#/components/schemas/TaskResult"},
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
                "description": "Returns 200 if the service process is running.",
                "security": [],
                "responses": {
                    "200": {
                        "description": "Service is alive",
                        "content": {
                            "application/json": {
                                "example": {
                                    "status": "healthy",
                                    "service": "edu-assistant",
                                    "version": "1.0.0",
                                }
                            }
                        },
                    }
                },
            }
        },
        "/ready": {
            "get": {
                "tags": ["Health"],
                "summary": "Readiness check",
                "description": "Returns 200 if Redis is reachable and the service is ready.",
                "security": [],
                "responses": {
                    "200": {
                        "description": "Service is ready",
                        "content": {
                            "application/json": {
                                "example": {"status": "ready", "service": "edu-assistant"}
                            }
                        },
                    },
                    "503": {"description": "Service not ready (Redis unavailable)"},
                },
            }
        },
        "/.well-known/agent.json": {
            "get": {
                "tags": ["A2A"],
                "summary": "Agent card",
                "description": "Auto-generated A2A agent card describing the agent's capabilities.",
                "parameters": [
                    {
                        "in": "header",
                        "name": "x-forwarded-by-gateway",
                        "required": True,
                        "schema": {"type": "string", "example": "true"},
                    },
                    {
                        "in": "header",
                        "name": "x-user-id",
                        "required": True,
                        "schema": {"type": "string", "example": "user-123"},
                    },
                    {
                        "in": "header",
                        "name": "x-user-roles",
                        "required": True,
                        "schema": {"type": "string", "example": "student"},
                    },
                    {
                        "in": "header",
                        "name": "x-tenant-id",
                        "required": True,
                        "schema": {"type": "string", "example": "tenant-1"},
                    },
                ],
                "responses": {"200": {"description": "Agent card JSON"}},
            }
        },
        "/": {
            "post": {
                "tags": ["A2A"],
                "summary": "Send a message (message/send)",
                "description": (
                    "Main A2A JSON-RPC 2.0 endpoint.\n\n"
                    "Routes the user message to the appropriate sub-agent:\n"
                    "- **course_agent** — course search and recommendations\n"
                    "- **schedule_agent** — schedule viewing and modification (HITL approval required)\n\n"
                    "For multi-turn conversations, include `contextId` in the message to "
                    "continue an existing session."
                ),
                "parameters": [
                    {
                        "in": "header",
                        "name": "x-forwarded-by-gateway",
                        "required": True,
                        "schema": {"type": "string", "example": "true"},
                    },
                    {
                        "in": "header",
                        "name": "x-user-id",
                        "required": True,
                        "schema": {"type": "string", "example": "user-123"},
                    },
                    {
                        "in": "header",
                        "name": "x-user-roles",
                        "required": True,
                        "schema": {"type": "string", "example": "student"},
                    },
                    {
                        "in": "header",
                        "name": "x-tenant-id",
                        "required": True,
                        "schema": {"type": "string", "example": "tenant-1"},
                    },
                ],
                "requestBody": {
                    "required": True,
                    "content": {
                        "application/json": {
                            "schema": {"$ref": "#/components/schemas/MessageSendRequest"},
                            "examples": {
                                "course_recommendation": {
                                    "summary": "Ask for a course recommendation",
                                    "value": {
                                        "jsonrpc": "2.0",
                                        "id": "1",
                                        "method": "message/send",
                                        "params": {
                                            "message": {
                                                "role": "user",
                                                "parts": [
                                                    {"kind": "text", "text": "Recommend me a Python course"}
                                                ],
                                                "messageId": "msg-1",
                                            }
                                        },
                                    },
                                },
                                "schedule_view": {
                                    "summary": "View current schedule",
                                    "value": {
                                        "jsonrpc": "2.0",
                                        "id": "2",
                                        "method": "message/send",
                                        "params": {
                                            "message": {
                                                "role": "user",
                                                "parts": [
                                                    {"kind": "text", "text": "Show me my current schedule"}
                                                ],
                                                "messageId": "msg-2",
                                            }
                                        },
                                    },
                                },
                                "multi_turn": {
                                    "summary": "Continue a conversation (multi-turn)",
                                    "value": {
                                        "jsonrpc": "2.0",
                                        "id": "3",
                                        "method": "message/send",
                                        "params": {
                                            "message": {
                                                "role": "user",
                                                "parts": [
                                                    {"kind": "text", "text": "Add it to my Monday 9am slot"}
                                                ],
                                                "messageId": "msg-3",
                                                "contextId": "45580fc9-2393-4f54-9eb7-0039c5a07f27",
                                            }
                                        },
                                    },
                                },
                            },
                        }
                    },
                },
                "responses": {
                    "200": {
                        "description": "Task result with agent response",
                        "content": {
                            "application/json": {
                                "schema": {"$ref": "#/components/schemas/A2AResponse"}
                            }
                        },
                    },
                    "401": {"description": "Missing gateway headers"},
                    "403": {"description": "Insufficient role"},
                },
            }
        },
    },
}


# ---------------------------------------------------------------------------
# Route handlers
# ---------------------------------------------------------------------------

async def openapi_json(request: Request) -> JSONResponse:
    """Serve the raw OpenAPI spec."""
    return JSONResponse(OPENAPI_SPEC)


async def swagger_ui(request: Request) -> HTMLResponse:
    """Serve Swagger UI (CDN-hosted assets — no static files needed)."""
    html = """<!DOCTYPE html>
<html>
  <head>
    <title>EduAssistant AI — API Docs</title>
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
        persistAuthorization: true,
      });
    </script>
  </body>
</html>"""
    return HTMLResponse(html)


# ---------------------------------------------------------------------------
# Routes to mount on the app
# ---------------------------------------------------------------------------

DOCS_ROUTES = [
    Route("/docs", swagger_ui, methods=["GET"]),
    Route("/openapi.json", openapi_json, methods=["GET"]),
]
