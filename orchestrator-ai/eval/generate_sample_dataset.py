#!/usr/bin/env python3
"""Generate comprehensive Vertex-ready eval tasks for the full A2A system.

Scope covered:
- Orchestrator routing rules
- Recommendation root routing rules
- Course agent policies (AWS-only, clarify-when-unclear, tool usage)
- Schedule agent policies (read/modify tool selection + HITL)
- RAG root and RAG agent policies

Output:
- Vertex flattened JSONL rows (`prompt`, `reference`, `response`, etc.)
- Optional raw task JSONL with richer metadata for custom harness checks
"""

from __future__ import annotations

import argparse
import json
import random
from pathlib import Path
from typing import Any, Iterable

COURSE_GOALS = [
    "backend development",
    "data engineering",
    "machine learning",
    "cloud architecture",
    "frontend development",
]
AWS_TOPICS = [
    "AWS Lambda",
    "Amazon ECS",
    "AWS CloudFormation",
    "Amazon S3",
    "AWS IAM",
]
NON_AWS_TOPICS = ["Google BigQuery", "Azure DevOps", "Kubernetes on-prem"]
LEVELS = ["beginner", "intermediate", "advanced"]

RAG_TOPICS = [
    "CloudFormation StackSets",
    "CloudFormation template sections",
    "troubleshooting failed stack deployment",
    "CloudFormation quotas",
    "CloudFormation registry extensions",
]

DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"]
TIME_WINDOWS = [("09:00", "11:00"), ("13:00", "15:00"), ("19:00", "21:00")]
APPROVAL_WORDS = ["approved", "approve", "yes", "confirm", "ok", "sure"]
REJECTION_WORDS = ["no", "reject", "cancel", "denied"]


def _mk_id(kind: str, idx: int) -> str:
    return f"{kind}-{idx:04d}"


def _format_turn(turn: dict[str, str]) -> str:
    role = turn["role"].strip().lower()
    text = turn["text"].strip()
    return f"{'User' if role == 'user' else 'Assistant'}: {text}"


def _split_history_and_prompt(conversation: list[dict[str, str]]) -> tuple[list[str], str]:
    """Map a conversation into Vertex multi-turn chat columns.

    - history: all turns before the current turn
    - prompt: current turn (last user utterance)
    """
    if not conversation:
        return [], ""

    if len(conversation) == 1:
        return [], conversation[0]["text"].strip()

    history = [_format_turn(turn) for turn in conversation[:-1]]
    prompt = conversation[-1]["text"].strip()
    return history, prompt


def _to_vertex_row(case: dict[str, Any]) -> dict[str, Any]:
    history, prompt = _split_history_and_prompt(case["conversation"])
    return {
        # Vertex multi-turn or chat schema
        "history": history,
        "prompt": prompt,
        "reference": case["reference"],
        "response": "",
        "intermediate_events": [],
        "rubric_criteria": case["rubric_criteria"],
        # Custom fields for A2A harness assertions
        "id": case["id"],
        "category": case["category"],
        "target_agent": case["target_agent"],
        "requires_tooling": case["requires_tooling"],
        "requires_human_approval": case["requires_human_approval"],
        "rule_source": case["rule_source"],
        "assertions": case["assertions"],
    }


def _base_case(
    *,
    id_: str,
    category: str,
    conversation: list[dict[str, str]],
    reference: str,
    rubric_criteria: str,
    target_agent: str,
    rule_source: str,
    requires_tooling: list[str] | None = None,
    requires_human_approval: bool = False,
    assertions: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": id_,
        "category": category,
        "conversation": conversation,
        "reference": reference,
        "rubric_criteria": rubric_criteria,
        "target_agent": target_agent,
        "rule_source": rule_source,
        "requires_tooling": requires_tooling or [],
        "requires_human_approval": requires_human_approval,
        "assertions": assertions or {},
    }


