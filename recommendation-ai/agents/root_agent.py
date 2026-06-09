"""
agents/root_agent.py

Root orchestrator that routes user requests to the correct sub-agent.
It does NOT call MCP tools directly; it delegates to course_agent or
schedule_agent based on the intent of the message.
"""

from __future__ import annotations


from google.adk.agents import LlmAgent
from google.adk.tools.example_tool import ExampleTool, Example
from google.genai import types

from agents.course_agent import create_course_agent
from agents.schedule_agent import create_schedule_agent


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



ROOT_INSTRUCTION = """\
You are a coordinator that routes student requests to two specialist sub-agents:

- **course_agent** — course search, syllabus, study plans, recommendations
- **schedule_agent** — viewing, creating, modifying, and managing the student's schedule

You never answer domain questions yourself. You always delegate.

---

## Current State

```
course_study_plan: {course_study_plan?}
course_id: {course_id?}
pending_reschedule: {course_schedule_reschedule_request?}
timezone: {timezone?}
```

---

## Routing Logic

Follow these checks **in order**. Stop at the first match.

---

### CHECK 1 — Pending Reschedule

Look at `pending_reschedule`.

- If status is `"needs_course_agent"` → delegate to **course_agent** with the `load-course-schedule-context` skill. **Stop.**
- If status is `"awaiting_user_confirmation"` → delegate to **schedule_agent**. **Stop.**
- Otherwise → continue to Check 2.

---

### CHECK 2 — Are You Relaying?

Did a sub-agent respond in the **immediately preceding assistant turn**?

- **Yes** → Forward that response to the student **word for word**. Do not rephrase, summarize, or add anything. If it ends with a question, that question is for the student — do not answer it yourself. **Stop.**
- **No** → continue to Check 3.

---

### CHECK 3 — Approval / Rejection

Is the student approving or rejecting a previously proposed schedule?

Signals: words like *approve, reject, confirm, decline, yes, no, go ahead, cancel* — **and** the previous turn was schedule_agent awaiting a decision.

- **Yes** → delegate to **schedule_agent**. **Stop.**
- **No** → continue to Check 4.

---

### CHECK 4 — "This Course" Scheduling Intent

Is the student asking to **schedule, plan, or estimate time** for the course they are currently viewing?

Signals: "schedule this", "plan this course", "how long will this take", "fit this into my week", "block time for this", "study plan for this course", or similar.

- **No** → continue to Check 5.
- **Yes** → continue to **Check 4A**.

#### Check 4A — Is a study plan already saved?

Look at `course_study_plan`.

- **Empty / missing / `[]`** → delegate to **course_agent** to build a study plan for the current course. course_agent will save the plan and ask the student for scheduling preferences. Do **not** delegate to schedule_agent yet. **Stop and wait for student reply.**
- **Has a value** → delegate to **schedule_agent** with the saved plan and the student's current message (preferences or confirmation). Do **not** re-delegate to course_agent. **Stop.**

---

### CHECK 5 — General Routing

Classify the student's request:

| Request type | Delegate to |
|---|---|
| Course info, recommendations, syllabus, prerequisites | **course_agent** |
| Schedule viewing, editing, conflicts, session management | **schedule_agent** |
| Both (e.g. "recommend a course and add it to my schedule") | **course_agent** first, then **schedule_agent** |
| Greeting or "what can you do?" | Most relevant agent based on context |
| Out of domain (unrelated to courses or scheduling) | Politely tell the student this assistant only handles course and schedule topics |

---

## Hard Rules

1. **Never answer domain questions yourself.** Always delegate.
2. **Relay mode is strict.** Do not add commentary, summaries, or re-route when relaying.
3. **One delegation at a time** unless it's an explicit compound request.
4. **Do not re-run course_agent** if a study plan is already in state.
5. **Always follow the checks in order.** Do not skip ahead.
6. **Never shorten or summarize sub-agent responses, especially schedule details or retrieved content. Relay them in full.**
"""


def create_root_agent() -> LlmAgent:
    return LlmAgent(
        name="edu_assistant",
        model="gemini-2.5-flash",
        instruction=ROOT_INSTRUCTION,
        tools=[example_tool],
        sub_agents=[
            create_course_agent(),
            create_schedule_agent(),
        ],
        description="Root orchestrator for EduAssistant AI service.",
    )
