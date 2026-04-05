from __future__ import annotations

import os
from dotenv import load_dotenv

load_dotenv()


from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.agents.remote_a2a_agent import RemoteA2aAgent, AGENT_CARD_WELL_KNOWN_PATH

from .remote_http_client import get_remote_agent_http_client


def _resolve_agent_card_url(env_name: str, default_base: str) -> str:
    """
    Resolve remote agent card URL from env.

    Supports both:
    - full agent-card URL in env var
    - base service URL (we append AGENT_CARD_WELL_KNOWN_PATH)
    """
    raw = os.getenv(env_name, default_base).rstrip("/")
    if "/.well-known/" in raw:
        return raw
    return f"{raw}{AGENT_CARD_WELL_KNOWN_PATH}"


recommendation_agent = RemoteA2aAgent(
    name="course_schedule_agent",
    description="Specialist agent for course scheduling queries.",
    agent_card=_resolve_agent_card_url("RECOMMENDATION_AGENT_URL", "http://localhost:3009"),
    httpx_client=get_remote_agent_http_client(),
)


rag_agent = RemoteA2aAgent(
    name="rag_agent",
    description="RAG specialist agent for retrieval-grounded answers.",
    agent_card=_resolve_agent_card_url("RAG_AGENT_URL", "http://localhost:3008"),
    httpx_client=get_remote_agent_http_client(),
)


def create_root_agent() -> LlmAgent:
    root_agent = LlmAgent(
        name="edu_assistant",
        model=LiteLlm(model="openai/gpt-5-nano"),
        instruction="""You are EduAssistant, the main AI coordinator for an educational platform.

You have two specialist sub-agents:
- course_schedule_agent: handles course scheduling, availability, and time management queries.
- rag_agent: provides answers grounded in retrieved context about knowledge base of the course.

Routing rules:
1. If the user asks about courses, subjects, learning paths, prerequisites, or recommendations → delegate to course_schedule_agent.
2. If the user asks about their schedule, time slots, conflicts, or wants to add/change/remove sessions → delegate to course_schedule_agent.
3. For request contain the course content reference, syllabus reference, or knowledge base asking → delegate to rag_agent.
4. CRITICAL — If the user's message is a short confirmation or rejection word ("approved", "approve", "yes", "confirm", "ok", "sure", "no", "reject", "cancel", "denied") AND the previous agent turn was from course_schedule_agent, this is a reply to a pending schedule approval. You MUST delegate it to course_schedule_agent immediately. NEVER answer approval/rejection replies directly yourself — doing so will cause schedule changes to be lost.

Result format for the user should be at markdown with clear sections, bullet points, and tables where appropriate.
Also try to format information using markdown tables when summarizing schedule or course information for better readability.
 - For schedule summaries, use tables to show event name, date/time, and any conflicts.
 - For course information, use tables to summarize course details, prerequisites, and recommendations.

Always be concise, helpful, and student-friendly.""",
        sub_agents=[
            recommendation_agent,
            rag_agent,
        ],
        description="Root orchestrator for EduAssistant AI service.",
        
    )
    return root_agent