def _course_recommendation_case(idx: int, rng: random.Random) -> dict[str, Any]:
    level = rng.choice(LEVELS)
    goal = rng.choice(COURSE_GOALS)
    return _base_case(
        id_=_mk_id("course-recommend", idx),
        category="course_recommendation",
        conversation=[
            {
                "role": "user",
                "text": (
                    f"I'm a {level} learner. Recommend 3 AWS courses for {goal}, "
                    "with prerequisites and weekly commitment."
                ),
            }
        ],
        reference=(
            "Provide ranked AWS course recommendations with prerequisites, "
            "difficulty, and time commitment."
        ),
        rubric_criteria="Course relevance, AWS-only compliance, clear actionable details.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/course_agent: core recommendation policy",
        requires_tooling=["search_courses", "recommend_courses"],
        assertions={"must_mention_any": ["AWS", "prerequisite", "time"]},
    )


def _course_unclear_goal_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("course-clarify", idx),
        category="course_clarification",
        conversation=[{"role": "user", "text": "Recommend something for me."}],
        reference=(
            "Ask clarifying questions about goals, level, and availability before final recommendation."
        ),
        rubric_criteria="Must clarify ambiguous goals before giving concrete recommendations.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/course_agent: ask clarifying questions",
        requires_tooling=["search_courses"],
        assertions={"must_mention_any": ["goal", "level", "time"]},
    )


def _course_non_aws_request_case(idx: int, rng: random.Random) -> dict[str, Any]:
    topic = rng.choice(NON_AWS_TOPICS)
    return _base_case(
        id_=_mk_id("course-non-aws", idx),
        category="course_non_aws_redirect",
        conversation=[
            {
                "role": "user",
                "text": f"Recommend a deep course path for {topic}.",
            }
        ],
        reference=(
            "Do not recommend non-AWS courses; provide closest AWS-oriented alternatives."
        ),
        rubric_criteria="Strict non-AWS rejection/redirect to AWS-relevant learning path.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/course_agent: AWS-only policy",
        requires_tooling=["search_courses", "recommend_courses"],
        assertions={
            "must_mention_any": ["AWS"],
            "must_not_mention_any": [topic],
        },
    )


def _schedule_view_case(idx: int, rng: random.Random) -> dict[str, Any]:
    day = rng.choice(DAYS)
    return _base_case(
        id_=_mk_id("schedule-view", idx),
        category="schedule_read",
        conversation=[{"role": "user", "text": f"What is on my schedule this {day}?"}],
        reference="Retrieve schedule and present relevant events clearly.",
        rubric_criteria="Must read schedule using tools, not fabricate events.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/schedule_agent: get-events usage",
        requires_tooling=["get-events"],
        assertions={"must_mention_any": ["schedule"]},
    )


def _schedule_event_lookup_by_name_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("schedule-find-name", idx),
        category="schedule_lookup_by_name",
        conversation=[{"role": "user", "text": "Find my event called 'Monday study session'."}],
        reference="Use name-based event lookup and return matching event details.",
        rubric_criteria="Prefer get-events-by-name-or-id when event name is given.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/schedule_agent: lookup by name rule",
        requires_tooling=["get-events-by-name-or-id"],
    )


def _schedule_free_time_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("schedule-free-time", idx),
        category="schedule_free_time",
        conversation=[{"role": "user", "text": "Find free time this week between 08:00 and 20:00."}],
        reference="Call free-time tool and return available slots.",
        rubric_criteria="Use get-free-time only when user explicitly asks for availability.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/schedule_agent: free-time rule",
        requires_tooling=["get-free-time"],
    )


def _schedule_modify_create_approved_case(idx: int, rng: random.Random) -> dict[str, Any]:
    day = rng.choice(DAYS)
    start, end = rng.choice(TIME_WINDOWS)
    return _base_case(
        id_=_mk_id("schedule-create-approved", idx),
        category="schedule_modify_create_approved",
        conversation=[
            {
                "role": "user",
                "text": f"Add a weekly AWS study session every {day} from {start} to {end}.",
            },
            {"role": "user", "text": rng.choice(APPROVAL_WORDS)},
        ],
        reference=(
            "Summarize exact change and request approval; after approval create event and confirm."
        ),
        rubric_criteria="No mutation before approval; create-event only after approval resolved.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/schedule_agent: HITL create-event flow",
        requires_tooling=["request_schedule_approval", "resolve_schedule_approval", "create-event"],
        requires_human_approval=True,
    )


