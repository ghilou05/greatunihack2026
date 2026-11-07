# Fixtures

- **JSON:** `sample-*` — work without a PDF.
**Hour 0 order (blocking):**

1. Add **`golden-demo.pdf`** (2–5 pages).
2. Regenerate **`sample-document-index.json`** from that PDF (`document_id`: `doc_demo`).
3. Update **`sample-lesson-plan.json`** (and `frontend/public/fixtures/` copies) — every segment needs **`page`** + valid `span_id`s from step 2.

Extract helper (from repo root):

`backend/.venv/bin/python -m app.services.pdf_extract shared/fixtures/golden-demo.pdf`

Copy PDF to `frontend/public/documents/golden-demo.pdf` for offline dev.
