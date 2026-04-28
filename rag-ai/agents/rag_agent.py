from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool

from config.settings import Settings, load_settings
from retrieval.retrieval_tool import build_retrieval_tool


RAG_AGENT_INSTRUCTION = """
You are the RAG specialist agent.

Always:
- Call `retrieve_context` for knowledge and document questions before answering.
- Ground answers in retrieved context when available.
- Distinguish retrieved facts from general model knowledge.
- Ask for clarification if user query is ambiguous.
- Keep answers concise and actionable.
- If retrieval returns no relevant context, say so clearly with no additional information.
"""


def create_rag_agent(model_name: str, settings: Settings | None = None) -> LlmAgent:
    active_settings = settings or load_settings()
    retrieval_tool = FunctionTool(func=build_retrieval_tool(active_settings))

    return LlmAgent(
        name="rag_agent",
        model=LiteLlm(model="openai/gpt-4.1-nano"),
        instruction=RAG_AGENT_INSTRUCTION,
        tools=[retrieval_tool],
        description="RAG specialist agent for retrieval-grounded answers.",
    )
