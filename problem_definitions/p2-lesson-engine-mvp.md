# Problem: P2 lesson engine (MVP)

**Status:** Approved (team contract v0.1)  
**Date:** 2026-11-07  
**Scope doc:** [docs/p2-backend-outline.md](../docs/p2-backend-outline.md)  
**Solution design:** [docs/p2-solution-design.md](../docs/p2-solution-design.md) (**approved**)  
**Implementation plan:** [implementation_plans/p2-lesson-engine-mvp.md](../implementation_plans/p2-lesson-engine-mvp.md)
**Contract:** [shared/CONTRACT-v0.1.md](../shared/CONTRACT-v0.1.md)

## Problem statement

Given a PDF upload, produce a **line-level DocumentIndex**, a **structured LessonPlan** (segments with narration, `on_enter`, `page`, line `span_id`s), and **grounded interrupt Q&A** over REST — without owning voice, browser orchestration, or the PDF viewer.

## Success criteria

1. `POST /documents` ingests golden PDF with ≥1 line unit per page; scanned/empty fails clearly.
2. `POST /documents/{id}/lessons` returns **200** with valid `LessonPlan` (3–12 segments, all refs in index, `page` set, `cues: []`).
3. `POST /lessons/{id}/qa` returns cited answers with `viewer_commands`; empty cites when ungrounded.
4. Demo path `doc_demo` works with `shared/fixtures/golden-demo.pdf`.

## Constraints

- FastAPI + OpenAI; local disk cache; sync lesson generation (no 202).
- Line units `p{n}_l{i}`; browser orchestrator elsewhere.
- Hackathon ~4h implementation after design.

## Golden fixture

- PDF: `shared/fixtures/golden-demo.pdf` (**4 pages, 175 line units** as of ingest probe).

## Out of scope

Voice LLM, LangGraph, Qdrant (unless time), Supabase, OCR, `cues` timing, server lesson state.

## NFRs

- Lesson gen target: &lt;60s on golden doc on laptop (stretch).
- Validate LLM output; one retry on schema/grounding failure.
