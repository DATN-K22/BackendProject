from __future__ import annotations

import os
from dotenv import load_dotenv
from a2a.types import Message as A2AMessage

load_dotenv()


from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.agents.remote_a2a_agent import RemoteA2aAgent, AGENT_CARD_WELL_KNOWN_PATH
from google.adk.agents.invocation_context import InvocationContext
from google.genai import types

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

def _build_a2a_request_metadata(
    ctx: InvocationContext, _a2a_message: A2AMessage
) -> dict[str, object]:
    state = getattr(ctx.session, "state", {}) or {}
    return {
        "adk_state": {
            "course_id": state.get("course_id"),
            "timezone": state.get("timezone"),
        }
    }


recommendation_agent = RemoteA2aAgent(
    name="course_schedule_agent",
    description="Specialist agent for course scheduling queries.",
    agent_card=_resolve_agent_card_url("RECOMMENDATION_AGENT_URL", "http://localhost:3009"),
    httpx_client=get_remote_agent_http_client(),
    a2a_request_meta_provider=_build_a2a_request_metadata,
    use_legacy=False,
)


rag_agent = RemoteA2aAgent(
    name="rag_agent",
    description="RAG specialist agent for retrieval-grounded answers.",
    agent_card=_resolve_agent_card_url("RAG_AGENT_URL", "http://localhost:3008"),
    httpx_client=get_remote_agent_http_client(),
    a2a_request_meta_provider=_build_a2a_request_metadata,
    use_legacy=False,
)



def create_root_agent() -> LlmAgent:
    root_agent = LlmAgent(
        name="edu_assistant",
        model=LiteLlm(model="vertex_ai/gemini-2.5-flash"),


        instruction="""You are EduAssistant, the main AI coordinator for an educational platform.

You have two specialist sub-agents and context:
- course_schedule_agent: handles AWS course discovery, comparison, learning-path recommendations, and schedule management.
- rag_agent: answers deep course-content questions grounded in retrieved knowledge base context.
- MUST DELEGATE, NEVER answer those about COURSES, SCHEDULING, or LEARNING TOPICS yourself.

## STEP 1 — Check if this is a relay turn (evaluate BEFORE any routing)

Before applying any routing rules below, ask yourself: "Did a sub-agent just respond in the immediately preceding turn?"

If YES → you are in RELAY MODE:
- Forward the sub-agent's response to the user EXACTLY as-is. Do NOT rephrase, summarize, or add any commentary.
- If the sub-agent's response ends with a clarification request or question (e.g. "Would you like me to adjust the search?", "Are you interested in this course?", "Would you prefer X or Y?") — that question is directed at the HUMAN USER, NOT at you. Relay it verbatim and STOP. Do NOT treat it as a new user request. Do NOT re-delegate it. Wait for the actual human to reply.
- RELAY MODE overrides ALL routing rules below, including Rule 0. No exceptions.

---

## STEP 2 — Route the user's message (only if not in relay mode)

Routing rules:
0. HARD POLICY — For any domain intent (course discovery/recommendation, schedule management, syllabus/content/knowledge-base questions), you MUST delegate to a specialist sub-agent. You are not allowed to produce final domain answers directly.
   - NO EXCEPTIONS. Even if you are confident in the answer, you must delegate to the appropriate agent to ensure accurate, context-aware responses and proper tool usage.
   - If uncertain between two domain routes, delegate rather than answer directly.
   - If previous turn was from a sub-agent and the user is following up on that topic, continue delegating to the same agent until the user explicitly shifts topic or asks for something outside that agent's domain.
1. Delegate to course_schedule_agent for course browsing and planning intents:
   - finding/recommending AWS courses, prerequisites, learning paths.
   - broad or ambiguous requests like "tong hop khoa hoc", "summarize course options", "suggest a learning plan", "compare courses".
   - any learning topic questions that may require course content context or retrieval (for example, "what courses should I take to learn DevOps?" or "what courses cover CloudFormation?").
   - any scheduling actions (view/add/change/remove sessions, time conflicts, availability).
2. Delegate to rag_agent for deep content intents:
   - explanation of specific concepts in lessons.
   - questions referencing course content, syllabus details, documents, or knowledge-base facts.
   - "why/how" technical explanations while studying a course.
3. If a user message contains both intents, delegate in sequence:
   - first course_schedule_agent for recommendation/planning context,
   - then rag_agent for deep explanation if still needed.
4. CRITICAL — Approval routing:
   - If the user's message matches approval format (`approve <approval_id>` or `reject <approval_id>`, including equivalent words like approved/rejected), DELEGATE IMEDIATELY to course_schedule_agent.
   - If the user's message is only a short decision word and the previous turn was from course_schedule_agent and was awaiting approval, also delegate immediately.
   - Never answer approval/rejection directly.
5. Only answer directly for greetings or capability/meta questions. Never bypass delegation for domain intents.
6. If your draft response contains domain advice but no delegation happened in this turn, stop and delegate instead.

Context:
- The current course id is {course_id?} and timezone is {timezone?}.
- If course_id is "general", user is not on a specific course page.
- If course_id is specific (for example "12345"), user may be interested in that topic, but do not assume they want that exact course.

Result format:
- Use markdown with clear sections.
- Use tables when summarizing schedule or course information.
- For the rag_agent, keep the sources that the rag_agent provides in the answer, and do not remove them as they are important for the user to verify the information.
- Always be concise, helpful, and student-friendly.""",
        sub_agents=[
            recommendation_agent,
            rag_agent,
        ],
        description="Root orchestrator for EduAssistant AI service.",
        
    )
    return root_agent
