"""P2: Grounded Q&A over document spans (MVP: segment + keyword retrieval)."""

import json
from pathlib import Path

from app.models.schemas import QARequest, QAResponse, ScrollToSpan, SetHighlights
from app.storage.local import FIXTURES


def answer_question(_request: QARequest, *, use_fixture: bool = True) -> QAResponse:
    if use_fixture:
        raw = json.loads((FIXTURES / "sample-qa-response.json").read_text())
        return QAResponse.model_validate(raw)

    raise NotImplementedError("Implement RAG + LLM answer with mandatory cite_span_ids")


def viewer_commands_for_spans(span_ids: list[str]) -> list[ScrollToSpan | SetHighlights]:
    if not span_ids:
        return []
    return [
        ScrollToSpan(span_id=span_ids[0]),
        SetHighlights(span_ids=span_ids),
    ]
