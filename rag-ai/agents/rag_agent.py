from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm


RAG_AGENT_INSTRUCTION = """
You are the RAG specialist agent.

Always:
- Ground answers in retrieved context when available.
- Distinguish retrieved facts from general model knowledge.
- Ask for clarification if user query is ambiguous.
- Keep answers concise and actionable.
"""


def create_rag_agent(model_name: str) -> LlmAgent:
    return LlmAgent(
        name="rag_agent",
        model=LiteLlm(model=model_name),
        instruction=RAG_AGENT_INSTRUCTION,
        description="RAG specialist agent for retrieval-grounded answers.",
    )
