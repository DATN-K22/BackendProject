from __future__ import annotations

from datetime import datetime, timezone as dt_timezone
from typing import Any
import yaml

from google.adk.tools.base_tool import BaseTool
from google.adk.tools.tool_context import ToolContext


COURSE_PLAN_STATE_KEY = "course_study_plan"
COURSE_RESCHEDULE_STATE_KEY = "course_schedule_reschedule_request"
FALLBACK_LESSON_DURATION_SECONDS = 600
MIN_REASONABLE_PERFORMANCE_MULTIPLIER = 0.5
MAX_REASONABLE_PERFORMANCE_MULTIPLIER = 3.0
MAX_EXPECTED_PROGRESS_POINTS = 30

def _parse_course_plan(raw: dict[str, Any]) -> dict[str, Any]:
    # Shape 1: already parsed flat dict
    if "chapters" in raw or "courseId" in raw:
        return raw

    # Shape 2: outer wrapper { "course_plan": { "content": [...] } }
    if "course_plan" in raw:
        return _parse_course_plan(raw["course_plan"])  # unwrap and recurse

    # Shape 3: MCP content block { "content": [{ "type": "text", "text": "<YAML>" }] }
    content_blocks = raw.get("content") or []
    yaml_text = next(
        (b["text"] for b in content_blocks if b.get("type") == "text"),
        None,
    )
    if not yaml_text:
        raise ValueError(
            "course_plan has no parseable content. "
            "Expected either a dict with 'chapters' or an MCP content block with YAML text."
        )

    parsed = yaml.safe_load(yaml_text)
    if not isinstance(parsed, dict):
        raise ValueError("Parsed YAML is not a dict — check the course plan format.")

    return parsed


def _parse_optional_dt(raw_value: Any) -> datetime | None:
    if not raw_value:
        return None
    if isinstance(raw_value, datetime):
        parsed = raw_value
    elif isinstance(raw_value, str):
        try:
            parsed = datetime.fromisoformat(raw_value.replace("Z", "+00:00"))
        except ValueError:
            return None
    else:
        return None

    if parsed.tzinfo is None:
        return parsed.replace(tzinfo=dt_timezone.utc)
    return parsed.astimezone(dt_timezone.utc)


def _user_course_state_key(course_id: str | int | None) -> str:
    return f"user:{course_id or 'unknown'}"


def _get_user_course_state(
    state: dict[str, Any], course_id: str | int | None
) -> dict[str, Any]:
    key = _user_course_state_key(course_id)
    existing = state.get(key)
    if not isinstance(existing, dict):
        existing = {}
        state[key] = existing
    return existing


def _course_plan_matches(state: dict[str, Any], course_id: str | int | None) -> bool:
    course_plan = state.get(COURSE_PLAN_STATE_KEY)
    return (
        isinstance(course_plan, dict)
        and course_id is not None
        and str(course_plan.get("courseId", "")) == str(course_id)
        and bool(course_plan.get("chapters"))
    )


def _count_finished_lessons(course_plan: dict[str, Any]) -> int:
    return sum(
        1
        for chapter in course_plan.get("chapters", [])
        for lesson in chapter.get("lessons", [])
        if lesson.get("isFinished", False)
    )


def _lesson_count_for_block(block: Any) -> int:
    if isinstance(block, list):
        return len(block)
    if isinstance(block, dict):
        if isinstance(block.get("lessons"), list):
            return len(block["lessons"])
        for key in ("lesson_count_in_block", "lesson_count", "total_lessons"):
            value = block.get(key)
            if isinstance(value, int) and value >= 0:
                return value
    return 0


def _prune_expected_progress(
    expected_progress: list[dict[str, Any]],
    now: datetime | None = None,
) -> list[dict[str, Any]]:
    now = now or datetime.now(dt_timezone.utc)
    normalized = []
    for item in expected_progress:
        parsed_end = _parse_optional_dt(item.get("time_end"))
        normalized.append((parsed_end, item))

    normalized.sort(key=lambda pair: pair[0] or datetime.max.replace(tzinfo=dt_timezone.utc))
    past = [item for parsed_end, item in normalized if parsed_end and parsed_end <= now]
    future = [item for parsed_end, item in normalized if not parsed_end or parsed_end > now]

    kept = (past[-1:] if past else []) + future
    if len(kept) <= MAX_EXPECTED_PROGRESS_POINTS:
        return kept
    return kept[:MAX_EXPECTED_PROGRESS_POINTS]
 
