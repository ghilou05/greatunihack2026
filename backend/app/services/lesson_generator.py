"""P2: plan validation, repair, assembly, generation ladder."""

from __future__ import annotations

import json
import logging
import re
import time
from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from typing import Any

from app.config import get_settings
from app.errors import LLMTimeoutError, PlanInvalidError
from app.models.llm_drafts import DraftSegment, PlanDraft
from app.models.schemas import DocumentIndex, LessonPlan, LessonSegment, SegmentOnEnter
from app.services import llm
from app.services.prompts import (
    PROMPT_VERSION_PLAN,
    build_plan_prompt,
    build_retry_turns,
    target_segments,
)

logger = logging.getLogger("lesson.plan")

_SPAN_ID_RE = re.compile(r"p\d+_l\d+")
_LINE_REF_RE = re.compile(r"\bline\s+\d+\b", re.I)
_MARKDOWN_RE = re.compile(r"[*_#`\[\]]|https?://")


@dataclass
class RepairRecord:
    rule: str
    segment_index: int
    message: str


@dataclass
class PlanMeta:
    model: str
    prompt_version: str
    strategy: str
    attempts: int
    repairs: list[dict[str, Any]] = field(default_factory=list)
    warnings: list[dict[str, Any]] = field(default_factory=list)
    usage: list[dict[str, Any]] = field(default_factory=list)
    duration_ms: int = 0
    created_at: str = ""
    lesson_id: str = ""


def _index_maps(index: DocumentIndex) -> tuple[dict[str, Any], dict[int, list[str]]]:
    by_id = {s.span_id: s for s in index.spans}
    by_page: dict[int, list[str]] = {}
    for s in index.spans:
        by_page.setdefault(s.page, []).append(s.span_id)
    return by_id, by_page


def _last_line(page: int, by_page: dict[int, list[str]]) -> int:
    ids = by_page.get(page, [])
    if not ids:
        return -1
    return max(int(re.search(r"_l(\d+)$", sid).group(1)) for sid in ids)  # type: ignore[union-attr]


def validate_plan_against_index(plan: LessonPlan, index: DocumentIndex) -> list[str]:
    by_id, _ = _index_maps(index)
    errors: list[str] = []
    id_set = {seg.id for seg in plan.segments}
    for seg in plan.segments:
        for sid in seg.span_ids + [seg.on_enter.scroll_to_span] + list(seg.on_enter.highlights):
            if sid not in by_id:
                errors.append(f"Unknown span_id {sid} in segment {seg.id}")
        if seg.on_enter.scroll_to_span != (seg.span_ids[0] if seg.span_ids else ""):
            errors.append(f"scroll_to_span mismatch on {seg.id}")
        if set(seg.on_enter.highlights) - set(seg.span_ids):
            errors.append(f"highlights not subset on {seg.id}")
        if len(seg.span_ids) != len(set(seg.span_ids)):
            errors.append(f"duplicate span_ids on {seg.id}")
        for sid in seg.span_ids:
            if by_id[sid].page != seg.page:
                errors.append(f"page mismatch for {sid} on {seg.id}")
        if seg.cues:
            errors.append(f"cues must be empty on {seg.id}")
        if seg.check_question is not None:
            errors.append(f"check_question must be null on {seg.id}")
        if seg.next is not None and seg.next not in id_set:
            errors.append(f"invalid next on {seg.id}")
    for i, seg in enumerate(plan.segments):
        exp = plan.segments[i + 1].id if i + 1 < len(plan.segments) else None
        if seg.next != exp:
            errors.append(f"next chain broken at {seg.id}")
    return errors


def _span_ids_for_range(page: int, start: int, end: int) -> list[str]:
    return [f"p{page}_l{i}" for i in range(start, end + 1)]


