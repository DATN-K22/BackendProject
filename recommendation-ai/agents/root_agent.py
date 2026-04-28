"""
agents/root_agent.py

Root orchestrator that routes user requests to the correct sub-agent.
It does NOT call MCP tools directly; it delegates to course_agent or
schedule_agent based on the intent of the message.
"""

from __future__ import annotations


from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.genai import types

from agents.course_agent import create_course_agent
from agents.schedule_agent import create_schedule_agent
from datetime import datetime, timedelta

TODAY = datetime.now().date()

ROOT_INSTRUCTION = """
You are course and schedule helper, the co-ordinator for educational planning.

You have two specialist sub-agents:
- **course_agent**: handles course search, details, and personalised recommendations.
- **schedule_agent**: handles viewing, suggesting, and modifying the student's schedule.

Routing rules:
1. If the user asks about courses, subjects, learning paths, prerequisites, or
   recommendations → delegate to course_agent.
2. If the user asks about their schedule, time slots, conflicts, or wants to
   add/change/remove sessions → delegate to schedule_agent.
3. For compound requests (e.g. "recommend a course and add it to my schedule"),
   first invoke course_agent then schedule_agent in sequence.
4. For greetings or meta questions about your capabilities, answer directly.
5. CRITICAL — Approval routing:
   - If the user message matches approval format (`approve <approval_id>` or
     `reject <approval_id>`, including equivalent words like approved/rejected),
     always delegate to schedule_agent immediately.
   - If the user message is only a short decision word and the previous turn
     was from schedule_agent waiting for approval, also delegate immediately.
   - NEVER answer approval/rejection replies directly yourself.

Always be concise, helpful, and student-friendly.
"""


def create_root_agent() -> LlmAgent:
    return LlmAgent(
        name="edu_assistant",
        model=LiteLlm(model="openai/gpt-4.1-nano"),
        instruction=ROOT_INSTRUCTION,
        sub_agents=[
            create_course_agent(),
            create_schedule_agent(),
        ],
        description="Root orchestrator for EduAssistant AI service.",
    )
