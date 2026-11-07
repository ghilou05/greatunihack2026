# Voice player integration handoff (Persons 1 and 2)

The browser player is implemented in `frontend/src/components/voice/LessonPlayer.tsx`. This handoff describes its current interfaces and the connections needed for a live document and lesson.

## Shared setup and IDs

Set these in `frontend/.env.local` (see `frontend/.env.example`):

```dotenv
NEXT_PUBLIC_API_URL=http://localhost:8000
NEXT_PUBLIC_ELEVENLABS_API_KEY=...
NEXT_PUBLIC_ELEVENLABS_VOICE_ID=...
```

`frontend/src/lib/api.ts` defaults the API URL to `http://localhost:8000`. `frontend/src/lib/elevenlabs-tts.ts` uses both ElevenLabs values for browser requests that generate lesson and answer audio. `NEXT_PUBLIC_` values are exposed to the browser, so use credentials appropriate for this setup.

`frontend/src/app/page.tsx` currently passes `doc_demo` to `PdfViewer` and `LessonPanel`, and `les_demo` to `LessonPlayer` and `LessonPanel`. After `POST /documents` returns a real `document_id` and `POST /documents/{document_id}/lessons` returns a plan, hold those live IDs in the page. Pass the same document ID to both document consumers and the returned `lesson_id` to both lesson consumers. `LessonPlayer` calls `GET /lessons/{lessonId}`; if it fails, the player loads the frontend fixture, which can mask a failed live connection.

## Person 1: shell and PDF viewer

Keep the existing page callback and viewer ref connected when replacing demo IDs:

```tsx
const viewerRef = useRef<PdfViewerHandle>(null);
const onViewerCommands = (commands: ViewerCommand[], fallbackPage = 1) => {
  viewerRef.current?.receiveCommands(commands, fallbackPage);
};

<PdfViewer documentId={documentId} ref={viewerRef} />
<LessonPlayer lessonId={lessonId} onViewerCommands={onViewerCommands} />
<LessonPanel lessonId={lessonId} documentId={documentId} />
```

`LessonPlayer` calls `onViewerCommands(commands, fallbackPage)` with the active segment's 1-based `page`. It sends segment entry commands, timed cue commands during narration, and Q&A response commands. On resume after Q&A, it reapplies segment entry commands and cues due at the saved audio position.

`PdfViewer.receiveCommands(commands, fallbackPage)` queues commands until an index is available, then calls `normalizeViewerCommands` and `executeCommands` from `frontend/src/lib/viewer-commands.ts`. Unknown scroll span IDs become `scroll_to_page` at `fallbackPage`; unknown highlight IDs are filtered. Command types are `scroll_to_span`, `scroll_to_page`, `set_highlights`, and `clear_highlights`. Person 1 owns live PDF and index loading, rendering, scrolling, and highlighting. Currently the viewer loads a fixture index only for `doc_demo`, displays `HighlightLayer`, and logs scroll requests; its scroll handlers do not move a rendered PDF.

## Person 2: lesson and Q&A data

`GET /lessons/{id}` returns a `LessonPlan` with `lesson_id`, `document_id`, `title`, and ordered `segments`. Each segment has `id`, `goal`, 1-based `page`, `span_ids`, `narration`, `on_enter: { scroll_to_span, highlights }`, `cues`, optional `check_question`, and `next`. The player uses segment order for playback, `narration` for speech and transcript, `on_enter` for initial viewer commands, and `page` as the viewer fallback. Each cue is `{ at_ms: number, commands: ViewerCommand[] }`; `at_ms` is measured from the start of that segment's narration audio. The backend defaults omitted `cues` to `[]`, while the frontend type expects an array. The player sorts cues by `at_ms`, fires them as audio time advances, and restores due cues after interruption or seek. Keep span IDs consistent with the document index.

`POST /lessons/{id}/qa` accepts `QARequest` with required `lesson_id`, `segment_id`, and `question`; optional `playback_ms`, `narration_delivered`, `qa_turns: { question, answer }[]`, and `max_cite_spans` (backend default 5). It returns `QAResponse` with `answer`, `cite_span_ids`, `viewer_commands: ViewerCommand[]`, and optional `bridge`. The normal microphone path sends `playback_ms` and empty `qa_turns`; it does not currently send `narration_delivered`. The player displays the answer and citations, forwards viewer commands, speaks `answer`, and resumes the lesson. It displays `bridge` but does not speak it on that path.

The current route in `backend/app/api/qa.py` always calls `answer_question(body, use_fixture=True)`, so it returns the sample answer regardless of the question. Person 2 owns grounded answer generation with matching citations and viewer commands. `GET /lessons/{id}` already returns the demo plan for `les_demo` and a stored plan for a real lesson ID.

## End-to-end verification

1. Upload a PDF. Confirm the returned `document_id` reaches the viewer and lesson panel, and the viewer loads that PDF and index.
2. Create a lesson for that document. Confirm the returned `lesson_id` reaches the player and lesson panel and `GET /lessons/{id}` returns a plan for the same `document_id`.
3. Play narration. Confirm segment entry scrolls and highlights the cited spans. Use a lesson with **nonempty `cues`** and verify each cue fires at its `at_ms` audio offset. The current demo fixture has empty cue arrays and cannot test timing.
4. Capture a spoken or typed question during narration. Confirm playback pauses and the question reaches `POST /lessons/{id}/qa` with the current segment and offset.
5. Confirm the answer and citations appear, the answer is spoken, and Q&A commands target the cited PDF spans. A grounded answer requires Person 2's live Q&A implementation; the current route returns a fixture.
6. After answer audio ends, confirm narration resumes at the saved offset and segment entry and due cue commands are restored. Confirm playback continues to the next segment.
