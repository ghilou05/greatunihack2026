# Person 3 — Voice & Lesson Orchestration

## Objective

Build the browser-side system that turns an AI-generated lesson into an interactive narrated experience: ElevenLabs text-to-speech, lesson playback, live transcript, speech input, interruptions, Q&A, and synchronised PDF navigation.

**Agreed architecture:** The lesson orchestrator runs in the **Next.js frontend (TypeScript)**. FastAPI exposes REST endpoints for document ingestion, lesson generation, and grounded Q&A. PDF rendering and highlighting belong to Person 1; lesson generation belongs to Person 2.

## 1. Ownership

### Files to implement

```text
frontend/src/
├── components/voice/
│   ├── LessonPlayer.tsx
│   ├── Transcript.tsx
│   └── MicrophoneButton.tsx
├── hooks/
│   └── useLessonSession.ts
└── lib/
    └── lesson-orchestrator.ts
```

Optional: `backend/app/api/voice.py` for an ElevenLabs API proxy, particularly if deploying publicly.

### Responsibilities

- Integrate ElevenLabs TTS.
- Control sequential narration, play, pause, resume, stop, and skip.
- Display the current spoken text.
- Capture student questions using the browser Web Speech API.
- Handle question interruptions and grounded Q&A calls.
- Preserve the current lesson checkpoint and resume correctly.
- Trigger Person 1's PDF viewer commands as lesson segments change.

**Not owned:** PDF extraction, lesson generation, highlight geometry, PDF rendering, or upload UI.

## 2. Implementation plan

### Step 1 — Get ElevenLabs TTS working (first 45 minutes) — P0

**Goal:** Generate and play speech from an arbitrary string.

- [ ] Obtain an ElevenLabs API key; put it in an environment file and never commit it.
- [ ] Integrate the ElevenLabs JS SDK or HTTP API.
- [ ] Create a reusable `speak(text)` function.
- [ ] Generate audio from hardcoded text and play it in the browser.
- [ ] Implement `pause()`, `resume()`, and `stop()` on the audio player.

**Test:** Play and pause: “Welcome to your lesson on Newton's laws.”

For the MVP, start with a complete audio response rather than streaming. Direct browser-side API calls are suitable only for a controlled private demo; use a FastAPI proxy before public deployment to protect the key.

### Step 2 — Sequential lesson playback (45–90 minutes) — P0

**Goal:** Narrate an entire structured lesson without relying on Person 2's live backend.

- [ ] Load `shared/fixtures/sample-lesson-plan.json`.
- [ ] Initialise `segment_index = 0`.
- [ ] Read the active segment's `narration` using ElevenLabs.
- [ ] Show the narration text in `Transcript.tsx`.
- [ ] On audio completion, advance to the next segment.
- [ ] Stop after the final segment.
- [ ] Implement play/pause/resume/next controls in `LessonPlayer.tsx`.
- [ ] Store segment and playback state in `useLessonSession.ts`.

**Test:** Three fixture segments narrate consecutively without overlapping.

### Step 3 — Trigger PDF viewer actions (90–120 minutes) — P0

**Goal:** Coordinate each narration segment with its corresponding PDF content.

At the beginning of each segment:

1. Read `segment.on_enter`.
2. Call `onEnterToCommands(segment.on_enter)` from `frontend/src/lib/viewer-commands.ts`.
3. Send the resulting `ViewerCommand[]` through `onViewerCommands`.
4. Start the segment's audio.

```ts
const commands = onEnterToCommands(segment.on_enter);
onViewerCommands(commands);
await playNarration(segment.narration);
```

Person 1 implements command execution, scrolling, and highlighting. Pass the segment's required **1-based `page`** as a fallback when a `span_id` is missing or invalid, using the agreed viewer-command normalisation interface.

**Test:** Changing lesson segments navigates the PDF and highlights the correct source lines.

### Step 4 — Speech-to-text (120–150 minutes) — P1

**Goal:** Let students ask questions aloud.

- [ ] Create `MicrophoneButton.tsx`.
- [ ] On click, **pause narration before listening**.
- [ ] Start `SpeechRecognition` / `webkitSpeechRecognition` in Chrome or Edge.
- [ ] Capture the final recognised transcript.
- [ ] Display the student's question.
- [ ] Pass the question to the lesson controller.
- [ ] Provide a typed-question fallback if browser speech recognition fails.

**Test:** Ask “Why does doubling mass halve acceleration?” and receive that question as text.

The agreed MVP uses **Web Speech API for STT** and **ElevenLabs for TTS**.

### Step 5 — Interrupt lesson and answer questions (150–190 minutes) — P1

**Goal:** Pause teaching, answer a student question, and display related evidence in the PDF.

1. Pause the original narration.
2. Save `segment_id`, `segment_index`, and `narration_offset_ms` (`audio.currentTime * 1000`).
3. Optionally provide `narration_delivered` if its contents can be determined reliably; otherwise leave it empty.
4. Send the question and playback context to `POST /lessons/{lesson_id}/qa`.
5. Receive `answer`, `viewer_commands`, and optional `bridge`.
6. Forward `viewer_commands` to Person 1's viewer.
7. Narrate the answer using ElevenLabs and show its text in the transcript.
8. Optionally narrate the `bridge` sentence before returning to teaching.

