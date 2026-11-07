# P2 manual testing guide

Reference for **Person 2** (and anyone integrating the backend): what to run, what each step proves, and what to expect.

Related: [README](../README.md) quick start, [implementation plan §8.2](../implementation_plans/p2-lesson-engine-mvp.md), [execution log](../implementation_plans/p2-lesson-engine-mvp-execution-log.md). **Team merge:** [p2-integration-handoff.md](./p2-integration-handoff.md).

---

## Prerequisites

```bash
cd backend
source .venv/bin/activate
```

- **Offline tests:** no API key.
- **Live LLM / API smoke:** `backend/.env` with `OPENAI_API_KEY` (never commit; see root `.gitignore`).

Run the API with **one worker** (locks assume a single process):

```bash
uvicorn app.main:app --port 8000 --app-dir .
```

**Useful URLs**

| URL | Purpose |
|-----|---------|
| http://127.0.0.1:8000/docs | Swagger UI — try routes interactively |
| http://127.0.0.1:8000/health | Liveness |
| http://127.0.0.1:8000/lessons/les_demo | Fixture lesson JSON |

**Startup log noise (not a concern)**

- `GET /` → **404** — no root route; use `/docs` or `/health`.
- `GET /json/version` → **404** — external probe, not part of this app.
- `GET /docs`, real API calls → **200** means the server is fine.

---

## Tier 1 — Automated (no server)

Run from `backend/`. These do **not** replace HTTP smoke; they catch regressions in ingest, validation, routes (with mocks), and plan logic.

### `pytest -q`

| Proves | Does **not** prove |
|--------|---------------------|
| Config, errors, storage, ingest guards, FastAPI routes via `TestClient` (often with **stubbed** LLM) | Real lesson/Q&A quality, live server concurrency |

### `python -m app.services.llm --ping` (needs key)

| Proves | Does **not** prove |
|--------|---------------------|
| Key set; plan/QA model names work; structured Responses parsing; truncated call → `incomplete` / `max_output_tokens` | Full plan or Q&A prompts |

### `python -m app.services.lesson_generator ../shared/fixtures/golden-demo.pdf --runs 5` (needs key)

| Proves | Does **not** prove |
|--------|---------------------|
| Real `generate_lesson_plan` on golden PDF; p50/p95 latency; validator passes; **5–12** segments | Upload API, POST cache, Q&A |

Optional — refresh team fixtures after a good run:

```bash
.venv/bin/python -m app.services.lesson_generator ../shared/fixtures/golden-demo.pdf --write-fixtures
```

Then copy `shared/fixtures/sample-lesson-plan.json` → `frontend/public/fixtures/` for P1 offline demo.

---

## Tier 2 — Demo paths (server running, minimal LLM cost)

No upload required if fixtures exist.

```bash
curl -s http://127.0.0.1:8000/health
curl -s http://127.0.0.1:8000/documents/doc_demo
curl -s http://127.0.0.1:8000/documents/doc_demo/index
curl -s -o /tmp/golden.pdf http://127.0.0.1:8000/documents/doc_demo/file
curl -s http://127.0.0.1:8000/lessons/les_demo | python3 -m json.tool
```

**Check**

- `doc_demo` status `ready`; index has **4 pages**, **175** line units, ids `p{n}_l{i}`.
- `/file` returns a PDF (golden fallback).
- `les_demo` lesson: segments with `narration`, `page`, `span_ids`, `on_enter`, `cues: []`, `check_question: null`, chained `next`.

---

## Tier 3 — Live upload → lesson → cache (needs key)

Replace `<DOC_ID>` / `<LES_ID>` from responses (`doc_<12hex>` → `les_<same suffix>`).

```bash
curl -s -F "file=@../shared/fixtures/golden-demo.pdf;type=application/pdf" http://127.0.0.1:8000/documents
curl -s http://127.0.0.1:8000/documents/<DOC_ID>/index
curl -s -w "\nTIME:%{time_total}\n" -X POST http://127.0.0.1:8000/documents/<DOC_ID>/lessons
curl -s -w "\nTIME:%{time_total}\n" -X POST http://127.0.0.1:8000/documents/<DOC_ID>/lessons
curl -s http://127.0.0.1:8000/lessons/<LES_ID>
```

