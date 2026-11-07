"""P2: grounded interrupt Q&A."""

import json
import logging

from fastapi import APIRouter

from app.errors import LLMTimeoutError, LLMUpstreamError, NotConfiguredError, NotFoundError
from app.models.schemas import QARequest, QAResponse
from app.services.rag import answer_question
from app.storage import local

router = APIRouter(tags=["qa"])
logger = logging.getLogger("lesson.qa")


@router.post("/lessons/{lesson_id}/qa", response_model=QAResponse)
def post_qa(lesson_id: str, body: QARequest) -> QAResponse:
    local.require_lesson_id(lesson_id)
    if body.lesson_id and body.lesson_id != lesson_id:
        logger.info("qa body lesson_id mismatch path=%s body=%s", lesson_id, body.lesson_id)

    plan = local.load_plan(lesson_id)
    index = local.load_index(plan.document_id)

    try:
        return answer_question(body, plan, index)
    except (NotConfiguredError, LLMUpstreamError, LLMTimeoutError) as exc:
        if lesson_id == local.DEMO_LESSON_ID:
            raw = json.loads((local.fixtures_dir() / "sample-qa-response.json").read_text())
            logger.info("qa_demo_fallback lesson_id=%s", lesson_id)
            return QAResponse.model_validate(raw)
        if isinstance(exc, NotConfiguredError):
            raise
        raise
