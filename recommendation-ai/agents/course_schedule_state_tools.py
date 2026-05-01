from __future__ import annotations

from datetime import datetime, timezone
from typing import Any

from google.adk.tools.tool_context import ToolContext


COURSE_PLAN_STATE_KEY = "course_study_plan"


async def save_course_estimated_commitment_to_state(
    course_plan: dict[str, Any],
    tool_context: ToolContext,
) -> dict[str, Any]:
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}

    state[COURSE_PLAN_STATE_KEY] = course_plan
    state["course_study_plan_updated_at"] = datetime.now(timezone.utc).isoformat()
    return {
        "status": "ok",
        "state_key": COURSE_PLAN_STATE_KEY,
        "course_id": (course_plan.get("course_profile") or {}).get("course_id"),
    }


async def get_course_study_plan_from_state(tool_context: ToolContext) -> dict[str, Any]:
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}

    plan = state.get(COURSE_PLAN_STATE_KEY)
    if not plan:
        return {"status": "empty", "state_key": COURSE_PLAN_STATE_KEY}

    return {
        "status": "ok",
        "state_key": COURSE_PLAN_STATE_KEY,
        "course_plan": plan,
        "updated_at": state.get("course_study_plan_updated_at"),
    }


async def clear_course_estimated_commitment_state(tool_context: ToolContext) -> dict[str, Any]:
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}

    existed = COURSE_PLAN_STATE_KEY in state
    state[COURSE_PLAN_STATE_KEY] = None
    state["course_study_plan_updated_at"] = None
    return {
        "status": "ok",
        "cleared": existed,
        "state_key": COURSE_PLAN_STATE_KEY,
    }