**Check**

- First `POST …/lessons`: **200**, ~**10–15s**, **5–12** segments, title + plain narration.
- Second `POST`: **200**, **&lt;1s** (cache hit), body identical to first.
- `GET /lessons/<LES_ID>` matches first POST body.
- On disk (gitignored): `backend/data/les_<suffix>.lesson.json`.

Optional regeneration:

```bash
curl -s -X POST "http://127.0.0.1:8000/documents/<DOC_ID>/lessons?force=true"
```

---

## Tier 4 — Q&A (needs key for uploaded lessons; `les_demo` uses live + fixture index)

**On-topic** (use a question answerable from the current segment/doc):

```bash
curl -s -X POST http://127.0.0.1:8000/lessons/les_demo/qa \
  -H "Content-Type: application/json" \
  -d '{"lesson_id":"les_demo","segment_id":"seg_01","question":"What is a phospholipid bilayer?"}' \
  | python3 -m json.tool
```

**Check:** non-empty `answer`; `cite_span_ids` ⊆ index; `viewer_commands` with `scroll_to_span` + `set_highlights` only; non-empty `bridge`.

**Off-topic:**

```bash
curl -s -X POST http://127.0.0.1:8000/lessons/les_demo/qa \
  -H "Content-Type: application/json" \
  -d '{"lesson_id":"les_demo","segment_id":"seg_01","question":"What is the capital of France?"}'
```

**Check:** `answer` exactly `I don't see that in this document.`; empty `cite_span_ids` and `viewer_commands`; non-empty `bridge`.

**P3-shaped body** (integration rehearsal — include when testing follow-ups):

```json
{
  "lesson_id": "les_demo",
  "segment_id": "seg_02",
  "question": "What about the sodium-potassium pump?",
  "narration_delivered": "…text TTS already spoke…",
  "qa_turns": [{"question": "…", "answer": "…"}],
  "playback_ms": 42000
}
```

**G-07 demo fallback:** With a valid key, `les_demo` should return **live** answers. Canned `sample-qa-response.json` appears only when live Q&A fails on `les_demo` (logged `qa_demo_fallback`). Non-demo lessons get **502**, not canned text.

---

## Tier 5 — Ingest error samples

```bash
curl -s -w "\nHTTP:%{http_code}\n" -F "file=@../README.md;type=text/plain" http://127.0.0.1:8000/documents
```

**Expect:** **400**, detail `Expected a PDF file`.

Other §8.2 cases (password-protected, empty/scanned, too many pages) need specific PDFs — see [p2-solution-design.md §8.3](./p2-solution-design.md).

---

## What P2 does **not** test by itself

| Capability | Owner |
|------------|--------|
| PDF viewer, highlights, scroll | P1 |
| TTS, STT, interrupt orchestration, playing `bridge` then `on_enter` | P3 |
| End-to-end “hear lesson + ask + resume” | Integration (P1+P2+P3) |

Backend proof is **JSON contracts**: valid `LessonPlan`, Q&A with span ids that exist in the index.

---

## Quick handoff checklist (before CP2/CP3)

- [ ] `pytest -q` green
- [ ] `llm --ping` exit 0
- [ ] `les_demo` GET returns fixture-shaped plan (8 segments after last fixture regen)
- [ ] Upload → lesson → fast cached second POST
- [ ] Q&A on-topic + off-topic on `les_demo` or your `les_*`
- [ ] P1 told: lesson POST timeout **≥ 90s**, show API `detail` on errors
- [ ] P3 told: send `narration_delivered` / `qa_turns`; always play `bridge`, then re-apply `on_enter`

---

## P2 completion note (hackathon scope)

Core Must implementation is **substantially complete** per [execution log](../implementation_plans/p2-lesson-engine-mvp-execution-log.md): routes, offline suite, latency gate, and live §8.2 smoke. Remaining gap is mostly **extra unit coverage** (validator/ladder/RAG matrices), not missing APIs.
