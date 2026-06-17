---
name: reschedule-course-detect
description: >
  Detects when an edit, delete, or skip request targets a course-linked study
  session. The linked between course and schedule is known if any event from get-events has course metadata, course_id/courseId field, or a title that clearly identifies it as a course study session.
  Saves the reschedule intent to state and asks the user to confirm a
  full coordinated rebuild rather than mutating the event directly.
---

# Reschedule Course Detect Skill

## Trigger phrases
any edit/delete/skip request
where the target event turns out to be a course study session.

---

## Step 1 — Fetch and inspect the event

Call `get-events-by-name-or-id` with the event name or ID the user specified.

Treat an event as **course-linked** if the event payload contains any of:
- `course_id` or `courseId` field
- Course metadata fields
- A title that clearly identifies it as a course study session for the current course

If the event is **not** course-linked, **stop this skill immediately** and route to the
correct mutation skill based on what the user wants to do:

| User intent | Skill to use |
|---|---|
| Change just one occurrence ("only this Monday") | `modify-occurrence` |
| Change this and all future occurrences ("from next week onward") | `modify-series` |
| Skip / cancel a single occurrence | `skip-occurrence` |
| Delete the entire series | `delete-series` |

---

## Step 2 — Save the reschedule request

Call `save_course_schedule_reschedule_request` with:
- `target_event`: the full event payload from Step 1
- `requested_change`: a dict describing what the user wants (e.g. `{"action": "move", "new_time": "..."}`), the `status` will be set to `"awaiting_user_confirmation"` by default
- `course_id`: from the event or from state if known

Then branch on the returned `request.status`:

### `status = "awaiting_user_confirmation"`
Explain to the user:
> "This is a coordinated course study block. Changing it requires rebuilding
> the remaining schedule to keep lesson blocks and progress tracking correct.
> Do you want me to proceed with the full schedule rebuild?"

**STOP** — do not mutate anything. Wait for the user's next message.

### `status = "needs_course_agent"`
Explain to the user:
> "I need to load your course structure first before I can rebuild the schedule.
> Please open the <course title here (eliminate the whatever after the `-` character in the event title)> page or tell me which course this belongs to so I can
> load the syllabus."

**STOP** — do not mutate anything. Wait for the user's next message.

---

## Hard rules
- ⛔ NEVER call `modify-this-only`, `modify-this-and-following`, `add-exception-date`, or `delete-event` for a course-linked event in the same turn.
- ⛔ NEVER proceed to any calendar mutation in this skill — only capture the intent.
- ✅ Always call `get-events-by-name-or-id` first before deciding if the event is course-linked.
- ✅ Always stop and wait for user confirmation after saving the reschedule request.
