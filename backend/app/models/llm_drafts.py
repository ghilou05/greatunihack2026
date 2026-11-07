"""LLM-facing draft schemas (constraint-free; bounds enforced in code)."""

from pydantic import BaseModel


class DraftSegment(BaseModel):
    goal: str
    page: int
    line_start: int
    line_end: int
    narration: str


class PlanDraft(BaseModel):
    title: str
    segments: list[DraftSegment]


class QADraft(BaseModel):
    answerable: bool
    answer: str
    cites: list[int]
    bridge: str
