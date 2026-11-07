# Integration contract v0.1 (agreed)

Changelog for the trio. Canonical JSON Schema files live in `schemas/`.

## Architecture

- **Orchestrator:** browser TypeScript (`frontend/src/lib/lesson-orchestrator.ts`). Backend is **REST only**.
- **`LessonState`:** frontend-only; not stored on the server in MVP.
- **Voice:** ElevenLabs from the browser; no TTS/STT in REST contract unless P3 adds an optional proxy.

## Data model

| Artifact | Notes |
|----------|--------|
| `DocumentIndex.spans[]` | **Line-level** units: `unit_kind: "line"`, id `p{page}_l{index}`, pages **1-based**, PyMuPDF bbox union |
| `LessonPlan.segments[]` | Required **`page`** (1-based); `cues: []` in MVP; `check_question` ignored |
| `LessonState` | No `open_loops`; `interrupt` has `narration_offset_ms`, `narration_delivered` |
| `QARequest` | Optional `playback_ms`, `narration_delivered`, `qa_turns: {question, answer}[]` |
| `ViewerCommand` | Invalid `span_id` → `scroll_to_page` to **`segment.page`** |

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

## Hour 0

- Add `shared/fixtures/golden-demo.pdf`; regenerate `sample-document-index.json` from that file.

## First hour (P3)

- **TTS:** ElevenLabs in browser (localhost OK).
- **STT:** Web Speech API.

