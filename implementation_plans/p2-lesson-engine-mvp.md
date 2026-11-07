# Implementation Plan: P2 Lesson Engine MVP (FastAPI backend)

**Date:** 2026-11-07
**Author:** AI-assisted (implementation-plan subagent)
**Status:** Ready for execution (design approved; gap defaults G-01/G-03/G-07 per §4 unless owner overrides)
**Branch:** `abs`
**Solution Design:** [docs/p2-solution-design.md](../docs/p2-solution-design.md) (APPROVED)
**Problem Definition:** [problem_definitions/p2-lesson-engine-mvp.md](../problem_definitions/p2-lesson-engine-mvp.md)
**Contract (frozen):** [shared/CONTRACT-v0.1.md](../shared/CONTRACT-v0.1.md)
**Outline / integration context:** [docs/p2-backend-outline.md](../docs/p2-backend-outline.md), [docs/team-mvp-integration-plan.md](../docs/team-mvp-integration-plan.md)
**Chosen option:** Single-call slim-draft plan (Option C schema) + layered validation ladder + whole-index segment-anchored Q&A with integer-label cites + deterministic one-lesson-per-document caching (design §1 D1–D7)
**Research verified:** Yes — live research via Context7 and Exa on 2026-11-07 (§3). Vendor facts already cited in design §12.4 are inherited, not re-verified, and are marked as such.

> Naming note: the skill's default file name is `YYYY-MM-DD-<slug>-implementation-plan.md`. The requester asked for `implementation_plans/p2-lesson-engine-mvp.md`; that name is used.

---

## 1. Summary

Turn the approved P2 design into working code on branch `abs`, in the order that unblocks teammates fastest:

1. **M0 Foundation** — deps, config, errors, storage primitives (everything else depends on these).
2. **M1 Ingest** — hardened sync `POST /documents` + `GET` routes. **Unblocks P1** (upload real PDFs, render index) → checkpoint **CP1**.
3. **M2 Plan engine** — `llm.py` + live model ping first (de-risks model name / effort / truncation behaviour early), then prompts, validator, repair, assembler, ladder, and the hour-0 smoke CLI that measures latency and writes the golden `les_demo` fixture.
4. **M3 Lessons route** — idempotent, locked, cached `POST /documents/{id}/lessons`. **Real lesson for P1/P3** → checkpoint **CP2**.
5. **M4 Q&A** — `rag.py` + `qa.py`. **Real grounded answers for P3** → checkpoint **CP3**.
6. **M5 Hardening** — end-to-end smoke, run docs, optional stretch items, latency gate decision.

**Highest-risk items** (sequenced early or gated): (a) model name / reasoning-effort / `max_output_tokens` behaviour on the real API (T-009 ping, before any plan logic is trusted); (b) sync plan latency vs the 25 s p95 gate (T-013); (c) the design's 6,000 `max_output_tokens` may be too small if the model spends many reasoning tokens (§3 finding F2, risk RK-02); (d) one-developer time budget — cut line follows design §5.5 (Must → Should → Could → Won't), tagged on every task.

**Scope guard:** no changes to `shared/schemas/**`, `frontend/**`, `backend/app/api/voice.py`, or the `ViewerCommand` union. All additions are server-internal or additive query params already in the design (`?force=true`).

---

## 2. Scope Traceability

### 2.1 Design decisions → tasks

| Design element | Plan task(s) |
|---|---|
| D1 slim draft `{title, segments[{goal,page,line_start,line_end,narration}]}` + server assembly (`id`, `span_ids`, `on_enter`, `cues: []`, `next`, `lesson_id`, `check_question=null`) | T-008, T-011 |
| D2 span ids from `(page, line_start..line_end)`; Q&A integer cite labels mapped server-side | T-011, T-016, T-017 |
| D3 failure ladder L0–L4 (prevent → repair → one whole-plan retry → drop if ≥3 → 502) | T-010 (L0), T-011 (L1), T-012 (L2–L4) |
| D4 one sync LLM call; `paged` only if p95 > 25 s (or any > 40 s) | T-012, T-013 (gate), T-023 (conditional) |
| D5 whole-index Q&A, cache-friendly prefix, refusal = `answerable=false` or zero valid cites | T-016, T-017 |
| D6 `lesson_id = "les_" + document_id.removeprefix("doc_")`, idempotent POST, per-doc lock, atomic writes, meta sidecar | T-004, T-014 |
| D7 env-driven models (`OPENAI_PLAN_MODEL`/`OPENAI_QA_MODEL`, default `gpt-6.1-terra`, low effort, `gpt-4o-mini` fallback), hour-0 confirmation | T-002, T-009, T-013 |
| §4.1 static draft schemas; key order `page, line_start, line_end` before `narration`; segment budget `target_n` | T-008, T-010 |
| §4.2 repair rules, retry feedback, drop/renumber/rechain | T-011, T-012 |
| §4.3 timeouts, `max_retries=0` for plan, 80 s deadline, retry skipped after 45 s, `OPENAI_SERVICE_TIER` | T-002, T-009, T-012 |
| §4.4 Q&A inputs/caps/gate/bridge/answer length | T-016, T-017, T-018 |
| §4.5 page-blocked compact index, boilerplate suppression, line truncation, ingest caps | T-005, T-010 (+Could sub-step) |
| §4.6 rules V1–V16 | T-011 (V1–V7, V9, V10–V16), T-012 (V8) |
| §4.7 idempotency, id validation regex, locks, atomic writes, no failure caching | T-004, T-014 |
| §5.1 components (`errors.py`, `config.py`, `prompts.py`, `llm_drafts.py`, tests) | T-002, T-003, T-008, T-010 |
| §5.4 signatures (`generate_lesson_plan`, widened `validate_plan_against_index`, `answer_question(request, plan, index)`, `parse_structured`) | T-009, T-011, T-012, T-017 |
| §6.4 limits table | T-002 (settings), T-009, T-012, T-017 |
| §6.5 one structured log line per LLM call | T-009 |
| §6.6 hour-0 smoke CLI | T-013 |
| §8.1 routes, §8.2 error model | T-003, T-006, T-014, T-018 |
| §8.3 scanned/empty/partial/encrypted/not-a-PDF edge cases | T-005 |
| §8.4 persistence layout + fixtures regenerated by live code path | T-004, T-013 |
| §9 P1/P3 invariants I1–I8, Q1–Q5 | T-011 (validator), T-017, tests T-015/T-019; CP1–CP3 |
| §10 risks R1–R17 | §13 below |

### 2.2 Scaffold bugs listed in design §3 → tasks (all must be fixed)

| # | Scaffold bug (design §3) | Fixed by |
|---|---|---|
| S1 | `create_lesson` mints a UUID `lesson_id` per POST (not idempotent) | T-004, T-014 |
| S2 | Prompt summary `" ".join(s.text[:120] for s in index.spans[:40])` drops ids and 77 % of doc | T-010 (replaced by page-blocked renderer); old code deleted in T-014 |
| S3 | `get_lesson("les_demo")` returns plan with `lesson_id: les_doc_demo` (fixture re-keyed via `f"les_{document_id}"`) | T-007 (interim), T-014 (final) |
| S4 | `validate_plan_against_index` has no page check and takes `span_ids: set[str]` | T-011 |
| S5 | `qa.py` ignores `lesson_id` (always fixture) | T-018 |
| S6 | `upload_document` is `async def` running blocking PyMuPDF; orphan PDF on ingest failure | T-005, T-006 |
| S7 | `sample-document-index.json` had 3 spans | **Already resolved** (verified 175 spans / 4 pages / 12,236 chars, `doc_demo`); locked in by regression test in T-005 |
| S8 | `requirements.txt` pins `openai>=1.50.0` | T-001 |

### 2.3 Additional scaffold defects found while planning (not in design §3; small, in-scope fixes)

| # | Defect (verified in code) | Fix | Task |
|---|---|---|---|
| S9 | `main.py` reads `DATA_DIR` env, but `storage/local.py` hard-codes `DATA = ROOT/backend/data`; `.env.example` sets `DATA_DIR=./data` and nothing loads `.env` | single `config.py` resolves `DATA_DIR`, calls `load_dotenv`; storage uses it at call time | T-002, T-004 |
| S10 | `POST /documents?demo=true` still requires a multipart `file` (`File(...)`), so P1 cannot call demo mode without a body | make `file` optional | T-006 |
| S11 | `Span`/ids have no path-safety validation; `document_pdf_path` etc. build paths from raw ids | regex id validation (design §4.7) | T-004 |

### 2.4 Requirements (problem definition) → tasks

| Requirement | Task(s) |
|---|---|
| SC1: `POST /documents` ingests golden PDF (≥1 line unit/page); scanned/empty fails clearly | T-005, T-006, T-007b tests |
| SC2: `POST …/lessons` 200 with valid `LessonPlan` (3–12 segments, refs in index, `page`, `cues: []`) | T-011, T-012, T-014 |
| SC3: `POST …/qa` cited answers + `viewer_commands`; empty cites when ungrounded | T-017, T-018 |
| SC4: `doc_demo` path works with golden PDF | T-006, T-007, T-013, T-014 |
| NFR: < 60 s on golden doc (stretch); validate output; one retry | T-012, T-013 |
| Out of scope (not planned): voice LLM, LangGraph, Qdrant/embeddings, Supabase, OCR, `cues`, server lesson state | §14 DO NOT list |

### 2.5 Product / validation traceability

N/A — this is an engineering component of a hackathon MVP; no separate validation strategy artifact exists for P2. The only "validation" artifacts P2 produces are engineering evidence (latency numbers, repair/warning counts) used for the design's measured `paged` gate (§12).

---

## 3. Research Summary

### Search queries used (this plan, 2026-11-07)

1. Context7 `/openai/openai-python` — "responses.parse with text_format Pydantic model, output_parsed, reasoning effort, max_output_tokens, store, timeout and max_retries per request"
2. Context7 `/websites/fastapi_tiangolo` — "testing with TestClient, pytest, dependency overrides, httpx requirement; def vs async def path operations threadpool"
3. Exa — "OpenAI Responses API structured outputs reasoning effort max_output_tokens incomplete status reasoning tokens counted"
4. Exa — "Python atomic file write os.replace temp file same directory fsync best practice"
5. Exa — "PyMuPDF Document needs_pass is_encrypted page_count open from bytes check password protected PDF"
6. Context7 `/pytest-dev/pytest` — "monkeypatch.setattr and monkeypatch.setenv fixtures, tmp_path, custom markers registration in pytest.ini"
7. Exa — "PyMuPDF save encrypted PDF with user password … to generate test PDFs programmatically"
8. Local verification (not web): installed SDK version and `responses.parse` presence; `TestClient` import; golden fixture stats (see F1, F9, F10).

Inherited (not re-verified): design §12.4 sources for Structured Outputs schema subset, prompt caching, latency guide, model lineup/prices, PyMuPDF OCR, narration speech rates, citation validation.

### Key findings

