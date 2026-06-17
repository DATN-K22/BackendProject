"""
mcp/toolset_factory.py

Builds MCPToolset instances for each sub-agent's external MCP server.
Each MCP server exposes domain-specific tools over SSE or stdio transport.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Optional

from google.adk.agents.readonly_context import ReadonlyContext
from google.adk.tools.base_tool import BaseTool
from google.adk.tools.mcp_tool.mcp_tool import MCPTool
from google.adk.tools.mcp_tool.mcp_toolset import (
    MCPToolset,
    SseConnectionParams,
    StreamableHTTPConnectionParams,
)


@dataclass
class MCPServerConfig:
    name: str
    url: str                        # SSE endpoint
    api_key: Optional[str] = None   # Optional server-level API key
    enabled: bool = True            # Set False (or via env) to skip


MCP_CONNECT_TIMEOUT_SEC = float(os.getenv("MCP_CONNECT_TIMEOUT_SEC", "5"))
MCP_READ_TIMEOUT_SEC = float(os.getenv("MCP_READ_TIMEOUT_SEC", "20"))


class UserScopedMCPTool(MCPTool):
    """MCP tool that forwards ADK user context as headers on each call."""

    async def _get_headers(self, tool_context, credential) -> Optional[dict[str, str]]:
        headers = await super()._get_headers(tool_context, credential) or {}

        # ADK derives invocation user_id from A2A call context.
        invocation_ctx = getattr(tool_context, "_invocation_context", None)
        user_id = getattr(invocation_ctx, "user_id", None)
        if user_id:
            headers["x-user-id"] = str(user_id)

        # Optional propagation from session state if present.
        state = getattr(tool_context, "state", None)
        if state:
            tenant_id = state.get("tenant_id")
            roles = state.get("role")
            if tenant_id:
                headers["x-tenant-id"] = str(tenant_id)
            if roles:
                headers["x-user-role"] = str(roles)

        return headers


class UserScopedMCPToolset(MCPToolset):
    """MCP toolset that builds user-aware MCP tools."""

    async def get_tools(
        self,
        readonly_context: Optional[ReadonlyContext] = None,
    ) -> List[BaseTool]:
        session = await self._mcp_session_manager.create_session()
        tools_response = await session.list_tools()

        tools: List[BaseTool] = []
        for tool in tools_response.tools:
            mcp_tool = UserScopedMCPTool(
                mcp_tool=tool,
                mcp_session_manager=self._mcp_session_manager,
                auth_scheme=self._auth_scheme,
                auth_credential=self._auth_credential,
            )

            if self._is_tool_selected(mcp_tool, readonly_context):
                tools.append(mcp_tool)
        return tools


def build_toolset(config: MCPServerConfig) -> Optional[MCPToolset]:
    """Return an MCPToolset, or None if the server is disabled."""
    if not config.enabled:
        return None

    headers = {}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"

    # Use SSE transport for /sse endpoints, streamable HTTP otherwise.
    if config.url.rstrip("/").endswith("/sse"):
        connection_params = SseConnectionParams(
            url=config.url,
            headers=headers,
            timeout=MCP_CONNECT_TIMEOUT_SEC,
            sse_read_timeout=MCP_READ_TIMEOUT_SEC,
        )
    else:
        connection_params = StreamableHTTPConnectionParams(
            url=config.url,
            headers=headers,
            timeout=MCP_CONNECT_TIMEOUT_SEC,
            sse_read_timeout=MCP_READ_TIMEOUT_SEC,
        )

    return UserScopedMCPToolset(connection_params=connection_params)


# ---------------------------------------------------------------------------
# Pre-configured toolsets (override URLs via environment in production)
# Set COURSE_MCP_ENABLED=false or SCHEDULE_MCP_ENABLED=false to disable.
# ---------------------------------------------------------------------------

COURSE_MCP_CONFIG = MCPServerConfig(
    name="course-mcp",
    url=os.getenv("COURSE_MCP_URL", "http://localhost:8001/sse"),
    api_key=os.getenv("COURSE_MCP_API_KEY"),
    enabled=os.getenv("COURSE_MCP_ENABLED", "true").lower() != "false",
)

SCHEDULE_MCP_CONFIG = MCPServerConfig(
    name="schedule-mcp",
    url=os.getenv("SCHEDULE_MCP_URL", "http://localhost:8002/sse"),
    api_key=os.getenv("SCHEDULE_MCP_API_KEY"),
    enabled=os.getenv("SCHEDULE_MCP_ENABLED", "true").lower() != "false",
)
