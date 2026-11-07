"""P2: generate and fetch LessonPlan."""

import json
import uuid

from fastapi import APIRouter, HTTPException

from app.models.schemas import LessonPlan
from app.services.lesson_generator import generate_lesson_plan
from app.storage.local import document_index_path, lesson_plan_path

router = APIRouter(tags=["lessons"])

DEMO_LESSON_ID = "les_demo"


@router.post("/documents/{document_id}/lessons", response_model=LessonPlan)
def create_lesson(document_id: str, demo: bool = False) -> LessonPlan:
    if demo or document_id == "doc_demo":
        plan = generate_lesson_plan(document_id, "", use_fixture=True)
        return plan

    doc_index_file = document_index_path(document_id)
    if not doc_index_file.exists():
        raise HTTPException(status_code=404, detail="Document not ingested")

    from app.models.schemas import DocumentIndex

    index = DocumentIndex.model_validate(json.loads(doc_index_file.read_text()))
    summary = " ".join(s.text[:120] for s in index.spans[:40])
    lesson_id = f"les_{uuid.uuid4().hex[:12]}"
    plan = generate_lesson_plan(document_id, summary, use_fixture=False)
    plan = plan.model_copy(update={"lesson_id": lesson_id, "document_id": document_id})
    lesson_plan_path(lesson_id).write_text(plan.model_dump_json(indent=2))
    return plan


@router.get("/lessons/{lesson_id}", response_model=LessonPlan)
def get_lesson(lesson_id: str) -> LessonPlan:
    if lesson_id == DEMO_LESSON_ID:
        plan = generate_lesson_plan("doc_demo", "", use_fixture=True)
        return plan

    path = lesson_plan_path(lesson_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Lesson not found")
    return LessonPlan.model_validate(json.loads(path.read_text()))
