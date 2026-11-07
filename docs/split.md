Person 1 — Frontend & PDF viewer
Next.js

Owns everything the user sees and interacts with.
Build the application layout: PDF viewer + lesson panel
Upload and display PDFs using PDF.js/react-pdf
Implement automatic scrolling to a page
Implement text/coordinate highlighting and simple annotations
Display live lesson text and questions
Connect frontend to backend APIs
Deliverable: A PDF viewer that can execute predefined scroll, highlight and annotation commands.

Person 2 — AI & lesson engine
FastAPI + OpenAI

Owns the intelligence and document processing.
Extract PDF text using PyMuPDF
Generate a structured lesson from the uploaded document
Divide the lesson into sequential teaching steps
Associate each step with a page number and highlight
Handle follow-up questions using document context
Return structured JSON for frontend and voice components
Deliverable: Given a PDF, produce a sequence of explanation steps with navigation/highlighting instructions.

Person 3 — Voice & lesson orchestration
ElevenLabs (browser) + optional FastAPI voice proxy

Owns the audio and interactive lesson experience.
Integrate ElevenLabs TTS
Implement speech-to-text for user questions
Build lesson playback controls: play, pause, resume, next
Display the text being narrated as a transcript
Handle interruptions when the user asks a question
Coordinate narration with PDF navigation events (browser orchestrator)
Deliverable: A lesson player that speaks AI-generated text and accepts spoken questions.

---

## Agreed architecture (v0.1)

1. **Orchestrator runs in the browser** — `frontend/src/lib/lesson-orchestrator.ts` (P3). Backend is REST only (no WebSocket for lesson state).
2. **Line-level highlight ids** — `p{page}_l{index}` from PyMuPDF lines; see `shared/README.md`.
3. **Resume after Q&A** — same segment at `narration_offset_ms`.
4. **Q&A** — P3 POSTs to P2 with optional `playback_ms` / `narration_delivered`.
5. **Contract** — [shared/CONTRACT-v0.1.md](../shared/CONTRACT-v0.1.md); details in [team-mvp-integration-plan.md](./team-mvp-integration-plan.md).
6. **Viewer glue** — P3 calls `onEnterToCommands`; P1 implements `executeCommands`; re-fire `on_enter` on resume after Q&A.
7. **Right rail** — P3: voice + transcript; P1: lesson panel (upload + segment text). See plan §3.5.
8. **PDF bytes** — `GET /documents/{id}/file` + `shared/fixtures/golden-demo.pdf`.

**File-level ownership:** [team-mvp-integration-plan.md](./team-mvp-integration-plan.md) §3.
