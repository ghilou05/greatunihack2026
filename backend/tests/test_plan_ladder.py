"""T-012: generate_lesson_plan ladder (stubbed LLM)."""

from unittest.mock import MagicMock

import pytest

from app.errors import LLMTimeoutError, PlanInvalidError
from app.models.llm_drafts import DraftSegment, PlanDraft
from app.services import lesson_generator
from app.services.llm import ParsedResult
from app.storage.local import load_fixture_document_index

_GOOD = PlanDraft(
    title="Demo",
    segments=[
        DraftSegment(
            goal=f"Segment {i}",
            page=1,
            line_start=i * 2,
            line_end=i * 2 + 1,
            narration=(
                "We explore this part of the document in clear spoken language "
                "so the learner understands the idea without reading it verbatim."
            ),
        )
        for i in range(5)
    ],
)


def _ok_result(draft: PlanDraft) -> ParsedResult:
    return ParsedResult(
        parsed=draft,
        failure=None,
        status="completed",
        incomplete_reason=None,
        usage={"input_tokens": 1, "output_tokens": 1, "cached_tokens": 0, "reasoning_tokens": 0},
        duration_ms=10,
        model="stub",
        kind="plan",
    )


def test_happy_path_one_call(monkeypatch):
    calls: list = []

    def fake_parse(*args, **kwargs):
        calls.append((args, kwargs))
        return _ok_result(_GOOD)

    monkeypatch.setattr(lesson_generator.llm, "parse_structured", fake_parse)
    index = load_fixture_document_index()
    plan, meta = lesson_generator.generate_lesson_plan(index, lesson_id="les_test")
    assert len(calls) == 1
    assert meta.attempts == 1
    assert lesson_generator.validate_plan_against_index(plan, index) == []


def test_retry_on_short_segment_count(monkeypatch):
    short = PlanDraft(
        title="T",
        segments=[
            DraftSegment(
                goal="Only one",
                page=1,
                line_start=0,
                line_end=1,
                narration="A single short valid segment with enough words for the spoken lesson format here.",
            )
        ],
    )
    seq = [_ok_result(short), _ok_result(_GOOD)]
    calls = {"n": 0}

    def fake_parse(*args, **kwargs):
        i = calls["n"]
        calls["n"] += 1
        return seq[min(i, 1)]

    monkeypatch.setattr(lesson_generator.llm, "parse_structured", fake_parse)
    index = load_fixture_document_index()
    plan, meta = lesson_generator.generate_lesson_plan(index, lesson_id="les_test2")
    assert calls["n"] == 2
    assert meta.attempts == 2
    assert len(plan.segments) >= 3


def test_no_retry_after_cutoff(monkeypatch):
    import time as time_mod

    short = _GOOD.model_copy(
        update={"segments": _GOOD.segments[:3]}
    )  # 3 valid triggers count issue on attempt 1 -> retry wanted

    monkeypatch.setattr(lesson_generator.llm, "parse_structured", lambda *a, **k: _ok_result(short))

    original = time_mod.perf_counter
    t = [1000.0]

    def fake_perf():
        t[0] += 50.0
        return t[0]

    monkeypatch.setattr(lesson_generator.time, "perf_counter", fake_perf)
    with pytest.raises((PlanInvalidError, LLMTimeoutError)):
        lesson_generator.generate_lesson_plan(
            load_fixture_document_index(), lesson_id="les_slow"
        )
