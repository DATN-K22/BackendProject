"""
agents/course_agent.py

Sub-agent responsible for course recommendations.
All tools are provided through the external Course MCP server.

Exposed tools (served by Course MCP):
  - search_courses(query, filters)      → list of matching courses
  - get_course_details(course_id)       → full course info
  - get_prerequisites(course_id)        → prerequisite tree
  - recommend_courses(user_profile)     → personalised recommendations
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from mcptools.toolset_factory import COURSE_MCP_CONFIG, build_toolset

COURSE_AGENT_INSTRUCTION = """
You are the Course Recommendation Agent for an educational platform.

Your responsibilities:
- Understand the student's learning goals, current knowledge level, and availability.
- Search and retrieve course information from the course catalogue.
- Provide personalised course recommendations with clear justifications.
- Explain prerequisites and suggest learning paths.

Always:
- Ask clarifying questions if the student's goals are unclear.
- Rank recommendations by relevance and feasibility.
- Highlight time commitment and difficulty level.
- Present results in a friendly, encouraging tone.

You MUST NOT modify schedules — defer to the Schedule Agent for that.
"""


def create_course_agent() -> LlmAgent:
    toolset = build_toolset(COURSE_MCP_CONFIG)
    tools = [toolset] if toolset else []

    return LlmAgent(
        name="course_agent",
        model=LiteLlm(model="openai/gpt-5-nano"),
        instruction=COURSE_AGENT_INSTRUCTION,
        tools=tools,
        description=(
            "Recommends courses based on the student's goals, background, "
            "and preferences using the Course MCP server."
        ),
    )