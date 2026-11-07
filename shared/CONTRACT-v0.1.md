# Integration contract v0.1 (agreed)

Changelog for the trio. Canonical JSON Schema: `schemas/*.json` (especially [lesson-plan.json](./schemas/lesson-plan.json)).

## Architecture

- **Orchestrator:** browser TypeScript (`frontend/src/lib/lesson-orchestrator.ts`). Backend is **REST only**.
- **`LessonState`:** frontend-only; not stored on the server in MVP.
- **Voice:** ElevenLabs TTS in browser; STT **Web Speech API** (P3).

## Data model

| Artifact | Notes |
|----------|--------|
| `DocumentIndex.spans[]` | **Line-level** units: `unit_kind: "line"`, id `p{page}_l{index}`, pages **1-based**, PyMuPDF bbox union |
| `LessonPlan.segments[]` | See segment shape below — **`page` required** on every segment |
| `LessonState` | No `open_loops`; `interrupt` has `narration_offset_ms`, `narration_delivered` |
| `QARequest` | Optional `playback_ms`, `narration_delivered`, `qa_turns: {question, answer}[]` |
| `ViewerCommand` | Invalid `span_id` → `scroll_to_page` to **`segment.page`** |

### `LessonPlan` segment (required)

```json
{
  "id": "seg_01",
  "goal": "...",
  "page": 1,
  "span_ids": ["p1_l0"],
  "narration": "...",
  "on_enter": { "scroll_to_span": "p1_l0", "highlights": ["p1_l0"] },
  "cues": [],
  "next": "seg_02"
}
```

`page` is the scroll fallback when highlight span ids are missing or invalid.

## HTTP

| Method | Path |
|--------|------|
| GET | `/documents/{id}` → `{ status, index? }` |
| GET | `/documents/{id}/index` → `DocumentIndex` |
| GET | `/documents/{id}/file` → PDF bytes (`doc_demo` → `shared/fixtures/golden-demo.pdf`) |
| POST | `/documents`, `/documents/{id}/lessons` (**sync 200**), `/lessons/{id}/qa` |
| GET | `/lessons/{id}`, `/health` |

## Pedagogy defaults

- Segments: **15–30s** narration (~2–4 sentences).
- Highlights: **`on_enter` only** at segment start (no `cues` timing in MVP).
- Resume: **same segment** at saved `narration_offset_ms` after Q&A; then **re-apply** `onEnterToCommands(segment.on_enter)` so Q&A citation highlights are replaced.

## Viewer commands (glue)

| Step | Owner | Function |
|------|--------|----------|
| `on_enter` → `ViewerCommand[]` | Shared helper (P1 file) | `onEnterToCommands()` in `viewer-commands.ts` — **P3 calls this** |
| Apply commands to PDF | P1 | `executeCommands(commands, handlers)` |
| Segment start / resume after Q&A | P3 | orchestrator calls `onEnterToCommands` then `executeCommands` via callback wired in `page.tsx` |
| Q&A citation highlights | P2 response → P3 | `qa.viewer_commands` → same `executeCommands` |

## Hour 0 (before branches)

1. `shared/fixtures/golden-demo.pdf`
2. Regenerate `sample-document-index.json` from that PDF (line units)
3. Regenerate or fix `sample-lesson-plan.json` — all `span_id`s + **`page`** align with the index

## First hour (P3)

- **TTS:** ElevenLabs in browser (localhost OK).
- **STT:** Web Speech API.