def repair_draft(
    draft: PlanDraft, index: DocumentIndex
) -> tuple[list[DraftSegment], list[RepairRecord], list[RepairRecord]]:
    _, by_page = _index_maps(index)
    repairs: list[RepairRecord] = []
    hard: list[RepairRecord] = []
    segments = [s.model_copy() for s in draft.segments]

    def hard_v(rule: str, idx: int, msg: str):
        hard.append(RepairRecord(rule, idx, msg))

    n_pages = len(index.pages)
    kept: list[DraftSegment] = []
    for idx, seg in enumerate(segments):
        page = seg.page
        if page < 1 or page > n_pages:
            repairs.append(RepairRecord("V5", idx, f"clamped page {page}"))
            page = max(1, min(n_pages, page))
            seg.page = page
        if seg.line_start > seg.line_end:
            repairs.append(RepairRecord("V2", idx, "swapped line_start/end"))
            seg.line_start, seg.line_end = seg.line_end, seg.line_start
        last = _last_line(page, by_page)
        if last < 0:
            hard_v("V1", idx, "page has no lines")
            continue
        if seg.line_start > last:
            hard_v("V1", idx, "line_start past last line")
            continue
        if seg.line_end > last:
            repairs.append(RepairRecord("V3", idx, "clamped line_end"))
            seg.line_end = last
        if seg.line_end - seg.line_start + 1 > 10:
            repairs.append(RepairRecord("V3", idx, "truncated to 10 lines"))
            seg.line_end = seg.line_start + 9
        seg.goal = seg.goal.strip()[:80]
        if not seg.goal:
            hard_v("V14", idx, "empty goal")
            continue
        narr = seg.narration
        narr = _MARKDOWN_RE.sub("", narr)
        narr = narr.replace("\n", " ").strip()
        narr = re.sub(r"\s+", " ", narr)
        if narr != seg.narration:
            repairs.append(RepairRecord("V11", idx, "cleaned narration"))
            seg.narration = narr
        if _SPAN_ID_RE.search(seg.narration) or _LINE_REF_RE.search(seg.narration):
            hard_v("V11", idx, "narration contains ids/line refs")
            continue
        words = len(seg.narration.split())
        if words < 15 or words > 110:
            hard_v("V10", idx, f"word count {words}")
            continue
        if 20 <= words <= 29 or 81 <= words <= 100:
            repairs.append(RepairRecord("V10-soft", idx, f"soft word count {words}"))
        kept.append(seg)

    # overlap drop (G-11)
    filtered: list[DraftSegment] = []
    for seg in kept:
        drop = False
        if filtered:
            prev = filtered[-1]
            if prev.page == seg.page:
                a = set(range(prev.line_start, prev.line_end + 1))
                b = set(range(seg.line_start, seg.line_end + 1))
                if b and len(a & b) / len(b) > 0.8:
                    repairs.append(RepairRecord("overlap", len(filtered), "dropped overlapping segment"))
                    drop = True
        if not drop:
            filtered.append(seg)

    if not draft.title.strip():
        hard.append(RepairRecord("V14", -1, "empty title"))
    title = draft.title.strip()[:80]
    return filtered, repairs, hard


def drop_and_rechain(segments: list[LessonSegment]) -> list[LessonSegment]:
    out: list[LessonSegment] = []
    for i, seg in enumerate(segments, start=1):
        seg_id = f"seg_{i:02d}"
        nxt = f"seg_{i+1:02d}" if i < len(segments) else None
        out.append(seg.model_copy(update={"id": seg_id, "next": nxt}))
    return out


def assemble_plan(
    segments: list[DraftSegment],
    index: DocumentIndex,
    *,
    lesson_id: str,
    title: str,
) -> LessonPlan:
    by_id, by_page = _index_maps(index)
    lesson_segments: list[LessonSegment] = []
    for i, seg in enumerate(segments, start=1):
        span_ids = [sid for sid in _span_ids_for_range(seg.page, seg.line_start, seg.line_end) if sid in by_id]
        if not span_ids:
            raise PlanInvalidError("no spans for segment")
        seg_id = f"seg_{i:02d}"
        nxt = f"seg_{i+1:02d}" if i < len(segments) else None
        lesson_segments.append(
            LessonSegment(
                id=seg_id,
                goal=seg.goal,
                page=seg.page,
                span_ids=span_ids,
                narration=seg.narration,
                on_enter=SegmentOnEnter(scroll_to_span=span_ids[0], highlights=span_ids),
                cues=[],
                check_question=None,
                next=nxt,
            )
        )
    return LessonPlan(
        lesson_id=lesson_id,
        document_id=index.document_id,
        title=title,
        segments=lesson_segments,
    )


