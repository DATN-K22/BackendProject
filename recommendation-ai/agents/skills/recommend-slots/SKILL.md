---
name: recommend-slots
description: >
  Recommends available time slots for scheduling based on user preferences
  and calendar availability. Triggers when the user asks for scheduling
  suggestions, availability, free time, or "when can I study".
---

# Recommend Slots Skill

## Trigger phrases
"when can I study", "find me a time", "recommend a slot", "what time works",
"what's my availability", "suggest a schedule", "when am I free"

## Mandatory tool sequence — do not skip or reorder any step

### Step 1 — Detect preferences from past events
Call `get-events` with `end_date = today`, covering the **past 90 days** so you MUST pass `today` date as `today - 90 days`.

- If events exist: analyze them to extract a preference pattern:
  - Most frequent days → `preferred_days`
  - Most frequent start times → `preferred_times`
  - Average duration → `preferred_duration`
  - Present the detected pattern to the user and ask them to confirm or override before proceeding.
- If no events found: inform the user no history was found, then ask directly:
  which days, what time range, and how long per session.
- Do not proceed to step 2 until preferences are confirmed.

### Step 2 — Fetch availability
Call `get-free-time` with a **30-day window** from today. The result of this tool is always a list of available slots, not the user's booked events, so do not rely on memory or previous tools for this information.

- Pass `timeStart` and `timeEnd` derived from confirmed preferences.
- Call this **exactly once** per scheduling flow.

### Step 3 — Rank and present slots
From the raw slots returned by `get-free-time`, select the best matches:

- Prefer days that match `preferred_days`.
- Prefer slots where the available duration ≥ effective preferred duration (base preferred duration × `user:performance_multiplier` when available; otherwise base preferred duration).
- Prefer start times closest to `preferred_times`.
- If the user expects multiple days (for example Monday + Wednesday), ensure the final options include those distinct days whenever free slots exist for them.
- If one or more preferred days cannot be included, explicitly notify which days are missing and why (no matching free slot, duration too short, or time window mismatch). Do not silently return single-day options.
- Present the **top 3 matched slots** in a markdown table and ask the user to confirm one.

## Hard rules
- ⛔ NEVER ask the user for preferred times before completing step 1.
- ⛔ NEVER call `get-free-time` more than once per flow.
- ⛔ NEVER apply the detected pattern without explicit user confirmation.
- ⛔ NEVER proceed to step 2 if the user has not confirmed their preferences yet.

