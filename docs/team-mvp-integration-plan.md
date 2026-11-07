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

**Hackathon bottom line (P2):** Ship **offline `LessonPlan` + line-level document index + grounded Q&A API**. P3 owns **browser** playback state; P1 executes `ViewerCommand`s. MVP: **`on_enter`** highlight only (empty `cues`), not clause-level sync.

---

## 2. MVP definition (one sentence)

> User uploads a PDF → backend builds a **cached lesson** → user presses play → voice reads each segment’s `narration` while the viewer runs `on_enter` → user can **pause, ask a question**, get a **cited** answer → **resume** the same segment index.

Everything else in [features.md](./features.md) is **bonus** (accounts, Supabase history, streaks, annotations beyond highlight).

---

## 2.1 Architecture decisions (resolve before coding)

Review objections — **what must be true on day 1** vs **what can wait**.

| Topic | **Decision for this hackathon** | Satisfy **now**? | Owner |
|--------|----------------------------------|------------------|--------|
| **Where orchestrator runs** | **Browser-only TypeScript** (`frontend/src/lib/lesson-orchestrator.ts` + `useLessonSession`). Backend = **REST only** (upload, index, plan, Q&A). No WebSocket unless you finish MVP early and want polish. | **Yes** — agree in stand-up; no server-side lesson FSM. | P3 |
| **`LessonState`** | Lives **only in frontend memory** (Zustand/context/hook). Not stored on server in MVP. | **Yes** — schema is a **TypeScript contract**, not a backend model. | P3 |
| **Resume after interrupt** | Store `narration_offset_ms` (and optionally `narration_delivered` text) in `interrupt`. Resume TTS from that offset, not from segment start. | **Schema now**; ElevenLabs seek implementation **hour 2–3**. | P3 |
| **Q&A context** | `POST /lessons/{id}/qa` accepts optional `narration_delivered`, `playback_ms`, `qa_turns[]` so answers match what was just said. | **Schema + types now**; P2 uses fields when wiring RAG. | P2 + P3 |
| **Text units for highlights** | **One PyMuPDF line → one `span_id`** (union bbox). IDs like `p1_l0`. Field name stays `span_id` for stable API; `unit_kind: "line"` on each unit. **Not** raw font spans. | **Yes** — P2 changes `pdf_extract.py` (done in scaffold). | P2 |
| **Segment length** | Target **15–30s** narration per segment (~2–4 sentences) so static highlights feel OK. | **Yes** — lesson prompt constraint. | P2 |
| **Mid-segment highlight sync** | MVP: `on_enter` only at segment start. **V1+:** optional `cues[]` on segment (char offsets + commands) with ElevenLabs timestamps. | **Defer cues**; optional empty `cues` in schema for forward compat. | P2 later / P3 later |
| **`DocumentIndex` to browser** | `GET /documents/{id}` returns `{ status, index }` when ready. P1 caches index client-side for viewer + highlight lookup. Optional alias `GET /documents/{id}/index` = same payload. | **Yes** — document in API §6; P1 polls after upload. | P1 + P2 |
| **Page numbers** | **1-based** everywhere (PyMuPDF `page_idx + 1`). | **Yes** — already in extractor. | P2 |
| **`open_loops`** | Topics to revisit later in the lesson — **post-MVP**. Omit from runtime state for hackathon. | **Drop from MVP state** (schema optional / docs only). | — |
| **`check_question`** | Optional end-of-segment micro-check — **post-MVP** (no auto-quiz flow in 4h). | Keep on `LessonSegment` as nullable, ignore in player. | — |
| **Invalid `span_id`** | No fuzzy matching: unknown ID → **`scroll_to_page`** using **`segment.page`**. | **Yes** — each segment has required `page` (1-based). | P2 + P1 |
| **TTS / STT API** | **TTS:** ElevenLabs in browser. **STT:** Web Speech API (P3). Proxy only for public deploy. | **STT pick in §7.1**; keys on localhost OK. | P3 |

**Bottom line:** Claude’s orchestrator-on-server concern is valid — **reject server orchestrator for MVP**. The rest is mostly **schema clarity + shorter segments + line units + resume offset**; word-level `cues` and `open_loops` do **not** block start.

