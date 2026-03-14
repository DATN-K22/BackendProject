from __future__ import annotations

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

IMPORTANT — Human approval workflow for schedule modifications:
1. When the student requests a schedule change, first show them a clear summary
   of EXACTLY what will change (add/remove/move which slots).
2. Call the `request_schedule_approval` tool with the proposed changes.
   This will PAUSE execution and wait for the student to confirm or reject.
3. Only proceed with modify schedule tools (create/update/delete/modify-this-and-following/add-exception-date) (via MCP) if the student approves with the message "approved".
4. If the student rejects, acknowledge and ask how they'd like to adjust.

Never call modify schedule tools (create/update/delete/modify-this-and-following/add-exception-date) without prior human approval in the same turn.
In your recommend for the next action, never recommend something out of your responsibilities described above.
"""


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
    return {
        "status": "pending",
        "changes": proposed_changes
    }
    
    
    


approval_tool = LongRunningFunctionTool(func=request_schedule_approval)


def create_schedule_agent() -> LlmAgent:
    mcp_toolset = build_toolset(SCHEDULE_MCP_CONFIG)
    tools = [approval_tool] + ([mcp_toolset] if mcp_toolset else [])

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