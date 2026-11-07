# P2 (lesson engine) — scope outline

Brief input for **solution design + implementation plan**. Contract: [CONTRACT-v0.1.md](../shared/CONTRACT-v0.1.md), [team-mvp-integration-plan.md](./team-mvp-integration-plan.md) §9.

**Design:** [p2-solution-design.md](./p2-solution-design.md)  
**Implementation plan:** [p2-implementation-plan.md](./p2-implementation-plan.md) → [implementation_plans/p2-lesson-engine-mvp.md](../implementation_plans/p2-lesson-engine-mvp.md)  
**Manual testing:** [p2-manual-testing.md](./p2-manual-testing.md)  
**P1/P3 merge handoff:** [p2-integration-handoff.md](./p2-integration-handoff.md)

---

## 1. Your role in one sentence

You turn an uploaded PDF into a **cached `DocumentIndex` + `LessonPlan`**, and answer interrupt **Q&A** with **grounded text + `cite_span_ids` + `viewer_commands`** — all over **REST**. You do **not** run the lesson, voice, or PDF UI.

---

## 2. Where you sit in the system

```text
                    ┌─────────────────────────────────────┐
                    │           Frontend (browser)         │
                    │  P1: PDF + executeCommands           │
                    │  P3: orchestrator + TTS/STT        │
                    └──────────────┬──────────────────────┘
                                   │ HTTP only
                    ┌──────────────▼──────────────────────┐
                    │         P2: FastAPI (you)             │
                    │  ingest → index → plan → /qa         │
                    └──────────────┬──────────────────────┘
                                   │
              OpenAI (plan + Q&A)  │  PyMuPDF (ingest)
              local disk cache     │
```

**Data flow (happy path):**

1. P1 `POST /documents` → you extract lines → store PDF + index JSON.
2. P1 `POST /documents/{id}/lessons` → you LLM-generate plan → validate → cache → **200** + `LessonPlan`.
3. P3 plays segments; on interrupt, P3 `POST /lessons/{id}/qa` → you return answer + citations + viewer commands.

---

## 3. What you own (files)

| Area | Path |
|------|------|
| Schemas (propose, trio approves) | `shared/schemas/**`, keep `app/models/schemas.py` in sync |
| Fixtures / golden pipeline | `shared/fixtures/*` (hour 0: PDF → index → lesson JSON) |
| Ingest | `app/services/pdf_extract.py` |
| Lesson LLM | `app/services/lesson_generator.py`, `app/services/llm.py` |
| Q&A | `app/services/rag.py` |
| Routes | `app/api/documents.py`, `lessons.py`, `qa.py` |
| Persistence | `app/storage/local.py`, `backend/data/` |

**Not yours:** `frontend/**`, `app/api/voice.py`, orchestrator, ElevenLabs.

---

## 4. Scaffold status (today)

| Piece | Status |
|-------|--------|
| Line-level `pdf_extract` | **Implemented** |
| Upload + `GET` index/file | **Implemented** (demo uses fixtures) |
| Pydantic models | **Match v0.1** (`page`, `cues`, QA context fields) |
| `POST …/lessons` | **Fixture only** (`use_fixture=True`); real upload hits `NotImplementedError` |
| `POST …/qa` | **Fixture response** always |
| `validate_plan_against_index()` | **Stub** — no `page` vs span page check yet |
| Lesson plan **caching** | Writes `lesson_id.json` on success path only |
| Embeddings / vector DB | **Not started** (optional for MVP) |

---

## 5. What must be implemented (MVP checklist)

### A. Ingestion & hour-0 fixtures

- [ ] Team `golden-demo.pdf` → run extract → commit `sample-document-index.json` (`document_id: doc_demo`).
- [ ] Harden ingest: empty PDF, scanned/no text (fail fast with clear error), max pages (~10).
- [ ] Optional: validate line count / log stats for demo.

### B. Lesson generation (`lesson_generator.py`)

- [ ] Build **LLM input** from `DocumentIndex` (compact): per-line `span_id`, `page`, truncated `text` — not full PDF if huge.
- [ ] **Structured output** → `LessonPlan` (OpenAI JSON schema / `response_format` aligned with Pydantic).
- [ ] **Post-validate:** all `span_id`s exist; each `segment.page` consistent with cited lines; `cues: []`; segment count 5–12; narration length.
- [ ] **One retry** on validation failure with error feedback in prompt.
- [ ] Set `use_fixture=False` in `create_lesson` for non-demo docs; **synchronous 200** (contract).
- [ ] **Idempotency:** if plan already exists for `document_id`, return cache (define key: one lesson per doc for MVP).

