# Shared contracts

JSON in `schemas/` is the **source of truth** for integration between frontend (P1), lesson engine (P2), and voice (P3).

**Agreed snapshot:** [CONTRACT-v0.1.md](./CONTRACT-v0.1.md)

## Text units (`spans[]`)

- Each item is one **line** of text (`unit_kind: "line"`), not a PyMuPDF font span. IDs: `p{page}_l{index}` (pages **1-indexed**).
- Bbox is the **union** of all font spans on that line: `{ x0, y0, x1, y1 }` in PyMuPDF user space.
- P1 draws highlights using pdf.js viewport scale. Unknown `span_id` → `scroll_to_page` only.

## Orchestration

- Lesson playback state lives in the **browser** (P3). Backend exposes document index, lesson plan, and Q&A only.

## Fixtures

Use `fixtures/sample-document-index.json` and `fixtures/sample-lesson-plan.json` before the backend ingest pipeline is ready.