**Test:** Pause during a lesson, ask a question, hear a generated answer, and see the cited PDF passage highlighted.

### Step 6 — Resume from the original checkpoint (190–220 minutes) — P1

**Goal:** Return to teaching without restarting the current segment.

1. Keep the original narration audio object paused during the Q&A.
2. After the Q&A audio finishes, restore the original `segment_id` and `segment_index`.
3. Reapply the segment's `on_enter` commands to clear temporary Q&A highlights.
4. Resume the original audio from the saved position (`audio.currentTime`), without regenerating narration.
5. Continue to the next segment when playback finishes.

**Test:** Interrupt halfway through segment 2 and resume halfway through the *same* segment.

### Step 7 — Integrate and test (remaining time)

- [ ] Wire `LessonPlayer` to the shared application shell in `frontend/src/app/page.tsx` with Person 1.
- [ ] Replace fixture data with Person 2's real `LessonPlan` response.
- [ ] Connect real Q&A using `POST /lessons/{id}/qa`.
- [ ] Test upload → generate lesson → play → scroll/highlight → interrupt → answer → resume.
- [ ] Preserve the fixture demo as a fallback if the live generation pipeline fails.

## 3. Playback state machine

Implement in `frontend/src/lib/lesson-orchestrator.ts`.

```ts
type LessonStatus =
  | "idle"
  | "teaching"
  | "paused"
  | "answering"
  | "resuming"
  | "complete";
```

Primary transitions:

```text
IDLE ──play──> TEACHING
TEACHING ──pause / ask──> PAUSED
PAUSED ──question sent──> ANSWERING
ANSWERING ──answer finished──> RESUMING
RESUMING ──resume saved audio──> TEACHING
TEACHING ──final segment ends──> COMPLETE
```

Keep the playback `HTMLAudioElement` in a React ref so UI rerenders do not reset it. Ensure delayed TTS responses cannot unexpectedly play after skipping, stopping, or changing lessons.

## 4. Integration contracts

Use the canonical shared schemas and frontend types; do not create conflicting definitions.

### Lesson segment (from Person 2)

```ts
type LessonSegment = {
  id: string;
  goal: string;
  page: number; // 1-based
  span_ids: string[];
  narration: string;
  on_enter: {
    scroll_to_span: string | null;
    highlights: string[];
  };
  cues: unknown[]; // [] in MVP
  next: string | null;
};
```

### Q&A request

`POST /lessons/{lesson_id}/qa`

```json
{
  "lesson_id": "les_demo",
  "segment_id": "seg_01",
  "question": "Why does this happen?",
  "playback_ms": 12500,
  "narration_delivered": "",
  "qa_turns": [],
  "max_cite_spans": 5
}
```

`qa_turns` contains previous turns in the current interruption as `{ "question": "...", "answer": "..." }` objects.

### Q&A response

```json
{
  "answer": "This happens because...",
  "cite_span_ids": ["p1_l1"],
  "viewer_commands": [
    { "type": "scroll_to_span", "span_id": "p1_l1" },
    { "type": "set_highlights", "span_ids": ["p1_l1"] }
  ],
  "bridge": "Now, returning to the lesson..."
}
```

P3 forwards the provided Q&A `viewer_commands` unchanged; P1 owns their execution. For segment-start or post-Q&A restoration, use `onEnterToCommands(segment.on_enter)`.

## 5. MVP acceptance checklist

- [ ] ElevenLabs can convert hardcoded text into playable audio.
- [ ] Audio can be paused, resumed, and stopped.
- [ ] Fixture lesson JSON loads.
- [ ] Lesson segments narrate sequentially.
- [ ] The current transcript appears in the UI.
- [ ] Segment changes trigger viewer commands.
- [ ] Microphone transcribes a spoken question.
- [ ] Q&A endpoint supplies a grounded answer.
- [ ] ElevenLabs narrates the answer.
- [ ] Original narration resumes from the saved audio position.
- [ ] End-to-end integration works.

## 6. Time-saving decisions

1. **Cache ElevenLabs audio per segment.** Reuse the original audio after interruptions; don't regenerate the same speech each time.
2. **No word-level speech/highlight sync for MVP.** Execute `on_enter` at the start of each 15–30-second segment. Keep `cues: []`.
3. **Use fixture data immediately.** P3 should not wait for live PDF ingestion or LLM lesson generation.
4. **Skip Supabase and persistence.** Keep `LessonState` in browser memory during the hackathon.
5. **Protect playback against stale requests.** Track the active request/session and ignore obsolete TTS completions.

## Definition of done

Given a lesson with at least three segments, Person 3's interface can **play ElevenLabs narration sequentially, display the transcript, trigger viewer commands, pause for a spoken question, narrate the grounded response, and resume the original segment at the saved position**.

---

### Reference documents

- `shared/CONTRACT-v0.1.md` — agreed integration contract.
- `docs/team-mvp-integration-plan.md` — ownership, file paths, API surface, and milestones.
- `docs/split.md` — three-person ownership split.
- `shared/fixtures/sample-lesson-plan.json` — development fixture.
