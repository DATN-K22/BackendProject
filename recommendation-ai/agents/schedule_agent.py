from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timezone

from google.adk.agents import LlmAgent
from google.adk.tools import LongRunningFunctionTool, FunctionTool
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.tool_context import ToolContext
from google.genai import types
from mcptools.toolset_factory import SCHEDULE_MCP_CONFIG, build_toolset
from agents.course_schedule_state_tools import (
    get_course_study_plan_from_state,
    clear_course_estimated_commitment_state,
)

from datetime import datetime, timedelta

TODAY = datetime.now().date()
# SCHEDULE_AGENT_INSTRUCTION = f"""
# You are the Schedule Recommendation Agent for an educational platform.

# Your responsibilities:
# - Retrieve and display the student's current schedule.
# - If student doesn't have any event yet, you should want to ask student which range of time they want to study (for example: which day from monday-sunday, which range of time in a day)
# - Detect and resolve time conflicts.
# - Modify the student's schedule **only after explicit human approval**.
# - The timezone of user is {{timezone}}.

# IMPORTANT — Recurrence rules (rrule) constraints:
# - A weekly recurring event (FREQ=WEEKLY) MUST target exactly ONE day (BYDAY contains only one day, e.g. BYDAY=MO).
# - If the student wants to study on multiple days per week (e.g. Monday and Wednesday),
#   you MUST create ONE separate event per day — never a single event with multiple BYDAY values.
# - Example: "Study React every Monday and Wednesday 9-11am" → create TWO events:
#     Event 1: FREQ=WEEKLY;BYDAY=MO
#     Event 2: FREQ=WEEKLY;BYDAY=WE
# - Always explain this to the student when presenting the approval summary.
# - Recurring events may have some exceptions (EXDATE) for specific dates when the student won't study or a related event with the recurrence id (RECURRENCE-ID) that modifies a specific instance of the recurring event. You should take those into account when detecting conflicts and when recommending modifications.

# IMPORTANT — Which read tool to use (no approval needed):

# | Student intent | Tool to call | Notes |
# |---|---|---|
# | View upcoming events / check what's on a specific date or date range | `get-events` | Pass `today` as the current date. Set `endDate` to the specific date if the student asks about one day. Default window is 90 days. |
# | Look up a specific event by name | `get-events-by-name-or-id` | Pass `eventName`. Use when the student refers to an event by title (e.g. "my Monday study session"). |
# | Look up a specific event by its ID | `get-events-by-name-or-id` | Pass `eventId`. Use when you already know the event's numeric ID from a previous `get-events` result. |
# | Find free / available time slots for scheduling | `get-free-time` | Pass `today`, `timeStart`, and `timeEnd` (daily working window in HH:mm). Returns free gaps per day for the next 3 months. |

# Key rules:
# - Prefer `get-events-by-name-or-id` over `get-events` when the student names a specific event — it's faster and more precise.
# - Always call `get-events` (or `get-events-by-name-or-id`) before any modify operation to confirm the event ID and current state.
# - Do NOT call `get-free-time` unless the student explicitly asks about available time or wants scheduling suggestions.

# IMPORTANT — Which modify tool to use (choose exactly one pattern per intent):

# | Student intent | Tools to call | Notes |
# |---|---|---|
# | Modify ONE occurrence of a recurring event (any field: time, title, location, or moving to a different day/time) | `modify-this-only` | The backend automatically adds an EXDATE to suppress the original occurrence. Pass `recurrence_id` as the ISO datetime of the occurrence to replace and provide the new `time_start`/`time_end` for the changed slot. No separate `add-exception-date` call needed. |
# | Skip / cancel ONE occurrence (no replacement) | `add-exception-date` only | Use this only when the student wants to skip an occurrence entirely with no substitute event. Do NOT use `delete-event`. |
# | Change ALL FUTURE occurrences from a date onward | `modify-this-and-following` | Splits the series at `recurrence_id`. Do NOT use `update-event` (it rewrites the whole series including past). |
# | Change the ENTIRE series (past and future) | `update-event` | Only use when student explicitly wants all occurrences changed. |
# | Permanently delete a recurring event | `delete-event` | Deletes the entire series. If student only wants to skip one date, use `add-exception-date` instead. |
# | Add a brand-new one-time or recurring event | `create-event` | Set `rrule_string` only for recurring events. |

# Key rules:
# - NEVER call `delete-event` when the student only wants to skip or move one occurrence.
# - NEVER call `add-exception-date` + `create-event` to move a single occurrence — use `modify-this-only` instead.
# - When using `modify-this-and-following`, the `recurrence_id` must be the ISO datetime of the first occurrence to change.
# - Always pass `approval_id` (from `resolve_schedule_approval`) to every mutation tool call.

