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
ElevenLabs + FastAPI

Owns the audio and interactive lesson experience.
Integrate ElevenLabs TTS
Implement speech-to-text for user questions
Build lesson playback controls: play, pause, resume, next
Display the text being narrated as a transcript
Handle interruptions when the user asks a question
Coordinate narration with PDF navigation events
Deliverable: A lesson player that speaks AI-generated text and accepts spoken questions.
