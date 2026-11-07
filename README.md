# greatunihack2026

PDF voice lesson MVP — see [docs/team-mvp-integration-plan.md](docs/team-mvp-integration-plan.md) for ownership and contracts.

## Quick start

### Backend (P2 + P3 voice routes)

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env
uvicorn app.main:app --reload --app-dir . --port 8000
```

Demo API: `GET http://localhost:8000/health`, `GET http://localhost:8000/documents/doc_demo`, `GET http://localhost:8000/lessons/les_demo`

### Frontend (P1 + P3 UI)

```bash
cd frontend
cp .env.example .env.local
npm install
npm run dev
```

Open http://localhost:3000 — works with fixtures if the API is down.

## Repo map

| Path | Primary owner |
|------|----------------|
| `shared/schemas/`, `shared/fixtures/` | **All** (P2 proposes changes) |
| `backend/app/services/`, `backend/app/api/{documents,lessons,qa}.py` | **P2** |
| `backend/app/api/voice.py`, `frontend/src/components/voice/` | **P3** |
| `frontend/src/components/pdf/`, `frontend/src/components/lesson/`, `frontend/src/lib/viewer-commands.ts` | **P1** |
| `frontend/src/app/page.tsx` | **All** (integrate last) |