async def save_course_estimated_commitment_to_state(
    course_plan: dict[str, Any],
    tool_context: ToolContext,
) -> dict[str, Any]:
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}
 
    # ── Parse & normalize before saving ────────────────────────────────────
    try:
        parsed_plan = _parse_course_plan(course_plan)
    except ValueError as e:
        return {"status": "error", "message": str(e)}
    course_id = state.get("course_id") or parsed_plan.get("courseId")
 
    # Basic sanity check — must have chapters
    if not parsed_plan.get("chapters"):
        return {
            "status": "error",
            "message": "Parsed course plan has no chapters. Cannot save.",
        }

    total_actual_seconds = 0
    total_estimated_seconds = 0
    comparable_finished_lessons = 0
    list_complete_lessons = []
    state[COURSE_PLAN_STATE_KEY] = parsed_plan
    user_course_state = _get_user_course_state(state, course_id)
    for chapter in parsed_plan.get("chapters", []):
        for lesson in chapter.get("lessons", []):
            if lesson.get("isFinished", False):
                list_complete_lessons.append(lesson.get("title", "Unknown Lesson"))
                previous_gap_hours = user_course_state.get("gap_hours", 0)
                gap_hours = previous_gap_hours if previous_gap_hours > 0 else 0
                base_estimated_seconds = lesson.get("duration") or FALLBACK_LESSON_DURATION_SECONDS
                estimated_seconds = base_estimated_seconds + (gap_hours * 3600)
                actual_seconds = lesson.get("timeSpent")
                if actual_seconds is None:
                    continue
                if estimated_seconds <= 0 or actual_seconds < 0:
                    continue
                total_estimated_seconds += estimated_seconds
                total_actual_seconds += actual_seconds
                comparable_finished_lessons += 1

    average_actual_seconds = (
        total_actual_seconds / comparable_finished_lessons if comparable_finished_lessons > 0 else 0
    )
    average_estimated_seconds = (
        total_estimated_seconds / comparable_finished_lessons if comparable_finished_lessons > 0 else 0
    )
    performance_multiplier = (
        total_actual_seconds / total_estimated_seconds if total_estimated_seconds > 0 else 1.0
    )
    gap_seconds = average_actual_seconds - average_estimated_seconds
    gap_hours = gap_seconds / 3600

    user_course_state.update({
        "gap_hours": gap_hours,
        "performance_multiplier": performance_multiplier,
        "average_actual_seconds": average_actual_seconds,
        "average_estimated_seconds": average_estimated_seconds,
    })
    for stale_key in (
        "latest_completed_at",
        "days_since_latest_completion",
        "progress_is_stale",
        "overdue_finished_lessons",
        "latest_completion_delay_hours",
    ):
        user_course_state.pop(stale_key, None)

    state["gap_hours"] = gap_hours  # backward compatibility
    # Suggested scaling factor for future event durations.
    state["course_study_plan_updated_at"] = datetime.now(dt_timezone.utc).isoformat()

    # ── Auto-promote pending reschedule request ──────────────────────────────
    # If there was a needs_course_context request waiting for this course's
    # syllabus, promote it now that the plan is loaded — so the root_agent
    # routes to schedule_agent (not course_agent) on the next user turn.
    pending = state.get(COURSE_RESCHEDULE_STATE_KEY)
    if (
        isinstance(pending, dict)
        and pending.get("status") == "needs_course_agent"
        and (
            pending.get("course_id") is None
            or str(pending.get("course_id")) == str(course_id)
        )
    ):
        pending["status"] = "awaiting_user_confirmation"
        state[COURSE_RESCHEDULE_STATE_KEY] = pending

    return {
        "status": "ok",
        "state_key": COURSE_PLAN_STATE_KEY,
        "course_id": str(parsed_plan.get("courseId", "")),
        "total_chapters": len(parsed_plan.get("chapters", [])),
        "total_lessons": parsed_plan.get("totalLessons"),
        "total_estimated_hours": parsed_plan.get("total_estimated_hours"),
        "gap_hours": state["gap_hours"],
        "performance_multiplier": user_course_state.get("performance_multiplier"),
        "complete_lessons": list_complete_lessons,
        "comparable_finished_lessons": comparable_finished_lessons,
    }


