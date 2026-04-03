from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

from google.adk.agents import LlmAgent
from google.adk.tools import FunctionTool, LongRunningFunctionTool
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.tool_context import ToolContext

from mcptools.toolset_factory import SCHEDULE_MCP_CONFIG, build_toolset

SCHEDULE_AGENT_INSTRUCTION = """
You are the Schedule Recommendation Agent for an educational platform.

Your responsibilities:
- Retrieve and display the student's current schedule.
- If student doesn't have any event yet, you should want to ask student which range of time they want to study (for example: which day from monday-sunday, which range of time in a day)
- Detect and resolve time conflicts.
- Modify the student's schedule **only after explicit human approval**.

IMPORTANT — Recurrence rules (rrule) constraints:
- A weekly recurring event (FREQ=WEEKLY) MUST target exactly ONE day (BYDAY contains only one day, e.g. BYDAY=MO).
- If the student wants to study on multiple days per week (e.g. Monday and Wednesday),
  you MUST create ONE separate event per day — never a single event with multiple BYDAY values.
- Example: "Study React every Monday and Wednesday 9-11am" → create TWO events:
    Event 1: FREQ=WEEKLY;BYDAY=MO
    Event 2: FREQ=WEEKLY;BYDAY=WE
- Always explain this to the student when presenting the approval summary.
- Reurring events may have some exceptions (EXDATE) for specific dates when the student won't study or an related event with the recurrence id (RECURRENCE-ID) that modifies a specific instance of the recurring event. You should take those into account when detecting conflicts and when recommending modifications.  

IMPORTANT — Human approval workflow for schedule modifications:
1. When the student requests a schedule change, first show them a clear summary
   of EXACTLY what will change (add/remove/move which slots).
2. Call the `request_schedule_approval` tool with the proposed changes.
   This returns an approval_id and pauses for human decision.
3. After the student's response, call `resolve_schedule_approval` using the same approval_id and decision (`approved` or `rejected`).
4. If approved, include `approval_status="approved"` in all modify schedule tool calls.
5. If rejected, acknowledge and ask how they'd like to adjust.

Never call modify schedule tools (create/update/delete/modify-this-and-following/modify-this-and-only/add-exception-date) unless `resolve_schedule_approval` returned status "approved".
Make sure the you actually run the tools (not just the resolve_schedule_approval but also the actual modify schedule tools) to modify the schedule after approval, don't just say "the schedule has been updated" without calling the tool.
In your recommend for the next action, never recommend something out of your responsibilities described above.
Keep your responses concise and focused on schedule management but not too deep into system design (like how you created it, just notify which event has been created). Always ask for human approval before making any changes to the schedule, and clearly explain the proposed changes in the approval request.
"""


HITL_STATE_KEY = "schedule_hitl"


def _changes_hash(changes: dict) -> str:
    normalized = str(changes)
    return hashlib.sha256(normalized.encode("utf-8")).hexdigest()


# ---------------------------------------------------------------------------
# Human-in-the-loop approval gate
# ---------------------------------------------------------------------------

async def request_schedule_approval(proposed_changes: dict,  tool_context: ToolContext) -> dict:
    """
    Args:
        proposed_changes: Dict describing the intended schedule mutation,
                          e.g. {"action": "add", "course_id": "CS101",
                                "slot": "Mon 09:00-11:00"}.

    Returns:
        A pending approval token that the agent must include when resuming.
    """
    approval_id = str(uuid.uuid4())
    state = getattr(tool_context, "state", None)
    if state is not None:
        state[HITL_STATE_KEY] = {
            "status": "pending",
            "approval_id": approval_id,
            "changes": proposed_changes,
            "changes_hash": _changes_hash(proposed_changes),
            "requested_at": datetime.now(timezone.utc).isoformat(),
        }

    return {
        "status": "pending",
        "approval_id": approval_id,
        "changes": proposed_changes
    }


async def resolve_schedule_approval(
    approval_id: str,
    decision: str,
    tool_context: ToolContext,
) -> dict:
    state = getattr(tool_context, "state", None)
    approval_state = state.get(HITL_STATE_KEY) if state else None

    if not approval_state:
        return {"status": "error", "message": "No pending schedule approval found."}

    if approval_state.get("approval_id") != approval_id:
        return {"status": "error", "message": "Approval ID mismatch."}

    normalized_decision = decision.strip().lower()
    if normalized_decision not in {"approved", "rejected"}:
        return {"status": "error", "message": "Decision must be 'approved' or 'rejected'."}

    if normalized_decision == "rejected":
        state[HITL_STATE_KEY] = {
            **approval_state,
            "status": "rejected",
            "resolved_at": datetime.now(timezone.utc).isoformat(),
        }
        return {
            "status": "rejected",
            "approval_id": approval_id,
            "message": "Schedule change rejected by user.",
        }

    state[HITL_STATE_KEY] = {
        **approval_state,
        "status": "approved",
        "resolved_at": datetime.now(timezone.utc).isoformat(),
    }

    return {
        "status": "approved",
        "approval_id": approval_id,
        "approval_status": "approved",
    }


approval_tool = LongRunningFunctionTool(func=request_schedule_approval)
resolve_approval_tool = FunctionTool(func=resolve_schedule_approval)


def create_schedule_agent() -> LlmAgent:
    mcp_toolset = build_toolset(SCHEDULE_MCP_CONFIG)
    tools = [approval_tool, resolve_approval_tool] + ([mcp_toolset] if mcp_toolset else [])

    return LlmAgent(
        name="schedule_agent",
        model=LiteLlm(model="openai/gpt-5-nano"),
        instruction=SCHEDULE_AGENT_INSTRUCTION,
        tools=tools,
        description=(
            "Manages and recommends course schedules. "
            "Schedule modifications require explicit human approval (HITL)."
        ),
    )