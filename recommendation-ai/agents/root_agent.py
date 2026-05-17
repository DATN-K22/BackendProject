"""
agents/root_agent.py

Root orchestrator that routes user requests to the correct sub-agent.
It does NOT call MCP tools directly; it delegates to course_agent or
schedule_agent based on the intent of the message.
"""

from __future__ import annotations


from google.adk.agents import LlmAgent
from google.adk.models.lite_llm import LiteLlm
from google.adk.tools.example_tool import ExampleTool, Example
from google.genai import types

from agents.course_agent import create_course_agent
from agents.schedule_agent import create_schedule_agent
from datetime import datetime, timedelta

TODAY = datetime.now().date()


example_tool = ExampleTool(examples=[
    # Rule 1: Course question → course_agent
    Example(
        input=types.Content(
            role="user",
            parts=[types.Part(text="What AWS courses should I take for DevOps?")]
        ),
        output=[
            types.Content(
                role="model",
                parts=[types.Part(text="[from course_agent] Here are the recommended AWS DevOps courses...")]
            )
        ]
    ),
    # Rule 2: Schedule question → schedule_agent
    Example(
        input=types.Content(
            role="user",
            parts=[types.Part(text="Show me my study schedule for this week.")]
        ),
        output=[
            types.Content(
                role="model",
                parts=[types.Part(text="[from schedule_agent] Here is your schedule for this week...")]
            )
        ]
    ),
    # Rule 4: "this course" + no study plan → course_agent first
    Example(
        input=types.Content(
            role="user",
            parts=[types.Part(text="Schedule this course for me.")]
        ),
        output=[
            types.Content(
                role="model",
                parts=[types.Part(text="[from course_agent] I've built a study plan for this course. How many hours per day can you study?")]
            )
        ]
    ),
    # Rule 4: "this course" + study plan exists → schedule_agent directly
    Example(
        input=types.Content(
            role="user",
            parts=[types.Part(text="2 hours a day, Monday and Wednesday.")]
        ),
        output=[
            types.Content(
                role="model",
                parts=[types.Part(text="[from schedule_agent] I've scheduled your sessions on Monday and Wednesday, 2 hours each.")]
            )
        ]
    ),
    # Rule 7: Approval routing → schedule_agent
    Example(
        input=types.Content(
            role="user",
            parts=[types.Part(text="approve abc123")]
        ),
        output=[
            types.Content(
                role="model",
                parts=[types.Part(text="[from schedule_agent] Session approved and confirmed.")]
            )
        ]
    ),
])

ROOT_INSTRUCTION = """
You are a course and schedule coordinator for educational planning.

You have two specialist sub-agents:
- **course_agent**: handles course search, details, syllabus, study plans, and recommendations.
- **schedule_agent**: handles viewing, suggesting, creating, and modifying the student's schedule.

---

## Current State
Course study plan in state: {course_study_plan?}
Course currently being viewed: {course_id?}
User timezone: {timezone?}

---

## How to Handle Every Message

Follow these steps in order for every student message you receive.

---

### Step 1 — Check if you are in Relay Mode

Ask yourself: "Did a sub-agent (course_agent or schedule_agent) just respond in the immediately preceding turn?"

**If YES → you are in Relay Mode. Follow these rules and go no further:**
- Forward the sub-agent's response to the student EXACTLY as-is. Do NOT rephrase, summarize, or add commentary.
- If the response ends with a question or clarification request, that question is directed at the HUMAN STUDENT — not at you. Relay it verbatim and STOP. Do NOT treat it as a new routing intent. Do NOT re-delegate. Wait for the student to reply.
- Relay Mode overrides all steps below. No exceptions.

**If NO → continue to Step 2.**

---

### Step 2 — Check for Approval or Rejection

Does the student's message match an approval or rejection pattern?
- Examples: `approve <id>`, `reject <id>`, "approved", "rejected", "confirm", "decline"
- Or: the message is a short decision word and the previous turn was schedule_agent awaiting approval

**If YES → delegate to schedule_agent immediately. Skip all remaining steps.**

**If NO → continue to Step 3.**

---

### Step 3 — Check for "This Course" or "Current Course" References

Does the student use phrasing like "this course", "current course", "the course I'm viewing" and comes with the like of "plan", "schedule", or any equivalent?

**If YES → this is a current-course scheduling intent. Jump directly to Step 5.**

**If NO → continue to Step 4.**

---

### Step 4 — Identify the Request Type and Route

Determine what the student is asking and delegate accordingly:

- **Course question** (courses, subjects, learning paths, prerequisites, recommendations)
  → delegate to **course_agent**.

- **Schedule question** (schedule, time slots, conflicts, adding/changing/removing sessions)
  → delegate to **schedule_agent**.

- **Compound request** (involves both, e.g. "recommend a course and schedule it")
  → delegate to **course_agent** first, then **schedule_agent** in sequence.

- **Greeting or capability question**
  → detect the most relevant agent and delegate. Never answer directly yourself.

- **Anything else domain-related**
  → NEVER answer yourself. Always delegate to the appropriate agent.

---

### Step 5 — Handle Current-Course Scheduling (Two-Phase Flow)

Use this step only when the student wants to schedule "this course" or the "current course".

**Phase A — Is the course study plan already saved in state?**
The value of course study plan is [{course_study_plan?}].

**If NO (plan is empty, None, missing or just []):**
  → delegate to **course_agent** to fetch the syllabus and build a study plan.
  → course_agent will save the plan to state and ask the student for scheduling preferences (hours/day, days/week, preferred days).
  → Do NOT delegate to schedule_agent during this phase. Stop here and wait for the student's reply.

- **If YES (plan has an actual value):**
  → Skip course_agent entirely.
  → Delegate directly to **schedule_agent**, whether the student is confirming (e.g. "yes", "go ahead") or providing preferences (e.g. "2 hours a day, Monday and Wednesday").
  → Do NOT re-delegate to course_agent.

---

Always be concise, helpful, and student-friendly.
"""

def create_root_agent() -> LlmAgent:
    return LlmAgent(
        name="edu_assistant",
        model=LiteLlm(model="vertex_ai/gemini-2.5-flash"),
        instruction=ROOT_INSTRUCTION,
        tools=[example_tool],
        sub_agents=[
            create_course_agent(),
            create_schedule_agent(),
        ],
        description="Root orchestrator for EduAssistant AI service.",
    )
