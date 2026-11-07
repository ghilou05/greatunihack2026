"""T-017: RAG cite gate (stubbed)."""

from app.models.llm_drafts import QADraft
from app.models.schemas import QARequest
from app.services import rag
from app.services.llm import ParsedResult
from app.storage.local import load_fixture_document_index, load_fixture_lesson_plan


def _draft(**kwargs) -> ParsedResult:
    d = QADraft(answerable=True, answer="It says osmosis moves water.", cites=[2, 5], bridge="Back.")
    d = d.model_copy(update=kwargs)
    return ParsedResult(
        parsed=d,
        failure=None,
        status="ok",
        incomplete_reason=None,
        usage={},
        duration_ms=1,
        model="stub",
        kind="qa",
    )


def test_valid_cites_viewer_commands(monkeypatch):
    monkeypatch.setattr(rag.llm, "parse_structured", lambda *a, **k: _draft())
    plan = load_fixture_lesson_plan()
    index = load_fixture_document_index()
    req = QARequest(
        lesson_id="les_demo",
        segment_id="seg_01",
        question="What is osmosis?",
    )
    resp = rag.answer_question(req, plan, index)
    assert resp.cite_span_ids
    assert resp.viewer_commands
    assert resp.viewer_commands[0].type == "scroll_to_span"


def test_refusal_when_not_answerable(monkeypatch):
    monkeypatch.setattr(
        rag.llm,
        "parse_structured",
        lambda *a, **k: _draft(answerable=False, answer="", cites=[]),
    )
    plan = load_fixture_lesson_plan()
    req = QARequest(lesson_id="les_demo", segment_id="seg_01", question="France?")
    resp = rag.answer_question(req, plan, load_fixture_document_index())
    assert resp.answer == rag.REFUSAL_TEXT
    assert resp.cite_span_ids == []