def generate_lesson_plan(
    index: DocumentIndex,
    *,
    lesson_id: str,
    force_strategy: str | None = None,
) -> tuple[LessonPlan, PlanMeta]:
    settings = get_settings()
    strategy = force_strategy or settings.plan_strategy
    if strategy == "paged":
        logger.warning("paged strategy not implemented; falling back to single")
        strategy = "single"

    target_n = target_segments(len(index.spans))
    system, first_user = build_plan_prompt(index, target_n)
    stable_turns: list[tuple[str, str]] = [("user", first_user)]

    meta = PlanMeta(
        model=settings.plan_model,
        prompt_version=PROMPT_VERSION_PLAN,
        strategy=strategy,
        attempts=0,
        lesson_id=lesson_id,
        created_at=datetime.now(timezone.utc).isoformat(),
    )
    t0 = time.perf_counter()
    deadline = settings.plan_deadline_s

    def call_llm(turns: list[tuple[str, str]], attempt: int, token_cap: int, timeout: float):
        return llm.parse_structured(
            settings.plan_model,
            system,
            turns,
            PlanDraft,
            max_output_tokens=token_cap,
            timeout=timeout,
            max_retries=0,
            prompt_cache_key=f"plan:{lesson_id}",
            reasoning_effort=settings.plan_effort,
            service_tier=settings.service_tier,
            kind="plan",
            attempt=attempt,
        )

    draft_json = ""
    token_cap = settings.plan_max_output_tokens
    violation_msgs: list[str] = []
    last_timeout = False

    def elapsed() -> float:
        return time.perf_counter() - t0

    for attempt in (1, 2):
        if attempt == 2:
            if elapsed() > settings.plan_retry_cutoff_s or deadline - elapsed() < 10:
                if last_timeout:
                    raise LLMTimeoutError()
                raise PlanInvalidError("retry skipped")
        remaining = max(1.0, deadline - elapsed())
        timeout = min(settings.plan_timeout_s, remaining)
        turns = list(stable_turns)
        if attempt == 2:
            turns.extend(build_retry_turns(draft_json, violation_msgs))
        try:
            result = call_llm(turns, attempt, token_cap, timeout)
        except LLMTimeoutError:
            last_timeout = True
            if attempt == 1 and elapsed() <= settings.plan_retry_cutoff_s:
                violation_msgs = ["timed out — try again faster"]
                continue
            raise
        last_timeout = False
        meta.attempts = attempt
        meta.usage.append(result.usage)
        if result.failure:
            if attempt == 1:
                if result.failure == "incomplete":
                    token_cap = int(settings.plan_max_output_tokens * 1.5)
                violation_msgs = [f"model failure: {result.failure}"]
                continue
            raise PlanInvalidError(result.failure or "llm failure")
        assert isinstance(result.parsed, PlanDraft)
        draft_json = result.parsed.model_dump_json()
        segs, repairs, hard = repair_draft(result.parsed, index)
        violation_msgs = [f"seg {h.segment_index}: {h.rule} → {h.message}" for h in hard]
        meta.repairs.extend(asdict(r) for r in repairs)
        n_valid = len(segs)
        count_ok = 5 <= n_valid <= 12
        if not hard and count_ok:
            title = result.parsed.title.strip()[:80] or "Lesson"
            plan = assemble_plan(segs, index, lesson_id=lesson_id, title=title)
            errs = validate_plan_against_index(plan, index)
            if errs:
                raise PlanInvalidError("assembled invalid")
            meta.duration_ms = int(elapsed() * 1000)
            logger.info(
                "plan_complete attempts=%s repairs=%s warnings=%s duration_ms=%s",
                meta.attempts,
                len(meta.repairs),
                len(meta.warnings),
                meta.duration_ms,
            )
            return plan, meta
        if attempt == 1:
            if not count_ok:
                violation_msgs.append("need 5–12 valid segments after repair")
            continue
        if n_valid >= 3:
            if n_valid > 12:
                segs = segs[:12]
                meta.warnings.append({"code": "segments_truncated"})
            title = result.parsed.title.strip()[:80] or "Lesson"
            plan = assemble_plan(segs, index, lesson_id=lesson_id, title=title)
            plan = plan.model_copy(update={"segments": drop_and_rechain(plan.segments)})
            errs = validate_plan_against_index(plan, index)
            if errs:
                raise PlanInvalidError("post-drop invalid")
            meta.duration_ms = int(elapsed() * 1000)
            return plan, meta
        raise PlanInvalidError("too few valid segments")

    raise PlanInvalidError("exhausted attempts")


def validate_fixture_plan() -> list[str]:
    from app.storage.local import load_fixture_document_index, load_fixture_lesson_plan

    return validate_plan_against_index(load_fixture_lesson_plan(), load_fixture_document_index())


if __name__ == "__main__":
    import argparse
    from pathlib import Path

    from app.services.pdf_extract import extract_document_index

    parser = argparse.ArgumentParser()
    parser.add_argument("pdf")
    parser.add_argument("--runs", type=int, default=1)
    parser.add_argument("--write-fixtures", action="store_true")
    parser.add_argument("--strategy", default="single")
    args = parser.parse_args()
    pdf = Path(args.pdf)
    data = pdf.read_bytes()
    index = extract_document_index("doc_demo", data)
    print(f"pages={len(index.pages)} lines={len(index.spans)} chars={sum(len(s.text) for s in index.spans)}")
    latencies: list[float] = []
    plan: LessonPlan | None = None
    meta: PlanMeta | None = None
    for i in range(args.runs):
        t0 = time.perf_counter()
        plan, meta = generate_lesson_plan(index, lesson_id="les_demo", force_strategy=args.strategy)
        latencies.append(time.perf_counter() - t0)
        print(f"run {i+1}: {latencies[-1]:.2f}s attempts={meta.attempts}")
    latencies.sort()
    p50 = latencies[len(latencies) // 2]
    p95 = latencies[int(0.95 * (len(latencies) - 1))]
    print(f"p50={p50:.2f} p95={p95:.2f} max={max(latencies):.2f}")
    if p95 > 25 or max(latencies) > 40:
        print("GATE TRIPPED: enable PLAN_STRATEGY=paged (T-023)")
    assert plan is not None
    errs = validate_plan_against_index(plan, index)
    if errs or not (5 <= len(plan.segments) <= 12):
        print("VALIDATION FAILED", errs)
        raise SystemExit(1)
    if args.write_fixtures:
        from app.storage.local import fixtures_dir

        fixtures_dir().joinpath("sample-lesson-plan.json").write_text(plan.model_dump_json(indent=2))
        print("wrote sample-lesson-plan.json")
