---
name: modify-series
description: >
  Changes all future occurrences of a recurring event from a specific date
  onward. Triggers when the user wants to update time, title, location, or
  recurrence rule for "this and all future" sessions.
---

# Modify Series Skill

## Trigger phrases
"change all future sessions", "from next week reschedule every Monday",
"update this and all following events", "shift the series starting [date]",
"change my recurring [event] going forward"

## Mandatory tool sequence

### Step 1 — Fetch the event
Call `get-events-by-name-or-id` with the event name or ID.
- Confirm with the user: which date should the change start from?
- If the event is linked to a course (`course_id`, `courseId`, course metadata,
  or clearly a course study session), **stop this skill immediately** and route to
  the `reschedule-course-detect` skill.

### Step 2 — Check for conflicts
Call `get-events` for the new proposed time range to detect overlaps.
- Present any conflicts clearly with resolution options.

### Step 3 — Propose and get approval
Summarize clearly:
> "Changing **[Event]** from **[Start Date]** onward: [what changes].
> Occurrences before [Start Date] are unaffected."

Call `request_schedule_approval` once.

### Step 4 — Commit if approved
Call `modify-this-and-following` with:
- `eventId`: the recurring event's ID
- `recurrence_id`: ISO datetime of the **first** occurrence to change
- Updated fields (`time_start`, `time_end`, `title`, `rrule_string`, etc.)
- `approval_id` + `approval_status="approved"`

## Hard rules
- ⛔ NEVER use `update-event` for this — it rewrites the entire series including past occurrences.
- ⛔ NEVER call `modify-this-and-following` for a course-linked study session.
- ⛔ NEVER mutate without a resolved approval.
- ✅ `recurrence_id` must be the ISO datetime of the first occurrence to change, not just a date string.
- ✅ Always make clear to the user that past occurrences will NOT be affected.
