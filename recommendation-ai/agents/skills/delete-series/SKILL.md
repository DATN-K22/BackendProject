---
name: delete-series
description: >
  Permanently deletes an entire recurring event series. Triggers only when
  the user explicitly wants to remove all past and future occurrences of a
  recurring event, not just skip or modify one instance.
---

# Delete Series Skill

## Trigger phrases
"delete this recurring event", "remove all my [event] sessions",
"cancel the entire series", "stop this recurring event permanently",
"get rid of all [event] occurrences"

## Disambiguation — always confirm intent first
Before doing anything, confirm the user wants to delete the **entire series**:
> "Just to confirm — you want to permanently delete **all** occurrences of **[Event]**,
> including past and future? This cannot be undone."

If the user only wants to skip one date → redirect to the **skip-occurrence** skill.
If the user only wants to change future dates → redirect to the **modify-series** skill.

## Mandatory tool sequence

### Step 1 — Fetch the event
Call `get-events-by-name-or-id` with the event name or ID.
- Confirm the event title and series details with the user.
- If the event is linked to a course (`course_id`, `courseId`, course metadata,
  or clearly a course study session), **stop this skill immediately** and route to
  the `reschedule-course-detect` skill.

### Step 2 — Propose and get approval
Summarize clearly:
> "Permanently deleting the entire **[Event]** series ([N] total occurrences). This cannot be undone."

Call `request_schedule_approval` once.

### Step 3 — Commit if approved
Call `delete-event` with:
- `eventId`: the event's ID
- `approval_id` + `approval_status="approved"`

## Hard rules
- ⛔ NEVER call `delete-event` when the user only wants to skip or move one occurrence.
- ⛔ NEVER skip the disambiguation step — deleting a series is irreversible.
- ⛔ NEVER mutate without a resolved approval.