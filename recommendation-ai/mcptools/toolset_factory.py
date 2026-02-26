"""
mcp/toolset_factory.py

Builds MCPToolset instances for each sub-agent's external MCP server.
Each MCP server exposes domain-specific tools over SSE or stdio transport.
"""

from __future__ import annotations

import os
from dataclasses import dataclass
from typing import List, Optional

from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, SseConnectionParams


@dataclass
class MCPServerConfig:
    name: str
    url: str                        # SSE endpoint
    api_key: Optional[str] = None   # Optional server-level API key
    enabled: bool = True            # Set False (or via env) to skip


def build_toolset(config: MCPServerConfig) -> Optional[MCPToolset]:
    """Return an MCPToolset, or None if the server is disabled."""
    if not config.enabled:
        return None

    headers = {}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"

    return MCPToolset(
        connection_params=SseConnectionParams(
            url=config.url,
            headers=headers,
        )
    )


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