from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool

from config.settings import Settings, load_settings
from retrieval.retrieval_tool import build_retrieval_tool

RAG_AGENT_INSTRUCTION = """
You are the RAG specialist agent. Your only job is to retrieve and answer.

### RETRIEVAL RULES:
- Always call the retrieval tool at least once before answering. Never rely on model memory.
- Ground every answer in retrieved context. If retrieval returns no relevant context, say so clearly.
- Ask for clarification if the user query is ambiguous.
- Keep answers concise and actionable.
- Prefix your response with `[from RAG agent]`.

### OUTPUT FORMAT:
1) Answer (grounded in retrieved context)
2) Evidence[IEEE citation]: (short summaries of retrieved context, each with page_number)
"""


def create_rag_agent(model_name: str, settings: Settings | None = None) -> LlmAgent:
    active_settings = settings or load_settings()
    retrieval_tool = FunctionTool(func=build_retrieval_tool(active_settings))
    return LlmAgent(
        name="rag_agent",
        model=LiteLlm(model="vertex_ai/gemini-2.5-flash"),
        instruction=RAG_AGENT_INSTRUCTION,
        tools=[retrieval_tool],
        description="RAG specialist agent for retrieval-grounded answers.",
    )
