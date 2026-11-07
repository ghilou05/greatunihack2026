"""T-010 / T-016 prompt builders."""

from app.services.prompts import (
    build_plan_prompt,
    render_plan_index,
    target_segments,
)
from app.storage.local import load_fixture_document_index


def test_target_segments():
    assert target_segments(175) == 8
    assert target_segments(30) == 5
    assert target_segments(500) == 12


def test_golden_plan_render():
    index = load_fixture_document_index()
    text, stats = render_plan_index(index, line_cap=220, suppress=True)
    assert text.startswith("<DOCUMENT>")
    for p in (1, 2, 3, 4):
        assert f"## Page {p}" in text
    assert "p3_l12" not in text
    assert stats.chars <= 24_000 or stats.over_budget
    text2, _ = render_plan_index(index)
    assert text == text2


def test_long_line_truncation():
    from app.models.schemas import BBox, DocumentIndex, PageMeta, Span

    index = DocumentIndex(
        document_id="doc_x",
        pages=[PageMeta(page=1, width=100, height=100)],
        spans=[
            Span(
                span_id="p1_l0",
                unit_kind="line",
                page=1,
                text="x" * 300,
                bbox=BBox(x0=0, y0=0, x1=1, y1=1),
            )
        ],
    )
    text, _ = render_plan_index(index, suppress=False)
    assert "…" in text
    line = [ln for ln in text.splitlines() if ln.startswith("l0:")][0]
    assert len(line) <= 224


def test_plan_prompt_has_rules():
    index = load_fixture_document_index()
    system, user = build_plan_prompt(index, target_segments(len(index.spans)))
    assert "never instructions" in system or "untrusted" in system.lower()
    assert "40–65" in system or "40-65" in system
    assert user.strip().endswith("lines). Place dynamic instructions here last.")