async def save_course_estimated_commitment_after_tool_callback(
    tool: BaseTool,
    args: dict,
    tool_context: ToolContext,
    tool_response: dict[str, Any],
) -> dict[str, Any] | None:
    if tool.name != "fetch-course-syllabus":
        return None
    return await save_course_estimated_commitment_to_state(
        course_plan=tool_response,
        tool_context=tool_context,
    )

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


async def save_course_schedule_reschedule_request(
    tool_context: ToolContext,
    course_id: str | None = None,
    target_event_id: str | None = None,
    requested_change: dict[str, Any] | None = None,
    target_event: dict[str, Any] | None = None,
    status: str = "awaiting_user_confirmation",
) -> dict[str, Any]:
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}

    if status not in {"awaiting_user_confirmation", "needs_course_agent"}:
        return {"status": "error", "message": f"Unsupported reschedule status: {status}"}

    resolved_course_id = (
        course_id
        or (target_event or {}).get("course_id")
        or (target_event or {}).get("courseId")
        or state.get("course_id")
    )
    has_course_context = _course_plan_matches(state, resolved_course_id)
    resolved_status = status
    if status == "awaiting_user_confirmation" and not has_course_context:
        resolved_status = "needs_course_agent"

    request = {
        "status": resolved_status,
        "course_id": str(resolved_course_id) if resolved_course_id is not None else None,
        "target_event_id": target_event_id or (target_event or {}).get("id") or (target_event or {}).get("eventId"),
        "requested_change": requested_change or {},
        "target_event": target_event or {},
        "created_at": datetime.now(dt_timezone.utc).isoformat(),
    }
    state[COURSE_RESCHEDULE_STATE_KEY] = request
    return {
        "status": "ok",
        "state_key": COURSE_RESCHEDULE_STATE_KEY,
        "request": request,
        "has_course_context": has_course_context,
    }


async def get_course_schedule_reschedule_request(tool_context: ToolContext) -> dict[str, Any]:
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}

    request = state.get(COURSE_RESCHEDULE_STATE_KEY)
    if not isinstance(request, dict):
        return {"status": "empty", "state_key": COURSE_RESCHEDULE_STATE_KEY}

    course_id = request.get("course_id")
    return {
        "status": "ok",
        "state_key": COURSE_RESCHEDULE_STATE_KEY,
        "request": request,
        "has_course_context": _course_plan_matches(state, course_id),
    }


async def clear_course_schedule_reschedule_request(tool_context: ToolContext) -> dict[str, Any]:
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}

    existed = COURSE_RESCHEDULE_STATE_KEY in state
    state[COURSE_RESCHEDULE_STATE_KEY] = None
    return {
        "status": "ok",
        "cleared": existed,
        "state_key": COURSE_RESCHEDULE_STATE_KEY,
    }


