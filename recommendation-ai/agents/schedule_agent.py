from __future__ import annotations

import hashlib
import pathlib
import uuid
from datetime import datetime, timezone

from google.adk.agents import LlmAgent
from google.adk.skills import load_skill_from_dir
from google.adk.tools import skill_toolset, LongRunningFunctionTool, FunctionTool
from google.adk.tools.tool_context import ToolContext
from google.adk.agents.readonly_context import ReadonlyContext
from mcptools.toolset_factory import SCHEDULE_MCP_CONFIG, build_toolset
from agents.course_schedule_state_tools import (
    get_course_study_plan_from_state,
    clear_course_estimated_commitment_state,
    build_lessons_block_plan,
    save_course_schedule_plan_to_state,
    analyze_course_schedule_progress,
    save_course_schedule_reschedule_request,
    get_course_schedule_reschedule_request,
    clear_course_schedule_reschedule_request,
)

# ---------------------------------------------------------------------------
# HITL approval gate
# ---------------------------------------------------------------------------

HITL_STATE_KEY = "schedule_hitl"


def _changes_hash(changes: dict) -> str:
    return hashlib.sha256(str(changes).encode("utf-8")).hexdigest()


async def request_schedule_approval(
    proposed_changes: dict, tool_context: ToolContext
) -> dict:
    """
    Presents proposed schedule changes to the user for approval.
    Must be called before any mutation tool (create/update/delete/modify-*).

    Args:
        proposed_changes: Dict describing the intended schedule mutation,
                          e.g. {"action": "add", "title": "Study React",
                                "slot": "Mon 09:00-11:00"}.
    Returns:
        A pending approval token the agent must wait on before mutating.
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
        "changes": proposed_changes,
    }


# ---------------------------------------------------------------------------
# Function tools
#
# FIX: Do NOT pass these via SkillToolset.additional_tools — that parameter
# does not reliably expose tools to the LLM in all ADK versions.
# Pass them directly in agent.tools instead.
#
# FIX: get_user_preference_recommendation is renamed to get_user_preferences
# so that skill instructions can reference it by the shorter, consistent name.
# ---------------------------------------------------------------------------

approval_tool = LongRunningFunctionTool(func=request_schedule_approval)
get_course_plan_tool = FunctionTool(func=get_course_study_plan_from_state)
build_lessons_block_plan_tool = FunctionTool(func=build_lessons_block_plan)
clear_course_plan_tool = FunctionTool(func=clear_course_estimated_commitment_state)
save_course_schedule_plan_tool = FunctionTool(func=save_course_schedule_plan_to_state)
analyze_course_schedule_progress_tool = FunctionTool(func=analyze_course_schedule_progress)
save_course_reschedule_request_tool = FunctionTool(func=save_course_schedule_reschedule_request)
get_course_reschedule_request_tool = FunctionTool(func=get_course_schedule_reschedule_request)
clear_course_reschedule_request_tool = FunctionTool(func=clear_course_schedule_reschedule_request)

_FUNCTION_TOOLS = [
    approval_tool,
    get_course_plan_tool,
    build_lessons_block_plan_tool,
    clear_course_plan_tool,
    save_course_schedule_plan_tool,
    analyze_course_schedule_progress_tool,
    save_course_reschedule_request_tool,
    get_course_reschedule_request_tool,
    clear_course_reschedule_request_tool,
]

# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

SKILLS_DIR = pathlib.Path(__file__).parent / "skills"

_SKILL_NAMES = [
    "recommend-slots",
    "course-schedule",
    "reschedule-course-detect",
    "reschedule-course-schedule",
    "modify-occurrence",
    "skip-occurrence",
    "modify-series",
    "delete-series",
    "view-schedule",
]

_skills = [load_skill_from_dir(SKILLS_DIR / name) for name in _SKILL_NAMES]

# ---------------------------------------------------------------------------
# Slim dispatcher instruction
# ---------------------------------------------------------------------------

def get_schedule_instruction(ctx: ReadonlyContext) -> str:
    today = datetime.now().date().isoformat()
    course_id = ctx.state.get("course_id", "unknown")
    tz = ctx.state.get("timezone", "UTC")
    pending_course_reschedule = ctx.state.get("course_schedule_reschedule_request")

    return f"""
You are the Schedule Recommendation Agent.
Course ID: {course_id} | Timezone: {tz} | Today: {today}
Pending course schedule rebuild request: {pending_course_reschedule}

## Scope
Manage the user's schedule only (view, suggest, add, modify, delete).
Do not answer course-content or syllabus questions.

## Course schedule rescheduling rule
If an event that needs modify is about a course study session, use the skill `reschedule-course-detect` to detect and save the rescheduling intent. Follow the instructions in that skill for the subsequent steps.
Do not directly call mutation tools to modify course study sessions without following the protocol in `reschedule-course-detect` and `reschedule-course-schedule` skills.

## TOOL-FIRST MANDATE
Always call the required tools BEFORE asking the user any questions.
Asking the user is a last resort, only after tools return empty or failed results.

## Approval protocol
1. Summarize exact proposed changes (ensure enough details, not just a brief description) to the user.
2. Call `request_schedule_approval` once per proposal.
3. Accept approval when the user's message contains:
   - The `approval_id` (preferred), OR
   - A keyword: "approved", "yes", "confirm", "ok", "sure", "go ahead"
     AND exactly one pending approval exists.
   - Rejection keywords: "rejected", "no", "cancel", "stop"
4. If approved:
   - You MUST immediately call the calendar mutation tool (e.g. create_event, update_event, delete_event).
   - Do NOT return any text response until the mutation tool has been called and returned a result.
   - Returning a success message WITHOUT calling the mutation tool is a critical error.
   - Every mutation call MUST include `approval_id` and `approval_status="approved"`.
5. If rejected: Do NOT call any mutation tool, and clear the pending approval from state.

## Input validation
- Reject event duration < 15 minutes.
- Reject start time in the past (unless the user is logging historical data).
- Recurring events require `end_date` OR `max_occurrences` (≤ 365).

## Recurrence rules
- Weekly recurring events: exactly ONE `BYDAY` value per event.
- Multi-day requests: create ONE separate event per day.

## Error handling
- Tool failure: explain the error, suggest retry.
- Approval timeout (> 5 min): auto-expire, ask the user to resubmit.
- Timezone edge cases: confirm explicitly with the user.

## Output format
Concise and user-friendly. Use markdown tables for schedule summaries.
""".strip()


# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------

def create_schedule_agent() -> LlmAgent:
    mcp_toolset = build_toolset(SCHEDULE_MCP_CONFIG)

    # SkillToolset only manages skill loading/discovery.
    # FunctionTools are passed directly to agent.tools so the LLM can see them.
    my_skill_toolset = skill_toolset.SkillToolset(skills=_skills)

    all_tools = (
        _FUNCTION_TOOLS
        + [my_skill_toolset]
        + ([mcp_toolset] if mcp_toolset else [])
    )

    return LlmAgent(
        name="schedule_agent",
        model="gemini-2.5-flash",
        instruction=get_schedule_instruction,
        tools=all_tools,
        description=(
            "Manages and recommends course schedules. "
            "Schedule modifications require explicit human approval (HITL)."
        ),
    )
