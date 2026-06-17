"""Agents package for recommendation-ai service."""

from agents.root_agent import create_root_agent
from agents.course_agent import create_course_agent
from agents.schedule_agent import create_schedule_agent

__all__ = [
    "create_root_agent",
    "create_course_agent",
    "create_schedule_agent",
]
