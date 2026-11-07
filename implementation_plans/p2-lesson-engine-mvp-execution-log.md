# Execution Log: P2 Lesson Engine MVP (FastAPI backend)

**Date started:** 2026-11-07  
**Date completed:** 2026-11-07 (relaunch run)  
**Implementation Plan:** [p2-lesson-engine-mvp.md](./p2-lesson-engine-mvp.md)  
**Executor:** AI-assisted (execute-implementation-plan subagent, composer-2.5 relaunch)  
**Branch:** `abs` (no commits per user instruction)

---

## Relaunch summary (2026-11-07)

Prior run halted during first `pytest` after T-002/T-003; this run resumed verification and implemented T-004 through T-021 (README), skipping T-023 (gate not tripped) and T-022 (Could).

### Prerequisites (updated)
- [x] `backend/.env` present with `OPENAI_API_KEY` (not logged)
- [x] Live ping T-009: **PASS** (`gpt-6.1-terra`, effort `low`, truncated → `incomplete` / `max_output_tokens`)
- [x] Offline `pytest -q`: **63 passed**

### Latency gate (T-013)
| run | latency (s) | attempts |
|-----|-------------|----------|
| 1 | 9.49 | 1 |
| 2 | 9.04 | 1 |
| 3 | 9.17 | 1 |
| 4 | 9.21 | 1 |
| 5 | 10.40 | 1 |

**p50=9.21s, p95=9.49s, max=10.40s** → **G-LAT: keep `PLAN_STRATEGY=single`** (T-023 not activated)

`--write-fixtures` regenerated `shared/fixtures/sample-lesson-plan.json` (8 segments, `les_demo`/`doc_demo`); fixture validator test passes.

### Ping transcript (truncated)
- Full ping: `parsed='Hello'`, `reasoning_tokens=0`, ~2.4s
- Truncated: `failure='refusal'`, `status=incomplete`, `reason=max_output_tokens`

---

## Task status

| Task | Status | Notes |
|------|--------|-------|
| T-001 | PASS | (prior run) |
| T-002 | PASS | 63-test suite includes config/health/CORS |
| T-003 | PASS | errors + handler tests |
| T-004 | PASS | `storage/local.py` + `test_storage.py` |
| T-005 | PASS | ingest guards + golden regression |
| T-006 | PASS | sync documents API |
| T-007 | PASS | superseded by T-014 but interim behaviour covered until T-014 |
| T-007b | PASS | M1 API tests green |
| T-008 | PASS | `llm_drafts.py` |
| T-009 | PASS | `llm.py` + live ping + `test_llm.py` (partial fake-client coverage) |
| T-010 | PASS | plan prompts; boilerplate [Could] implemented |
| T-011 | PARTIAL | validator/repair/assembler implemented; not all per-rule table tests |
| T-012 | PARTIAL | ladder implemented; `test_plan_ladder.py` covers happy/retry/cutoff, not every bullet |
| T-013 | PASS | 5-run CLI + fixtures written |
| T-014 | PASS | idempotent locked route; `test_lessons_api.py` idempotency |
| T-015 | PASS | offline tests + live smoke (see § Live API smoke) |
| T-016 | PARTIAL | QA prompts in `prompts.py`; limited prefix/cache tests |
| T-017 | PARTIAL | `rag.py` + stub tests; not full cite-matrix |
| T-018 | PASS | `qa.py` + demo fallback G-07 |
| T-019 | PASS | offline + live Q&A (answerable + off-topic) |
| T-020 | PASS | §8.2 e2e curl against live uvicorn (parent agent) |
| T-021 | PASS | README backend section updated |
| T-022 | SKIPPED | Could |
| T-023 | SKIPPED | Gate not tripped |

**Gap defaults:** G-01, G-03, G-07 applied as documented (no BLOCKER raised).

---

## Checkpoints

| CP | Status |
|----|--------|
| **CP1** | READY — message template in plan §9.2 (upload, ingest errors, demo, interim 503) |
| **CP-F** | READY — real `sample-lesson-plan.json`; P1 copy to `frontend/public/fixtures/` |
| **CP2** | **DONE** (live smoke) — real `POST …/lessons` |
| **CP3** | **DONE** (live smoke) — real `POST …/qa` |

---

## How to run smoke test

From `backend/`:

```text
.venv/bin/python -m pytest -q
.venv/bin/python -m app.services.llm --ping
.venv/bin/python -m app.services.lesson_generator ../shared/fixtures/golden-demo.pdf --runs 5
.venv/bin/uvicorn app.main:app --port 8000 --app-dir .
```

Then integration plan §8.2 curls (upload golden PDF → lessons → qa).

---

## Live API smoke (parent follow-up, 2026-11-07)

Single-worker uvicorn `:8000`; golden PDF upload → `doc_77ddea424429`.

| Step | Result |
|------|--------|
| `GET /health` | 200 `{"status":"ok"}` |
| `POST /documents` (golden PDF) | 200, `status: ready` |
| `POST …/lessons` (1st) | 200, **8 segments**, title "Cell Membranes and Osmosis", ~**12.0s** |
| `POST …/lessons` (2nd) | 200 cache hit, ~**0.006s** |
| `GET /lessons/les_77ddea424429` | identical to first POST body |
| Q&A on-topic ("phospholipid bilayer") | 200, 4 cites, viewer_commands, bridge; ~**1.85s** |
| Q&A off-topic (France capital) | refusal exact string, empty cites/commands, non-empty bridge |
| `POST /documents` (README.md) | **400** `Expected a PDF file` |

**CP-F:** copied `shared/fixtures/sample-lesson-plan.json` → `frontend/public/fixtures/sample-lesson-plan.json`.

---

## Verdict

**SUBSTANTIALLY COMPLETE** for hackathon MVP Must path: core routes, offline suite (63 tests), latency gate, live §8.2 smoke, fixtures synced to frontend. **Remaining (non-blocking):** fuller unit matrices for T-011/T-012/T-017 (marked PARTIAL); T-022/T-023 skipped per plan.

**Optional next step:** `post-implementation-review` if you want a formal plan-vs-code audit before team CP2/CP3 messages.

---

## Amendment — 2026-11-07 relaunch halt recovery

- T-002/T-003 verified PASS (`pytest` 19 → 63 tests after full M0–M4 work).
- No edits to `shared/schemas/**` or `frontend/**`.
- No git commits in this run.