| # | Finding | Source | Tier | Affects |
|---|---|---|---|---|
| F1 | The venv already has `openai==3.46.0` and `client.responses.parse` exists; the `requirements.txt` floor (`>=1.50.0`) is what is wrong. Pin must allow `responses.parse` and be frozen to what actually passes the ping. | local `pip list` + `hasattr(client.responses,'parse')`; [openai-python helpers.md](https://github.com/openai/openai-python/blob/main/helpers.md) via Context7 | 1 (maintainer) + local | T-001, T-009 |
| F2 | `max_output_tokens` bounds **total generated tokens including reasoning tokens**, visible output and formatting tokens; hitting it yields `status: "incomplete"`, `incomplete_details.reason: "max_output_tokens"`, possibly **before any visible output**. OpenAI suggests reserving at least 25,000 tokens when experimenting with reasoning models. Design's default of 6,000 is therefore a *risk*, not a given. | [OpenAI — Reasoning models](https://developers.openai.com/api/docs/guides/reasoning) | 1 (official) | T-002 (env-tunable cap), T-009, T-012, RK-02 |
| F3 | `reasoning.effort` is a documented Responses API parameter with values `none`, `minimal`, `low`, `medium`, `high`, `xhigh`, `max`; which values a *given model* accepts is not stated → keep env-driven, omit param when empty, confirm in ping. Reasoning token counts appear in `usage.output_tokens_details.reasoning_tokens`. | [OpenAI API reference — responses.create](https://developers.openai.com/api/reference/resources/responses/methods/create); [Reasoning models](https://developers.openai.com/api/docs/guides/reasoning) | 1 | T-002, T-009 |
| F4 | `output_parsed` returns the first parsed result or `None`; **invalid JSON / schema-invalid text in an eligible message still raises a validation error** (not `None`). Both paths must be handled and mapped to "attempt failed". | [openai-python helpers.md](https://github.com/openai/openai-python/blob/main/helpers.md) via Context7 | 1 | T-009 |
| F5 | Per-request `timeout` and `max_retries` are set with `client.with_options(timeout=…, max_retries=…)`; timeouts raise `APITimeoutError`; SDK default is 2 retries (timed-out requests retried too). `max_retries=0` disables. `httpx2` is the transport type in this SDK generation. | [openai-python README](https://github.com/openai/openai-python/blob/main/README.md) via Context7 | 1 | T-009 |
| F6 | Sync `def` path operations (and dependencies) run in an external threadpool, which is why a `threading.Lock` per document is the correct concurrency primitive; blocking PyMuPDF/OpenAI calls must not live in `async def`. | [FastAPI — async](https://fastapi.tiangolo.com/async/) via Context7 | 1 | T-006, T-014, T-018 |
| F7 | `TestClient` is the documented way to test; plain `def` tests, no `await`; it needs `httpx` (here `TestClient` imports fine with the installed HTTP stack — verify in T-001). | [FastAPI — testing](https://fastapi.tiangolo.com/tutorial/testing/) via Context7 | 1 | T-001, T-007b |
| F8 | Atomic JSON write pattern: serialise fully first, create a **unique temp file in the same directory** (`tempfile.mkstemp(dir=…)`), write, flush, `fsync`, `os.replace`; never a fixed shared temp name; cleanup temp in `finally`. Atomic replace ≠ read-modify-write isolation (hence the lock). Directory `fsync` is a durability nicety, not needed for this MVP. | [python-atomicwrites docs](https://python-atomicwrites.readthedocs.io/en/stable/); [Prep With Proof — atomic writes](https://prepwithproof.com/blog/python-atomic-file-write-os-replace-tempfile) (tier 4, corroborates); [atomic-json-io](https://github.com/JohnLinotte/atomic-json-io) (tier 5) | 3–5 | T-004 |
| F9 | PyMuPDF: open from memory with `pymupdf.open(stream=bytes, filetype="pdf")` (no temp file needed → no orphan PDF); `doc.needs_pass` = password required. A PDF with only an **owner** password is readable (`authenticate("")==2`) and PyMuPDF ignores restriction flags — so reject on `needs_pass`, do not reject merely because `is_encrypted` is true (refinement of design §8.3 wording; see §4 G-05). | [PyMuPDF document.rst](https://github.com/pymupdf/PyMuPDF/blob/main/docs/document.rst); [PyMuPDF the-basics](https://pymupdf.readthedocs.io/en/latest/the-basics.html) | 1 | T-005 |
| F10 | Test PDFs can be generated in-test with PyMuPDF (`Document.save(..., user_pw=…, encryption=PDF_ENCRYPT_AES_256)` for an encrypted file; new empty doc + `insert_text`/blank pages for text/scanned cases) → no binary fixtures to commit. | [Artifex — Save a PDF with PyMuPDF](https://artifex.com/blog/how-to-save-a-pdf-document-with-pymupdf-encryption-incremental-saving) | 2 (vendor blog) | T-007b |
| F11 | pytest: `monkeypatch.setattr` (incl. string target form), `monkeypatch.setenv`, `tmp_path`; custom markers registered in `pytest.ini`. | [pytest docs](https://github.com/pytest-dev/pytest/blob/main/doc/en/how-to/monkeypatch.rst) via Context7 | 1 | T-001, all test tasks |
| F12 | Local fact: golden index = 4 pages, 175 spans (46/43/56/30 per page), 12,236 chars, longest line 103 chars; `p1_l2` is the running footer-style line `Page 1`. Design estimate was ≈10k chars; actual ≈12.2k chars ≈ 3k tokens — still far inside both prompt budgets. | local read of `shared/fixtures/sample-document-index.json` | local | T-005, T-010, T-013 |

### Implications for tasks

- T-002 makes `max_output_tokens` env-tunable (additive; design values stay the defaults) because F2 says 6,000 might truncate; T-009 ping prints `reasoning_tokens` so the number is chosen from data.
- T-009 must treat *three* "no parsed result" shapes uniformly: `output_parsed is None` (refusal/no eligible message), `status == "incomplete"`, and the SDK validation error from invalid/truncated JSON (F4).
- T-005 reads the PDF from memory (F9) and persists bytes only after extraction succeeds.

---

## 4. Design–Plan Conflicts and Gaps

None of these requires editing the design; each has a default adopted by this plan. **Items marked ⚑ need a one-line P2-owner confirmation at approval time**; if rejected, the stated fallback applies. None blocks starting M0/M1.

| ID | Issue | Impact | Plan default / recommended resolution |
|---|---|---|---|
| G-01 ⚑ | Design §4.5 says "above T1, the ingest cap would already have rejected the file", but `MAX_TOTAL_CHARS=80_000` (ingest) vs plan-prompt budget 24k chars (T0) are inconsistent: an 80k-char PDF passes ingest but exceeds the plan prompt budget even with line cap 160. | Prompt could be ~20k tokens for plan call; latency impact small (input tokens barely move latency per design/latency guide); no correctness impact. | **Send anyway** with a logged `prompt_over_budget` warning (no rejection). Alternative if owner prefers: lower `MAX_TOTAL_CHARS` — would reject legitimate dense 10-page docs, so not chosen. If `paged` is ever enabled, it removes the issue. |
| G-02 | Design §4.2 L3 says drop invalid segments after retry and accept if ≥3 remain, but I6/V8 say 5–12 segments. Final accepted range is therefore **3–12**; design is silent on **>12** segments after the final attempt. | Contract schema itself has no min/max items; 12 is a design/problem-definition bound. | After the final attempt, if >12 segments: keep the first 12 (document order), re-chain `next`, log warning `segments_truncated`. >12 on attempt 1 triggers the retry as a hard violation (V8) as designed. |
| G-03 ⚑ | Design §4.3: "retry is skipped if more than 45 s elapsed (return 502/504 **instead**)". It is unclear whether, when the retry is skipped, a first-attempt result with ≥3 valid segments should still be accepted via L3. | UX vs strictness on slow calls. | Follow the design literally: **no retry ⇒ error** (504 if the failure was a timeout, else 502); hard violations never leave the server. One-line alternative (apply L3 to attempt 1 when ≥3 valid segments) noted for the owner; not implemented unless approved. |
| G-04 | Design §4.3 numbers: per-call timeout 45 s, retry allowed up to 45 s elapsed, but request-wide deadline 80 s ⇒ 45 + 45 = 90 > 80. | Worst case would exceed the stated deadline. | Per-attempt timeout = `min(PLAN_TIMEOUT_S, PLAN_DEADLINE_S − elapsed)`; retry skipped if `elapsed > PLAN_RETRY_CUTOFF_S` **or** remaining deadline < 10 s. P1 timeout ≥ 90 s still holds. |
| G-05 | Design §8.3 lists "Encrypted: `doc.needs_pass` / `is_encrypted` → 422". Per PyMuPDF docs (F9), owner-password-only PDFs are readable. | Rejecting them would refuse extractable PDFs. | Reject when `needs_pass` is true. If `is_encrypted and not needs_pass`, accept and log. Message unchanged: "PDF is password-protected". |
| G-06 | Design §8.2 vs §8.3: "too few lines/chars" → 'Not enough text to build a lesson' vs "scanned message" for `total_chars < MIN_TOTAL_CHARS or lines < MIN_LINES`. | Which message when text exists but is small. | `total_chars == 0` **or** `empty_pages/n_pages > 0.5` → scanned message; else `< MIN_TOTAL_CHARS` or `< MIN_LINES` → "Not enough text to build a lesson". Both 422. |
| G-07 ⚑ | Design §5.4 says "`doc_demo` demo fixture short-circuit lives in the route" for Q&A but §8.1/§8.4 only specify fixture serving for document/lesson routes. A permanent canned Q&A answer for `les_demo` would make the demo ignore the question. | Demo realism vs insurance; P3 also needs *some* QA response before a key is configured. | `les_demo` Q&A runs **live** against fixture plan + fixture index. **Only** when the call fails with `NotConfiguredError`/upstream/timeout **and** `lesson_id == "les_demo"` does the route return `sample-qa-response.json` (logged `qa_demo_fallback`). Six lines in `qa.py`; delete if rejected. |
| G-08 | `?force=true` on `doc_demo` (design §4.3: "only way to re-run live"): where does the result go? | Ambiguity about overwriting fixtures. | Forced demo run executes the live pipeline against the fixture index, returns the plan, writes `backend/data/les_demo.lesson.json` + meta, **never** touches `shared/fixtures/**`. `GET /lessons/les_demo` and `les_demo` Q&A keep serving the fixture. Fixtures change only via the T-013 CLI `--write-fixtures`. |
| G-09 | Design §5.4 `parse_structured(model, system, user, schema, …)` has a single `user` argument, but the ladder retry needs `[prefix, previous draft (assistant), feedback (user)]`. | Interface detail. | Generalise to `parse_structured(model, system, turns, schema, …)` where `turns` is an ordered list of `(role, text)`; the first user turn = stable document block + dynamic suffix last (cache-friendly), retry appends assistant draft + user feedback. Additive; sketch intent preserved. |
| G-10 | Design §6.4 fixes `max_output_tokens` 6000/1200; F2 suggests larger reasoning headroom. | Possible `incomplete` on the first call. | Defaults stay 6000 / 1200 per design; env overrides `PLAN_MAX_OUTPUT_TOKENS` / `QA_MAX_OUTPUT_TOKENS` added (additive). Ping + CLI print `reasoning_tokens`; T-013 gate step: if reasoning tokens ≳ 50 % of the cap, raise the env default. |
| G-11 | Design §4.2 "duplicate/overlapping segments (>80 % overlap)" does not define the ratio. | Implementation choice. | `overlap = |A ∩ B| / |B|` where B is the later segment (in document order); drop B if > 0.8. |
| G-12 | Design §4.4 mentions "Resume semantics" and bridge but not what `QARequest.lesson_id` (body) does when it differs from the path. | Ambiguity. | Path param is authoritative; body `lesson_id` is ignored (mismatch logged at INFO). |
| G-13 | Design §8.1 `GET /documents/{id}` status field. | None. | No change; always `ready` or 404 (design). |
| G-14 | `frontend/public/fixtures/*` are copies owned by P1 (and `git status` shows `frontend/public/fixtures/sample-document-index.json` already modified). P2 must not edit `frontend/**`. | Fixture drift between `shared/` and `frontend/public/`. | T-013 writes only `shared/fixtures/**`; hand-off message in CP-F asks P1 to copy. |
| G-15 | Design header says `sample-document-index.json` regeneration is "pending"; requester states it is done. | None. | Verified done (F12). T-013 only rewrites the index if `(span_id, page, text)` differs from the current file. |

If G-01, G-03, or G-07 are rejected, the executor swaps in the stated alternative — no re-planning needed.

---

## 5. Work Breakdown Structure

Conventions for **all** tasks:
- Python commands run with cwd `backend/` using `.venv/bin/python` (e.g. `.venv/bin/python -m pytest -q`). The root `README` uses `uvicorn app.main:app --reload --app-dir . --port 8000` (single worker; `--reload` restarts on file save — do not edit files while a live generation is running).
- **Priority tags** map to design §5.5: **[Must]**, **[Should]**, **[Could]**, **[Won't unless gate trips]**.
- "Stub the LLM" in tests means `monkeypatch.setattr("app.services.llm.parse_structured", fake)`. Services therefore **must call `llm.parse_structured(...)` through the module** (`from app.services import llm`), never `from … import parse_structured`, so the stub takes effect.
- No schema in `shared/schemas/**` changes. No edits to `frontend/**`.

---

### Milestone M0 — Foundation

#### T-001: Dependency, env template, and test tooling baseline
- **Priority:** [Must] **Effort:** S **Dependencies:** — **Design ref:** §6.1 (Dependency), §10 R17
- **Description:** Fix the stale `openai` pin; make `.env` loading and test tooling explicit.
- **Inputs:** `backend/requirements.txt`, `backend/.env.example`, installed venv (`openai==3.46.0`, `python-dotenv==1.2.4`, `pytest` **not** installed).
- **Outputs:**
  - `backend/requirements.txt`: replace `openai>=1.50.0` with a floor that ships `responses.parse` — `openai>=3.46.0,<4` (finding F1; if the executor's `pip install -U openai` resolves a different major, pin to the version that passes the T-009 ping and record it in the execution log); add `python-dotenv>=1.0`.
  - New `backend/requirements-dev.txt`: `-r requirements.txt` plus `pytest>=8`; add `httpx` only if `from fastapi.testclient import TestClient` fails (F7).
  - New `backend/pytest.ini`: `[pytest]` with `testpaths = tests`, `pythonpath = .`, and a registered marker `live: calls the real OpenAI API (skipped unless OPENAI_API_KEY set)` (F11).
  - `backend/.env.example`: add every variable from §7 with the design defaults and a one-line comment each (`OPENAI_API_KEY=` left blank).
- **Acceptance criteria:**
  - [ ] `.venv/bin/pip install -r requirements-dev.txt` succeeds.
  - [ ] `.venv/bin/python -c "from openai import OpenAI; assert hasattr(OpenAI(api_key='x').responses,'parse')"` exits 0.
  - [ ] `.venv/bin/python -c "from fastapi.testclient import TestClient"` exits 0.
  - [ ] `.venv/bin/python -m pytest -q` runs (0 tests collected is fine at this point).
  - [ ] `.env.example` lists all §7 variables; `.env` remains gitignored (already in `.gitignore`).

#### T-002: `config.py` + wire `main.py` to it
- **Priority:** [Must] **Effort:** S **Dependencies:** T-001 **Design ref:** §5.1 Config, §4.5 caps, §6.4, D7, S9
- **Description:** One source of truth for env-driven settings, read **at call time** so tests can `monkeypatch.setenv`.
- **Inputs:** §7 variable table; `backend/app/main.py`.
- **Outputs:**
  - New `backend/app/config.py`: calls `load_dotenv(<backend>/.env)` once at import (`override=False`); exposes `get_settings()` returning a frozen dataclass built from `os.environ` on each call; includes `data_dir`, `fixtures_dir`, ingest caps, model/effort/tier/strategy, timeouts, deadline, retry cutoff, output-token caps, CORS origins. Empty-string effort/tier means "omit the parameter".
  - `backend/app/main.py`: use `get_settings().data_dir` (create it), CORS from settings; register the `AppError` handler (added in T-003); keep router includes unchanged (including `voice`).
- **Acceptance criteria:**
  - [ ] With no env set, `get_settings()` returns the design defaults (models `gpt-6.1-terra`, effort `low`, caps 10 / 80000 / 200 / 10 / 20, timeouts 45 / 20, deadline 80, cutoff 45, tokens 6000 / 1200, strategy `single`).
  - [ ] `DATA_DIR=/tmp/x` (via env) changes `data_dir`; relative `DATA_DIR` (as in `.env.example`) resolves against `backend/`, not the process cwd.
  - [ ] `GET /health` still returns 200 and CORS headers for `http://localhost:3000` are unchanged.

#### T-003: `errors.py` + FastAPI handler
- **Priority:** [Must] **Effort:** S **Dependencies:** T-002 **Design ref:** §5.1 Errors, §8.2, §4.3 failure modes
- **Description:** Typed exceptions carrying an HTTP status and a **safe** `detail`; one handler returns the default FastAPI body shape `{"detail": "<string>"}` (no shape change for P1).
- **Outputs:** New `backend/app/errors.py` with: `AppError(status_code, detail)` base; `IngestError` (400/413/422, detail per §8.2); `NotFoundError` (404; "Document not found" / "Lesson not found" / "Segment not found"); `NotConfiguredError` (503, "Lesson generator is not configured"); `LLMTimeoutError` (504, "Lesson generation timed out. Please try again."); `LLMUpstreamError` and `PlanInvalidError` (502, "Lesson generation failed. Please try again."); a `with_detail(str)` helper so Q&A can re-raise with "Couldn't answer right now."; handler function registered in `main.py` (T-002 reserved the hook).
- **Acceptance criteria:**
  - [ ] Unit test raises each error in a tiny test app/route and asserts status + exact `detail` string from design §8.2.
  - [ ] No error message ever contains provider text, stack traces, file paths, or keys (asserted for `LLMUpstreamError` constructed from a fake exception whose message contains `sk-test`).

#### T-004: `storage/local.py` hardening
- **Priority:** [Must] **Effort:** M **Dependencies:** T-002, T-003 **Design ref:** §4.7, §8.4, S1, S3, S9, S11
- **Description:** Replace module constants with call-time paths; add id validation, deterministic lesson ids, atomic writes, locks, and loaders (including demo fixtures). Remove the `use_fixture`-style re-keying.
- **Inputs:** existing `storage/local.py`; T-002 settings.
- **Outputs (all in `storage/local.py`):**
  - `data_dir()` (from settings; mkdir) replacing the `DATA` constant (update imports in `documents.py` in T-006).
  - `DEMO_DOCUMENT_ID="doc_demo"`, `DEMO_LESSON_ID="les_demo"`; `GOLDEN_PDF_FALLBACK` retained.
  - `require_document_id(id)` / `require_lesson_id(id)` against `^doc_[a-z0-9]{1,32}$` / `^les_[a-z0-9]{1,32}$`; invalid → `NotFoundError` (same detail as not-found; no path logic leaked).
  - `lesson_id_for(document_id) -> "les_" + document_id.removeprefix("doc_")`; `lesson_id_for("doc_demo") == "les_demo"`.
  - `atomic_write_text(path, text)` / `atomic_write_bytes(path, data)`: serialise first, `tempfile.mkstemp(dir=<same dir>)`, write, flush, `os.fsync`, `os.replace`, remove temp in `finally` (F8). Unique temp names (never a shared fixed name).
  - `save_index`, `save_plan`, `save_meta` (`{lesson_id}.meta.json`), `save_pdf_bytes`; path builders `document_pdf_path`, `document_index_path`, `lesson_plan_path`, `lesson_meta_path`.
  - `load_index(document_id)` (demo → fixture; missing/corrupt → `NotFoundError`), `load_plan(lesson_id)` (`les_demo` → fixture **returned unmodified** so its `lesson_id` is `les_demo`), `try_load_plan(lesson_id)` returning `None` on missing/corrupt/invalid (used by the cache check).
  - `document_lock(document_id)`: context manager over a per-document `threading.Lock` held in a dict guarded by a global lock (single uvicorn worker assumption stated in README, T-021).
- **Acceptance criteria:**
  - [ ] Unit tests: ids like `../x`, `doc_`, `doc_ABC`, 33-char suffix, `les_../a` are rejected; `doc_a1b2c3d4e5f6` and `doc_demo` accepted.
  - [ ] `lesson_id_for("doc_a1b2c3d4e5f6") == "les_a1b2c3d4e5f6"`; `lesson_id_for("doc_demo") == "les_demo"`.
  - [ ] `atomic_write_*`: simulated failure mid-write (monkeypatch `os.replace` to raise) leaves the original file intact and no stray temp file; two threads writing the same path never produce a corrupt file.
  - [ ] `load_plan("les_demo").lesson_id == "les_demo"` and `.document_id == "doc_demo"` (fixes S3).
  - [ ] Two threads entering `document_lock("doc_x")` are serialised; different documents do not block each other.

---

### Milestone M1 — Ingest (unblocks P1)

#### T-005: Ingest guards, bytes-based extraction, golden regression
- **Priority:** [Must] **Effort:** M **Dependencies:** T-003 **Design ref:** §4.5 caps, §8.2, §8.3, S6, S7, F9, G-05, G-06
- **Description:** Harden `extract_document_index` without changing id/line semantics, and add typed ingest failures.
- **Inputs:** `services/pdf_extract.py` (line-extraction loop **must not change**: block order, `line_idx` assignment, `" ".join(parts)`, union bbox — fixture ids depend on it).
- **Outputs (`pdf_extract.py`):**
  - Accept `source: Path | bytes`; bytes opened via `pymupdf.open(stream=data, filetype="pdf")` so no file is written before success (F9). The CLI `__main__` keeps the `Path` form.
  - Before extraction: open failure → `IngestError(422, "Could not read PDF")`; `needs_pass` → `IngestError(422, "PDF is password-protected")` (G-05); `page_count > MAX_PAGES` → `IngestError(422, "PDF has N pages; the limit is 10")`.
  - After extraction (per G-06): compute `empty_pages` (pages with zero line units); `total_chars == 0` or `empty_pages/n_pages > 0.5` → 422 "This PDF has no selectable text (scanned?). Upload a text-based PDF — OCR isn't supported yet."; `total_chars < MIN_TOTAL_CHARS` or `lines < MIN_LINES` → 422 "Not enough text to build a lesson"; `total_chars > MAX_TOTAL_CHARS` → 422 "PDF has too much text for an MVP lesson (limit 80,000 characters)". Partially scanned (≤ 50 % empty) accepted; log `empty_pages=[…]`.
  - Log one INFO line with `pages`, `line_units`, `chars`, `empty_pages` (outline "optional line-count stats").
  - Always `doc.close()` (use try/finally).
- **Acceptance criteria:**
  - [ ] **Golden regression test:** extracting `shared/fixtures/golden-demo.pdf` yields 4 pages, 175 spans, and the `(span_id, page, text)` list equals `sample-document-index.json` (locks S7/F12).
  - [ ] Generated-in-test PDFs (F10): encrypted-with-user-password → 422 password message; blank/image-only pages → 422 scanned message; 11 pages → 422 page-limit message with N; one short line → 422 not-enough-text; garbage bytes → 422 "Could not read PDF".
  - [ ] An owner-password-only PDF (if constructible via `owner_pw` without `user_pw`) is accepted (G-05) — if PyMuPDF cannot construct it in the sandbox, document and skip.
  - [ ] `python -m app.services.pdf_extract ../shared/fixtures/golden-demo.pdf` still prints `pages=4 line_units=175`.

#### T-006: Rewrite `api/documents.py` (sync, no orphans, id validation)
- **Priority:** [Must] **Effort:** M **Dependencies:** T-004, T-005 **Design ref:** §8.1, §8.2, S6, S10
- **Description:** Sync handlers; guard order: demo shortcut → content-type → bounded read → magic bytes → extract → persist.
- **Outputs (`api/documents.py`):**
  - `upload_document` becomes plain `def`; `file: UploadFile | None = File(None)` so `?demo=true` works without a body (S10); demo → `UploadResponse(doc_demo, ready)` unchanged.
  - Content-type must be `application/pdf` or `application/octet-stream` else 400 "Expected a PDF file"; read at most `MAX_UPLOAD_MB*1MiB + 1` bytes → 413 "PDF exceeds 20 MB limit"; first 5 bytes must be `%PDF-` else 400 "Expected a PDF file"; missing file (non-demo) → 400 or 422 (FastAPI default 422 acceptable).
  - `document_id = f"doc_{uuid4().hex[:12]}"` (unchanged format); run extraction **from bytes**; only after success: `save_pdf_bytes` then `save_index` (index existence = ready marker); if `save_index` fails, remove the PDF.
  - `GET /documents/{id}`, `/index`, `/file`: call `require_document_id`; demo from fixtures; `/index` returns the same body via a shared helper (no calling route functions from route functions); `/file` for `doc_demo` streams `golden-demo.pdf` (existing message retained if missing).
- **Acceptance criteria:**
  - [ ] Upload of the golden PDF returns `{document_id: "doc_<12 hex>", status: "ready"}`; `GET /documents/{id}` returns 175 spans; `/index` body equals `GET /documents/{id}`'s `index`; `/file` returns `application/pdf` bytes identical to the upload.
  - [ ] A failed ingest (e.g. password PDF) leaves **no** `*.pdf` or `*.index.json` in the data dir (S6).
  - [ ] Status codes/details exactly match design §8.2 for: non-PDF 400, oversized 413 (limit lowered via env in test), password/corrupt/scanned/few-lines/too-many-pages 422.
  - [ ] `POST /documents?demo=true` with **no** file returns `doc_demo` ready.
  - [ ] `GET /documents/..%2Fx`-style or malformed ids return 404 "Document not found".
  - [ ] While a slow upload is processed, `GET /health` is not blocked (handler is sync → threadpool; asserted by code inspection + a manual concurrent curl).

#### T-007: Interim lessons route fix (demo consistency, clean non-demo failure)
- **Priority:** [Must] **Effort:** S **Dependencies:** T-004 **Design ref:** S3, §8.1
- **Description:** Stop P1 hitting a 500 `NotImplementedError` while M2/M3 are built. This task is **superseded and deleted by T-014**; keep it minimal.
- **Outputs (`api/lessons.py`, `services/lesson_generator.py`):** `GET /lessons/les_demo` and `POST /documents/doc_demo/lessons` return the fixture plan **unmodified** (`lesson_id: les_demo`); `POST` for any other document returns 503 "Lesson generator is not configured" via `NotConfiguredError` (placeholder) after validating the document exists (404 otherwise). `generate_lesson_plan(..., use_fixture)` is no longer used by the route.
- **Acceptance criteria:**
  - [ ] `GET /lessons/les_demo` → `lesson_id == "les_demo"`, `document_id == "doc_demo"`.
  - [ ] `POST /documents/<uploaded id>/lessons` → 503 with the §8.2 string (not 500).
  - [ ] `POST /documents/doc_unknown/lessons` → 404.

#### T-007b: Tests for M1
- **Priority:** [Must] **Effort:** M **Dependencies:** T-006, T-007 **Design ref:** §8.1–8.3, F7, F10, F11
- **Description:** `backend/tests/` with shared fixtures: `client` (TestClient with `DATA_DIR` pointed at `tmp_path` via `monkeypatch.setenv`), `golden_pdf_bytes`, PDF builders (encrypted, scanned/blank, 11-page, tiny) generated with PyMuPDF.
- **Outputs:** `backend/tests/conftest.py`, `test_storage.py` (from T-004), `test_ingest.py` (T-005), `test_documents_api.py` (T-006), `test_lessons_interim.py` (T-007).
- **Acceptance criteria:** `.venv/bin/python -m pytest -q` is green; no test requires a network or an API key; no test writes under `backend/data/` or `shared/fixtures/`.

> **Checkpoint CP1 (after T-007b) — hand-off to P1** (message template in §9): upload works with real PDFs; real error statuses/details; `?demo=true`; `/file` bytes; interim lesson behaviour.

---

### Milestone M2 — Plan engine (largest block; pure logic first except the early ping)

#### T-008: `models/llm_drafts.py` (LLM-facing draft schemas)
- **Priority:** [Must] **Effort:** S **Dependencies:** T-001 **Design ref:** §4.1, §4.4 "Output", D1, D2
- **Outputs:** New `backend/app/models/llm_drafts.py`:
  - `DraftSegment`: fields **in this order**: `goal: str`, `page: int`, `line_start: int`, `line_end: int`, `narration: str`.
  - `PlanDraft`: `title: str`, `segments: list[DraftSegment]`.
  - `QADraft`: `answerable: bool`, `answer: str`, `cites: list[int]`, `bridge: str`.
  - All fields required (no defaults, no `Optional`), **no** `Field(min_length/ge/le/…)` constraints, no `Literal`/enums (constraint-free draft schema, design §4.1).
  - `schemas.py` (contract models) is **not** touched.
- **Acceptance criteria:**
  - [ ] Test: `PlanDraft.model_json_schema()` and `QADraft.model_json_schema()` contain no `minimum`, `maximum`, `minLength`, `maxLength`, `minItems`, `maxItems`, `default`, `anyOf`/`oneOf`; every property is in `required`; key order in the schema equals declaration order (`page, line_start, line_end` precede `narration`).
  - [ ] `git diff --stat -- backend/app/models/schemas.py shared/schemas` is empty after this task (contract models and schemas untouched).

#### T-009: `llm.py` — `parse_structured`, logging, error mapping, `--ping`
- **Priority:** [Must] **Effort:** M **Dependencies:** T-002, T-003, T-008; **external:** `OPENAI_API_KEY` **Design ref:** §4.3, §5.4, §6.1, §6.4, §6.5, D7, F2–F5, G-09, G-10
- **Description:** The single seam to OpenAI. Do this **first within M2** so model-name/effort/truncation surprises surface before logic is built on them.
- **Outputs (`services/llm.py`):**
  - `get_client()` retained (lazy, `max_retries=0` default on the client; per-call overrides through `client.with_options(timeout=…, max_retries=…)`, F5). Missing/blank key → `NotConfiguredError` **before** any network call.
  - `parse_structured(model, system, turns, schema, *, max_output_tokens, timeout, max_retries, prompt_cache_key, reasoning_effort, service_tier) -> ParsedResult`, calling `client.responses.parse(model=…, input=[system, *turns], text_format=schema, max_output_tokens=…, store=False, …)`. `reasoning={"effort": …}` only if effort non-empty; `service_tier` only if set; `prompt_cache_key` only if given.
  - `ParsedResult`: `parsed` (Pydantic instance or `None`), `failure` (`None | "refusal" | "incomplete" | "invalid"`), `status`, `incomplete_reason`, `usage` (`input_tokens`, `output_tokens`, `cached_tokens`, `reasoning_tokens`), `duration_ms`, `model`, `kind`.
  - Handles all three "no usable result" shapes uniformly (F4): `output_parsed is None`; `status == "incomplete"` (record `incomplete_details.reason`); SDK validation error from invalid/truncated JSON (caught and mapped to `failure="invalid"`; **verified empirically in the ping**, below).
  - Transport errors map to typed errors without leaking provider text: `APITimeoutError → LLMTimeoutError`; connection/rate-limit/status errors → `LLMUpstreamError`.
  - One structured log line per call via logger `lesson.llm`: `{kind, model, attempt, duration_ms, input_tokens, output_tokens, cached_tokens, reasoning_tokens, status, failure}`; never logs prompts, keys, or provider messages.
  - `python -m app.services.llm --ping`: (1) one tiny structured call (inline Pydantic schema) with the plan model/effort from settings → prints parsed value, latency, usage incl. `reasoning_tokens`; (2) one **deliberately truncated** call (`max_output_tokens` very small) → prints which failure shape occurred (`incomplete` vs `invalid` vs exception) so the code path is confirmed; (3) repeats (1) for the QA model if different; (4) exits non-zero if any call is rejected (400 unsupported effort/model).
- **Acceptance criteria:**
  - [ ] Unit tests with a fake client: `output_parsed=None` → `failure="refusal"`; `status="incomplete"` → `failure="incomplete"`; SDK validation error → `failure="invalid"`; timeout/connection/429/500 → correct typed error; blank key → `NotConfiguredError` without constructing a network call; reasoning/service_tier/prompt_cache_key are omitted when unset.
  - [ ] **Live (once, manual):** `.venv/bin/python -m app.services.llm --ping` exits 0 with the configured models (`gpt-6.1-terra`, effort `low`); if a value is rejected, set the env fallback (`OPENAI_PLAN_EFFORT=` empty, or model → `gpt-6-luna` → `gpt-4o-mini`) and record the working configuration + SDK version in the execution log (resolves design Q1; updates the T-001 pin if needed).
  - [ ] Ping output records `reasoning_tokens` and the truncated-call failure shape in the execution log (informs G-10 and T-012's retry trigger).

#### T-010: `prompts.py` — plan side (renderer, target_n, system/user/feedback builders)
- **Priority:** [Must] (core); boilerplate suppression sub-step [Could] **Effort:** M **Dependencies:** T-008 **Design ref:** §4.5, §6.2, §4.1 segment budget, S2, G-01
- **Outputs (new `services/prompts.py`):**
  - `PROMPT_VERSION_PLAN = "plan-v1"` (and `PROMPT_VERSION_QA = "qa-v1"` reserved for T-016).
  - `render_plan_index(index, *, line_cap=220, suppress=True) -> (text, stats)`: `## Page {n}` header then `l{i}: {text}` per line (`i` parsed from `p{n}_l{i}`); each line truncated at `line_cap` with `…`; wrapped in `<DOCUMENT>…</DOCUMENT>`; **never renumbers**. Budget tiers: T0 (cap 220) ≤ 24k chars; if exceeded T1 (cap 160); if still exceeded proceed and set `stats.over_budget=True` (G-01).
  - **[Could] sub-step:** `detect_boilerplate(index) -> set[span_id]`: lines that are only digits/roman numerals, or whose digit-normalised text repeats on ≥ `max(2, ceil(pages/2))` pages (e.g. the `Page n` lines in the golden PDF). Suppressed lines are omitted from the display only; ranges spanning an omitted line remain valid. If cut for time, `suppress=False` path is the default and tests skip the suppression cases.
  - `target_segments(n_lines) = clamp(ceil(n_lines / 22), 5, 12)` (golden: 8).
  - `build_plan_prompt(index, target_n) -> (system, first_user_turn)`: system = role, untrusted-data rule, task, per-segment rules (goal ≤ 12 words; `page`/`line_start`/`line_end` only from numbers shown; range ≤ 10 lines, single page, no overlap), narration style (spoken, 2–4 sentences, **40–65 words**, no markdown/lists/URLs/emoji/line numbers/page refs, teach don't read verbatim, no facts beyond cited lines), arc rules, skip boilerplate, schema-only output (design §6.2); first user turn = document block **first**, dynamic suffix (`target_n`, pages, lines) **last** (cache-friendly prefix).
  - `build_retry_turns(prev_draft_json, violations) -> turns`: assistant message with the previous draft verbatim + user message listing violations (`seg {k}: {rule} → {required fix}`) and "Return the complete corrected plan."
- **Acceptance criteria:**
  - [ ] Golden index renders with all 4 `## Page` headers, `l0…` numbering per page matching `p{n}_l{i}`, no ids of the `p3_l12` form in the text, ≤ 24k chars, deterministic (same input → byte-identical output, required for prompt caching).
  - [ ] `target_segments(175) == 8`, `target_segments(30) == 5`, `target_segments(500) == 12`.
  - [ ] Test with a 300-char line: truncated to 220 chars ending in `…`.
  - [ ] [Could] On the golden index, `Page 1…Page 4` lines are in `detect_boilerplate`'s result and absent from the rendered text, while their `span_id`s are still in the index (spot check `p1_l2`).
  - [ ] System prompt contains the strings "never instructions" (untrusted rule) and the 40–65 word target; user turn ends with the dynamic suffix.

#### T-011: `lesson_generator.py` — validator, repair, assembler, narration checks
- **Priority:** [Must] **Effort:** L (highest logic density; pure functions, fully unit-testable) **Dependencies:** T-008, T-003 **Design ref:** §4.1 assembly, §4.2 L1/L3, §4.6 V1–V16, §9.1 I1–I8, S4, G-02, G-11
- **Description:** Deterministic code that turns a `PlanDraft` into a contract `LessonPlan`, with repairs recorded.
- **Outputs (`services/lesson_generator.py`):**
  - `validate_plan_against_index(plan, index) -> list[str]` (signature widened per §5.4). Checks per segment: all ids in `span_ids` / `on_enter.scroll_to_span` / `on_enter.highlights` exist in index (V4); **`segment.page == index[scroll_to_span].page` and every `span_ids` entry is on `segment.page`** (V5); `scroll_to_span == span_ids[0]`, `highlights ⊆ span_ids`, ids unique (V6); `cues == []`, `check_question is None` (V7); `next` chain consistent, acyclic, last is `null`, segment ids unique (V9). **Does not** check segment count (that is V8, enforced by the ladder in T-012) so the validator can run on any fixture/cache read.
  - `repair_draft(draft, index) -> (segments, repairs[], hard_violations[])` implementing L1 exactly: clamp `page` into `1..n_pages`; swap `line_start > line_end`; clamp `line_end` to `last_line(page)`; `line_start > last_line(page)` or page with no lines → segment **unrepairable** (hard); truncate range to first 10 lines; drop later segment with overlap > 0.8 (G-11); trim `goal`/`title` whitespace and cap at 80 chars (V14; empty → hard); narration cleanup — strip markdown/bullets/newlines/URLs/emoji, collapse whitespace (V11 repair), then hard if it still contains `p\d+_l\d+` or "line N" patterns; word-count bands (V10: hard `<15` or `>110`, soft-log 20–29 / 81–100); sentence count 2–4 soft (V12); document-order monotonic soft warn (V13); coverage % of non-boilerplate lines recorded (V16).
  - `assemble_plan(segments, index, *, lesson_id, title) -> LessonPlan`: `id=seg_{NN}` (zero-padded, 1-based), `span_ids = [p{page}_l{i} …]` checked against the index, `on_enter = {scroll_to_span: span_ids[0], highlights: span_ids}`, `cues=[]`, `check_question=None`, `next = seg_{NN+1}` / `None` on last, `document_id` from the index.
  - `drop_and_rechain(segments)` helper for L3 (renumber ids, rechain `next`).
  - Hard/soft classification returned as structured data (`rule`, `segment_index`, `message`) so T-012 can both build retry feedback and the meta sidecar.
- **Acceptance criteria:**
  - [ ] **Table-driven unit tests, one case per rule** V1–V7, V9–V15 (e.g. page 9 on a 4-page doc → clamped to 4 then range-checked; `line_end` 214 on a 43-line page → clamped; start 80 on 43-line page → unrepairable; start>end → swapped; 14-line range → 10; 90 % overlap → later dropped; markdown bullets stripped; narration containing `p2_l3` → hard; 12-word / 120-word narration → hard; 25-word narration → soft warning only).
  - [ ] Assembled plan from a hand-written valid draft passes `LessonPlan.model_validate` **and** `validate_plan_against_index` with an empty error list; I1–I5, I8 hold.
  - [ ] Mutation tests: change `page` on one segment, point `scroll_to_span` at another page's span, inject unknown id, set `cues` non-empty, break `next` → each yields ≥1 error from the validator (V4–V7, V9).
  - [ ] Fixture test: `sample-lesson-plan.json` validated against `sample-document-index.json` using the same validator returns `[]` **now** (placeholder plan, 2 segments — count not checked here by design); this test stays and is the guard after T-013 regenerates the fixture.
  - [ ] Old `validate_plan_against_index(plan, span_ids: set)` callers: none remain (grep returns nothing in `backend/app/`).

#### T-012: Ladder — `generate_lesson_plan(index, *, lesson_id, force_strategy=None)`
- **Priority:** [Must] (single call + assemble + validate); retry ladder [Should] **Effort:** M **Dependencies:** T-009, T-010, T-011 **Design ref:** §4.2 L2–L4, §4.3, §5.4, §6.4, D3, D4, G-02, G-03, G-04, G-10
- **Description:** Orchestrates prompt → `llm.parse_structured` → repair → hard-rule check → at most one retry → drop → assemble → validate. Returns `(LessonPlan, PlanMeta)`.
- **Outputs:**
  - `PlanMeta` dataclass/model: `model`, `prompt_version`, `strategy`, `attempts`, `repairs[]`, `warnings[]`, `usage[]` (per call), `duration_ms`, `created_at`, `lesson_id`.
  - Algorithm (all numbers from §7 settings):
    1. `elapsed` clock starts. Attempt 1: timeout `min(PLAN_TIMEOUT_S, deadline − elapsed)`, `max_retries=0`, `max_output_tokens=PLAN_MAX_OUTPUT_TOKENS`, `prompt_cache_key=plan:{lesson_id}`.
    2. Result handling: transport error or `failure != None` ⇒ attempt failed (record; if `failure=="incomplete"`, next attempt's tokens × 1.5). Otherwise `repair_draft` then V8 check (5 ≤ n ≤ 12 and ≥ 3 valid) plus the hard violations from T-011.
    3. If no hard violations ⇒ assemble, validate, return.
    4. Else retry **once** iff `elapsed ≤ PLAN_RETRY_CUTOFF_S` and `remaining ≥ 10 s`: same system + same first user turn (identical prefix) + assistant draft (if any) + violation feedback; attempt timeout `min(PLAN_TIMEOUT_S, remaining)`. If retry is not permitted ⇒ raise `LLMTimeoutError` if the failure was a timeout else `PlanInvalidError` (G-03; nothing cached).
    5. After attempt 2: **L3** drop remaining hard-invalid segments, re-chain, accept if ≥ 3 remain (and truncate to 12 with warning `segments_truncated` if more, G-02); else **L4** raise `PlanInvalidError` (502). Transport error on attempt 2 ⇒ timeout → 504 / otherwise 502.
    6. Assemble, run `validate_plan_against_index`; any error here is a code bug ⇒ `PlanInvalidError` (never return an invalid plan).
  - Soft violations are logged into `warnings[]`, never fatal. One INFO summary line per plan with `repairs`/`warnings` counts (§6.5).
  - `force_strategy` parameter accepted (`"single"` default); `"paged"` implemented only by T-023 (until then raises `NotImplementedError` guarded by settings validation → falls back to `single` with warning).
- **Acceptance criteria (all with a stubbed `llm.parse_structured`):**
  - [ ] Happy path: valid draft ⇒ exactly **1** LLM call; plan valid; meta has 0 repairs.
  - [ ] Draft with 3 segments (count < 5) ⇒ retry call made with the **identical** system and first-turn text (assert string equality → prompt-cache friendliness) plus appended assistant+feedback turns; second valid draft accepted ⇒ 2 calls total.
  - [ ] `failure="incomplete"` on attempt 1 ⇒ attempt 2 `max_output_tokens == int(6000*1.5)`.
  - [ ] Attempt 2 still has 2 invalid + 5 valid segments ⇒ invalid dropped, ids renumbered contiguous, `next` chain intact, accepted (5 ≥ 3). Only 2 valid after retry ⇒ `PlanInvalidError`.
  - [ ] First attempt `LLMTimeoutError` with `elapsed` faked > 45 s ⇒ no second call, `LLMTimeoutError` (504). Faked elapsed ≤ 45 s ⇒ one retry.
  - [ ] 14 segments after retry ⇒ 12 kept with `segments_truncated` warning.
  - [ ] Never more than 2 calls in any scenario (assert on stub call count).
  - [ ] No plan is ever returned that fails `validate_plan_against_index`.

#### T-013: Hour-0 smoke CLI + latency gate + golden fixture
- **Priority:** [Must] **Effort:** M **Dependencies:** T-012; **external:** `OPENAI_API_KEY` **Design ref:** §6.6, §8.4, §4.3 (gate), D4, G-08, G-10, G-14, G-15
- **Description:** `python -m app.services.lesson_generator <pdf> [--runs N] [--write-fixtures] [--strategy single|paged]` run from `backend/`.
- **Behaviour (design §6.6, in order):** extract the PDF (document_id `doc_demo`) → **assert 4 pages and 175 line units** (when the PDF is the golden one; skippable by flag for other PDFs) → print `chars`, estimated tokens (chars/4, labelled estimate) → `N` live plan calls (default 1; **5 for the gate**) printing per-run latency, attempts, repairs/warnings counts, and `usage` (incl. `reasoning_tokens`, `cached_tokens`) → p50/p95/max → compare to the gate (**p95 > 25 s or any > 40 s ⇒ print `GATE TRIPPED: enable PLAN_STRATEGY=paged (T-023)`**) → run `validate_plan_against_index` and the V8 count rule on the result → with `--write-fixtures`: write `shared/fixtures/sample-lesson-plan.json` (`les_demo`/`doc_demo`) via `atomic_write_text`, and rewrite `sample-document-index.json` **only if** `(span_id, page, text)` differ from the current file (G-15) → exit non-zero on any hard violation. Never writes under `backend/data/`, never touches `frontend/**` (G-14).
- **Manual review step (required):** read all segments of the produced plan; confirm narration is plain spoken English, ≈ 40–65 words, matches cited lines, no ids/markdown. Decide which run to commit (re-run if poor). Then commit fixture with the code.
- **Acceptance criteria:**
  - [ ] `.venv/bin/python -m app.services.lesson_generator ../shared/fixtures/golden-demo.pdf --runs 5` completes and prints latency stats; result and gate decision recorded in the execution log.
  - [ ] `--write-fixtures` produces a `sample-lesson-plan.json` with 5–12 segments, `lesson_id: les_demo`, `document_id: doc_demo`, every segment `page` valid, `cues: []`; the T-011 fixture test still passes **and** a new assertion `5 ≤ len(segments) ≤ 12` now holds for the fixture.
  - [ ] Exit code is non-zero when the stubbed/forced result has a hard violation (unit test with stub).
  - [ ] **Decision gate G-LAT recorded:** `single` kept (p95 ≤ 25 s, max ≤ 40 s) **or** T-023 activated. Model/effort/token-cap config that produced the numbers is written into the execution log and `.env.example` comments.
  - [ ] Segment budget sanity: golden produces 7–9 segments (target_n 8 ± 1); if not, note and adjust prompt wording only (no design change).

> **Checkpoint CP-F (after T-013) — fixtures hand-off:** tell P1/P3 `shared/fixtures/sample-lesson-plan.json` is now the real golden plan; P1 copies to `frontend/public/fixtures/` (P2 does not touch `frontend/**`).

---

### Milestone M3 — Lessons route (real lesson to P1/P3)

#### T-014: `api/lessons.py` — idempotent, locked, cached, forceable
- **Priority:** [Must] **Effort:** M **Dependencies:** T-004, T-012 **Design ref:** §4.7, §5.2, §8.1, §8.2, D6, S1–S3, G-08
- **Outputs (`api/lessons.py`, deletes T-007 interim code and the old `generate_lesson_plan(document_id, summary, use_fixture)` shim):**
  - `POST /documents/{document_id}/lessons?force=false&demo=false` (sync `def`):
    1. `require_document_id`; `doc_demo` or `demo=true` ⇒ unless `force`, return fixture plan unmodified (`les_demo`).
    2. `with document_lock(document_id):` — `lesson_id = lesson_id_for(document_id)`; `load_index` (404 "Document not found"); if not `force`: `try_load_plan(lesson_id)`; if present **and** `validate_plan_against_index(plan, index) == []` and `plan.lesson_id == lesson_id` ⇒ return it (cache hit, no LLM call); otherwise generate.
    3. `generate_lesson_plan(index, lesson_id=…)`; `save_plan` then `save_meta` (atomic). Failures store nothing; lock released by the context manager.
    4. `response_model=LessonPlan`; contract fields only (meta never served).
  - `GET /lessons/{lesson_id}`: `require_lesson_id`; `les_demo` ⇒ fixture; else `load_plan` (404 "Lesson not found").
  - Forced demo run per G-08.
- **Acceptance criteria:**
  - [ ] **Idempotent:** two sequential POSTs for one document ⇒ identical bodies, `lesson_id == "les_<suffix>"`, LLM stub called once.
  - [ ] **Concurrent:** 5 threads POST the same document simultaneously ⇒ stub called exactly once; all 5 responses equal.
  - [ ] `?force=true` ⇒ stub called again; file replaced atomically.
  - [ ] Corrupt/invalid cached `*.lesson.json` (hand-edited page) ⇒ regenerated, not served.
  - [ ] Generation failure (stub raises `PlanInvalidError`) ⇒ 502 with §8.2 detail, **no** `*.lesson.json` on disk, and a following POST retries successfully (no failure caching).
  - [ ] Unknown document ⇒ 404 "Document not found"; no key (`NotConfiguredError`) ⇒ 503; stub timeout ⇒ 504; `GET /lessons/les_<id>` after POST returns the same plan; `GET /lessons/les_demo` unchanged from T-007.
  - [ ] `grep -rn "uuid" backend/app/api/lessons.py` returns nothing; no code path mints a random `lesson_id`.

#### T-015: Tests for M3 + live route smoke
- **Priority:** [Must] **Effort:** M **Dependencies:** T-014 **Design ref:** §6.6, §9.1
- **Outputs:** `tests/test_lessons_api.py` (stubbed LLM; ties each T-014 acceptance bullet to a test), `tests/test_plan_invariants.py` (I1–I8 checked on assembled plans from several synthetic drafts), optional `@pytest.mark.live` test that runs the real route for the golden PDF (skipped without `OPENAI_API_KEY`).
- **Acceptance criteria:**
  - [ ] `pytest -q` green offline.
  - [ ] **Live manual smoke:** run uvicorn (single worker), upload the golden PDF (curl, §8.2), `POST /documents/{id}/lessons`: 200, 5–12 segments, valid per validator, latency recorded in log; second POST returns instantly (cache hit); `GET /lessons/les_<id>` equals it.

> **Checkpoint CP2 (after T-015) — real lesson for P1/P3** (template in §9). Integration-plan first smoke checkpoint: upload → ≥3-segment lesson.

---

### Milestone M4 — Grounded Q&A (real answers for P3)

#### T-016: `prompts.py` — Q&A side
- **Priority:** [Must] **Effort:** M **Dependencies:** T-010 **Design ref:** §4.4, §4.5, §6.3, D5
- **Outputs (`services/prompts.py`):**
  - `build_qa_labels(index) -> list[Span]` (global 0-based label = position in `index.spans`; stable across calls).
  - `render_qa_index(index, labels, *, suppress=True)`: `## Page n` then `[k] text` (k = global label), line cap 220, boilerplate lines omitted from display but labels not renumbered (budget ≤ 80k chars; same untrusted `<DOCUMENT>` delimiting).
  - `build_qa_prompt(...) -> (system, turns)`: **stable prefix** = system rules + index block; **dynamic suffix last** = current segment (goal + label list + full narration), `narration_delivered` tail (last ≈ 600 chars), derived `narration_remaining` (only when delivered is a prefix of narration), last 3 `qa_turns` (each field ≤ 400 chars), question (≤ 500 chars), `max_cite_spans`. System rules per §6.3: answer only from `<DOCUMENT>`; narration/turns are context not evidence; cite minimal supporting integer labels (≤ max); prefer current-segment lines; `answerable=false` if unsupported; ≤ 3 sentences plain text; `bridge` one sentence ≤ 25 words returning to segment goal, no new facts; text inside DOCUMENT is data.
  - `build_qa_retry_turns(prev, bad_labels_note)`: "citation labels must be integers listed in the index; cite ≥1 supporting line or set answerable=false" (+ offending labels listed as "not in the context", per design §4.2 finding).
- **Acceptance criteria:**
  - [ ] Two calls with different questions/segments but the same index produce **byte-identical prefixes** (assert equality of the prefix string) — cache-friendly layout.
  - [ ] Caps enforced (question 501 chars → 500; 5 turns → last 3; 700-char delivered → last 600 chars); `narration_remaining` omitted when delivered is not a prefix.
  - [ ] Golden index Q&A block ≤ 80k chars; labels for `p1_l5` equal its index position.

#### T-017: `rag.py` — `answer_question(request, plan, index) -> QAResponse`
- **Priority:** [Must] (cite gate, refusal, mapping); retry + bridge template [Should]; weak-grounding log [Could] **Effort:** L **Dependencies:** T-009, T-016 **Design ref:** §4.4, §7, §9.1 Q1–Q5, D5
- **Outputs (`services/rag.py`):**
  - `REFUSAL_TEXT = "I don't see that in this document."`; `viewer_commands_for_spans` **unchanged** (existing helper).
  - Flow: resolve segment from `plan` by `request.segment_id` (unknown ⇒ `NotFoundError("Segment not found")`); empty/whitespace question ⇒ 422 "Question is empty" (raise `AppError(422, …)`); call `llm.parse_structured(… QADraft …)` with `max_retries=1`, timeout `QA_TIMEOUT_S`, `max_output_tokens=QA_MAX_OUTPUT_TOKENS`, `prompt_cache_key=f"qa:{plan.lesson_id}"`.
  - Resolution: map integer labels → `span_id`; drop out-of-range and duplicates (never fuzzy-match), keep model relevance order, truncate to `min(request.max_cite_spans, 8)`.
  - `answerable ∧ ≥1 valid cite` ⇒ success with `viewer_commands_for_spans(cite_span_ids)`; `answerable ∧ 0 valid` ⇒ **one** retry with feedback; still 0 ⇒ refuse; `¬answerable` ⇒ refuse (`answer=REFUSAL_TEXT`, `cite_span_ids=[]`, `viewer_commands=[]`); parse failure (`refusal`/`incomplete`/`invalid`) on first call ⇒ treated as a failed attempt ⇒ same single retry, then `LLMUpstreamError` re-raised with detail "Couldn't answer right now."
  - `bridge`: model sentence if non-empty, ≤ 25 words, single sentence, no markdown; otherwise template `"Now, back to {segment.goal}."`; always non-empty, including after refusals.
  - Answer length: if > 90 words, truncate at a sentence boundary (soft). Strip markdown. Plain text.
  - Transport errors re-raised as typed errors with QA detail (502/504 → "Couldn't answer right now."; 503 keeps the generator-not-configured text).
  - **[Could] S1:** `lexical_overlap(answer, cited_text)` content-word overlap; log `weak_grounding` when cites exist but overlap below a threshold; never blocks.
- **Acceptance criteria (stubbed LLM):**
  - [ ] Valid cites `[2, 5]` ⇒ `cite_span_ids` are the corresponding span ids in that order; `viewer_commands == [ScrollToSpan(first), SetHighlights(all)]`; types only `scroll_to_span`/`set_highlights` (Q3).
  - [ ] Cites `[2, 9999, 2, -1]` ⇒ `[span(2)]` only (out-of-range and duplicate dropped).
  - [ ] 12 valid cites with `max_cite_spans=5` ⇒ 5; request `max_cite_spans=50` ⇒ capped at 8.
  - [ ] `answerable=false` ⇒ refusal text, empty cites, empty commands, bridge non-empty, **1** LLM call.
  - [ ] `answerable=true` with `cites=[]` ⇒ second call with feedback; second call valid ⇒ success; still empty ⇒ refusal (2 calls total, never 3).
  - [ ] Empty/over-long/multi-sentence bridge ⇒ template from `segment.goal`.
  - [ ] Unknown `segment_id` ⇒ 404 "Segment not found"; whitespace question ⇒ 422 "Question is empty".
  - [ ] Real-index mapping test on the golden index: label ↔ `span_id` round-trips for all 175 spans (I1/Q1).

#### T-018: `api/qa.py` — resolve lesson → plan → index
- **Priority:** [Must] **Effort:** S **Dependencies:** T-004, T-017 **Design ref:** §5.3, §8.1, §8.2, S5, G-07, G-12
- **Outputs (`api/qa.py`):** sync `def`; `require_lesson_id(lesson_id)`; `plan = load_plan(lesson_id)` (404 "Lesson not found"; `les_demo` ⇒ fixture); `index = load_index(plan.document_id)` (404 "Document not found"; `doc_demo` ⇒ fixture); body `lesson_id` ignored (G-12; log mismatch); call `answer_question(body, plan, index)`; **only for `lesson_id == "les_demo"`** and only on `NotConfiguredError`/upstream/timeout, return `sample-qa-response.json` and log `qa_demo_fallback` (G-07). Remove the `use_fixture` parameter everywhere.
- **Acceptance criteria:**
  - [ ] Unknown lesson ⇒ 404; lesson whose document index was deleted ⇒ 404; unknown segment ⇒ 404; empty question ⇒ 422.
  - [ ] Path `lesson_id` wins when body `lesson_id` differs.
  - [ ] Upstream error for a non-demo lesson ⇒ 502 `{"detail": "Couldn't answer right now."}`; for `les_demo` ⇒ 200 canned fixture (G-07) — **if G-07 is rejected at approval, drop the demo fallback and this bullet.**
  - [ ] `grep -rn "use_fixture" backend/app` returns nothing.

#### T-019: Tests for M4 + live Q&A smoke
- **Priority:** [Must] **Effort:** M **Dependencies:** T-018 **Design ref:** §4.4, §9.1
- **Outputs:** `tests/test_prompts.py` (completes T-010/T-016 cases), `tests/test_rag.py` (T-017 cases), `tests/test_qa_api.py` (T-018 cases).
- **Acceptance criteria:**
  - [ ] `pytest -q` green offline.
  - [ ] **Live manual smoke** (after CP2's lesson exists): (a) question answerable from the doc ⇒ 200, ≥ 1 valid cite, `viewer_commands` present, answer ≤ ~3 sentences; (b) off-topic question (e.g. "What's the capital of France?") ⇒ refusal text, empty cites/commands, non-empty bridge; (c) follow-up using `qa_turns` and `narration_delivered` ("what did you just say about …") behaves sensibly; (d) latency printed in the `lesson.llm` log; p50 target < 5 s (design R7 trigger: if p50 > 5 s, set `OPENAI_QA_MODEL=gpt-6-luna`).

> **Checkpoint CP3 (after T-019) — Q&A for P3** (template in §9). Integration-plan second smoke checkpoint: interrupt → cited answer → resume path.

---

### Milestone M5 — Hardening and handover

#### T-020: End-to-end smoke (P2 side of integration plan §11)
- **Priority:** [Must] **Effort:** M **Dependencies:** T-019 **Design ref:** §6.6, integration plan §11
- **Description:** Run the script in §8.2 end-to-end against a live uvicorn (single worker) with a real key; paste results into the execution log.
- **Acceptance criteria:**
  - [ ] Steps 1–3 and the Q&A step of §8.2 pass; failure cases (bad file, scanned PDF) return clear 4xx messages.
  - [ ] `GET /health` and `?demo=true` paths still work; `doc_demo`/`les_demo` fixtures serve unchanged.
  - [ ] Data dir contains `doc_*.pdf`, `doc_*.index.json`, `les_*.lesson.json`, `les_*.meta.json`; meta contains model, prompt_version, attempts, repairs, warnings, usage, duration.
  - [ ] Latency gate re-checked through the API path (not only CLI); recorded.

#### T-021: Run docs update
- **Priority:** [Should] **Effort:** S **Dependencies:** T-020 **Design ref:** §4.7 (single worker "stated in the run docs"), §9.3
- **Outputs:** Edit the root `README.md` backend section only: env var table (§7), "run **one** uvicorn worker; do not pass `--workers N`", how to run tests, CLI commands (`--ping`, hour-0 smoke), note for P1 (lesson POST timeout ≥ 90 s; 502/504 retryable because POST is idempotent; surface `detail`), note for P3 (send `narration_delivered`, `qa_turns`; always play `bridge`, then re-apply `on_enter`).
- **Acceptance criteria:**
  - [ ] A teammate can run backend, tests, and the smoke CLI from README alone; no secrets in docs.

#### T-022: Weak-grounding log (S1) and `service_tier` demo switch
- **Priority:** [Could] **Effort:** S **Dependencies:** T-017, T-009 **Design ref:** §4.4 S1, §4.3 `OPENAI_SERVICE_TIER`
- **Outputs:** the S1 log in `rag.py` (if not already done in T-017) and verification that `OPENAI_SERVICE_TIER=fast` (when supported by the model, finding unverified) is passed through and that an unsupported value fails visibly in the ping rather than silently.
- **Acceptance criteria:** [ ] `weak_grounding` log appears for a synthetic mismatch case; [ ] enabling the tier env var changes the request parameters (asserted via the fake client), disabled by default.

#### T-023: Page-parallel strategy (`PLAN_STRATEGY=paged`) — **conditional**
- **Priority:** [Won't unless T-013/T-020 gate trips] **Effort:** L **Dependencies:** T-013 **Design ref:** §4.3 option C, D4, §4.5 T-tier
- **Trigger:** p95 > 25 s **or** any run > 40 s on the golden PDF over 5 runs (measured via CLI or API).
- **Description:** Per-page calls (thread pool, one call per page ≤ 10) reusing the same draft schema, repair, assembler, validator and ladder; prompt builder adds a per-page slice + one-line skeleton of all pages ("part k of K", greeting only in part 1, wrap-up only in part K, `title` only from part 1), per-page segment budget proportional to line count (≥1 for pages with ≥ 8 lines); merge in page order; used only when `pages ≥ 4`. Total calls bounded (each part gets at most the single ladder retry; respect the 80 s deadline).
- **Acceptance criteria:** [ ] stubbed test: 4 pages ⇒ 4 parallel part calls, merged plan valid, ids contiguous; [ ] one part failing twice ⇒ that page's segments dropped, ≥3 total ⇒ accept, else 502; [ ] CLI re-run with `--strategy paged` shows p95 under the gate; [ ] `single` remains the default and unchanged.

---

## 6. Sequencing and Milestones

### Milestones

| Milestone | Tasks | Entry criteria | Exit criteria |
|---|---|---|---|
| **M0 Foundation** | T-001 … T-004 | Branch `abs` checked out; design approved | `pytest -q` runs; settings/errors/storage unit tests green; `/health` unchanged; `DATA_DIR` honoured |
| **M1 Ingest** (P1 unblocked) | T-005, T-006, T-007, T-007b | M0 exit | Golden PDF upload → 175-span index via API; all §8.2 ingest errors correct; no orphan PDFs; interim lesson behaviour clean; **CP1 sent to P1** |
| **M2 Plan engine** | T-008 … T-013 | M1 exit; `OPENAI_API_KEY` available (needed by T-009 live ping and T-013 only) | Ping passes with recorded model/effort/tokens; validator/repair/assembler/ladder tests green; CLI produces and validates golden `les_demo`; latency gate decision recorded; **CP-F sent** |
| **M3 Lessons route** (P1/P3 unblocked on real lesson) | T-014, T-015 | M2 exit | Idempotent, locked, cached POST; failure paths correct; live smoke passes; **CP2 sent** |
| **M4 Q&A** (P3 unblocked on real answers) | T-016 … T-019 | M3 exit (a lesson exists to ask about) | Cite gate, refusal, label mapping tests green; live answerable + unanswerable smoke pass; **CP3 sent** |
| **M5 Hardening** | T-020, T-021, T-022 (Could), T-023 (conditional) | M4 exit | System-level acceptance (§9) all ticked; README updated; gate decision final |

### Execution order (fastest path to unblock P1, then P3)

```mermaid
flowchart TD
  T001[T-001 deps/env/pytest] --> T002[T-002 config.py]
  T002 --> T003[T-003 errors.py]
  T002 --> T004[T-004 storage]
  T003 --> T004
  T003 --> T005[T-005 ingest guards + golden regression]
  T004 --> T006[T-006 documents.py]
  T005 --> T006
  T004 --> T007[T-007 interim lessons]
  T006 --> T007b[T-007b M1 tests]
  T007 --> T007b
  T007b --> CP1{{CP1 -> P1}}
  T001 --> T008[T-008 llm_drafts]
  T003 --> T009[T-009 llm.py + ping]
  T008 --> T009
  T008 --> T010[T-010 prompts plan]
  T008 --> T011[T-011 validator/repair/assembler]
  T009 --> T012[T-012 ladder]
  T010 --> T012
  T011 --> T012
  T012 --> T013[T-013 smoke CLI + gate + fixture]
  T013 --> CPF{{CP-F fixtures -> P1/P3}}
  T013 --> T014[T-014 lessons route]
  T004 --> T014
  T014 --> T015[T-015 M3 tests + live smoke]
  T015 --> CP2{{CP2 real lesson -> P1/P3}}
  T010 --> T016[T-016 prompts QA]
  T016 --> T017[T-017 rag.py]
  T009 --> T017
  T017 --> T018[T-018 qa.py]
  T015 --> T018
  T018 --> T019[T-019 M4 tests + live smoke]
  T019 --> CP3{{CP3 Q&A -> P3}}
  T019 --> T020[T-020 e2e smoke]
  T020 --> T021[T-021 README]
  T013 -. gate trips .-> T023[T-023 paged]
```

**Parallelisation / ordering notes (single developer):**
- After CP1 is sent, the **early live ping (T-009)** is deliberately done *before* the pure-logic tasks (T-010, T-011) so model/effort/truncation issues are known while logic is still cheap to adapt. If the API key is not yet available, do T-008, T-010, T-011 first and come back to T-009 before T-012.
- T-011 (L) is the biggest block; T-010 and T-011 are independent and can be interleaved. T-016 can be written while waiting on the live smoke of T-015.
- **Cut line when time runs short (design §5.5, apply from the bottom):** T-023 (never unless gated) → T-022 → T-010 boilerplate sub-step → T-021 (README note shrinks to the single-worker line) → T-012 retry ladder (keep single call + assemble + validate; hard violations then 502) → T-017 retry & bridge template. **Never cut:** ingest guards (T-005/T-006), assemble + validate + cache (T-011/T-014), Q&A cite gate (T-017), the hour-0 CLI (T-013).

---

## 7. Engineering Standards

### 7.1 Environment variables (all in `backend/.env.example`; defaults from the design)

| Variable | Default | Used by | Notes |
|---|---|---|---|
| `OPENAI_API_KEY` | *(empty)* | `llm.py` | Empty ⇒ `NotConfiguredError` → 503; never logged |
| `OPENAI_PLAN_MODEL` | `gpt-6.1-terra` | plan | Fallbacks per D7: `gpt-6-luna` → `gpt-4o-mini` (confirmed by ping, T-009) |
| `OPENAI_QA_MODEL` | `gpt-6.1-terra` | Q&A | `gpt-6-luna` if p50 > 5 s |
| `OPENAI_PLAN_EFFORT` / `OPENAI_QA_EFFORT` | `low` | plan / Q&A | Empty ⇒ omit `reasoning` (needed for non-reasoning fallbacks) |
| `OPENAI_SERVICE_TIER` | *(empty)* | both | Demo-day switch (`fast`); off by default |
| `PLAN_STRATEGY` | `single` | generator | `paged` only after T-023 |
| `PLAN_MAX_OUTPUT_TOKENS` / `QA_MAX_OUTPUT_TOKENS` | `6000` / `1200` | plan / Q&A | Env overrides additive (G-10); plan ×1.5 on retry after `incomplete` |
| `PLAN_TIMEOUT_S` / `QA_TIMEOUT_S` | `45` / `20` | per-call timeouts | Plan uses `max_retries=0`; Q&A `max_retries=1` |
| `PLAN_DEADLINE_S` / `PLAN_RETRY_CUTOFF_S` | `80` / `45` | ladder | G-04 interpretation |
| `MAX_PAGES` / `MAX_TOTAL_CHARS` / `MIN_TOTAL_CHARS` / `MIN_LINES` / `MAX_UPLOAD_MB` | `10` / `80000` / `200` / `10` / `20` | ingest | Env-overridable (§4.5) |
| `DATA_DIR` | `<repo>/backend/data` | storage | Relative values resolve against `backend/` |
| `CORS_ORIGINS` | `http://localhost:3000` | CORS | Unchanged |

### 7.2 Dependency changes

| Package | Before | After | Reason |
|---|---|---|---|
| `openai` | `>=1.50.0` | `>=3.46.0,<4` (freeze to ping-verified version) | `responses.parse` + `text_format`, `with_options` (F1, F5) |
| `python-dotenv` | transitive via `uvicorn[standard]` | explicit `>=1.0` | `.env` is now actually loaded by `config.py` |
| `pytest` | absent | `requirements-dev.txt` `>=8` | tests |
| `httpx` | n/a | only if `TestClient` import fails | F7 |

No vector DB, no embeddings libs, no LangGraph (design non-goals).

### 7.3 Conventions

- **Branch/review:** work on `abs`; small commits per task (message `T-0xx: …`); PR to `main` after M3 (so P1/P3 can integrate) and again after M5; each PR must pass `pytest -q` and `GET /health` (integration plan §10 "definition of done per PR"); do not break fixtures.
- **File ownership:** edit only `backend/app/**` (except `api/voice.py`), `backend/tests/**`, `backend/requirements*.txt`, `backend/pytest.ini`, `backend/.env.example`, `shared/fixtures/**` (via CLI), root `README.md` (T-021 only). Never `frontend/**` or `shared/schemas/**`.
- **Handlers:** all route handlers are sync `def` (F6). All file writes use `atomic_write_*`. All ids pass `require_*_id` before touching the filesystem.
- **Services call the LLM only via `llm.parse_structured`** through the module attribute (test seam).
- **Errors:** raise `AppError` subclasses; never raise bare `HTTPException` with provider text; never return stack traces.
- **Logging:** logger names `lesson.llm`, `lesson.plan`, `lesson.ingest`, `lesson.qa`; structured key=value or JSON lines; no prompts/keys/PDF text bodies in logs.
- **Style:** type hints, small pure functions for everything testable offline; Pydantic models for draft/meta; keep `schemas.py` untouched.

---

## 8. Testing Strategy

### 8.1 Test levels

| Level | Scope | Tools / approach | Required before milestone |
|---|---|---|---|
| Unit — pure logic | storage ids/atomic writes/locks (T-004), settings (T-002), ingest guards + golden regression (T-005), draft schemas (T-008), prompts (T-010/T-016), validator/repair/assembler (T-011), cite resolution (T-017) | `pytest`, `tmp_path`, `monkeypatch`; PDFs generated with PyMuPDF in-test (F10, F11) | M0, M1, M2 |
| Unit — LLM seam | `parse_structured` mapping of refusal/incomplete/invalid/timeouts (T-009) | fake client object | M2 |
| Component — ladder / RAG | `generate_lesson_plan` call counts, retry prefix identity, token ×1.5, drop/renumber (T-012); `answer_question` gates (T-017) | stub `app.services.llm.parse_structured` | M2, M4 |
| API integration | all routes via `TestClient` with `DATA_DIR=tmp_path`, stubbed LLM; idempotency, concurrency (threads), force, failure not cached, error statuses/details (T-007b, T-015, T-019) | FastAPI `TestClient` (F7) | M1, M3, M4 |
| Fixture guard | `sample-lesson-plan.json` ↔ `sample-document-index.json` through the **same** validator; golden extraction == fixture index | pytest | M1 (index), M2 (plan after T-013) |
| Live — model ping | model/effort/truncation behaviour; `reasoning_tokens` (T-009) | `python -m app.services.llm --ping` (real key, manual) | M2 |
| Live — hour-0 smoke | extract → live plan ×5 → latency/usage → validate → fixtures (T-013) | `python -m app.services.lesson_generator …` | M2 exit |
| Live — API smoke | upload → plan → cache hit → Q&A answerable/unanswerable/follow-up (T-015, T-019, T-020) | uvicorn + curl (§8.2) | M3, M4, M5 |
| Cross-team manual | highlight on expected page; cite highlight; resume | P1/P3 at CP2/CP3 (integration plan §11) | M3, M4 |

`@pytest.mark.live` tests (optional) are skipped unless `OPENAI_API_KEY` is set; default CI/dev run is fully offline.

### 8.2 Smoke scripts (manual; run each command separately from `backend/` unless stated)

**Hour-0 / gate (design §6.6):**

```text
.venv/bin/python -m app.services.llm --ping
.venv/bin/python -m app.services.lesson_generator ../shared/fixtures/golden-demo.pdf --runs 5
.venv/bin/python -m app.services.lesson_generator ../shared/fixtures/golden-demo.pdf --write-fixtures
```
Expected: ping exit 0; 5 latencies + p50/p95 + gate verdict; fixture written, validator clean, exit 0.

**API end-to-end (integration plan §11, P2 side)** — start `.venv/bin/uvicorn app.main:app --port 8000` (single worker), then:

```text
curl -s localhost:8000/health
curl -s -F "file=@../shared/fixtures/golden-demo.pdf;type=application/pdf" localhost:8000/documents
curl -s localhost:8000/documents/<DOC_ID>/index
curl -s -X POST localhost:8000/documents/<DOC_ID>/lessons
curl -s -X POST localhost:8000/documents/<DOC_ID>/lessons
curl -s localhost:8000/lessons/<LES_ID>
curl -s -X POST localhost:8000/lessons/<LES_ID>/qa -H "Content-Type: application/json" -d '{"lesson_id":"<LES_ID>","segment_id":"seg_01","question":"<question answerable from the golden PDF>"}'
curl -s -X POST localhost:8000/lessons/<LES_ID>/qa -H "Content-Type: application/json" -d '{"lesson_id":"<LES_ID>","segment_id":"seg_01","question":"What is the capital of France?"}'
curl -s -F "file=@README.md;type=text/plain" localhost:8000/documents
```
Expected: `ready` + `doc_<12hex>`; 175 spans; first lesson POST 200 (slow), second near-instant and identical (cache); `les_<same suffix>`; answerable ⇒ cites + `viewer_commands`; off-topic ⇒ "I don't see that in this document." with empty cites/commands; text file ⇒ 400 "Expected a PDF file".

---

## 9. System-Level Acceptance Criteria and Integration Checkpoints

### 9.1 System acceptance (all must be ticked at M5)

- [ ] **SC1** Golden PDF upload → `DocumentIndex` with 4 pages, 175 line units, ids `p{page}_l{i}`; scanned/empty/encrypted/oversized/non-PDF fail with the §8.2 statuses and messages; no orphan files.
- [ ] **SC2** `POST /documents/{id}/lessons` returns **200 sync** with a contract-valid `LessonPlan` (5–12 segments typical, ≥ 3 after drops, `page` set, `cues: []`, `check_question: null`, `next` chain complete, narration plain text) that passes `validate_plan_against_index` (I1–I8).
- [ ] **SC2b** `lesson_id` deterministic (`doc_X → les_X`; `doc_demo → les_demo`); repeated/concurrent POSTs call the LLM once; `?force=true` regenerates; failures are not cached.
- [ ] **SC3** `POST /lessons/{id}/qa` returns `answer`, `cite_span_ids ⊆ index` (≤ `min(max_cite_spans, 8)`), `viewer_commands` (`scroll_to_span` + `set_highlights` only), non-empty `bridge`; unanswerable ⇒ refusal text + empty cites + empty commands (Q1–Q5).
- [ ] **SC4** `doc_demo`/`les_demo` demo paths and `GET /health` work; `GET /lessons/les_demo.lesson_id == "les_demo"`; fixtures validated by the same validator.
- [ ] **NFR** Plan latency on golden PDF measured over 5 runs; p95 ≤ 25 s and max ≤ 40 s **or** T-023 enabled and re-measured; absolute NFR (< 60 s stretch) met.
- [ ] No change to `shared/schemas/**`, `frontend/**`, `voice.py`; contract invariants unchanged (CONTRACT-v0.1 frozen).
- [ ] `pytest -q` green offline; README documents env vars, single-worker assumption, and teammate asks.

### 9.2 Integration checkpoints (message templates; post in the team thread per integration plan §10 — "only schema/API changes + sample curl")

| CP | When | To | Message must contain |
|---|---|---|---|
| **CP1** | after T-007b | **P1** | `POST /documents` now ingests real PDFs (sync, no orphans); `GET /documents/{id}`, `/index`, `/file` work; error statuses/`detail` strings (400/413/422, copy from §8.2); `?demo=true` works with no file; ids are validated (404 on bad id); lesson POST for uploaded docs is **503 "not configured" until CP2**; sample curl for upload + index. |
| **CP-F** | after T-013 | **P1, P3** | `shared/fixtures/sample-lesson-plan.json` is now the real golden plan (`les_demo`, `doc_demo`, 5–12 segments, every `page` + span id valid); P1 please copy to `frontend/public/fixtures/` (P2 will not touch `frontend/**`); the hour-0 CLI that produced it. |
| **CP2** | after T-015 | **P1, P3** | `POST /documents/{id}/lessons` is real, **synchronous**, idempotent (safe to retry on 502/504), `lesson_id = les_<doc suffix>`, `?force=true` to regenerate. **P1:** set fetch timeout ≥ 90 s, show spinner ("Building your lesson… up to a minute"), render `detail` from 4xx/5xx. **P3:** `GET /lessons/{id}` shape unchanged (`cues: []`, `check_question: null`, `on_enter` only); narration is plain text for TTS (no markdown/ids). Sample curl. |
| **CP3** | after T-019 | **P3** (cc P1) | `POST /lessons/{id}/qa` is real: send `segment_id`, `question`, `narration_delivered` (exact text spoken so far), `qa_turns` (newest last), `playback_ms`; do not send control intents ("pause", "next"); response has `answer`, `cite_span_ids`, `viewer_commands` (only `scroll_to_span` + `set_highlights`), always-non-empty `bridge`; refusal phrase is exactly "I don't see that in this document." with empty cites/commands; **always play `bridge`, then re-apply `onEnterToCommands(segment.on_enter)`** (P2 never emits `clear_highlights`/`scroll_to_page`). Sample curl for answerable and off-topic. |
| **CP-Final** | after T-020 | all | Smoke result summary; known limitations (§13 residuals: multi-column order, partially scanned pages not flagged to UI, single worker); how to switch models/tier via env on demo day. |

Mapping to the integration plan's own checkpoints (§7 item 10, "T+90 min & T+180 min smoke tests"): CP2 ≈ the first smoke (upload → ≥ 3-segment lesson), CP3 ≈ the second (interrupt → cited answer → resume).

---

## 10. Operational Readiness

| Concern | Approach |
|---|---|
| Logging | One structured line per LLM call (`lesson.llm`: kind, model, attempt, duration_ms, input/output/cached/reasoning tokens, status/failure); one summary line per plan (`lesson.plan`: attempts, repairs count, warnings count, duration, strategy); one per ingest (`lesson.ingest`: pages, line units, chars, empty pages); `lesson.qa` for demo fallback / weak grounding / body-path lesson_id mismatch. No prompts, PDF text, keys, or provider error bodies in logs. |
| Monitoring / alerting | None beyond logs (hackathon). The `*.meta.json` sidecar is the demo-day debugging record and the evidence for the `paged` decision. `GET /health` unchanged (optionally add `llm_configured` only if P1/P3 ask — not planned). |
| Runbook (symptom → check) | **Highlight wrong:** is it `segment.page`/span ids (P2 — check meta repairs and run the validator on the cached plan) or bbox transform (P1)? **Bad teaching/narration:** P2 prompt (`PROMPT_VERSION`) or fixture — re-run CLI/`?force=true`. **Lesson slow:** read `lesson.llm` duration + `reasoning_tokens`; try `OPENAI_PLAN_EFFORT=low`/empty, model `gpt-6-luna`, `OPENAI_SERVICE_TIER=fast`; if gate tripped enable `paged` (T-023). **Lesson 502:** check `lesson.plan` for the violation list; `?force=true` retries (nothing cached on failure). **503:** key missing/blank. **504:** raise nothing—retry; consider tier/model change. **Q&A refuses too much:** inspect cite labels in log; try `OPENAI_QA_MODEL`. **Stale/odd cache:** delete `backend/data/les_<id>.*` or use `?force=true`. **Data dir confusion:** check `DATA_DIR` (now actually honoured). |
| Secrets / config | `OPENAI_API_KEY` only in untracked `backend/.env` (gitignored) or process env; `.env.example` has a blank key; `store=False` on all calls (data minimisation); PDF text goes to OpenAI (inherent; disclose in demo notes). Single uvicorn worker assumed for locks. |
| Data hygiene | `backend/data/` is gitignored; uploads persist locally only; ids regex-validated to prevent traversal; temp files created in the data dir and removed on failure. |

---

## 11. Deployment, Rollout, and Rollback

- **Environment:** local laptop only (hackathon); `uvicorn app.main:app --port 8000` single worker (README). No CI/CD, containers, or cloud deploy are in design scope — none planned.
- **Promotion path:** commits on `abs` → PR to `main` at M3 (real lesson available) and M5 (final). Before each merge: `pytest -q` green, `GET /health`, `?demo=true` paths, fixtures validated, and the relevant checkpoint message sent.
- **Feature flags / switches (all env, no code deploy):** `PLAN_STRATEGY` (`single`|`paged`), `OPENAI_PLAN_MODEL`/`OPENAI_QA_MODEL`, `OPENAI_*_EFFORT`, `OPENAI_SERVICE_TIER`, `PLAN_MAX_OUTPUT_TOKENS`.
- **Demo insurance:** `doc_demo` / `les_demo` stay fixture-served (SC4); `?force=true` is the only route to a live re-run for them (G-08); Q&A for `les_demo` has the canned fallback (G-07, if approved). Warm the schema by running the CLI shortly before a demo (first-request schema latency, design §4.1).
- **Rollback triggers and actions:**

| Trigger | Action |
|---|---|
| Live lesson POST regularly > gate or failing on stage | Switch env (model/effort/tier) → enable `paged` if built → fall back to `?demo=true` / `doc_demo` fixture path for the demo |
| New validator/ladder regression breaks lesson POST | `git revert` the offending task commit(s); fixtures-only mode still serves `doc_demo` |
| Cache corruption/staleness | delete `backend/data/les_*.{lesson,meta}.json` or `?force=true` |
| Merge breaks P1/P3 integration | revert the `abs` merge on `main`; contract/schemas unchanged so consumers need no rollback |

- **Contract safety:** because no contract fields or routes change (additive `?force=true` only), rollback never requires consumer changes.

---

## 12. Validation Enablement (engineering evidence only)

Not product-led validation; P2 captures only the engineering evidence the design relies on.

| Evidence requirement | Implementation task | Evidence produced | Verification |
|---|---|---|---|
| Measured latency/usage to settle design "estimates" and the `paged` gate | T-009, T-013, T-020 | CLI p50/p95/max, per-call `usage` incl. `reasoning_tokens`/`cached_tokens`; execution-log table | Gate verdict recorded; numbers copied to execution log |
| Repair/warning rates (is the prompt good?) | T-011, T-012 | `*.meta.json` (`repairs[]`, `warnings[]`, attempts) + `lesson.plan` log | Inspect sidecar after each live run |
| Model/effort acceptance (design Q1) | T-009 | Ping transcript | Working config recorded in `.env.example` comments and log |
| Truncation behaviour (design §6.4 note) | T-009 | Ping step (2) output | Failure shape recorded; ladder trigger confirmed |
| Q&A grounding spot-check (R6 residual) | T-019 | 3–5 manual Q&A samples with cited lines compared by eye | Notes in execution log |

Assumptions that remain **untested until the live run / cross-team demo:** token and latency estimates; the 22-lines-per-segment heuristic; ±15 % TTS-speed vs narration word bands; whether `low` effort and `gpt-6.1-terra` are accepted; Fast-mode availability for the chosen model; P1's lesson-POST timeout being configurable to ≥ 90 s (design Q2).

---

## 13. Risks

| ID | Risk | Likelihood | Impact | Mitigation | Owner task |
|---|---|---|---|---|---|
| RK-01 | Model name / effort value rejected, or differs from the design's names at hackathon time (design R12) | Med | High | Env-driven; early ping (T-009) before logic depends on it; fallbacks `gpt-6-luna` → `gpt-4o-mini`; empty effort omits param | T-009 |
| RK-02 | `max_output_tokens=6000` too small once reasoning tokens count (F2) → `incomplete` before visible output | Med | High | Ping prints `reasoning_tokens`; env-tunable cap; ladder retries with ×1.5; effort `low` | T-009, T-012, T-013 |
| RK-03 | Plan latency over gate (design R1) | Med | High | Slim draft, single call, low effort, warm schema, tier switch; measured gate; conditional T-023; fixture-served `doc_demo` | T-013, T-023 |
| RK-04 | Invalid/hallucinated ids or wrong `page` (R2, R3) | Med | High | Model never types ids; ranges + repair + validator (V5) + one retry + drop; fixtures through same validator | T-011, T-012 |
| RK-05 | Truncated/invalid JSON or refusals (R4) | Low | Med | Three-shape failure handling (F4); retry with ×1.5 tokens | T-009, T-012 |
| RK-06 | Q&A hallucination / bad cites (R6) | Med | High | Cite gate; labels not ids; narration ≠ evidence; refusal constant; manual spot-checks | T-016, T-017, T-019 |
| RK-07 | Q&A latency hurts conversation (R7) | Med | Med | Stable prefix + `prompt_cache_key`, low effort, 1200 cap, 20 s timeout, `gpt-6-luna` fallback | T-016, T-017, T-019 |
| RK-08 | Double-click/concurrency duplicates (R10) | High | Low | Deterministic ids, per-doc lock, atomic writes, idempotent POST; single-worker assumption documented | T-004, T-014, T-021 |
| RK-09 | `--reload` restarts mid-generation or multi-worker run breaks locks | Med | Low | README: single worker; avoid saving files during live runs; atomic writes prevent torn files | T-021 |
| RK-10 | Fixture drift (R11) and `frontend/public/fixtures` copies out of sync (G-14) | Med | Med | CLI regenerates from live path; fixture validator test; CP-F asks P1 to copy | T-011, T-013 |
| RK-11 | Over-budget prompt for dense 10-page docs (G-01) | Low | Low | Send anyway + warning; input tokens barely affect latency | T-010 |
| RK-12 | Multi-column / odd reading order (R13) | Low | Med | Extractor order unchanged (changing it renumbers ids and breaks fixtures); golden PDF is single-column | T-005 |
| RK-13 | Prompt injection via PDF text (R8) | Low | Low | Delimited untrusted data; schema-constrained output; server-validated cites; no tools | T-010, T-016 |
| RK-14 | Contract creep (R16) | Med | High | Drafts are LLM-facing only; meta sidecar never served; no schema/route-shape changes; DO NOT list | all |
| RK-15 | One-developer time overrun | Med | High | Ordered by unblock value; priority tags + cut line (§6); live key needed only at T-009/T-013 | §6 |
| RK-16 | Third-party package/API drift (`openai` major, `httpx2` transport) | Low | Med | Freeze after ping; keep SDK touchpoints in `llm.py` only | T-001, T-009 |
| RK-17 | Partially scanned PDF silently yields a thinner lesson (no warnings field in frozen `UploadResponse`) | Low | Low | Logged `empty_pages`; documented limitation in CP-Final | T-005 |

---

## 14. Explicit DO NOT list

- **Do NOT** change `shared/schemas/**`, `CONTRACT-v0.1.md`, the `ViewerCommand` union, `UploadResponse`, `QAResponse`, or any contract model in `app/models/schemas.py`.
- **Do NOT** edit `frontend/**` (including `frontend/public/fixtures/**`) or `backend/app/api/voice.py`; do NOT call ElevenLabs/STT or return audio.
- **Do NOT** let the model emit `span_id`s, `on_enter`, `next`, `cues`, `id`, `lesson_id`, or `check_question`; the server assembles and validates them.
- **Do NOT** add `minLength`/`maxLength`/range keywords, enums, optionals, or defaults to the LLM draft schemas; enforce bounds in code.
- **Do NOT** use LangGraph/agent frameworks, a vector DB, embeddings, keyword-retrieval, OCR, Supabase/accounts, server-side `LessonState`, WebSockets, `check_question` flow, multi-document lessons, streaming plan responses, or a `202`/job queue.
- **Do NOT** make more than **2** LLM calls per lesson (ladder) or more than 2 attempts for a Q&A answer (plus SDK `max_retries=1`); do NOT let SDK retries stack on the plan call (`max_retries=0`).
- **Do NOT** cache failed generations; do NOT serve a cached/LLM plan that fails `validate_plan_against_index`; do NOT return any plan with a hard violation.
- **Do NOT** mint random `lesson_id`s anywhere; do NOT build filesystem paths from unvalidated ids.
- **Do NOT** change the extraction loop's line ordering or id assignment (fixture ids depend on it), and do NOT rewrite fixtures except via the T-013 CLI.
- **Do NOT** fuzzy-match Q&A cites; out-of-range labels are dropped.
- **Do NOT** emit `clear_highlights` or `scroll_to_page` from Q&A (P1's `normalizeViewerCommands` and P3's `onEnterToCommands` own those).
- **Do NOT** log prompts, PDF text, API keys, or provider error bodies; do NOT put provider text into HTTP `detail`.
- **Do NOT** implement `PLAN_STRATEGY=paged` unless the T-013/T-020 gate trips; do NOT add features, endpoints, or fields not in the design (e.g. machine-readable error `code` is parked).
- **Do NOT** edit the solution design, problem definition, or other upstream docs; surface issues via §4 and route to `solution-design`.

---

## 15. Definition of Done

The P2 implementation is done when:

1. Every **[Must]** task (T-001 – T-020 except where tagged Should/Could) is complete with all acceptance boxes ticked, and each skipped **[Should]/[Could]** item is explicitly recorded as skipped in the execution log.
2. All items in §9.1 (system acceptance) are ticked, including the recorded latency-gate decision.
3. `.venv/bin/python -m pytest -q` is green offline; live ping, hour-0 CLI, and the §8.2 API smoke have been run once each with outputs saved in the execution log.
4. `shared/fixtures/sample-document-index.json` (175 spans) and `sample-lesson-plan.json` (`les_demo`, real plan) pass the same validator as live plans; CP-F sent.
5. CP1, CP2, CP3, and CP-Final messages have been sent; P1/P3 confirmations (or "no response") are logged.
6. §4 ⚑ items (G-01, G-03, G-07) are confirmed or their fallbacks applied.
7. No file outside the permitted ownership list in §7.3 changed; `shared/schemas/**` and `frontend/**` diffs are empty.
8. Residual risks (§13) and untested assumptions (§12) are listed in the final execution log for the post-implementation review.

**Next step:** this plan is ready for approval. After approval, invoke the **`execute-implementation-plan`** subagent with `implementation_plans/p2-lesson-engine-mvp.md` (and keep `docs/p2-solution-design.md` as the governing design).
