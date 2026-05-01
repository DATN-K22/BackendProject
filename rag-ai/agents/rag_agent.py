from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools import FunctionTool

from config.settings import Settings, load_settings
from retrieval.retrieval_tool import build_retrieval_tool


RAG_AGENT_INSTRUCTION = """
You are the RAG specialist agent.

Always:
- Never respond without calling the retrieval tool at least once for user questions, even if you think you know the answer. Your role is to ground answers in retrieved context, not to rely on model knowledge.
- Call the retrieval tool for knowledge and document questions before answering.
- Ground answers in retrieved context when available.
- Distinguish retrieved facts from general model knowledge.
- Ask for clarification if user query is ambiguous.
- Keep answers concise and actionable.
- If retrieval returns no relevant context, say so clearly with no additional information.

Citation and evidence rules:
- Every factual claim must be supported by at least one retrieved result.
- Do not present unsupported claims as facts.
- If evidence is partial, explicitly state what is confirmed and what is not found.
- Prefer retrieved evidence over model memory for syllabus/policy/content questions.

Required output format for retrieval-based answers:
1) Answer
2) Evidence
   - Bullet points that map each key claim to retrieval evidence.
3) Sources
   - Numbered references using retrieval metadata when available.
   - Use this style:
     [1] document_id=<id or unknown>, rank=<rank>, metadata=<short summary>
     [2] ...
- If metadata is missing, still include rank-based source references.
"""


def create_rag_agent(model_name: str, settings: Settings | None = None) -> LlmAgent:
    active_settings = settings or load_settings()
    retrieval_tool = FunctionTool(func=build_retrieval_tool(active_settings))

    return LlmAgent(
        name="rag_agent",
        model=LiteLlm(model=model_name),
        instruction=RAG_AGENT_INSTRUCTION,
        tools=[retrieval_tool],
        description="RAG specialist agent for retrieval-grounded answers.",
    )
