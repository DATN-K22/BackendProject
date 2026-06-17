---
name: course-progress-feedback
description: >
  AI-powered course progress review. Fetches the course syllabus and the student's
  completed lessons, generates personalized feedback based on their newest completed
  lesson, and optionally helps them adjust their study schedule based on that feedback.
  Triggers when the user asks about their progress, wants feedback on what they've
  learned, or asks "how am I doing".
---

# Course Progress Feedback Skill

## Trigger phrases
"how am I doing", "give me feedback on my progress", "review my progress",
"what have I learned so far", "am I on track", "I just finished a lesson",
"adjust my schedule based on my progress"

---

## Phase 1 — Load progress data

### Step 1 — Fetch syllabus with progress
Call `fetch-course-syllabus` with:
- `course_id`: from current state
- `includeStudyPlan: true`
- `includeProgress: true`

### Step 2 — Save to state (after-tool callback)
`fetch-course-syllabus` automatically triggers `save_course_estimated_commitment_to_state`
as an after-tool callback. No manual save call is needed.
This keeps state fresh for `schedule_agent` in case rescheduling is needed later.

### Step 2.5 — Analyze against the active schedule plan
Call `analyze_course_schedule_progress` with the current `course_id`.

- This compares freshly fetched `actual_completed_lessons` against the active
  `schedule_plan.expected_progress` saved by `schedule_agent`.
- If it returns `progress_status="no_active_schedule_plan"`, fall back to pace
  metrics from `save_course_estimated_commitment_to_state`.

---

## Phase 2 — Generate feedback

### Step 3 — Identify newest completed lesson
From the refreshed progress data, identify the latest completed lesson by course order.
Do not rely on completion timestamps because the course service may not provide them.

### Step 4 — Produce AI feedback
Generate a concise, encouraging feedback message covering:

- **What they just completed:** Brief summary of the lesson topic.
- **Key concept reinforcement:** 1–2 most important takeaways from that lesson.
- **Connection to next lesson:** How the completed lesson connects to what comes next.
- **Pace assessment:** Are they ahead, on track, or behind their original schedule?
  - Prefer the result from `analyze_course_schedule_progress`:
    - `behind`: actual completed lessons are lower than expected by the current schedule.
    - `on_track`: actual completed lessons match the current schedule.
    - `ahead`: actual completed lessons exceed the current schedule.
    - `no_active_schedule_plan`: there is no saved schedule baseline; use pace metrics only.
  - If schedule analysis says `behind`, do NOT say the student is ahead or on track
    even when `performance_multiplier` is low.
  - If there is no active schedule plan, compute fallback pace from state values:
    - `user:performance_multiplier` (actual/estimated pace ratio)
    - `user:gap_hours` (average per-lesson gap in hours, signed)
    - Ahead: multiplier < 0.9 (or gap_hours <= -0.2)
    - On track: 0.9 <= multiplier <= 1.1 (or |gap_hours| < 0.2)
    - Behind: multiplier > 1.1 (or gap_hours >= 0.2)
- **Encouragement:** A short motivating closing line.

Include one short metric line in the feedback:
- Schedule baseline example: "By now, your schedule expected 6 completed lessons; you have completed 4, so you are 2 lessons behind the current plan."
- Fallback pace example: "No active study schedule is saved yet, so this estimate is based on time spent: about x1.18 of the original estimate."

Present the feedback in a readable format, not a wall of text.

---

## Phase 3 — Offer schedule adjustment

### Step 5 — Ask if they want to adjust
After presenting feedback:

- If schedule analysis is **Behind**: recommend a schedule review or catch-up adjustment.
  - Ask:
    > "You are a bit behind the current study schedule. Would you like me to review the remaining sessions and make the plan more realistic?"
- If fallback pace is **Behind** and no active schedule plan exists: recommend only a slowdown adjustment.
- If status is **Ahead** or **On track**: do not recommend any schedule adjustment.
  - Close with encouragement only.

### Step 6 — Hand off to schedule_agent (if user wants adjustment)
If the user accepts the schedule review or slowdown adjustment:
- Summarize their preference clearly.
- Mention that `schedule_agent` will use pace-adjusted lesson durations (`adjusted_duration`) when rebuilding blocks.
- Transfer control to `schedule_agent` to handle the actual calendar mutations.
- Do NOT attempt any calendar mutations yourself.

If the user declines:
- Acknowledge and close the flow.

---

## Hard rules
- ⛔ NEVER skip step 2 — state must be saved before any handoff to schedule_agent.
- ⛔ NEVER bypass `fetch-course-syllabus` before handoff — state refresh depends on its callback.
- ⛔ NEVER evaluate schedule progress from stale state only — actual completed lessons must come from the latest `fetch-course-syllabus` result.
- ⛔ NEVER make calendar mutations — this skill is feedback + handoff only.
- ⛔ NEVER generate negative or discouraging feedback — always frame constructively.
- ✅ Always base feedback on actual progress data, not assumptions.
- ✅ Prefer schedule-based progress analysis over raw time-spent pace metrics.
- ✅ Recommend schedule adjustment only when schedule analysis or fallback pace is **Behind**.
- ✅ If no comparable completed lessons exist yet, explicitly say pace is using default estimate (multiplier 1.0).
