---
name: reschedule-course-schedule
description: >
  Executes a coordinated course schedule time-shift after the user confirms a
  pending reschedule request. Rebuilds lesson blocks using the saved duration,
  commits the new event times via the planner, and patches the schedule plan
  state — without altering which lessons are in each block.
---

# Reschedule Course Schedule Skill

## Trigger
- User confirms a pending course rebuild (says "yes", "go ahead", "confirm", etc.)
  AND state contains a `course_schedule_reschedule_request` with
  `status = "awaiting_user_confirmation"`.

---

## Step 1 — Verify context

Call `get_course_schedule_reschedule_request`.

- If `has_course_context = false`: explain that the course structure must be loaded
  first and **STOP** — ask the user to open the course page.
- If `has_course_context = true`: continue.

---

## Step 2 — Rebuild lesson blocks

Call `build_lessons_block_plan` with **`course_id`, `batch_size` = 5, `offset` = 0** — omit `duration_seconds`.
The function automatically reuses `duration_each_block` stored in the existing
schedule plan.

The response includes a `reschedule` key with two sub-objects:

```
reschedule.planner_input
  ├── courseTitle      → pass as courseTitle to the planner
  ├── course_id        → pass as course_id
  ├── replace_mode     → true (pass as-is)
  ├── blocks           → pass as blocks to the planner
  └── timezone         → default timezone for sessions

reschedule.reschedule_context
  ├── requested_change      → what the user originally asked for (new time, etc.)
  ├── target_event          → the original event being moved
  ├── existing_block_times  → [{block_no, time_start, time_end}, …] current schedule
  └── duration_each_block   → seconds per block (for computing new slot sizes)
```

Use `reschedule_context.existing_block_times` + `reschedule_context.requested_change`
to compute the new `timeSlot` array for the planner (shift the affected block to the
requested new time, then shift all following blocks to maintain the original cadence).

---

## Step 3 — Propose and get approval

Summarize the new schedule in a markdown table (existing blocks replaced by new times).
Call `request_schedule_approval` once.

---

## Step 4 — Commit if approved

Call `build-event-by-block-planner` in **mode B** with:
- `approval_status = "approved"` + `approval_id`
- `courseTitle`, `course_id`, `replace_mode` from `reschedule.planner_input`
- `approval_status="approved"`
- `approval_id` from `request_schedule_approval`
- `courseTitle` from course plan state
- `sessions` from the approved proposal

If commit succeeds, call `save_course_schedule_plan_to_state` with:
- `course_id` from state
- `sessions` from the planner result
- `batch` from `build_lessons_block_plan` result
- `next_offset`, `total_lessons` from `build_lessons_block_plan` result
- `timezone` from state
- `replace_existing = true`

Preferred commit payload:
```json
{
  "approval_id": "<approval-id>",
  "approval_status": "approved",
  "courseTitle": "<course title>",
  "course_id": "<course-id>",
  "sessions": [
    {
      "title": "<course title> - Study Session 1",
      "description": "Lessons: ...",
      "time_start": "2026-05-25T19:00:00+07:00",
      "time_end": "2026-05-25T21:00:00+07:00"
    }
  ]
}
```

Then call `clear_course_schedule_reschedule_request` to clean up the pending request.

## Step 4 — If rejected

Call `clear_course_schedule_reschedule_request` and do not mutate.
Ask the user how they would like to adjust.

---

## Hard rules
- ⛔ NEVER call `save_course_schedule_plan_to_state` before `build-event-by-block-planner` succeeds.
- ⛔ NEVER call `modify-this-only` or `modify-this-and-following` for course sessions.
- ⛔ NEVER mutate without a resolved approval.
- ✅ Always omit `duration_seconds` from `build_lessons_block_plan` — let it fall back to the saved value.
- ✅ Always clear the reschedule request after a successful commit OR a rejection.
- ✅ Pass `approval_id` + `approval_status="approved"` to `build-event-by-block-planner`.
