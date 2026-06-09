---
name: schedule-course-prep
description: >
  Preparation phase for scheduling a course. Fetches the course syllabus,
  saves the study plan to state, and collects the user's scheduling preferences.
  Triggers when the user says "schedule this course", "add this course to my calendar",
  or "I want to study this course". Does NOT create any calendar events — that is
  handled exclusively by schedule_agent.
---

# Schedule Course Prep Skill

## Trigger phrases
"schedule this course", "schedule the current course", "add this course to my calendar",
"I want to study this course", "set up a study plan for this course",
"book sessions for this course", "get this course estimated time"

## Scope boundary
This skill handles **preparation only**. It MUST NOT call any calendar mutation tools
(`create-event`, `update-event`, `delete-event`, `modify-this-only`, etc.).
All calendar mutations are handled exclusively by `schedule_agent`.

---

## Step 1 — Fetch syllabus
Call `fetch-course-syllabus` with:
- `course_id`: from current state (use the specific course ID if available)
- `includeStudyPlan: true`

---

## Step 2 — Save plan to state
Immediately after step 1, call `save_course_estimated_commitment_to_state` with:
- `course_plan`: the full JSON object returned by `fetch-course-syllabus`

Do not skip this step — `schedule_agent` depends on this state to build the session plan.

---

## Step 3 — Collect preferences from user
Present the estimated commitment to the user:

> "This course has **[N] lessons** with an estimated total of **[X] hours**.
> To schedule your sessions, I need a few details:
> - How many hours per day can you study?
> - How many days per week?
> - Do you have any preferred days? (e.g. Mon/Wed/Fri)"

Wait for the user's reply. **Do not proceed further.**
`schedule_agent` will take over once the user provides their preferences.

## Hard rules
- ⛔ NEVER call schedule mutation tools in this skill.
- ⛔ NEVER skip `save_course_estimated_commitment_to_state` — it is required for handoff.
- ⛔ NEVER ask the user for preferences before completing steps 1 and 2.
- ✅ Always show the estimated hours and lesson count so the user can make an informed choice.