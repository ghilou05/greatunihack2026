# P2 integration handoff (post-implementation)

Use this when merging branches or wiring **P1** (viewer) and **P3** (voice/orchestrator) to the live backend. Resolves common conflicts from the **pre-P2 scaffold** vs **current `abs` behaviour**.

**Related:** [CONTRACT-v0.1.md](../shared/CONTRACT-v0.1.md) · [p2-manual-testing.md](./p2-manual-testing.md) · [team-mvp-integration-plan.md](./team-mvp-integration-plan.md) · [execution log](../implementation_plans/p2-lesson-engine-mvp-execution-log.md)

---

## 1. Plan vs shipped (team-relevant)

| Was true in **early scaffold / old CP1 text** | **Now** |
|-----------------------------------------------|---------|
| `lesson_id` = new UUID on every `POST …/lessons` | **`les_` + same suffix as `doc_`** (`doc_abc…` → `les_abc…`) |
| Fixture plan used `les_doc_demo` / re-keying | Canonical **`les_demo`** / **`doc_demo`** only |
| `use_fixture=True` on real uploads | **Removed** — real docs call the LLM (`OPENAI_API_KEY` required) |
| `POST …/lessons` on uploads → **503** until M3 | **Live:** **200** (or 502/504/503 if key missing / LLM fails) |
| `sample-document-index.json` had ~3 spans | **175** line units — must match lesson `span_ids` |
| `POST /documents?demo=true` required multipart file | **`?demo=true` works with no file** → `doc_demo` |
| Q&A ignored body `lesson_id` | **Path wins** (G-12); body mismatch logged at INFO |

**Unchanged (by design):** REST-only backend; sync lesson `POST` 200; `cues: []`; idempotent plan cache; P2 does not edit `frontend/**`; single uvicorn worker; gap defaults G-01 / G-03 / G-07.

**Plan gaps (usually non-blocking for integration):** partial validator/ladder/RAG test matrices; T-022/T-023 skipped; [p2-backend-outline.md](./p2-backend-outline.md) may still mention old stubs — **trust this doc and the contract**.

**Intentional stub:** `GET /voice/status` — P3 owns voice; ignore unless you add a proxy.

---

## 2. Integration boundaries that break code if ignored

### IDs and routing

| Pitfall | Result |
|---------|--------|
| `les_doc_demo` or invented lesson ids | **404** — ids must match `^les_[a-z0-9]{1,32}$` |
| `POST …/lessons` before upload / index missing | **404** document or failed lesson |
| `POST /documents/{id}/lessons?demo=true` on a **real** `doc_*` | Returns **`les_demo` fixture** anyway — don’t combine |
| `doc_demo` / `les_demo` without `?force=true` | **Fixture plan**, no LLM; regen via `?force=true` or real upload id |

### P1 — HTTP and data

| Pitfall | Fix |
|---------|-----|
| Expect index on `POST /documents` | Response is only `{ document_id, status }` — **`GET /…/index`** |
| Parse errors as plain text | Body is `{"detail": "string"}` — surface `detail` in UI |
| Default `fetch` timeout on lesson POST | **≥ 90 s**; first call ~10–15s |
| No `OPENAI_API_KEY` on server | **503** `Lesson generator is not configured` |
| Stale `frontend/public/fixtures/*` | Re-copy from `shared/fixtures/` after P2 regen |
| PDF from static path only | Live: **`GET /documents/{id}/file`** (`getDocumentFileUrl`) |
| Index from fixtures while lesson from API | **Mismatched highlights** — same source for index + plan |

### P3 — Q&A and viewer

| Pitfall | Fix |
|---------|-----|
| `POST …/lessons` on interrupt | Only **`POST /lessons/{id}/qa`** |
| Skip `narration_delivered` / `qa_turns` | Send contract fields for grounding |
| Expect `clear_highlights` from P2 Q&A | Only `scroll_to_span` + `set_highlights`; restore via **`on_enter`** after bridge |
| Wrong refusal handling | Exact: `I don't see that in this document.` |
| Body `lesson_id` ≠ path | **Path authoritative** |
| `LessonPlayer` catch-all → fixture JSON | Masks real 502/404 — fail visibly in integration |
| Playback order | **answer → viewer_commands → bridge (TTS) → `onEnterToCommands(on_enter)`** |

### Config

| Variable | Who |
|----------|-----|
| `NEXT_PUBLIC_API_URL` | P1 frontend → e.g. `http://localhost:8000` |
| `CORS_ORIGINS` | P2 → must include frontend origin |
| `OPENAI_API_KEY` | P2 `backend/.env` only (gitignored) |

---

## 3. Canonical HTTP surface

| Method | Path | Notes |
|--------|------|--------|
| GET | `/health` | Liveness |
| POST | `/documents` | Multipart PDF |
| POST | `/documents?demo=true` | No file → `doc_demo` |
| GET | `/documents/{id}` | `{ status, index? }` |
| GET | `/documents/{id}/index` | `DocumentIndex`, line units `p{n}_l{i}` |
| GET | `/documents/{id}/file` | PDF bytes |
| POST | `/documents/{id}/lessons` | Sync **200**; cache on repeat; `?force=true` regenerates |
| GET | `/lessons/{id}` | Same plan as POST |
| POST | `/lessons/{id}/qa` | Grounded interrupt Q&A |

