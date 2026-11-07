"""P2: Grounded Q&A over document spans."""

from __future__ import annotations

import logging
import re

from app.config import get_settings
from app.errors import AppError, LLMTimeoutError, LLMUpstreamError, NotFoundError
from app.models.llm_drafts import QADraft
from app.models.schemas import DocumentIndex, LessonPlan, QARequest, QAResponse, ScrollToSpan, SetHighlights
from app.services import llm
from app.services.prompts import build_qa_labels, build_qa_prompt, build_qa_retry_turns

logger = logging.getLogger("lesson.qa")

REFUSAL_TEXT = "I don't see that in this document."


def viewer_commands_for_spans(span_ids: list[str]) -> list[ScrollToSpan | SetHighlights]:
    if not span_ids:
        return []
    return [
        ScrollToSpan(span_id=span_ids[0]),
        SetHighlights(span_ids=span_ids),
    ]


def _bridge_from(segment_goal: str, candidate: str) -> str:
    text = (candidate or "").strip()
    if text and len(text.split()) <= 25 and text.endswith(".") and text.count(".") <= 1:
        return text
    return f"Now, back to {segment_goal}."


def answer_question(request: QARequest, plan: LessonPlan, index: DocumentIndex) -> QAResponse:
    if not (request.question or "").strip():
        raise AppError(422, "Question is empty")

    segment = next((s for s in plan.segments if s.id == request.segment_id), None)
    if segment is None:
        raise NotFoundError("Segment not found")

    settings = get_settings()
    labels = build_qa_labels(index)
    system, turns = build_qa_prompt(index, plan, segment, request, labels)
    max_cites = min(request.max_cite_spans, 8)

    def resolve(draft: QADraft) -> tuple[str, list[str], bool]:
        if not draft.answerable:
            return REFUSAL_TEXT, [], False
        label_map = {i: labels[i].span_id for i in range(len(labels))}
        seen: set[str] = set()
        span_ids: list[str] = []
        for label in draft.cites:
            if not isinstance(label, int) or label < 0 or label >= len(labels):
                continue
            sid = label_map[label]
            if sid in seen:
                continue
            seen.add(sid)
            span_ids.append(sid)
            if len(span_ids) >= max_cites:
                break
        answer = draft.answer.strip()
        if len(answer.split()) > 90:
            parts = re.split(r"(?<=[.!?])\s+", answer)
            answer = " ".join(parts[:3])
        return answer, span_ids, bool(span_ids)

    attempts = 0
    prev_json = ""
    bad: list[int] = []
    last_draft: QADraft | None = None

    while attempts < 2:
        attempts += 1
        call_turns = list(turns)
        if attempts == 2 and prev_json:
            call_turns.extend(build_qa_retry_turns(prev_json, bad))
        try:
            result = llm.parse_structured(
                settings.qa_model,
                system,
                call_turns,
                QADraft,
                max_output_tokens=settings.qa_max_output_tokens,
                timeout=settings.qa_timeout_s,
                max_retries=1,
                prompt_cache_key=f"qa:{plan.lesson_id}",
                reasoning_effort=settings.qa_effort,
                service_tier=settings.service_tier,
                kind="qa",
                attempt=attempts,
            )
        except LLMTimeoutError as exc:
            raise exc.with_detail("Couldn't answer right now.") from exc
        except LLMUpstreamError as exc:
            raise exc.with_detail("Couldn't answer right now.") from exc

        if result.failure or result.parsed is None:
            if attempts == 2:
                raise LLMUpstreamError().with_detail("Couldn't answer right now.")
            continue
        assert isinstance(result.parsed, QADraft)
        last_draft = result.parsed
        prev_json = last_draft.model_dump_json()
        if not last_draft.answerable:
            return QAResponse(
                answer=REFUSAL_TEXT,
                cite_span_ids=[],
                viewer_commands=[],
                bridge=_bridge_from(segment.goal, last_draft.bridge),
            )
        answer, span_ids, ok = resolve(last_draft)
        if ok:
            return QAResponse(
                answer=answer,
                cite_span_ids=span_ids,
                viewer_commands=viewer_commands_for_spans(span_ids),
                bridge=_bridge_from(segment.goal, last_draft.bridge),
            )
        bad = [c for c in last_draft.cites if not isinstance(c, int) or c < 0 or c >= len(labels)]
    if last_draft is None:
        raise LLMUpstreamError().with_detail("Couldn't answer right now.")
    return QAResponse(
        answer=REFUSAL_TEXT,
        cite_span_ids=[],
        viewer_commands=[],
        bridge=_bridge_from(segment.goal, last_draft.bridge),
    )
