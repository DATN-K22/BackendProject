---
name: load-course-schedule-context
description: >
  Loads syllabus/progress for a course-linked schedule edit when schedule_agent
  cannot safely rebuild the course schedule because course structure is missing.
---

# Load Course Schedule Context Skill

## Trigger phrases
"load this course for schedule changes", "I opened the course", "use this course",
"continue rebuilding my course schedule", "load course context"

## When to use
Use this only when `course_schedule_reschedule_request.status` is
`needs_course_agent`, or when the user is clearly trying to provide/open the
course needed for a pending course schedule rebuild.

## Steps

1. Read the pending {course_schedule_reschedule_request?} from state.
2. Determine `course_id`:
   - Prefer the pending request's `course_id`.
   - Otherwise use current state `course_id` if it is specific and not `general`.
3. If no specific `course_id` is available:
   - Tell the student this schedule item belongs to a course, but the course structure is not loaded.
   - Ask them to open/select that course page or provide the course so the syllabus can be loaded.
   - Stop. Do not hand off to schedule_agent.
4. Call `fetch-course-syllabus` with:
   - `course_id`
   - `includeStudyPlan: true`
   - `includeProgress: true`
5. Rely on the after-tool callback to save the returned syllabus/progress to state.
6. Tell the student the course structure is loaded and ask them to confirm rebuilding the remaining course schedule.

## Hard rules
- Do not call schedule mutation tools.
- Do not ask for hours/day or preferred days in this skill.
- Do not mutate the calendar or rebuild the schedule here; schedule_agent handles that after user confirmation.
