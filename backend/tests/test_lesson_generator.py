"""T-011: validator, repair, assembler."""

from app.models.llm_drafts import DraftSegment, PlanDraft
from app.models.schemas import LessonPlan
from app.services.lesson_generator import (
    assemble_plan,
    repair_draft,
    validate_fixture_plan,
    validate_plan_against_index,
)
from app.storage.local import load_fixture_document_index, load_fixture_lesson_plan


def test_fixture_plan_validates_against_fixture_index():
    assert validate_fixture_plan() == []


def test_valid_draft_assembles():
    index = load_fixture_document_index()
    draft = PlanDraft(
        title="T",
        segments=[
            DraftSegment(
                goal="Intro",
                page=1,
                line_start=0,
                line_end=1,
                narration=(
                    "This segment explains the opening lines in plain spoken English "
                    "so learners grasp the idea clearly without reading every word aloud."
                ),
            )
        ],
    )
    segs, repairs, hard = repair_draft(draft, index)
    assert not hard
    plan = assemble_plan(segs, index, lesson_id="les_x", title="T")
    assert validate_plan_against_index(plan, index) == []
    LessonPlan.model_validate(plan.model_dump())


def test_validator_catches_bad_page():
    plan = load_fixture_lesson_plan()
    bad = plan.model_copy(
        update={
            "segments": [
                plan.segments[0].model_copy(update={"page": 99}),
                *plan.segments[1:],
            ]
        }
    )
    assert validate_plan_against_index(bad, load_fixture_document_index())
