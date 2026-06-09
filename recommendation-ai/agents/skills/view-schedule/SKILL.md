---
name: view-schedule
description: >
  Fetches and displays the user's current schedule, upcoming events, or
  details about a specific event. Read-only — no mutations. Triggers when
  the user wants to see what's on their calendar.
---

# View Schedule Skill

## Trigger phrases
"what's on my schedule", "show my events", "what do I have this week",
"show me [event name]", "when is my next [event]", "what's on [date]"

## Tool selection — pick exactly one

| User intent | Tool to call |
|---|---|
| View upcoming events or a date range | `get-events` |
| Look up a specific event by name | `get-events-by-name-or-id` with `eventName` |
| Look up a specific event by ID | `get-events-by-name-or-id` with `eventId` |

## Parameters

**`get-events`**
- `today`: current date (always pass this)
- `endDate`: set to the specific date if user asks about one day; default window is 90 days
- `timeZone`: from agent state

**`get-events-by-name-or-id`**
- Pass exactly one of `eventName` OR `eventId`, never both.
- Prefer this over `get-events` when the user names a specific event — faster and more precise.

## Output format
Present results in a markdown table:

| Event | Day | Time | Recurring |
|-------|-----|------|-----------|
| Study React | Mon | 9–11am | Weekly |
| Gym | Wed | 7–8pm | Weekly |

## Hard rules
- ⛔ NEVER call `get-free-time` for viewing the schedule — that returns available gaps, not booked events.
- ⛔ NEVER rely on memory for schedule facts — always call the tool first.
- ✅ This skill is read-only. No approvals, no mutations.