---
name: modify-occurrence
description: >
  Edits a single occurrence of a recurring event (time, title, location, or day)
  without affecting any past or future occurrences. Triggers when the user wants
  to change "just this one" instance of a repeating event.
---

# Modify Occurrence Skill

## Trigger phrases
"move just this Monday's session", "change only next Tuesday's event",
"reschedule this one occurrence", "edit just this week's gym session"

## Mandatory tool sequence

### Step 1 — Fetch the event
Call `get-events-by-name-or-id` with the event name or ID the user specified.
- Confirm with the user which specific occurrence (date) they want to change.
- If the event is linked to a course (`course_id`, `courseId`, course metadata,
  or clearly a course study session), **stop this skill immediately** and route to
  the `reschedule-course-detect` skill.

### Step 2 — Check for conflicts
Call `get-events` for the proposed new time range to detect overlaps.
- If a conflict exists, present options clearly:
  > "Found conflict: 'X' overlaps with proposed time. Options: 1) Adjust to [alt], 2) Keep original?"

### Step 3 — Propose and get approval
Summarize the exact change:
> "Changing **[Event]** on **[Original Date/Time]** → **[New Date/Time]** (this occurrence only)."

Call `request_schedule_approval` once.

### Step 4 — Commit if approved
Call `modify-this-only` with:
- `eventId`: parent event ID
- `recurrence_id`: ISO datetime of the specific occurrence to change
- Updated fields (`time_start`, `time_end`, `title`, `location`, etc.)
- `approval_id` + `approval_status="approved"`

## Hard rules
- ⛔ NEVER call `delete-event` to remove the old occurrence — `modify-this-only` handles suppression automatically.
- ⛔ NEVER use `add-exception-date` + `create-event` to move a single occurrence — use `modify-this-only` instead.
- ⛔ NEVER call `modify-this-only` for a course-linked study session.
- ⛔ NEVER mutate without a resolved approval.
- ✅ Always confirm which occurrence (by date) before calling the approval.