### C. Grounded Q&A (`rag.py`)

- [ ] Load `DocumentIndex` + `LessonPlan` for `lesson_id`.
- [ ] Context: current segment + `narration_delivered` / `qa_turns` from `QARequest`.
- [ ] Retrieval MVP: segment `span_ids` text + keyword/simple overlap on all lines (embeddings optional).
- [ ] LLM answer with **mandatory** `cite_span_ids` only from retrieved lines; else refuse.
- [ ] Build `viewer_commands` via `viewer_commands_for_spans()` (already exists).
- [ ] Optional one-sentence `bridge` for P3 resume.

### D. API polish

- [ ] `qa.py`: resolve lesson → document index; 404 if missing.
- [ ] Consistent errors (422 ingest, 404 missing, 502 LLM failure with safe message).
- [ ] CORS unchanged; document routes for P1.

---

## 6. Constraints (do not fight these in design)

| Constraint | Implication for P2 |
|------------|-------------------|
| Browser orchestrator | No server `LessonState`, no WebSockets |
| Sync lesson `POST` | No job queue; optimize prompt + model; timeout UX on P1 |
| Line units only | Lesson must reference `p{n}_l{i}` from **your** index |
| `segment.page` required | LLM must output page; validate against span pages |
| Segment 15–30s | Prompt + post-check word count |
| `cues: []` | Do not generate timed highlights |
| No Supabase | File cache under `backend/data/` |
| P3 voice out of scope | Return **text** only |

---

## 7. Design choices to nail in solution design

1. **LLM packaging for plan:** single call vs outline-then-segments (time vs quality).
2. **Index → prompt compression:** cap lines/tokens; page-aware chunking for long PDFs.
3. **RAG depth:** in-segment only vs whole-doc keyword retrieval for Q&A.
4. **Models:** plan = fast/cheap; Q&A = same or slightly stronger; structured output API shape.
5. **Cache keys:** `{document_id}.lesson.json` vs `{lesson_id}` — who generates `lesson_id` (currently UUID in route).
6. **`page` validation:** `segment.page` must equal `scroll_to_span` line’s page (or majority of highlights).
7. **Hallucination policy:** strip invalid span refs vs hard fail vs retry only.

**Prior art (see [pdf-voice-lesson-llm-workflow.md](./pdf-voice-lesson-llm-workflow.md)):** offline plan + runtime Q&A worked in LearnAloud/TeachBack; failure modes were sync polish and span alignment — your line units + `page` field address alignment for MVP.

---

## 8. Integration touchpoints (coordinate, don’t guess)

| Consumer | Needs from you |
|----------|----------------|
| **P1** | Stable routes; `index` on `GET /documents/{id}`; file URL; upload errors |
| **P3** | `LessonPlan.segments[].narration`, `on_enter`; Q&A `answer`, `viewer_commands`, `bridge` |
| **P1/P3** | Do not change `ViewerCommand` union without schema bump |

**You consume from P3 (QA request):** `playback_ms`, `narration_delivered`, `qa_turns` — use in Q&A prompt.

---

## 9. Suggested build order (4h hackathon)

1. Hour 0: golden PDF pipeline + fixtures committed.
2. Lesson gen end-to-end on golden doc (CLI or API) with validation.
3. Wire `create_lesson` off fixture; P1 can upload real PDF.
4. Q&A real implementation + wire `use_fixture=False`.
5. Cache, errors, smoke: upload → plan → one Q&A.

---

## 10. Definition of done (P2)

- [ ] Upload team golden PDF → index with real line ids.
- [ ] `POST …/lessons` returns valid plan (≥3 segments, all refs valid).
- [ ] `POST …/qa` answers from doc with cites; empty cites when unanswerable.
- [ ] `GET /health` + demo paths still work.
- [ ] No schema change without trio + `CONTRACT` bump.

---

## 11. Out of scope (explicit)

Realtime voice LLM, LangGraph, word-level `cues`, embeddings/Qdrant unless time, Supabase, OCR, multi-document lessons, `check_question` quiz flow, server-side TTS proxy (P3).
