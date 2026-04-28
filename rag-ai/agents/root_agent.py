from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm

from agents.rag_agent import create_rag_agent
from config.settings import Settings


ROOT_INSTRUCTION = """
You are the RAG Assistant coordinator.

Routing rules:
1. Retrieval-heavy, knowledge, policy, and documentation questions -> rag_agent.
2. Greetings and capability questions -> answer directly.
"""


def create_root_agent(model_name: str, settings: Settings | None = None) -> LlmAgent:
    return LlmAgent(
        name="rag_assistant",
        model=LiteLlm(model="openai/gpt-4.1-nano"),
        instruction=ROOT_INSTRUCTION,
        sub_agents=[create_rag_agent(model_name, settings=settings)],
        description="Root orchestrator for the RAG AI service.",
    )