Demo ids: **`doc_demo`**, **`les_demo`**.

---

## 4. Checkpoint messages (team thread)

### CP-F — fixtures

```text
CP-F — fixtures updated from live golden PDF (8-segment plan, les_demo)

P1: sync shared/fixtures/ → frontend/public/fixtures/
  - sample-lesson-plan.json
  - sample-document-index.json

Old 3-span index or les_doc_demo ids will break highlights and lesson URLs.
```

### CP2 — lesson (P1 + P3)

```text
CP2 — P2 lesson route is LIVE (backend :8000)

Contract: shared/CONTRACT-v0.1.md
Smoke: docs/p2-manual-testing.md

IDs:
  upload → doc_<12hex>
  lesson_id = les_<same suffix>  (NOT uuid, NOT les_doc_demo)
  demo: doc_demo / les_demo

Endpoints:
  POST /documents  (multipart PDF) OR POST /documents?demo=true  (no file)
  GET  /documents/{id}/index
  GET  /documents/{id}/file
  POST /documents/{id}/lessons — sync 200, first call ~10–15s, idempotent
  GET  /lessons/{id}

P1:
  - NEXT_PUBLIC_API_URL, CORS on :3000
  - Lesson POST fetch timeout ≥ 90s; show json.detail on errors
  - Retry POST …/lessons on 502/504 (idempotent)
  - Fixture sync (see CP-F); getDocumentFileUrl for PDF

P3:
  - GET /lessons/{id}; narration = plain text; on_enter only (cues: [])
  - Do not POST …/lessons on interrupt

curl -s http://localhost:8000/lessons/les_demo | jq .title
curl -s -X POST http://localhost:8000/documents/doc_demo/lessons
```

### CP3 — Q&A (P3, cc P1)

```text
CP3 — P2 interrupt Q&A is LIVE

POST /lessons/{lesson_id}/qa
  Path lesson_id wins (body lesson_id ignored if mismatch)

Body:
  segment_id, question
  narration_delivered (exact TTS so far)
  qa_turns[] (newest last)
  playback_ms (optional)
  max_cite_spans (optional; default 5, server cap 8)

Response:
  answer, cite_span_ids, viewer_commands, bridge
  commands: scroll_to_span, set_highlights only

P3 order after interrupt:
  1) TTS answer
  2) viewer_commands
  3) TTS bridge
  4) onEnterToCommands(segment.on_enter) → executeCommands

Off-topic: "I don't see that in this document." — empty cites/commands, still play bridge

les_demo: live Q&A; canned sample-qa-response.json only if API fails (G-07)
Non-demo: 502/504/503 — no canned answers

curl -s -X POST http://localhost:8000/lessons/les_demo/qa \
  -H "Content-Type: application/json" \
  -d '{"lesson_id":"les_demo","segment_id":"seg_01","question":"What is osmosis?","narration_delivered":"","qa_turns":[]}'
```

---

## 5. Recommended merge / integration order

1. Start backend (one worker), `backend/.env` with key.
2. **P1:** sync fixtures; wire upload → index → file URL → lesson POST (long timeout).
3. **P3:** `GET /lessons/{id}` after lesson exists (`les_demo` or `les_<upload>`).
4. Wire interrupt → `POST …/qa` with full QA body.
5. Run [p2-manual-testing.md](./p2-manual-testing.md) Tiers 3–4 with the integrated UI.

---

## 6. Merge conflict hints

When resolving frontend/backend merges, prefer **contract + live backend** over older stubs:

| File / pattern | Prefer |
|----------------|--------|
| `les_doc_demo` | `les_demo` |
| `use_fixture`, UUID `lesson_id` | Deterministic `les_` suffix |
| Hardcoded `/fixtures/*` only | API with fixture fallback documented |
| Assuming lesson POST 503 on uploads | Live POST with spinner + timeout |
| `frontend/public/fixtures/sample-document-index.json` | Match `shared/fixtures/` (175 lines) |
| `frontend/src/lib/api.ts` | Add upload + `POST …/lessons` if missing; parse `detail` |

P2-owned paths (coordinate before editing in a merge):

- `backend/app/api/{documents,lessons,qa}.py`
- `backend/app/services/*`
- `shared/fixtures/sample-*.json` (P2 writes `shared/`; P1 copies to `frontend/public/`)

Do **not** change `shared/schemas/**` without trio agreement.

---

## 7. Errors quick reference (P1 UI)

| Status | Typical `detail` |
|--------|------------------|
| 400 | `Expected a PDF file` |
| 413 | PDF exceeds N MB limit |
| 422 | ingest messages (scanned, password, page limit, etc.) |
| 404 | `Document not found` / `Lesson not found` / `Segment not found` |
| 502 | `Lesson generation failed…` / `Couldn't answer right now.` |
| 503 | `Lesson generator is not configured` |
| 504 | `Lesson generation timed out…` |

Full list: [p2-solution-design.md §8.2](./p2-solution-design.md).
