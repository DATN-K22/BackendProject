from typing import Optional
from pydantic import BaseModel, Field
from google.adk.sessions.database_session_service import DatabaseSessionService

class PendingApproval(BaseModel):
    """Approval request details."""
    functionCallId: str
    proposed_changes: dict

class ChatMessage(BaseModel):
    """Single chat message in simplified format."""
    id: str
    role: str  # "user" | "assistant"
    text: str
    timestamp: float
    
    # A2A fields (optional)
    context_id: Optional[str] = None
    task_id: Optional[str] = None
    state: Optional[str] = None  # "completed" | "input-required" | "in-progress"
    
    # Approval fields (optional)
    pending_approval: Optional[PendingApproval] = None

class ChatHistoryResponse(BaseModel):
    """Response model for chat history endpoint."""
    session_id: str
    messages: list[ChatMessage] = Field(default_factory=list)


async def get_chat_history(
    session_id: str,
    app_name: str,
    user_id: str,
    service: DatabaseSessionService
) -> ChatHistoryResponse:
    """
    Fetch and transform chat history from ADK session to simplified format.
    """
    # 1. Get session from database
    session = await service.get_session(
        app_name=app_name,
        user_id=user_id,
        session_id=session_id
    )
    
    if not session:
        raise ValueError(f"Session {session_id} not found")
    
    # 2. Transform events to messages
    messages = []
    
    for event in session.events:
        # Extract basic info
        message = {
            "id": event.id,
            "role": _get_role(event),
            "text": _extract_text(event),
            "timestamp": event.timestamp
        }
        
        # Extract A2A metadata if exists
        if event.custom_metadata:
            a2a_data = event.custom_metadata
            
            # Add context_id if present
            if "a2a:context_id" in a2a_data:
                message["context_id"] = a2a_data["a2a:context_id"]
            
            # Add task_id if present
            if "a2a:task_id" in a2a_data:
                message["task_id"] = a2a_data["a2a:task_id"]
            
            # Add state from a2a:response
            if "a2a:response" in a2a_data:
                response = a2a_data["a2a:response"]
                if "status" in response:
                    message["state"] = response["status"]["state"]
                    
                    # Add pending approval if input-required
                    if response["status"]["state"] == "input-required":
                        message["pending_approval"] = _extract_approval_info(response)
        
        messages.append(message)
    
    return ChatHistoryResponse(
        session_id=session_id,
        messages=messages
    )


def _get_role(event) -> str:
    """Extract role from event."""
    if event.author == "user":
        return "user"
    return "assistant"


def _extract_text(event) -> str:
    """Extract text content from event."""
    if event.content and event.content.parts:
        for part in event.content.parts:
            if part.text:
                return part.text
    return ""


def _extract_approval_info(a2a_response: dict) -> Optional[dict]:
    """Extract pending approval information from A2A response."""
    try:
        # Find the function_call in history
        for item in a2a_response.get("history", []):
            if item.get("kind") == "message" and item.get("role") == "agent":
                for part in item.get("parts", []):
                    if part.get("kind") == "data":
                        data = part.get("data", {})
                        if "name" in data and data["name"] == "request_schedule_approval":
                            return {
                                "functionCallId": data.get("id"),
                                "proposed_changes": data.get("args", {}).get("proposed_changes", {})
                            }
    except Exception:
        pass
    return None