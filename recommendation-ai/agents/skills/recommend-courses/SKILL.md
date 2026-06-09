---
name: recommend-courses
description: >
  Recommends personalized AWS courses based on the student's goals, background,
  and enrollment history. Triggers when the user asks for course suggestions,
  learning paths, alternatives, or "what should I learn next".
---

# Recommend Courses Skill

## Trigger phrases
"what course should I take", "recommend me a course", "what should I learn next",
"suggest a learning path", "find me an AWS course", "alternatives to X course"

## Platform constraint
This platform offers **AWS courses only**. If the user asks for non-AWS topics
(Azure, GCP, general programming, etc.), politely clarify the limitation and
bridge their request to the closest AWS equivalent.

---

## Step 1 — Assess context

Check the current `course_id` from state:

- If `course_id` is **specific** (e.g. `"12345"`): the user is viewing that course page.
  Ask whether they want recommendations related to that course before searching.
- If `course_id` is **"general"**: user is not on a specific course page, proceed normally.

---

## Step 2 — Determine search intent

**If the user's request is clear** (they named a topic, level, or goal):
- Search immediately using `find-course-by-fulltextsearch` with:
  - `query`: maximum **3 technical keywords** (e.g. "DevOps", "CloudFormation")
  - NEVER put difficulty, price, or ratings in `query` — use `courseLevel`, `maxPrice`, `minRating` params instead
  - `limit`: maximum **4 results**
- Then call `fetch-enrolled-courses` with the returned course IDs to filter out already-enrolled courses.
- Remove enrolled courses from recommendations.

**If the user's request is unclear**:
- Call `fetch-enrolled-courses` first to assess their current level and history.
- Ask the user to clarify goals based on what you find.
- Then search as above once intent is clear.

---

## Step 3 — Present recommendations

- Rank results by relevance to the user's history and stated goals.
- For each course show: title, difficulty level, estimated time commitment (from `short_description`).
- If time commitment is not clear from `short_description`, offer to fetch the full syllabus.
- Explain prerequisites and suggest a logical learning path.

## Hard rules
- ⛔ NEVER recommend courses the user is already enrolled in.
- ⛔ NEVER call `fetch-course-syllabus` for multiple courses at once (N+1 prevention).
  Only fetch syllabus if the user explicitly asks for deep-dive curriculum of a specific course.
- ⛔ NEVER put difficulty/price/rating keywords inside the `query` string.
- ⛔ NEVER recommend non-AWS courses.
- ✅ If you identify better search keywords than the user's, suggest them and let the user decide.