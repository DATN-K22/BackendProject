---
name: course-schedule
description: >
  Handles end-to-end course scheduling across four phases: inspecting the
  course plan, gathering preferences, building a session block plan, and
  committing approved events to the calendar via a single reconcile tool.
  Also handles extending the schedule when the user completes sessions or asks for more.
---

# Course Schedule Skill

## Trigger phrases
"schedule this course", "set up my study plan", "add course to my calendar",
"schedule more lessons", "I finished a session", "book my course sessions"

---

## Phase 1 — Inspect course plan

1. Call `get_course_study_plan_from_state`.
2. If `status=empty`: respond with "Plan not ready. Please visit the course page first." and **STOP**.
3. If `status=ok`: read `course_title`, `total_lessons`, `total_estimated_hours`.
   Present a brief summary to the user before continuing.

---

## Phase 2 — Gather preferences


Follow the **recommend-slots** skill's preference learning flow (steps 1–2).
Skip this entire phase if preferences were already confirmed earlier in this conversation.

Note: If user ask to use the previously created schedule course, skip to Phase 3 directly, but still call `get-free-time` to confirm up-to-date availability and adjust the schedule if needed.

Then:
- Call `get-free-time` with a **30-day window**.
- Rank and filter the returned free slots directly using confirmed preferences (days, times, and preferred duration).
- Present the **top 3–5 matched slots** and ask the user to confirm.

---

## Phase 3 — Build and propose schedule

1. Call `build_lessons_block_plan` with:
   - `course_id` from state
   - `duration_seconds` = confirmed `hours_per_session × 3600`
   - `batch_size = 5`
   - `offset = 0`
   - Read `performance_multiplier` from the result.
   - If no comparable finished lessons are available, assume multiplier `1.0` and mention default pacing to the user.

   **Pacing:** `build_lessons_block_plan` pre-applies `performance_multiplier` to each
   lesson's duration. Always use `adjusted_duration` (not raw `duration`) when computing
   `time_end` for each session. Multiplier `> 1` means the user is slower than estimated;
   `< 1` means faster. When presenting the plan, note:
   `"Durations are pace-adjusted from your completed lesson history."` If no history exists,
   state that default estimates are being used.

2. Build a proposed `sessions` list (preferred commit payload):
   - Each session must contain:
     - `title`
     - `description`
     - `time_start`
     - `time_end`
   - Build `time_end` using the sum of lesson `adjusted_duration` values in each block.
   - Keep lesson `duration` only as original estimate reference when needed.
   - In `description`, include a short pace note such as `Pace-adjusted by x1.18 from your completed lessons.`
   - Keep times in user timezone offset format (e.g. `+07:00`).
   - Example:
```json
[
  {
    "title": "AWS CloudFormation Introduction - Study Session 1",
    "description": "Lessons: Course Introduction, What is CloudFormation? + Course Cost",
    "time_start": "2026-05-25T19:00:00+07:00",
    "time_end": "2026-05-25T21:00:00+07:00"
  },
  {
    "title": "AWS CloudFormation Introduction - Study Session 2",
    "description": "Lessons: Code Download, VSCode Setup",
    "time_start": "2026-06-01T19:00:00+07:00",
    "time_end": "2026-06-01T21:00:00+07:00"
  }
]
```

3. Present a schedule summary (first 5 sessions only) in a markdown table.
   Inform user: "I've planned your first 5 sessions. I'll suggest more as you progress."

4. Call `request_schedule_approval` once for the full proposed batch.


---

## Phase 4 — Commit

### If approved:
- Immediately call `build-event-by-block-planner` once with:
  - `approval_status="approved"`
  - `approval_id` from `request_schedule_approval`
  - `courseTitle` from course plan state
  - `sessions` from the approved proposal
  - `course_id` from state for server-side linking
- Important: Do NOT pass any `existentEvents`. The server now discovers old related events and replaces them automatically.
- If tool result has failures: report failed entries and ask user how to proceed.
- If tool succeeds:
  - Call `save_course_schedule_plan_to_state` with:
    - `course_id` from state
    - `sessions` from the approved proposal
    - `batch` from the `build_lessons_block_plan` result
    - `next_offset` from the `build_lessons_block_plan` result
    - `total_lessons` from the `build_lessons_block_plan` result
    - `timezone` from state
    - `duration_each_block` from `build_lessons_block_plan` result (for future reuse in rescheduling)
    - `replace_existing=true`
  - Then confirm created/deleted counts and continue.

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

### If rejected:
- Do not mutate anything.
- Ask how the user would like to adjust, then loop back to Phase 2.

---

## Extending the schedule

**Trigger:** User explicitly asks to schedule more, OR remaining scheduled sessions ≤ 2 after a session is completed.

1. Call `get_course_schedule_progress` to get `scheduled_offset`.
2. If `scheduled_offset >= total_lessons`: respond "You've scheduled all lessons! 🎉" and **STOP**.
3. Call `get-free-time` for slots after the last scheduled session's end date.
4. Call `build_lessons_block_plan` with `offset = scheduled_offset`, `batch_size = 5`.
5. Build a new `sessions` proposal for the next batch.
6. Present summary, call `request_schedule_approval`.
7. If approved: call `build-event-by-block-planner` once for the new batch.
8. If commit succeeds: call `save_course_schedule_plan_to_state` with `replace_existing=false`
   so expected progress is appended instead of replacing the active plan.

---

## Naming rules
- **Event title:** course title (from `course_title`)
- **Event description:** list of lesson titles in that session block

## Hard rules
- ⛔ NEVER call `get_course_study_plan_from_state` for anything other than course-plan integration.
- ⛔ NEVER commit events before `request_schedule_approval` returns approved.
- ⛔ NEVER skip Phase 1 — always verify the plan exists before proceeding.
- ✅ Always include `approval_id` + `approval_status="approved"` on `build-event-by-block-planner`.
- ⛔ NEVER call `create-event` directly for course batch scheduling when `build-event-by-block-planner` is available.
- ✅ Always call `save_course_schedule_plan_to_state` after a successful course schedule commit.
