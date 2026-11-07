# greatunihack2026

PDF voice lesson MVP.

- **Integration plan & ownership:** [docs/team-mvp-integration-plan.md](docs/team-mvp-integration-plan.md)
- **Contract v0.1 (agreed):** [shared/CONTRACT-v0.1.md](shared/CONTRACT-v0.1.md)

## Architecture (agreed)

- **Backend:** FastAPI — document ingest, lesson plan, grounded Q&A (P2).
- **Frontend:** Next.js — PDF viewer (P1), browser lesson orchestrator + ElevenLabs (P3).
- **Demo ids:** `doc_demo`, `les_demo`

## Quick start

### Backend (P2 + optional P3 voice proxy)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements-dev.txt
cp .env.example .env   # set OPENAI_API_KEY for live lesson/Q&A
```

Run the API with **one worker** (per-document locks assume a single process):

```bash
uvicorn app.main:app --port 8000 --app-dir .
```

Tests (offline, no API key required):

```bash
.venv/bin/python -m pytest -q
```

LLM smoke / golden fixture (needs `OPENAI_API_KEY` in `backend/.env`):

```bash
.venv/bin/python -m app.services.llm --ping
.venv/bin/python -m app.services.lesson_generator ../shared/fixtures/golden-demo.pdf --runs 5
```

**P1:** set lesson `POST` fetch timeout ≥ 90s; show `detail` on 4xx/5xx; retries on 502/504 are safe (idempotent).

**P3:** send `narration_delivered` and `qa_turns`; always play `bridge`, then re-apply segment `on_enter`.

**Full P2 manual test checklist:** [docs/p2-manual-testing.md](docs/p2-manual-testing.md)  
**P1/P3 merge handoff (CP2/CP3, conflict hints):** [docs/p2-integration-handoff.md](docs/p2-integration-handoff.md)

API smoke test:

- `GET http://localhost:8000/health`
- `GET http://localhost:8000/documents/doc_demo` (includes `index`)
- `GET http://localhost:8000/documents/doc_demo/index` (index only)
- `GET http://localhost:8000/documents/doc_demo/file` (needs `shared/fixtures/golden-demo.pdf`)
- `GET http://localhost:8000/lessons/les_demo`

### Frontend (P1 + P3)

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000 (not `127.0.0.1`: the backend's default `CORS_ORIGINS` only allows `http://localhost:3000`).

To run without the backend, set `NEXT_PUBLIC_USE_FIXTURES=true` in `.env.local` and restart `npm run dev`. The app only uses `public/fixtures/` when this is set; otherwise an unreachable API shows an error.

## Repo map

| Path | Primary owner |
|------|----------------|
| `shared/schemas/`, `shared/fixtures/`, `shared/CONTRACT-v0.1.md` | **All** (P2 proposes schema changes) |
| `backend/app/services/`, `backend/app/api/{documents,lessons,qa}.py` | **P2** |
| `backend/app/api/voice.py`, `frontend/src/components/voice/`, `frontend/src/lib/lesson-orchestrator.ts` | **P3** |
| `frontend/src/components/pdf/`, `frontend/src/components/lesson/`, `frontend/src/lib/viewer-commands.ts` | **P1** |
| `frontend/src/app/page.tsx` | **All** (integrate last) |