def _schedule_modify_rejected_case(idx: int, rng: random.Random) -> dict[str, Any]:
    day = rng.choice(DAYS)
    start, end = rng.choice(TIME_WINDOWS)
    return _base_case(
        id_=_mk_id("schedule-rejected", idx),
        category="schedule_modify_rejected",
        conversation=[
            {
                "role": "user",
                "text": f"Move my recurring AWS session on {day} to {start}-{end}.",
            },
            {"role": "user", "text": rng.choice(REJECTION_WORDS)},
        ],
        reference=(
            "After rejection, do not mutate schedule; acknowledge rejection and ask adjustment preference."
        ),
        rubric_criteria="Strict rejection handling; forbid mutation tools after rejected decision.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/schedule_agent: HITL reject flow",
        requires_tooling=["request_schedule_approval", "resolve_schedule_approval"],
        requires_human_approval=True,
        assertions={"must_not_mention_any": ["created", "updated successfully"]},
    )


def _schedule_modify_this_only_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("schedule-mod-this-only", idx),
        category="schedule_modify_this_only",
        conversation=[
            {
                "role": "user",
                "text": "Move only next Tuesday occurrence of my recurring AWS class from 09:00 to 13:00.",
            },
            {"role": "user", "text": "approved"},
        ],
        reference="Use modify-this-only for one occurrence after approval.",
        rubric_criteria="Correct tool choice: modify-this-only, not delete/create workaround.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/schedule_agent: modify ONE occurrence",
        requires_tooling=["request_schedule_approval", "resolve_schedule_approval", "modify-this-only"],
        requires_human_approval=True,
    )


def _schedule_modify_following_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("schedule-mod-following", idx),
        category="schedule_modify_this_and_following",
        conversation=[
            {"role": "user", "text": "From next month onward, move my recurring session to Fridays at 19:00."},
            {"role": "user", "text": "confirm"},
        ],
        reference="Use modify-this-and-following after approval with recurrence_id split behavior.",
        rubric_criteria="Correct tool choice for future-only changes.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/schedule_agent: modify future occurrences",
        requires_tooling=[
            "request_schedule_approval",
            "resolve_schedule_approval",
            "modify-this-and-following",
        ],
        requires_human_approval=True,
    )


def _schedule_skip_one_occurrence_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("schedule-skip-one", idx),
        category="schedule_skip_one_occurrence",
        conversation=[
            {"role": "user", "text": "Skip my class only on 2026-05-12, keep all other sessions."},
            {"role": "user", "text": "yes"},
        ],
        reference="Use add-exception-date only after approval; do not delete full series.",
        rubric_criteria="Correct tool choice: add-exception-date, avoid delete-event.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/schedule_agent: skip one occurrence",
        requires_tooling=[
            "request_schedule_approval",
            "resolve_schedule_approval",
            "add-exception-date",
        ],
        requires_human_approval=True,
    )


def _schedule_delete_series_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("schedule-delete-series", idx),
        category="schedule_delete_series",
        conversation=[
            {"role": "user", "text": "Delete this recurring AWS study event entirely."},
            {"role": "user", "text": "approved"},
        ],
        reference="Delete full recurring series after approval using delete-event.",
        rubric_criteria="Use delete-event only for entire series deletion.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/schedule_agent: permanent delete rule",
        requires_tooling=["request_schedule_approval", "resolve_schedule_approval", "delete-event"],
        requires_human_approval=True,
    )


def _schedule_no_events_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("schedule-empty-calendar", idx),
        category="schedule_empty_state",
        conversation=[{"role": "user", "text": "Help me plan my study schedule from scratch."}],
        reference=(
            "If no existing events, ask which days and daily time range the user wants to study."
        ),
        rubric_criteria="Prompt-guided empty-calendar discovery questions.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/schedule_agent: no-event onboarding",
        requires_tooling=["get-events"],
    )