---

## 3. File ownership (who edits what)

**Rule:** Do not edit another person’s primary paths without a quick sync. **Everyone** may read everything; **schema changes** need all three in the loop.

### Person 1 — Frontend & PDF viewer

| Owns (implement here) | Touches only for integration |
|------------------------|------------------------------|
| `frontend/src/components/pdf/**` — react-pdf viewer, scroll, bbox highlights | `frontend/src/app/page.tsx` — layout wiring |
| `frontend/src/components/lesson/**` — upload, lesson text panel, API polling | `frontend/src/lib/api.ts` — add client methods if new routes |
| `frontend/src/lib/viewer-commands.ts` — **`executeCommands`** + shared **`onEnterToCommands`** | `shared/schemas/viewer-commands.json` — propose changes to P2 |
| `frontend/public/**` — static assets, copy of fixtures for offline dev | |

**Does not own:** `backend/app/services/*`, `frontend/src/components/voice/*`, LLM prompts, ElevenLabs keys.

### Person 2 — AI & lesson engine

**After P2 merge:** [p2-integration-handoff.md](./p2-integration-handoff.md) (scaffold deltas, CP messages, merge conflict hints).

| Owns (implement here) | Touches only for integration |
|------------------------|------------------------------|
| `shared/schemas/**` — propose contract changes (trio approval) | `backend/app/main.py` — CORS only if needed |
| `shared/fixtures/**` — golden JSON + later golden PDF | `backend/app/models/schemas.py` — keep in sync with `shared/schemas` |
| `backend/app/services/pdf_extract.py` | |
| `backend/app/services/lesson_generator.py` | |
| `backend/app/services/rag.py` | |
| `backend/app/services/llm.py` | |
| `backend/app/api/documents.py` | |
| `backend/app/api/lessons.py` | |
| `backend/app/api/qa.py` | |
| `backend/app/storage/**` | |

**Does not own:** PDF React components, voice player UI, `backend/app/api/voice.py` (P3).

### Person 3 — Voice & lesson orchestration

| Owns (implement here) | Touches only for integration |
|------------------------|------------------------------|
| `frontend/src/components/voice/**` — TTS/STT, transcript, play/pause/interrupt | `frontend/src/app/page.tsx` — pass viewer command callback to P1 |
| `frontend/src/lib/lesson-orchestrator.ts` — **browser** FSM: teach / pause / qa / resume | |
| `frontend/src/hooks/useLessonSession.ts` — segment state + command bus to P1 | |
| `backend/app/api/voice.py` — optional server-side ElevenLabs proxy | `frontend/src/lib/api.ts` — voice-specific endpoints only |
| Runtime **`LessonState`** (in React state or small store); **not** persisted in MVP unless agreed | `shared/schemas/lesson-state.json` — propose fields to trio |

**Does not own:** PyMuPDF ingest, lesson JSON generation, highlight geometry math (P1).

### Shared / integration (all three)

| Path | How we work it |
|------|----------------|
| `frontend/src/lib/types.ts` | P2 defines shape via schemas; P1 updates types when schemas change; P3 consumes `LessonPlan` / `LessonState` |
| `frontend/src/lib/api.ts` | P1 maintains HTTP client; P2 documents routes; P3 adds calls for QA + voice |
| `frontend/src/app/page.tsx` | **Integration shell** — each person lands components here at T+2h |
| `docs/*`, root `README.md` | Anyone; keep run instructions accurate |

### Branch suggestion

| Person | Branch (example) | Merge target |
|--------|------------------|----------------|
| P1 | `feat/frontend-pdf` | `main` |
| P2 | `feat/lesson-engine` (you: `abs`) | `main` |
| P3 | `feat/voice-player` | `main` |

Merge **`shared/` + skeleton** first so branches rebase cleanly.

---

## 3.5 UI layout, viewer glue, and PDF bytes (agreed)

**Resolve before parallel dev:** yes — these are integration boundaries, not extra features.

### Screen wireframe