def _build_reschedule_planner_context(
    state: dict[str, Any],
    course_id: str,
    blocks: list[Any],
) -> dict[str, Any] | list[Any] | None:
    """Return reschedule planner context if a pending reschedule request exists, else existing blocks or new blocks."""
    user_course_state = _get_user_course_state(state, course_id)
    schedule_plan = user_course_state.get("schedule_plan") or {}
    existing_progress = schedule_plan.get("expected_progress") or []

    existing_blocks = [
        {
            "block_no": item.get("block_no"),
            "time_start": item.get("time_start"),
            "time_end": item.get("time_end"),
        }
        for item in existing_progress
        if isinstance(item, dict)
    ]

    reschedule_request = state.get(COURSE_RESCHEDULE_STATE_KEY)
    if not isinstance(reschedule_request, dict):
        if existing_blocks:
            return existing_blocks
        return blocks

    timezone = schedule_plan.get("timezone") or state.get("timezone", "UTC")
    duration_each_block = schedule_plan.get("duration_each_block")

    course_plan = state.get(COURSE_PLAN_STATE_KEY) or {}
    course_title = course_plan.get("title") or course_plan.get("name") or f"Course {course_id}"

    requested_change = reschedule_request.get("requested_change") or {}
    # Fix 1: parse target_event từ YAML string nếu cần
    target_event_raw = reschedule_request.get("target_event") or {}
    if target_event_raw.get("type") == "text":
        import yaml
        parsed = yaml.safe_load(target_event_raw["text"])
        target_event = parsed[0] if isinstance(parsed, list) else parsed
    else:
        target_event = target_event_raw

    target_start_raw = target_event.get("start")
    if isinstance(target_start_raw, dict):
        target_start = target_start_raw.get("dateTime") or target_start_raw.get("date")
    else:
        target_start = target_start_raw or target_event.get("time_start")

    target_end_raw = target_event.get("end")
    if isinstance(target_end_raw, dict):
        target_end = target_end_raw.get("dateTime") or target_end_raw.get("date")
    else:
        target_end = target_end_raw or target_event.get("time_end")

    # Fix 2: thêm new_time_start / new_time_end vào lookup chain
    new_start = (
        requested_change.get("new_time_start")
        or requested_change.get("new_start")
        or requested_change.get("start")
        or requested_change.get("time_start")
        or requested_change.get("new_time")
    )
    new_end = (
        requested_change.get("new_time_end")
        or requested_change.get("new_end")
        or requested_change.get("end")
        or requested_change.get("time_end")
    )

    target_start_dt = _parse_optional_dt(target_start)
    target_end_dt = _parse_optional_dt(target_end)
    new_start_dt = _parse_optional_dt(new_start)
    new_end_dt = _parse_optional_dt(new_end)

    if target_start_dt and new_start_dt:
        target_block_idx = None
        for i, block in enumerate(existing_blocks):
            b_start_dt = _parse_optional_dt(block.get("time_start"))
            b_end_dt = _parse_optional_dt(block.get("time_end"))
            if b_start_dt == target_start_dt and (not target_end_dt or b_end_dt == target_end_dt):
                target_block_idx = i
                break
        
        if target_block_idx is not None:
            existing_blocks[target_block_idx]["time_start"] = new_start_dt.isoformat()
            if new_end_dt:
                existing_blocks[target_block_idx]["time_end"] = new_end_dt.isoformat()
            
            target_block = existing_blocks[target_block_idx]
            
            existing_blocks.sort(
                key=lambda b: (
                    _parse_optional_dt(b.get("time_start")) or datetime.min.replace(tzinfo=dt_timezone.utc),
                    _parse_optional_dt(b.get("time_end")) or datetime.min.replace(tzinfo=dt_timezone.utc)
                )
            )
            
            filtered_blocks = []
            for block in existing_blocks:
                if block is target_block:
                    filtered_blocks.append(block)
                else:
                    b_start_dt = _parse_optional_dt(block.get("time_start"))
                    b_end_dt = _parse_optional_dt(block.get("time_end"))
                    t_start_dt = _parse_optional_dt(target_block.get("time_start"))
                    t_end_dt = _parse_optional_dt(target_block.get("time_end"))
                    
                    if b_start_dt == t_start_dt and b_end_dt == t_end_dt:
                        continue
                    filtered_blocks.append(block)
            existing_blocks = filtered_blocks

    return {
        # Keys map directly to build-event-by-block-planner params (timeSlot filled by LLM)
        "planner_input": {
            "courseTitle": course_title,
            "course_id": str(course_id),
            "replace_mode": True,
            "timezone": timezone,
            "timeSlot": None,  # LLM derives this from reschedule_context below
        },
        # LLM uses this to compute the new timeSlot values
        "reschedule_context": {
            "requested_change": requested_change,
            "target_event": target_event,
            "target_event_id": reschedule_request.get("target_event_id"),
            "existing_block_times": existing_blocks,
            "duration_each_block": duration_each_block,
            "timezone": timezone,
        },
    }


