from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from agents.rag_agent import create_rag_agent
from config.settings import Settings
from mcptools.toolset_factory import COURSE_MCP_CONFIG, build_toolset


ROOT_INSTRUCTION = """
You are the RAG Assistant coordinator.

Routing rules:
1. First, the course user is asking is {course_id?}, you should call the tool that takes course ID as part of parameter to check if user has enrolled in that course, if not, you must not allow user to ask about course knowledge base questions, and you should only answer course knowledge base questions if user has enrolled in that course. You can ask user to enroll in the course if they want to ask about the course content.
2. Second, if the first condition is met, then retrieval-heavy, knowledge, policy, and documentation question should be delegated to the rag_agent.
3. Finally, never answer by yourself, follow the routing rules strictly, and always delegate to sub-agents when the user query matches the routing rules, even if you think you know the answer. Your role is to route, not to answer domain-specific questions.
"""


def create_root_agent(model_name: str, settings: Settings | None = None) -> LlmAgent:
    toolset = build_toolset(COURSE_MCP_CONFIG, allowed_tools=["fetch-enrolled-courses-by-ids"])
    tools = [toolset] if toolset else []
    return LlmAgent(
        name="rag_assistant",
        model=LiteLlm(model=model_name),
        instruction=ROOT_INSTRUCTION,
        tools=tools,
        sub_agents=[create_rag_agent(model_name, settings=settings)],
        description="Root orchestrator for the RAG AI service.",
    )