```text
┌────────────────────────────────────┬──────────────────────┐
│  P1: PdfViewer                     │  P3: LessonPlayer    │
│  (PDF + highlight overlays)        │  play / pause / ask    │
│                                    │  live transcript       │
│                                    ├──────────────────────┤
│                                    │  P1: LessonPanel     │
│                                    │  upload, segment list  │
│                                    │  static lesson text    │
└────────────────────────────────────┴──────────────────────┘
         ▲                                      │
         │         page.tsx wires props         │
         └──────────────────────────────────────┘
           executeCommands(commands, handlers, fallbackPage)
```

| UI block | Owner | Component | Not owned by |
|---------|--------|-----------|--------------|
| Left column | **P1** | `components/pdf/PdfViewer` | P3 |
| Top-right | **P3** | `components/voice/LessonPlayer` | P1 |
| Bottom-right | **P1** | `components/lesson/LessonPanel` | P3 (no play/pause/transcript here) |
| Layout shell | **All** | `app/page.tsx` | — |

P1 provides a **stable ref/callback** that runs `executeCommands(commands, handlers, fallbackPage)` on the viewer, where `handlers` is the `PdfViewerHandle` ref and `fallbackPage` is `segment.page`. P3 passes `onViewerCommands` into `LessonPlayer`; `page.tsx` connects them.

### `on_enter` → viewer

1. **P3** (or orchestrator) calls `onEnterToCommands(segment.on_enter)` from `frontend/src/lib/viewer-commands.ts`.
2. **P1** implements `executeCommands(commands, handlers, fallbackPage)` — same function for Q&A `viewer_commands`. `handlers` is the `PdfViewerHandle` ref; `fallbackPage` is `segment.page`.
3. **On resume after Q&A:** P3 calls `resumeAfterQA()` in orchestrator, which **re-fires** `onEnterToCommands` for the current segment so citation highlights are replaced by the segment’s `on_enter` set.

### PDF file for the viewer

| Scenario | Source |
|----------|--------|
| After upload | `GET /documents/{id}/file` → `backend/data/{id}.pdf` |
| `doc_demo` / refresh | `GET /documents/doc_demo/file` if `shared/fixtures/golden-demo.pdf` exists |
| API down | `frontend/public/documents/golden-demo.pdf` (`DEV_DOCUMENT_PDF` in `api.ts`) |

**Hour 0 pipeline:** `golden-demo.pdf` → ingest → `sample-document-index.json` → lesson plan fixture/LLM → `sample-lesson-plan.json`. Copy PDF to `frontend/public/documents/` optional.

---

## 4. Repo layout (scaffolded on `main`)

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

**Scaffold status:** `shared/`, `backend/`, and `frontend/` exist with stubs. Demo IDs: `doc_demo`, `les_demo`. Backend returns fixtures until P2 implements real ingest/LLM.

**P2:** [p2-solution-design.md](./p2-solution-design.md) (approved) · [p2-implementation-plan.md](./p2-implementation-plan.md)

---

## 5. The four contracts (agree before coding)

### 5.1 `DocumentIndex` (P2 produces, P1 consumes for highlights)

**Delivery:** `GET /documents/{document_id}` → `index` when `status: ready`. P1 stores this for the session (highlights + scroll).

Each entry in `spans[]` is a **line-level text unit** (not a PyMuPDF font span):

```json
{
  "document_id": "doc_abc",
  "pages": [{ "page": 1, "width": 612, "height": 792 }],
  "spans": [
    {
      "span_id": "p1_l0",
      "unit_kind": "line",
      "page": 1,
      "text": "Osmosis is the net movement of water...",
      "bbox": { "x0": 72, "y0": 120, "x1": 520, "y1": 136 }
    }
  ]
}
```

**Pages:** **1-indexed** (first page = `1`).

**Coords:** PyMuPDF user space; P1 scales via pdf.js viewport.

**Fallback rule:** Unknown `span_id` → `scroll_to_page` to **`segment.page`** (required on every segment).

### 5.2 `LessonPlan` (P2 produces, P3 reads, P1 uses `on_enter`)

