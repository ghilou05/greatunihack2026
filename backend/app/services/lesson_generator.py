"""P2: Build LessonPlan from DocumentIndex (LLM + validation).

Segments: ~15–30s narration, 2–4 sentences, cues=[] until timed highlights exist.
"""

import json

from app.models.schemas import LessonPlan
from app.services.llm import get_client
from app.storage.local import load_fixture_lesson_plan


def generate_lesson_plan(document_id: str, index_summary: str, *, use_fixture: bool = True) -> LessonPlan:
    if use_fixture:
        plan = load_fixture_lesson_plan()
        return plan.model_copy(update={"document_id": document_id, "lesson_id": f"les_{document_id}"})

    # TODO(P2): structured output with span_id validation against DocumentIndex
    _ = get_client()
    _ = index_summary
    raise NotImplementedError("Set use_fixture=False after implementing LLM lesson generation")


def validate_plan_against_index(plan: LessonPlan, span_ids: set[str]) -> list[str]:
    errors: list[str] = []
    for seg in plan.segments:
        for sid in seg.span_ids + [seg.on_enter.scroll_to_span] + seg.on_enter.highlights:
            if sid not in span_ids:
                errors.append(f"Unknown span_id {sid} in segment {seg.id}")
        if seg.page < 1:
            errors.append(f"Invalid page on segment {seg.id}")
    return errors