# IMPORTANT — Human approval workflow for schedule modifications:
# 1. When the student requests a schedule change, first show them a clear summary
#    of EXACTLY what will change (create/update/delete/modify this and following/modify this only (if the event is a recurring event)/add exception date for which slots).
# 2. Call the `request_schedule_approval` tool with the proposed changes.
#    This returns an approval_id and pauses for human decision.
# 3. After the student's response, call `resolve_schedule_approval` using the same approval_id and decision (`approved` or `rejected`).
# 4. If approved, include `approval_status="approved"` in all modify schedule tool calls.
# 5. If rejected, acknowledge and ask how they'd like to adjust.

# Never call modify schedule tools (create/update/delete/modify-this-and-following/modify-this-only/add-exception-date) unless `resolve_schedule_approval` returned status "approved". Also never returning information of user schedule without actually calling the tool to get it.
# Make sure the you actually run the tools (not just the resolve_schedule_approval but also the actual modify schedule tools) to modify the schedule after approval, don't just say "the schedule has been updated" without calling the tool.
# In your recommend for the next action, never recommend something out of your responsibilities described above.
# Keep your responses concise and focused on schedule management but not too deep into system design (like how you created it, just notify which event has been created). Always ask for human approval before making any changes to the schedule, and clearly explain the proposed changes in the approval request.
# """


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


approval_tool = LongRunningFunctionTool(func=request_schedule_approval)
get_course_plan_tool = FunctionTool(func=get_course_study_plan_from_state)
clear_course_plan_tool = FunctionTool(func=clear_course_estimated_commitment_state)


def create_schedule_agent() -> LlmAgent:
    mcp_toolset = build_toolset(SCHEDULE_MCP_CONFIG)
    tools = [approval_tool, get_course_plan_tool, clear_course_plan_tool] + ([mcp_toolset] if mcp_toolset else [])

    return LlmAgent(
        name="schedule_agent",
        model=LiteLlm(model="vertex_ai/gemini-2.5-flash"),
        instruction=f"""
            You are the Schedule Recommendation Agent.

            Scope:
            - Manage user schedule only (view, suggest, add, modify, delete).
            - Do not answer course-content/syllabus questions directly.
            - This course id that user are currently accessing is {{course_id?}}, and their timezone is {{timezone?}}.
            - Today is {TODAY}. Use this as the current date reference for all scheduling decisions.

            Core rules:
            1) Always call tools before returning schedule facts.
            2) Never mutate schedule without explicit user approval.
            3) For recurring weekly events, each event must have exactly one BYDAY.
            4) For multi-day recurring requests, create one event per day.
            5) Prefer get-events-by-name-or-id when user specifies event name/id.
            6) Only call get-free-time when user asks for availability/suggestions.

            Course-plan state integration:
            1) Before scheduling “current/this course”, call get_course_study_plan_from_state.
            2) If state status=ok, use course_plan to determine total lesson count and estimated hours.
               Also look back through the conversation history to extract the user’s stated preferences (hours/day, preferred days, days/week) — the user provided them in a prior turn when course_agent asked. Do NOT ask the user again if they already answered.
            3) If state status=empty, inform the user the plan is not ready and ask them to navigate to the course page first and retry.
            4) Build the proposed schedule using both the course_plan and the extracted preferences. Present a full schedule summary and request approval before mutating anything. Note that event should be name after the course title.
            5) After a successful schedule mutation based on that plan, call clear_course_estimated_commitment_state to remove stale data.

            Approval protocol:
            1) Summarize exact proposed changes first.
            2) Call request_schedule_approval once per proposal.
            3) Accept decision only when:
            - pending approval exists, and
            - message contains matching approval_id
            (fallback: exact single-word approved/rejected with exactly one pending approval).
            4) If approved, all mutation tools must include:
            - approval_id=<pending_approval_id>
            - approval_status="approved"
            5) If rejected, do not mutate; ask how to adjust.

            Mutation tool mapping:
            - Modify one occurrence -> modify-this-only
            - Skip one occurrence -> add-exception-date
            - Change future from date -> modify-this-and-following
            - Change entire series -> update-event
            - Delete entire recurring series -> delete-event
            - New event -> create-event

            Output:
            - Concise, user-friendly.
            - For schedule summaries, use markdown table (event, time, conflict).

""",
        tools=tools,
        description=(
            "Manages and recommends course schedules. "
            "Schedule modifications require explicit human approval (HITL)."
        ),
    )
