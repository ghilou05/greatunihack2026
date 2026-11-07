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
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --app-dir . --port 8000
```

API smoke test:

- `GET http://localhost:8000/health`
- `GET http://localhost:8000/documents/doc_demo` (includes `index`)
- `GET http://localhost:8000/documents/doc_demo/index` (index only)
- `GET http://localhost:8000/lessons/les_demo`

### Frontend (P1 + P3)

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000 — uses `public/fixtures/` if the API is down.

## Repo map

| Path | Primary owner |
|------|----------------|
| `shared/schemas/`, `shared/fixtures/`, `shared/CONTRACT-v0.1.md` | **All** (P2 proposes schema changes) |
| `backend/app/services/`, `backend/app/api/{documents,lessons,qa}.py` | **P2** |
| `backend/app/api/voice.py`, `frontend/src/components/voice/`, `frontend/src/lib/lesson-orchestrator.ts` | **P3** |
| `frontend/src/components/pdf/`, `frontend/src/components/lesson/`, `frontend/src/lib/viewer-commands.ts` | **P1** |
| `frontend/src/app/page.tsx` | **All** (integrate last) |
