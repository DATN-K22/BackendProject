from __future__ import annotations

import os
from typing import Optional
from dataclasses import dataclass


from google.adk.tools.mcp_tool.mcp_toolset import MCPToolset, SseConnectionParams

@dataclass
class McpServerConfig:
    name: str
    url: str
    api_key: Optional[str] = None
    enabled: bool = True
    
    
def build_toolset(config: McpServerConfig) -> Optional[MCPToolset]:
    if not config.enabled:
        return None
        
    headers = {}
    if config.api_key:
        headers["Authorization"] = f"Bearer {config.api_key}"
            
    return MCPToolset(
        connection_params=SseConnectionParams(url=config.url, headers=headers)
    )
        
        
        

# ---------------------------------------------------------------------------
# Pre-configured toolsets (override URLs via environment in production)
# Set COURSE_MCP_ENABLED=false or SCHEDULE_MCP_ENABLED=false to disable.
# ---------------------------------------------------------------------------

COURSE_MCP_CONFIG = McpServerConfig(
    name="course-mcp",
    url=os.getenv("COURSE_MCP_URL", "http://localhost:8001/sse"),
    api_key=os.getenv("COURSE_MCP_API_KEY"),
    enabled=os.getenv("COURSE_MCP_ENABLED", "true").lower() != "false",
)
    
    