async def build_lessons_block_plan(
    tool_context: ToolContext,
    course_id: str,
    duration_seconds: int | None = None,  # falls back to saved schedule_plan if omitted
    batch_size: int = 5,
    offset: int = 0,
) -> dict[str, Any]:
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}

    course_plan = state.get(COURSE_PLAN_STATE_KEY)
    if not course_plan or str(course_plan.get("courseId", "")) != str(course_id):
        return {"status": "error", "message": f"No course plan found for course_id {course_id}"}

    # Fall back to the duration stored in the existing schedule_plan when not supplied.
    if duration_seconds is None:
        user_course_state = _get_user_course_state(state, course_id)
        saved_plan = user_course_state.get("schedule_plan")
        if isinstance(saved_plan, dict):
            duration_seconds = saved_plan.get("duration_each_block")
    if not duration_seconds or duration_seconds <= 0:
        return {
            "status": "error",
            "message": (
                "duration_seconds is required. "
                "Either pass it explicitly or ensure the existing schedule_plan "
                "has a duration_each_block value."
            ),
        }

    raw_performance_multiplier = state.get(f"user:{course_id}", {}).get("performance_multiplier", 1.0) or 1.0
    performance_multiplier = raw_performance_multiplier
    if (
        performance_multiplier <= 0
        or performance_multiplier < MIN_REASONABLE_PERFORMANCE_MULTIPLIER
        or performance_multiplier > MAX_REASONABLE_PERFORMANCE_MULTIPLIER
    ):
        performance_multiplier = 1.0

    # Flatten + filter lessons
    pending_lessons = []
    for chapter in course_plan.get("chapters", []):
        for lesson in chapter.get("lessons", []):
            if lesson.get("isFinished", False):
                continue
            base_duration = lesson.get("duration", 0) or FALLBACK_LESSON_DURATION_SECONDS
            adjusted_duration = max(60, int(round(base_duration * performance_multiplier)))
            pending_lessons.append({
                "title": lesson.get("title", ""),
                "duration": base_duration,
                "adjusted_duration": adjusted_duration,
                "chapter_index": chapter.get("index"),
                "lesson_index": lesson.get("index"),
            })

    # Group into blocks based on duration_seconds
    blocks = []
    current_block = []
    current_total = 0
    for lesson in pending_lessons:
        lesson_duration = lesson["adjusted_duration"]
        if current_total + lesson_duration <= duration_seconds:
            current_block.append(lesson)
            current_total += lesson_duration
        else:
            if current_block:
                blocks.append(current_block)
            current_block = [lesson]
            current_total = lesson_duration
    if current_block:
        blocks.append(current_block)
    
    state["course_block_plan"] = {
        "course_id": course_id,
        "blocks": blocks,
        "pending_lessons": pending_lessons,
        "duration_seconds": duration_seconds,
        "performance_multiplier": performance_multiplier,
        "built_at": datetime.now(dt_timezone.utc).isoformat(),
    }
    batch = blocks[offset : offset + batch_size] if batch_size is not None else blocks
    result: dict[str, Any] = {
        "status": "ok",
        "course_id": course_id,
        "requested_duration_seconds": duration_seconds,
        "performance_multiplier": performance_multiplier,
        "raw_performance_multiplier": raw_performance_multiplier,
        "batch_size": batch_size,
        "offset": offset,
        "next_offset": offset + (batch_size or len(blocks)),
        "batch": batch,
        "total_blocks": len(blocks),
        "total_lessons": len(pending_lessons),
        "max_duration_block": duration_seconds  
    }

    # If a reschedule request is pending, enrich the response with planner context
    # so the LLM has everything it needs in a single tool call.
    reschedule_context = _build_reschedule_planner_context(state, course_id, blocks)
    if reschedule_context is not None:
        result["reschedule"] = reschedule_context

    return result


