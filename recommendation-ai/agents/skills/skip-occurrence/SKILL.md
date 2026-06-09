---
name: skip-occurrence
description: >
  Skips a single occurrence of a recurring event with no replacement.
  Triggers when the user wants to cancel or skip just one instance of a
  repeating event, not delete the whole series.
---

# Skip Occurrence Skill

## Trigger phrases
"skip next Monday's session", "cancel just this week's gym", "I won't make it Tuesday",
"remove only this one occurrence", "don't show [event] on [date]"

## Mandatory tool sequence

### Step 1 — Fetch the event
Call `get-events-by-name-or-id` with the event name or ID.
- Confirm the exact occurrence date/time to skip.
- If the event is linked to a course (`course_id`, `courseId`, course metadata,
  or clearly a course study session), **stop this skill immediately** and route to
  the `reschedule-course-detect` skill.

### Step 2 — Propose and get approval
Summarize clearly:
> "Skipping **[Event]** on **[Date/Time]**. The rest of the series remains unchanged."

Call `request_schedule_approval` once.

### Step 3 — Commit if approved
Call `add-exception-date` with:
- `eventId`: the recurring event's ID
- `exception_date`: ISO datetime of the occurrence to skip
- `approval_id` + `approval_status="approved"`

## Hard rules
- ⛔ NEVER call `delete-event` when the user only wants to skip one date — that deletes the entire series.
- ⛔ NEVER call `modify-this-only` here — that's for edits, not skips.
- ⛔ NEVER call `add-exception-date` for a course-linked study session.
- ⛔ NEVER mutate without a resolved approval.
- ✅ Always confirm the exact date before calling approval.
