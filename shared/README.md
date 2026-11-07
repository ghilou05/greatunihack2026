# Shared contracts

JSON in `schemas/` is the **source of truth** for integration between frontend (P1), lesson engine (P2), and voice (P3).

## Bounding boxes

- Produced by **P2** via PyMuPDF: each span `bbox` is `{ x0, y0, x1, y1 }` in **PDF user space** (points), origin top-left of the page.
- Consumed by **P1** in pdf.js: multiply by `viewport.scale` when drawing highlight overlays; use the page’s viewport for `scroll_to_span`.
- If a highlight cannot be placed, fall back to `scroll_to_page` only (see `viewer-commands.json`).

## Fixtures

Use `fixtures/sample-document-index.json` and `fixtures/sample-lesson-plan.json` before the backend ingest pipeline is ready.