async def save_course_schedule_plan_to_state(
    course_id: str,
    sessions: list[dict[str, Any]],
    batch: list[Any],
    next_offset: int,
    total_lessons: int,
    timezone: str,
    tool_context: ToolContext,
    replace_existing: bool = True,
    duration_each_block: int | None = None,
) -> dict[str, Any]:
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}

    course_plan = state.get(COURSE_PLAN_STATE_KEY)
    if not isinstance(course_plan, dict):
        return {"status": "error", "message": "No course plan available in state"}
    if str(course_plan.get("courseId", "")) != str(course_id):
        return {"status": "error", "message": f"No course plan found for course_id {course_id}"}

    user_course_state = _get_user_course_state(state, course_id)
    existing_plan = user_course_state.get("schedule_plan") if isinstance(user_course_state.get("schedule_plan"), dict) else {}
    existing_progress = existing_plan.get("expected_progress", []) if not replace_existing else []
    if not isinstance(existing_progress, list):
        existing_progress = []

    baseline_completed_lessons = (
        _count_finished_lessons(course_plan)
        if replace_existing or not existing_plan
        else existing_plan.get("baseline_completed_lessons", _count_finished_lessons(course_plan))
    )
    cumulative_completed = baseline_completed_lessons
    if existing_progress:
        cumulative_completed = max(
            cumulative_completed,
            max(
                (
                    item.get("expected_completed_lessons", baseline_completed_lessons)
                    for item in existing_progress
                    if isinstance(item, dict)
                ),
                default=baseline_completed_lessons,
            ),
        )

    expected_progress = list(existing_progress)
    starting_block_no = len(expected_progress)
    for index, session in enumerate(sessions or []):
        block = batch[index] if index < len(batch or []) else None
        lesson_count = _lesson_count_for_block(block)
        if lesson_count <= 0:
            continue
        cumulative_completed += lesson_count
        entry: dict[str, Any] = {
            "block_no": starting_block_no + index + 1,
            "time_start": session.get("time_start") or session.get("timeStart"),
            "time_end": session.get("time_end") or session.get("timeEnd"),
            "lesson_count_in_block": lesson_count,
            "expected_completed_lessons": cumulative_completed,
        }
        if duration_each_block is not None:
            entry["duration_each_block"] = duration_each_block
        expected_progress.append(entry)

    plan_version = datetime.now(dt_timezone.utc).isoformat()
    schedule_plan: dict[str, Any] = {
        "status": "active",
        "plan_version": plan_version,
        "baseline_completed_lessons": baseline_completed_lessons,
        "total_lessons": course_plan.get("totalLessons") or total_lessons,
        "next_offset": next_offset,
        "timezone": timezone,
        "expected_progress": _prune_expected_progress(expected_progress),
    }
    if duration_each_block is not None:
        schedule_plan["duration_each_block"] = duration_each_block
    state_key = _user_course_state_key(course_id)
    user_course_state = dict(_get_user_course_state(state, course_id))
    user_course_state["schedule_plan"] = schedule_plan
    state[state_key] = user_course_state

    return {
        "status": "ok",
        "course_id": str(course_id),
        "state_key": _user_course_state_key(course_id),
        "plan_version": plan_version,
        "baseline_completed_lessons": baseline_completed_lessons,
        "expected_progress_count": len(schedule_plan["expected_progress"]),
        "next_offset": next_offset,
    }