**Canonical schema:** [shared/schemas/lesson-plan.json](../shared/schemas/lesson-plan.json)

Each **segment** required fields: `id`, `goal`, **`page`** (1-based), `span_ids`, `narration`, `on_enter`, `cues`, `next`. Optional: `check_question`.

```json
{
  "lesson_id": "les_xyz",
  "document_id": "doc_abc",
  "title": "Chapter 3 — Cell membrane",
  "segments": [
    {
      "id": "seg_01",
      "goal": "Define osmosis",
      "page": 1,
      "span_ids": ["p1_l0", "p1_l1"],
      "narration": "We'll start with osmosis...",
      "on_enter": {
        "scroll_to_span": "p1_l0",
        "highlights": ["p1_l0", "p1_l1"]
      },
      "cues": [],
      "check_question": null,
      "next": "seg_02"
    },
    {
      "id": "seg_02",
      "goal": "Apply to plant cells",
      "page": 2,
      "span_ids": ["p2_l0"],
      "narration": "In plants, turgor pressure depends on this flow...",
      "on_enter": {
        "scroll_to_span": "p2_l0",
        "highlights": ["p2_l0"]
      },
      "cues": [],
      "check_question": null,
      "next": null
    }
  ]
}
```

**MVP cap:** 5–12 segments, **~15–30s narration each** (2–4 sentences). `cues[]` optional — empty in MVP; future: `{ "at_ms": 1200, "commands": [...] }` for ElevenLabs sync.

**`check_question`:** optional field; **not used** in MVP player (quiz flow later).

### 5.3 `ViewerCommand` (P1 applies; P3 converts `on_enter`)

Union type:

- `{ "type": "scroll_to_span", "span_id": "p1_l0" }`
- `{ "type": "scroll_to_page", "page": 3 }`
- `{ "type": "set_highlights", "span_ids": ["p1_l0"] }`
- `{ "type": "clear_highlights" }`

**Glue (in `viewer-commands.ts`):**

- `onEnterToCommands(on_enter)` — **P3 calls** at segment start and on resume after Q&A.
- `executeCommands(commands, handlers, fallbackPage)` — **P1 implements** `handlers` on `PdfViewer`: `handlers` is the `PdfViewerHandle` ref and `fallbackPage` is **`segment.page`**, used for span fallbacks.

P2 returns ready-made `viewer_commands` on Q&A; P3 does not build those manually.

### 5.4 `LessonState` (P3 owns runtime — **frontend only**; shapes Q&A body)

```json
{
  "lesson_id": "les_xyz",
  "status": "teaching",
  "segment_id": "seg_01",
  "segment_index": 0,
  "interrupt": null
}
```

On interrupt: `status: "paused"`, `interrupt: { "at_segment_id", "narration_offset_ms", "narration_delivered" }`. After Q&A: resume **same segment** at `narration_offset_ms` (TTS seek or replay substring).

**Q&A request** (P3 → P2 via HTTP):

```json
{
  "lesson_id": "les_xyz",
  "segment_id": "seg_01",
  "question": "Why does water move?",
  "playback_ms": 12500,
  "narration_delivered": "We'll start with osmosis. Water moves when...",
  "qa_turns": [{ "question": "...", "answer": "..." }],
  "max_cite_spans": 5
}
```

`qa_turns`: prior questions in this interrupt, `{ question, answer }[]`, newest last.

**Q&A response** (P2):

```json
{
  "answer": "...",
  "cite_span_ids": ["p1_l1"],
  "viewer_commands": [
    { "type": "scroll_to_span", "span_id": "p1_l1" },
    { "type": "set_highlights", "span_ids": ["p1_l1"] }
  ],
  "bridge": "Back to the membrane..."
}
```

`bridge` is optional one sentence P3 can speak before resuming narration.

---

## 6. API surface (P2 implements first; stub returns fixtures)

