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
| `LessonPlan.segments[]` | `cues: []` in MVP; `check_question` ignored by player |
| `LessonState` | No `open_loops`; `interrupt` has `narration_offset_ms`, `narration_delivered` |
| `QARequest` | Optional `playback_ms`, `narration_delivered`, `qa_turns[]` |
| `ViewerCommand` | Invalid `span_id` → P1 falls back to `scroll_to_page` |

## HTTP

| Method | Path |
|--------|------|
| GET | `/documents/{id}` → `{ status, index? }` |
| GET | `/documents/{id}/index` → `DocumentIndex` |
| POST | `/documents`, `/documents/{id}/lessons`, `/lessons/{id}/qa` |
| GET | `/lessons/{id}`, `/health` |

## Pedagogy defaults

- Segments: **15–30s** narration (~2–4 sentences).
- Highlights: **`on_enter` only** at segment start (no `cues` timing in MVP).
- Resume: **same segment** at saved `narration_offset_ms` after Q&A.
