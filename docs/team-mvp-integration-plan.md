# MVP integration plan (3–4 hours)

Team alignment doc for **Person 1 (frontend/PDF)**, **Person 2 (LLM/lesson engine)**, and **Person 3 (voice/orchestration)**. Complements [split.md](./split.md), [features.md](./features.md), and [pdf-voice-lesson-llm-workflow.md](./pdf-voice-lesson-llm-workflow.md).

---

## 1. What prior projects teach us (steal / skip)

| Project | **Steal for MVP** | **Skip / defer (learned the hard way)** |
|---------|-------------------|----------------------------------------|
| [LearnAloud](https://devpost.com/software/learnaloud-4qgti9) | PyMuPDF span + bbox metadata; **client actions** in structured output (scroll/highlight commands); offline doc prep | **Sub-200ms** speech↔highlight sync; pre-computed syllable timeline; multi-agent librarian/navigator |
| [TeachBack](https://devpost.com/software/live_teacher) | **Checkpoint state** outside the model; interrupt → sidecar Q&A → **feed context back**; retrieval driven by current segment, not whole PDF in context | Full Gemini Live stack if team already chose ElevenLabs pipeline; silent background grounding worker |
| [Vaani](https://github.com/Rudra1729/Vaani) | Grounded answers with **page + passage**; auto-scroll to citation; RAG over chunks | Perfect span matching across encodings; wake-word / podcast mode; mind maps |
| [HackNYU Agora](https://github.com/harshagarwalnyu/HackNYU-Agora) | Explicit **pedagogy / lesson states**; RAG on uploaded material | LangGraph + Qdrant + Docling in one hack — too heavy unless ingestion is already done |
| [ReadAble](https://devpost.com/software/readable-7r1eu2) / [Aha](https://devpost.com/software/aha-ze2hqg) | **Structured JSON** from LLM with retries; optional **clause splits** for later TTS sync | Word-level highlight timing unless P3 has ElevenLabs timestamps working |

**Hackathon bottom line (P2):** Ship **offline `LessonPlan` + span index + grounded Q&A API**. Let P3 own playback state; let P1 own executing `ViewerCommand`s. Do **segment-level** highlight (one scroll + highlight set per segment), not clause-level sync.

---

## 2. MVP definition (one sentence)

> User uploads a PDF → backend builds a **cached lesson** → user presses play → voice reads each segment’s `narration` while the viewer runs `on_enter` → user can **pause, ask a question**, get a **cited** answer → **resume** the same segment index.

Everything else in [features.md](./features.md) is **bonus** (accounts, Supabase history, streaks, annotations beyond highlight).

---

## 3. Recommended repo layout (contract-first)

Single repo, three branches merging to `main`. **Shared contracts live on `main` first** (or a short-lived `contracts` branch merged before feature work).

```text
greatunihack2026/
├── docs/                          # Already here
├── shared/
│   ├── schemas/                   # Source of truth (JSON Schema or OpenAPI components)
│   │   ├── document-index.json    # spans, pages, bboxes
│   │   ├── lesson-plan.json       # segments + narration + on_enter
│   │   ├── viewer-commands.json   # scroll_to, highlights[], page fallback
│   │   └── lesson-state.json      # checkpoint for P3 orchestrator
│   ├── fixtures/
│   │   ├── sample-lesson-plan.json
│   │   └── sample-document-index.json
│   └── types/                     # Optional: generated TS + Python from schemas
├── backend/                       # FastAPI — P2 owns core; P3 adds voice routes
│   ├── app/
│   │   ├── main.py
│   │   ├── api/
│   │   │   ├── documents.py       # upload, ingest status
│   │   │   ├── lessons.py         # generate + fetch LessonPlan
│   │   │   ├── qa.py              # grounded follow-up
│   │   │   └── health.py
│   │   ├── services/
│   │   │   ├── pdf_extract.py     # PyMuPDF → DocumentIndex
│   │   │   ├── lesson_generator.py
│   │   │   ├── rag.py             # MVP: in-memory or simple vector store
│   │   │   └── llm.py
│   │   ├── models/                # Pydantic mirrors shared/schemas
│   │   └── storage/               # MVP: local disk; later Supabase
│   ├── requirements.txt
│   └── .env.example
├── frontend/                      # Next.js — P1
│   ├── src/
│   │   ├── components/pdf/
│   │   ├── components/lesson/
│   │   ├── lib/api.ts
│   │   └── lib/viewer-commands.ts  # executes ViewerCommand[]
│   └── package.json
└── README.md                      # how to run all three locally
```

**Why `shared/` matters:** Most integration bugs are schema drift. P1 can build the viewer against **fixtures** before P2’s LLM is done; P3 can play audio from fixture `narration` while wiring ElevenLabs.

---

## 4. The four contracts (agree before coding)

### 4.1 `DocumentIndex` (P2 produces, P1 consumes for highlights)

Minimum fields per span:

```json
{
  "document_id": "doc_abc",
  "pages": [{ "page": 1, "width": 612, "height": 792 }],
  "spans": [
    {
      "span_id": "p1_s0",
      "page": 1,
      "text": "Osmosis is...",
      "bbox": { "x0": 72, "y0": 120, "x1": 400, "y1": 136 }
    }
  ]
}
```

**Team decision:** PDF user space coords (PyMuPDF default) vs normalized 0–1. **Pick PyMuPDF rect and document in README** — P1 transforms using pdf.js viewport scale.

**Fallback rule:** If highlight fails fuzzy match, `scroll_to_page` only (no silent wrong box).

### 4.2 `LessonPlan` (P2 produces, P3 reads, P1 uses `on_enter`)

```json
{
  "lesson_id": "les_xyz",
  "document_id": "doc_abc",
  "title": "Chapter 3 — Cell membrane",
  "segments": [
    {
      "id": "seg_01",
      "goal": "Define osmosis",
      "span_ids": ["p1_s0", "p1_s1"],
      "narration": "We'll start with osmosis...",
      "on_enter": {
        "scroll_to_span": "p1_s0",
        "highlights": ["p1_s0", "p1_s1"]
      },
      "check_question": null,
      "next": "seg_02"
    }
  ]
}
```

**MVP cap:** 5–12 segments, ~30–90s narration each (hackathon PDF = a few pages, not a whole textbook).

### 4.3 `ViewerCommand` (P1 implements; P2/P3 only emit via plan or orchestrator)

Union type P1 executes:

- `{ "type": "scroll_to_span", "span_id": "p1_s0" }`
- `{ "type": "scroll_to_page", "page": 3 }`
- `{ "type": "set_highlights", "span_ids": ["p1_s0"] }`
- `{ "type": "clear_highlights" }`

P3 fires `on_enter` when a segment **starts** (not word-synced).

### 4.4 `LessonState` (P3 owns runtime; P2 reads for Q&A)

```json
{
  "lesson_id": "les_xyz",
  "status": "teaching",
  "segment_id": "seg_01",
  "segment_index": 0,
  "open_loops": [],
  "interrupt": null
}
```

On interrupt: `status: "paused"`, store `interrupt: { "question", "at_segment_id" }`. After Q&A: P3 sets `status: "teaching"` and same `segment_id` (or `segment_index + 1` if team chooses “skip ahead” — **pick one default: resume same segment**).

**Q&A request** (P3 → P2):

```json
{
  "lesson_id": "les_xyz",
  "segment_id": "seg_01",
  "question": "Why does water move?",
  "max_cite_spans": 5
}
```

**Q&A response** (P2):

```json
{
  "answer": "...",
  "cite_span_ids": ["p1_s1"],
  "viewer_commands": [
    { "type": "scroll_to_span", "span_id": "p1_s1" },
    { "type": "set_highlights", "span_ids": ["p1_s1"] }
  ],
  "bridge": "Back to the membrane..."
}
```

`bridge` is optional one sentence P3 can speak before resuming narration.

---

## 5. API surface (P2 implements first; stub returns fixtures)

| Method | Path | Owner | Purpose |
|--------|------|-------|---------|
| `POST` | `/documents` | P2 | Upload PDF → `document_id`, start ingest |
| `GET` | `/documents/{id}` | P2 | Ingest status + `DocumentIndex` when ready |
| `POST` | `/documents/{id}/lessons` | P2 | Generate `LessonPlan` (idempotent: same doc → cache) |
| `GET` | `/lessons/{id}` | P2 | Fetch plan + document_id |
| `POST` | `/lessons/{id}/qa` | P2 | Grounded interrupt answer |
| `GET` | `/health` | anyone | CI + integration check |

P3 may add `/lessons/{id}/tts` later; **MVP:** P3 calls ElevenLabs from frontend or backend with `segment.narration` text — no P2 change required.

**CORS:** P2 enables frontend origin on day one.

---

## 6. Pre-development agreements (~20–30 min, do this now)

Checklist — every person says yes/no:

1. **Golden PDF:** One 2–5 page lecture PDF everyone tests on (named file in `shared/fixtures/`).
2. **Schema version:** `shared/schemas/*` v0.1 frozen for 2 hours; changes only via quick trio huddle.
3. **Coord system:** PyMuPDF bboxes + P1 scale math — documented in `shared/README.md` (one paragraph).
4. **Segment sync level:** Segment-level highlight at segment start (not word-level).
5. **Resume semantics:** After Q&A, replay remainder of segment narration or skip to next — **default: resume from start of segment** (simplest).
6. **LLM provider:** OpenAI model names + who holds API key (env var `OPENAI_API_KEY` in backend only).
7. **Voice stack:** ElevenLabs STT/TTS on P3; P2 returns text only.
8. **Database:** Supabase optional for hackathon; **default local disk** for PDF + JSON cache to save time.
9. **Branch strategy:** PRs to `main` only for `shared/` + `backend` skeleton; feature branches per person.
10. **Integration times:** T+90 min and T+180 min — 15 min merge + smoke test (upload → plan → play one segment → one question).

---

## 7. Parallel work without blocking

| Person | Hour 0–1 | Hour 1–2 | Hour 2–3 | Hour 3–4 |
|--------|----------|----------|----------|----------|
| **P2** | `DocumentIndex` extract + fixture; stub APIs | `LessonPlan` LLM + validation | RAG Q&A + citations | Polish, cache, error messages |
| **P1** | PDF viewer + page scroll; load fixture index | Execute `ViewerCommand` from fixture plan | Wire upload + poll ingest | Lesson panel UI + highlight QA |
| **P3** | Play fixture `narration` via TTS; transcript | Segment index state machine | Interrupt button + STT → `/qa` | Resume + emit commands to P1 |

**Mocks:**

- P1: `fetch('/lessons/demo')` → static JSON in `public/` until backend ready.
- P3: Same fixture; fake Q&A response JSON for UI flow.
- P2: CLI `python -m app.services.pdf_extract fixtures/sample.pdf` prints span count.

---

## 8. P2 LLM workflow (detailed, time-boxed)

### Ingestion (no LLM)

1. PyMuPDF: per page, `get_text("dict")` → spans with bbox + text.
2. Assign stable `span_id` = `p{page}_s{index}`.
3. Drop empty spans; merge tiny fragments if needed (optional).

### Lesson generation (one LLM call, structured output)

**Input:** concatenated outline — page headings + first N chars per span (not full PDF if huge).

**Prompt constraints:**

- Output must match `lesson-plan.json` schema.
- Every `span_id` in output must exist in `DocumentIndex` (validate in code; retry once on failure).
- Narration: conversational, 2–4 sentences per segment.
- Teaching order follows document order unless PDF is obviously appendix-first.

**Model:** cheaper/faster for plan (`gpt-4o-mini` or equivalent); same or better for Q&A.

### Q&A (per interrupt)

**Context assembly:**

- Current segment `goal`, `narration`, `span_ids`.
- Retrieved chunks: spans in segment + top-k similar spans from full doc (embeddings optional MVP: keyword overlap or full-doc truncate if &lt; 8k tokens).

**Grounding rule:** If no span supports answer, return `"I don't see that in this document"` and empty `cite_span_ids`.

### What P2 does **not** build in MVP

- Realtime OpenAI/Gemini voice session.
- Word-timed highlight pipeline.
- LangGraph (use plain functions + enums for `LessonStatus`).
- Supabase unless ingest is done early.

---

## 9. During development — communication norms

- **#integration** or single Discord thread: post **only** schema/API changes + sample curl.
- **Definition of done per PR:** passes `GET /health`, doesn’t break fixtures.
- **No hidden fields:** if P3 needs `segment_index`, add to schema — don’t parse ad hoc.
- **Pair debug list:** highlight wrong → P2 bbox or P1 transform; voice desync → P3 timing (not P2); bad teaching → P2 prompt/validation.

---

## 10. Smoke test script (end of hackathon)

1. Upload golden PDF.
2. Wait for `DocumentIndex` (N spans &gt; 0).
3. Generate lesson (≥ 3 segments).
4. Play segment 0: hear audio + see highlight on expected page.
5. Interrupt with question answerable from PDF → see citation highlight.
6. Resume: segment continues or restarts per agreed rule.
7. Advance to segment 1 manually.

---

## 11. Risk register (P2)

| Risk | Mitigation |
|------|------------|
| LLM invalid JSON | Pydantic validate + 1 retry with error feedback |
| Hallucinated span_ids | Post-validate against index; drop invalid refs |
| Ingest slow | Return 202 + poll; show spinner on P1 |
| PDF is scanned image | MVP: fail fast with “needs text PDF”; OCR is out of scope |
| Token limit | Plan from outline + span samples, not full raw text |
| Team merge conflicts | P2 owns `backend/app/services/*` and `shared/schemas`; P3 owns `backend/app/api/voice*` or `frontend` voice hooks |

---

## 12. Open decisions for trio (resolve in first 30 min)

1. Monorepo `frontend/` + `backend/` on `main` skeleton — who commits initial scaffold?
2. Resume same segment vs continue from pause point?
3. Single FastAPI process for P2+P3 vs split — **recommend single `backend/`** process.
4. Embed Supabase now or post-MVP?
5. Maximum PDF pages for demo (suggest **≤ 10**).

---

## References

- Internal: [pdf-voice-lesson-llm-workflow.md](./pdf-voice-lesson-llm-workflow.md)
- LearnAloud: [Devpost](https://devpost.com/software/learnaloud-4qgti9), [GitHub layout](https://github.com/psantanusaha/learn-aloud)
- TeachBack: [Devpost](https://devpost.com/software/live_teacher)
- Vaani: [GitHub](https://github.com/Rudra1729/Vaani)
- Agora: [GitHub](https://github.com/harshagarwalnyu/HackNYU-Agora)
