"""T-014 / T-015: lessons API."""

import threading

from app.services import lesson_generator
from app.services.llm import ParsedResult
from app.models.llm_drafts import DraftSegment, PlanDraft
from tests.test_plan_ladder import _GOOD, _ok_result


def test_idempotent_lesson_post(monkeypatch, client, golden_pdf_bytes, data_dir):
    up = client.post(
        "/documents",
        files={"file": ("g.pdf", golden_pdf_bytes, "application/pdf")},
    )
    doc_id = up.json()["document_id"]
    calls = {"n": 0}

    def fake(*a, **k):
        calls["n"] += 1
        return _ok_result(_GOOD)

    monkeypatch.setattr(lesson_generator.llm, "parse_structured", fake)
    r1 = client.post(f"/documents/{doc_id}/lessons")
    r2 = client.post(f"/documents/{doc_id}/lessons")
    assert r1.status_code == 200
    assert r2.status_code == 200
    assert r1.json() == r2.json()
    assert calls["n"] == 1
    assert r1.json()["lesson_id"] == f"les_{doc_id.removeprefix('doc_')}"