| Method | Path | Owner | Purpose |
|--------|------|-------|---------|
| `POST` | `/documents` | P2 | Upload PDF → `document_id`, start ingest |
| `GET` | `/documents/{id}` | P2 | Ingest status + full `DocumentIndex` in `index` when ready |
| `GET` | `/documents/{id}/index` | P2 | Optional alias — same `DocumentIndex` body (P1 convenience) |
| `GET` | `/documents/{id}/file` | P2 | PDF bytes for viewer (`doc_demo` → golden fixture) |
| `POST` | `/documents/{id}/lessons` | P2 | Generate `LessonPlan` — **synchronous** `200` + body (MVP); P1 spinner on button |
| `GET` | `/lessons/{id}` | P2 | Fetch plan + document_id |
| `POST` | `/lessons/{id}/qa` | P2 | Grounded interrupt answer |
| `GET` | `/health` | anyone | CI + integration check |

**Voice (out of REST contract for MVP):** P3 calls ElevenLabs from the **browser** with `segment.narration` / Q&A `answer`. Server proxy only if hiding API keys — not required for integration test.

**CORS:** P2 enables frontend origin on day one.

---

## 7. Agreed checklist (v0.1 — locked)

Full contract summary: [shared/CONTRACT-v0.1.md](../shared/CONTRACT-v0.1.md).

1. **Hour 0 (blocking):** In order — **(a)** add `shared/fixtures/golden-demo.pdf` → **(b)** regenerate `sample-document-index.json` from that PDF → **(c)** regenerate or hand-fix `sample-lesson-plan.json` so every `span_id` and **`page`** matches the index. Then branch.
2. **Schema version:** `shared/schemas/*` **v0.1** — changes only via trio huddle.
3. **Text units:** **Line-level** ids `p{n}_l{i}`; see `shared/README.md`.
4. **Segment sync:** `on_enter` at segment start only; `cues[]` empty in MVP.
5. **Resume:** Same segment at **`narration_offset_ms`** after Q&A.
6. **Orchestrator:** **Browser only** — no server lesson FSM / WebSocket for MVP.
7. **LLM:** OpenAI on backend (`OPENAI_API_KEY`); P2 returns text; P3 does ElevenLabs in browser.
8. **Storage:** Local disk under `backend/data/`; Supabase post-MVP.
9. **Branches:** Per-person feature branches → `main`; scaffold already on repo.
10. **Integration checkpoints:** T+90 min & T+180 min smoke tests.

### 7.1 First-hour defaults (pick once, don’t block start)

| Topic | MVP choice |
|--------|------------|
| **STT** | **Web Speech API** (Chrome/Edge) for “ask” — P3 owns; ElevenLabs STT only if Web Speech fails in demo |
| **Lesson `POST …/lessons`** | **Synchronous** `200` + `LessonPlan` JSON; P1 loading state on button (no `202` poll in MVP) |
| **`qa_turns`** | `{ "question": string, "answer": string }[]` on `QARequest` (see `shared/schemas/qa.json`) |
| **ElevenLabs in browser** | OK for **localhost / private demo**; move to backend proxy only before public deploy |

---

## 8. Parallel work without blocking

| Person | Hour 0–1 | Hour 1–2 | Hour 2–3 | Hour 3–4 |
|--------|----------|----------|----------|----------|
| **P2** | `DocumentIndex` extract + fixture; stub APIs | `LessonPlan` LLM + validation | RAG Q&A + citations | Polish, cache, error messages |
| **P1** | PDF viewer + page scroll; load fixture index | Execute `ViewerCommand` from fixture plan | Wire upload + poll ingest | Lesson panel UI + highlight QA |
| **P3** | Play fixture `narration` via TTS; transcript | Segment index state machine | Interrupt button + STT → `/qa` | Resume + emit commands to P1 |

**Mocks:**

- P1: `fetch('/lessons/demo')` → static JSON in `public/` until backend ready.
- P3: Same fixture; fake Q&A response JSON for UI flow.
- P2: CLI `python -m app.services.pdf_extract path/to.pdf` prints line-unit count.

---

## 9. P2 LLM workflow (detailed, time-boxed)

### Ingestion (no LLM)

1. PyMuPDF: per page, `get_text("dict")` → **one unit per line** (union bbox + joined text).
2. Assign `span_id` = `p{page}_l{index}`, `unit_kind: "line"` (page **1-based**).
3. Drop empty lines.

