"""
agents/course_agent.py

Sub-agent responsible for course recommendations, scheduling prep,
and AI-powered progress feedback.
All course data tools are provided through the external Course MCP server.
"""

from __future__ import annotations

import pathlib

from google.adk.agents import LlmAgent
from google.adk.skills import load_skill_from_dir
from google.adk.tools import skill_toolset, FunctionTool

from mcptools.toolset_factory import COURSE_MCP_CONFIG, build_toolset
from agents.course_schedule_state_tools import (
    save_course_estimated_commitment_after_tool_callback,
    analyze_course_schedule_progress,
)

# ---------------------------------------------------------------------------
# Skills
# ---------------------------------------------------------------------------

SKILLS_DIR = pathlib.Path(__file__).parent / "skills"

_SKILL_NAMES = [
    "recommend-courses",
    "schedule-course-prep",
    "load-course-schedule-context",
    "course-progress-feedback",
]

_skills = [load_skill_from_dir(SKILLS_DIR / name) for name in _SKILL_NAMES]

# ---------------------------------------------------------------------------
# Agent factory
# ---------------------------------------------------------------------------

def create_course_agent() -> LlmAgent:
    mcp_toolset = build_toolset(COURSE_MCP_CONFIG)
    my_skill_toolset = skill_toolset.SkillToolset(skills=_skills)
    analyze_course_schedule_progress_tool = FunctionTool(func=analyze_course_schedule_progress)

    all_tools = (
        [analyze_course_schedule_progress_tool, my_skill_toolset]
        + ([mcp_toolset] if mcp_toolset else [])
    )

    return LlmAgent(
        name="course_agent",
        model="gemini-2.5-flash",
        instruction="""
You are the Course Recommendation Agent for an educational platform.

## Scope
- AWS courses only. Never recommend non-AWS courses.
- Never call schedule mutation tools (create-event, update-event, delete-event,
  modify-this-only, modify-this-and-following, add-exception-date).
  All calendar mutations are handled exclusively by schedule_agent.

## Context
- Current course_id: {course_id?} — "general" means user is not on a specific course page.
- Pending course schedule rebuild request: {course_schedule_reschedule_request?}
- User timezone: {timezone?}

## TOOL-FIRST MANDATE
Always call tools before asking the user questions.
Asking is a last resort only after tools return empty results.

## Skill dispatch
| User intent | Skill |
|---|---|
| Course recommendations / learning path | recommend-courses |
| "Schedule this course" / study plan setup | schedule-course-prep |
| Load course structure for a pending course schedule edit | load-course-schedule-context |
| Progress review / feedback / "how am I doing" | course-progress-feedback |

## Output format
- Concise and encouraging.
- Use tables for course comparisons.
- Never overwhelm with more than 4 course results at once.
        """,
        tools=all_tools,
        after_tool_callback=save_course_estimated_commitment_after_tool_callback,
        description=(
            "Recommends courses based on the student's goals, background, "
            "and preferences using the Course MCP server."
        ),
    )
