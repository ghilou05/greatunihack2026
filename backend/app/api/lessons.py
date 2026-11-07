"""P2: generate and fetch LessonPlan."""

from fastapi import APIRouter

from app.errors import NotFoundError
from app.models.schemas import LessonPlan
from app.services.lesson_generator import generate_lesson_plan, validate_plan_against_index
from app.storage import local

router = APIRouter(tags=["lessons"])


@router.post("/documents/{document_id}/lessons", response_model=LessonPlan)
def create_lesson(document_id: str, demo: bool = False, force: bool = False) -> LessonPlan:
    local.require_document_id(document_id)
    if (demo or document_id == local.DEMO_DOCUMENT_ID) and not force:
        return local.load_fixture_lesson_plan()

    index = local.load_index(document_id)
    lesson_id = local.lesson_id_for(document_id)

    with local.document_lock(document_id):
        if not force:
            cached = local.try_load_plan(lesson_id)
            if (
                cached is not None
                and cached.lesson_id == lesson_id
                and validate_plan_against_index(cached, index) == []
            ):
                return cached
        plan, meta = generate_lesson_plan(index, lesson_id=lesson_id)
        local.save_plan(lesson_id, plan)
        from dataclasses import asdict

        local.save_meta(lesson_id, asdict(meta))
        return plan


@router.get("/lessons/{lesson_id}", response_model=LessonPlan)
def get_lesson(lesson_id: str) -> LessonPlan:
    local.require_lesson_id(lesson_id)
    try:
        return local.load_plan(lesson_id)
    except NotFoundError:
        raise NotFoundError("Lesson not found") from None
