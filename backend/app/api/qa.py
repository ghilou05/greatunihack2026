"""P2: grounded interrupt Q&A."""

from fastapi import APIRouter

from app.models.schemas import QARequest, QAResponse
from app.services.rag import answer_question

router = APIRouter(tags=["qa"])


@router.post("/lessons/{lesson_id}/qa", response_model=QAResponse)
def post_qa(lesson_id: str, body: QARequest) -> QAResponse:
    _ = lesson_id
    return answer_question(body, use_fixture=True)
