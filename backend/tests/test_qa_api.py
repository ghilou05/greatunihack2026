"""T-018: QA route."""

import pytest

from app.services import rag
from app.services.llm import ParsedResult
from app.models.llm_drafts import QADraft


def test_qa_demo_live_ok(monkeypatch, client):
    def fake(*a, **k):
        return ParsedResult(
            parsed=QADraft(answerable=True, answer="Water moves.", cites=[0], bridge="Done."),
            failure=None,
            status="ok",
            incomplete_reason=None,
            usage={},
            duration_ms=1,
            model="stub",
            kind="qa",
        )

    monkeypatch.setattr(rag.llm, "parse_structured", fake)
    r = client.post(
        "/lessons/les_demo/qa",
        json={
            "lesson_id": "les_demo",
            "segment_id": "seg_01",
            "question": "What is osmosis?",
        },
    )
    assert r.status_code == 200
    assert r.json()["cite_span_ids"]