def _orchestrator_approval_reply_case(idx: int, rng: random.Random) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("orchestrator-approval-reply", idx),
        category="orchestrator_approval_word_routing",
        conversation=[{"role": "user", "text": rng.choice(APPROVAL_WORDS + REJECTION_WORDS)}],
        reference=(
            "When previous turn was schedule flow, delegate short approval/rejection reply to course_schedule_agent."
        ),
        rubric_criteria="Must route approval-word continuation correctly.",
        target_agent="course_schedule_agent",
        rule_source="orchestrator/root_agent: approval-word routing",
    )


def _orchestrator_rag_routing_case(idx: int, rng: random.Random) -> dict[str, Any]:
    topic = rng.choice(RAG_TOPICS)
    return _base_case(
        id_=_mk_id("orchestrator-rag-route", idx),
        category="orchestrator_to_rag",
        conversation=[
            {"role": "user", "text": f"From the course knowledge base, explain {topic} with examples."}
        ],
        reference="Route to rag_agent and provide retrieval-grounded answer.",
        rubric_criteria="Correct routing for knowledge-base content queries.",
        target_agent="rag_agent",
        rule_source="orchestrator/root_agent: KB query routing",
        requires_tooling=["retrieve_context"],
    )


def _orchestrator_greeting_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("orchestrator-greeting", idx),
        category="greeting_or_meta",
        conversation=[{"role": "user", "text": "Hi, what can you help me with?"}],
        reference="Answer directly with capabilities summary; no unnecessary delegation.",
        rubric_criteria="Direct concise capability response.",
        target_agent="orchestrator_direct",
        rule_source="recommendation/root_agent + rag/root_agent greeting/meta handling",
    )


def _compound_course_schedule_case(idx: int, rng: random.Random) -> dict[str, Any]:
    topic = rng.choice(AWS_TOPICS)
    day = rng.choice(DAYS)
    start, end = rng.choice(TIME_WINDOWS)
    return _base_case(
        id_=_mk_id("compound", idx),
        category="compound_course_then_schedule",
        conversation=[
            {
                "role": "user",
                "text": (
                    f"Recommend one {topic} course and add a weekly study block on {day} {start}-{end}."
                ),
            },
            {"role": "user", "text": "yes, confirm"},
        ],
        reference=(
            "First recommendation step, then schedule approval and event creation."
        ),
        rubric_criteria="Correct sequential delegation and HITL compliance.",
        target_agent="course_schedule_agent",
        rule_source="recommendation/root_agent: compound request routing",
        requires_tooling=[
            "recommend_courses",
            "request_schedule_approval",
            "resolve_schedule_approval",
            "create-event",
        ],
        requires_human_approval=True,
    )


def _rag_ambiguous_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("rag-ambiguous", idx),
        category="rag_ambiguous_query",
        conversation=[{"role": "user", "text": "Can you explain that section?"}],
        reference="Ask clarification before answering due to ambiguity.",
        rubric_criteria="Ambiguous RAG query should trigger clarification request.",
        target_agent="rag_agent",
        rule_source="rag/rag_agent: ask clarification on ambiguous query",
        requires_tooling=["retrieve_context"],
    )


def _rag_no_context_case(idx: int) -> dict[str, Any]:
    return _base_case(
        id_=_mk_id("rag-no-context", idx),
        category="rag_no_relevant_context",
        conversation=[
            {
                "role": "user",
                "text": "From knowledge base, explain Terraform Sentinel policies for Azure Arc.",
            }
        ],
        reference="If retrieval has no relevant context, explicitly state no relevant context and stop.",
        rubric_criteria="No-context strictness: do not add unsupported extra information.",
        target_agent="rag_agent",
        rule_source="rag/rag_agent: no relevant context behavior",
        requires_tooling=["retrieve_context"],
    )


