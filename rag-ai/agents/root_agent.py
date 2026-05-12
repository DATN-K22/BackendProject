from __future__ import annotations

from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.example_tool import ExampleTool, Example
from google.genai import types

from agents.rag_agent import create_rag_agent
from config.settings import Settings
from mcptools.toolset_factory import COURSE_MCP_CONFIG, build_toolset
from google.adk.tools.example_tool import ExampleTool, Example


example_tool = ExampleTool(examples=[
    # Case 1: course_id empty/general → STOP immediately
    Example(
        input=types.Content(
            role="user",
            parts=[types.Part(text="What is taught in this course?")]
            # course_id = "general" or empty
        ),
        output=[
            types.Content(
                role="model",
                parts=[types.Part(text="No course ID provided. Cannot check enrollment status.")]
            )
        ]
    ),
    # Case 2: course_id valid, enrolled → delegate to rag_agent
    Example(
        input=types.Content(
            role="user",
            parts=[types.Part(text="What is taught in course 21?")]
            # course_id = "21", fetch returns non-empty
        ),
        output=[
            types.Content(
                role="model",
                parts=[types.Part(text="[from RAG agent] The course covers the following topics...")]
            )
        ]
    ),
    # Case 3: course_id valid but not enrolled → STOP
    Example(
        input=types.Content(
            role="user",
            parts=[types.Part(text="Explain the syllabus for course 99?")]
            # course_id = "99", fetch returns empty list
        ),
        output=[
            types.Content(
                role="model",
                parts=[types.Part(text="No enrollment found for course_id 99.")]
            )
        ]
    ),
])

ROOT_INSTRUCTION = """
You are the RAG Assistant coordinator of an A2A system.

## Workflow (follow in strict order every turn)

### STEP 1 — CHECK COURSE ID:
- course_id = "{course_id?}"
- If course_id is empty, "", null, or "general":
  Respond ONLY with JSON: "No course ID provided. Cannot check enrollment status."
  Then STOP.

### STEP 2 — CALL FETCH TOOL (mandatory if course_id is valid):
- Call "fetch-enrolled-courses-by-ids" with course_id="{course_id?}" NOW.
- Do NOT skip this call under any circumstance.
- Do NOT assume the result. Wait for the actual tool response.

### STEP 3 — RETURN RESULT:
- If tool returns empty list:
  Respond ONLY with: "No enrollment found for course_id {course_id?}." Then STOP.
- If tool returns non-empty list:
  Proceed to STEP 4.


### STEP 4 — Retrieval & answer
- Delegate to rag_agent to retrieve and answer the user's question.
- Forward rag_agent's response to the user exactly as-is (keep any `[from RAG agent]` prefix).

## Hard rules
- NEVER answer domain questions yourself. Your only role is to coordinate.
- NEVER skip validate step, even if you think you know the enrollment status.
- NEVER call rag_agent if validate step not passed.
"""


def create_root_agent(model_name: str, settings: Settings | None = None) -> LlmAgent:
    toolset = build_toolset(COURSE_MCP_CONFIG, allowed_tools=["fetch-enrolled-courses-by-ids"])
    tools = [toolset] if toolset else []
    return LlmAgent(
        name="rag_assistant",
        model=LiteLlm(model="vertex_ai/gemini-2.5-flash"),
        instruction=ROOT_INSTRUCTION,
        tools=tools + [example_tool],
        sub_agents=[
            create_rag_agent(model_name, settings=settings),
        ],
        description="Root orchestrator for the RAG AI service.",
    )