### Lesson generation (one LLM call, structured output)

**Input:** concatenated outline — page headings + first N chars per span (not full PDF if huge).

**Prompt constraints:**

- Output must match `lesson-plan.json` schema.
- Every `span_id` in output must exist in `DocumentIndex` (validate in code; retry once on failure).
- Every segment must include **`page`** (1-based) matching its primary teaching location.
- Narration: conversational, 2–4 sentences per segment (**~15–30 seconds** when spoken).
- Every segment includes `"cues": []` until timed highlights exist.
- Teaching order follows document order unless PDF is obviously appendix-first.

**Model:** cheaper/faster for plan (`gpt-4o-mini` or equivalent); same or better for Q&A.

### Q&A (per interrupt)

**Context assembly:**

- Current segment `goal`, full `narration`, `span_ids`.
- Request fields: `narration_delivered`, `playback_ms`, `qa_turns` when present.
- Retrieved chunks: line units in segment + top-k from doc (embeddings optional MVP).

**Grounding rule:** If no span supports answer, return `"I don't see that in this document"` and empty `cite_span_ids`.

### What P2 does **not** build in MVP

- Realtime OpenAI/Gemini voice session.
- Word-timed highlight pipeline.
- LangGraph (use plain functions + enums for `LessonStatus`).
- Supabase unless ingest is done early.

---

## 10. During development — communication norms

- **#integration** or single Discord thread: post **only** schema/API changes + sample curl.
- **Definition of done per PR:** passes `GET /health`, doesn’t break fixtures.
- **No hidden fields:** if P3 needs `segment_index`, add to schema — don’t parse ad hoc.
- **Pair debug list:** highlight wrong → P2 bbox or P1 transform; voice desync → P3 timing (not P2); bad teaching → P2 prompt/validation.

---

## 11. Smoke test script (end of hackathon)

1. Upload golden PDF.
2. Wait for `DocumentIndex` (N line units &gt; 0).
3. Generate lesson (≥ 3 segments).
4. Play segment 0: hear audio + see highlight on expected page.
5. Interrupt with question answerable from PDF → see citation highlight.
6. Resume: same segment from saved offset (not from segment start).
7. Advance to segment 1 manually.

---

## 12. Risk register (P2)

| Risk | Mitigation |
|------|------------|
| LLM invalid JSON | Pydantic validate + 1 retry with error feedback |
| Hallucinated span_ids | Post-validate against index; drop invalid refs |
| Lesson gen slow | MVP: synchronous POST + spinner; optional 202 poll post-hackathon only |
| PDF is scanned image | MVP: fail fast with “needs text PDF”; OCR is out of scope |
| Token limit | Plan from outline + span samples, not full raw text |
| Team merge conflicts | P2 owns `backend/app/services/*` and `shared/schemas`; P3 owns `backend/app/api/voice*` or `frontend` voice hooks |

---

## 13. Resolved decisions

| # | Decision |
|---|----------|
| 1 | Monorepo scaffold on repo — **done** |
| 2 | Resume same segment at **`narration_offset_ms`** |
| 3 | Single `backend/` process; **orchestrator not on server** |
| 4 | **No Supabase** in MVP — local disk |
| 5 | Demo PDF **≤ 10 pages** |
| 6 | Highlight units = **lines** (`p{n}_l{i}`) |
| 7 | TTS ElevenLabs browser; STT **Web Speech API** (P3) |
| 8 | Lesson `POST …/lessons` **synchronous** `200` |
| 9 | Each segment has required **`page`** for highlight fallback |

---

## References

- Internal: [pdf-voice-lesson-llm-workflow.md](./pdf-voice-lesson-llm-workflow.md)
- LearnAloud: [Devpost](https://devpost.com/software/learnaloud-4qgti9), [GitHub layout](https://github.com/psantanusaha/learn-aloud)
- TeachBack: [Devpost](https://devpost.com/software/live_teacher)
- Vaani: [GitHub](https://github.com/Rudra1729/Vaani)
- Agora: [GitHub](https://github.com/harshagarwalnyu/HackNYU-Agora)