def _task_templates() -> list:
    return [
        _course_recommendation_case,
        _course_unclear_goal_case,
        _course_non_aws_request_case,
        _schedule_view_case,
        _schedule_event_lookup_by_name_case,
        _schedule_free_time_case,
        _schedule_no_events_case,
        _schedule_modify_create_approved_case,
        _schedule_modify_rejected_case,
        _schedule_modify_this_only_case,
        _schedule_modify_following_case,
        _schedule_skip_one_occurrence_case,
        _schedule_delete_series_case,
        _orchestrator_approval_reply_case,
        _orchestrator_rag_routing_case,
        _orchestrator_greeting_case,
        _compound_course_schedule_case,
        _rag_ambiguous_case,
        _rag_no_context_case,
    ]


def generate_cases(total: int, seed: int) -> list[dict[str, Any]]:
    rng = random.Random(seed)
    templates = _task_templates()
    cases: list[dict[str, Any]] = []

    # Ensure at least one sample for each explicit prompt rule template.
    idx = 1
    for template in templates:
        if idx > total:
            break
        cases.append(_call_template(template, idx, rng))
        idx += 1

    # Fill remainder by cycling templates.
    while idx <= total:
        template = templates[(idx - 1) % len(templates)]
        cases.append(_call_template(template, idx, rng))
        idx += 1

    rng.shuffle(cases)
    return cases


def _call_template(template, idx: int, rng: random.Random) -> dict[str, Any]:
    # Support templates with signature (idx) and (idx, rng)
    try:
        return template(idx, rng)
    except TypeError:
        return template(idx)


def summarize_case_coverage(cases: Iterable[dict[str, Any]]) -> dict[str, Any]:
    categories: dict[str, int] = {}
    rules: dict[str, int] = {}
    for case in cases:
        categories[case["category"]] = categories.get(case["category"], 0) + 1
        rules[case["rule_source"]] = rules.get(case["rule_source"], 0) + 1
    return {
        "total_cases": sum(categories.values()),
        "categories": categories,
        "rules": rules,
    }


def main() -> None:
    parser = argparse.ArgumentParser(
        description="Generate comprehensive Vertex-compatible eval tasks for full A2A system."
    )
    parser.add_argument("--count", type=int, default=120, help="Total tasks to generate.")
    parser.add_argument("--seed", type=int, default=42, help="Random seed for deterministic generation.")
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("orchestrator-ai/eval/data/vertex_eval_dataset.jsonl"),
        help="Output path for Vertex flattened JSONL rows.",
    )
    parser.add_argument(
        "--include-raw-cases",
        action="store_true",
        help="Also write raw A2A task file (for custom assertions).",
    )
    parser.add_argument(
        "--write-coverage-summary",
        action="store_true",
        help="Also write JSON summary grouped by category and rule source.",
    )
    args = parser.parse_args()

    args.output.parent.mkdir(parents=True, exist_ok=True)
    raw_cases = generate_cases(total=args.count, seed=args.seed)
    vertex_rows = [_to_vertex_row(case) for case in raw_cases]

    with args.output.open("w", encoding="utf-8") as f:
        for row in vertex_rows:
            f.write(json.dumps(row, ensure_ascii=True) + "\n")

    print(f"Wrote {len(vertex_rows)} Vertex eval rows to {args.output}")

    if args.include_raw_cases:
        raw_path = args.output.with_name("a2a_eval_cases_raw.jsonl")
        with raw_path.open("w", encoding="utf-8") as f:
            for row in raw_cases:
                f.write(json.dumps(row, ensure_ascii=True) + "\n")
        print(f"Wrote {len(raw_cases)} raw A2A cases to {raw_path}")

    if args.write_coverage_summary:
        coverage = summarize_case_coverage(raw_cases)
        coverage_path = args.output.with_name("a2a_eval_coverage_summary.json")
        coverage_path.write_text(json.dumps(coverage, ensure_ascii=True, indent=2), encoding="utf-8")
        print(f"Wrote coverage summary to {coverage_path}")


if __name__ == "__main__":
    main()
