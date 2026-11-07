# Fixtures

- **JSON:** `sample-*` — work without a PDF.
- **`golden-demo.pdf`:** **Hour 0** — add your 2–5 page team test PDF here before branching.
- After adding, regenerate **`sample-document-index.json`** from this PDF:
  `cd backend && .venv/bin/python -m app.services.pdf_extract ../shared/fixtures/golden-demo.pdf`
  then copy/save output as `shared/fixtures/sample-document-index.json` (set `document_id` to `doc_demo`).
- Copy the same PDF to `frontend/public/documents/golden-demo.pdf` for offline dev.