async def update_course_schedule_block_times(
    course_id: str,
    sessions: list[dict[str, Any]],
    tool_context: ToolContext,
) -> dict[str, Any]:
    """Patch only time_start / time_end on existing expected_progress entries.

    Called after `build-event-by-block-planner` succeeds during a reschedule.
    All other block metadata (block_no, lesson_count_in_block,
    expected_completed_lessons, duration_each_block, …) is preserved as-is.

    Args:
        course_id:  Course whose schedule_plan should be updated.
        sessions:   Ordered list returned by the MCP planner tool.
                    Each item should contain time_start / timeStart and
                    time_end / timeEnd (ISO-8601 with offset).
        tool_context: ADK tool context.
    """
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}

    user_course_state = _get_user_course_state(state, course_id)
    schedule_plan = user_course_state.get("schedule_plan")
    if not isinstance(schedule_plan, dict) or schedule_plan.get("status") != "active":
        return {
            "status": "error",
            "message": f"No active schedule_plan found for course_id {course_id}",
        }

    existing_progress: list[dict[str, Any]] = schedule_plan.get("expected_progress") or []
    if not isinstance(existing_progress, list):
        return {"status": "error", "message": "expected_progress is missing or malformed"}

    updated_count = 0
    patched_progress = list(existing_progress)  # shallow copy of list
    for index, session in enumerate(sessions or []):
        if index >= len(patched_progress):
            break
        entry = dict(patched_progress[index])  # copy entry before mutating
        new_start = session.get("time_start") or session.get("timeStart")
        new_end = session.get("time_end") or session.get("timeEnd")
        if new_start is not None:
            entry["time_start"] = new_start
        if new_end is not None:
            entry["time_end"] = new_end
        patched_progress[index] = entry
        updated_count += 1

    plan_version = datetime.now(dt_timezone.utc).isoformat()
    updated_plan = {
        **schedule_plan,
        "expected_progress": patched_progress,
        "plan_version": plan_version,
    }
    state_key = _user_course_state_key(course_id)
    updated_user_state = dict(user_course_state)
    updated_user_state["schedule_plan"] = updated_plan
    state[state_key] = updated_user_state

    return {
        "status": "ok",
        "course_id": str(course_id),
        "state_key": state_key,
        "plan_version": plan_version,
        "updated_block_count": updated_count,
        "total_blocks": len(patched_progress),
    }


async def analyze_course_schedule_progress(
    course_id: str,
    tool_context: ToolContext,
) -> dict[str, Any]:
    state = getattr(tool_context, "state", None)
    if state is None:
        return {"status": "error", "message": "No state available"}

    course_plan = state.get(COURSE_PLAN_STATE_KEY)
    if not isinstance(course_plan, dict):
        return {"status": "error", "message": "No refreshed course plan available in state"}

    user_course_state = _get_user_course_state(state, course_id)
    schedule_plan = user_course_state.get("schedule_plan")
    if not isinstance(schedule_plan, dict) or schedule_plan.get("status") != "active":
        analysis = {
            "analyzed_at": datetime.now(dt_timezone.utc).isoformat(),
            "actual_completed_lessons": _count_finished_lessons(course_plan),
            "expected_completed_lessons": None,
            "delta_lessons": None,
            "progress_status": "no_active_schedule_plan",
        }
        user_course_state["last_progress_analysis"] = analysis
        state_key = _user_course_state_key(course_id)
        state[state_key] = user_course_state
        return {"status": "ok", **analysis}

    now = datetime.now(dt_timezone.utc)
    expected_progress = schedule_plan.get("expected_progress") or []
    due_points = [
        item for item in expected_progress
        if isinstance(item, dict)
        and _parse_optional_dt(item.get("time_end"))
        and _parse_optional_dt(item.get("time_end")) <= now
    ]
    due_points.sort(key=lambda item: _parse_optional_dt(item.get("time_end")) or datetime.min.replace(tzinfo=dt_timezone.utc))
    if due_points:
        expected_completed_lessons = due_points[-1].get("expected_completed_lessons")
    else:
        expected_completed_lessons = schedule_plan.get("baseline_completed_lessons", 0)

    actual_completed_lessons = _count_finished_lessons(course_plan)
    delta_lessons = actual_completed_lessons - int(expected_completed_lessons or 0)
    if delta_lessons < 0:
        progress_status = "behind"
    elif delta_lessons > 0:
        progress_status = "ahead"
    else:
        progress_status = "on_track"

    analysis = {
        "analyzed_at": now.isoformat(),
        "actual_completed_lessons": actual_completed_lessons,
        "expected_completed_lessons": int(expected_completed_lessons or 0),
        "delta_lessons": delta_lessons,
        "progress_status": progress_status,
        "plan_version": schedule_plan.get("plan_version"),
    }
    state_key = _user_course_state_key(course_id)
    user_course_state["last_progress_analysis"] = analysis
    state[state_key] = user_course_state
    return {"status": "ok", **analysis}