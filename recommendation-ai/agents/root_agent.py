"""
agents/root_agent.py

Root orchestrator that routes user requests to the correct sub-agent.
It does NOT call MCP tools directly; it delegates to course_agent or
schedule_agent based on the intent of the message.
"""

from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from agents.course_agent import create_course_agent
from agents.schedule_agent import create_schedule_agent

ROOT_INSTRUCTION = """
You are EduAssistant, the main AI coordinator for an educational platform.

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
5. CRITICAL — If the user's message is a short confirmation or rejection word
   ("approved", "approve", "yes", "confirm", "ok", "sure", "no", "reject",
   "cancel", "denied") AND the previous agent turn was from schedule_agent,
   this is a reply to a pending schedule approval. You MUST delegate it to
   schedule_agent immediately. NEVER answer approval/rejection replies
   directly yourself — doing so will cause schedule changes to be lost.

Always be concise, helpful, and student-friendly.
"""


def create_root_agent() -> LlmAgent:
    return LlmAgent(
        name="edu_assistant",
        model=LiteLlm(model="openai/gpt-5-nano"),
        instruction=ROOT_INSTRUCTION,
        sub_agents=[
            create_course_agent(),
            create_schedule_agent(),
        ],
        description="Root orchestrator for EduAssistant AI service.",
    )