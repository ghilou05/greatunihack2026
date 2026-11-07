import os
from pathlib import Path

from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.api import documents, health, lessons, qa, voice

ROOT = Path(__file__).resolve().parents[2]
DATA_DIR = Path(os.getenv("DATA_DIR", ROOT / "backend" / "data"))
DATA_DIR.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="GreatUniHack Lesson API", version="0.1.0")

origins = os.getenv("CORS_ORIGINS", "http://localhost:3000").split(",")
app.add_middleware(
    CORSMiddleware,
    allow_origins=[o.strip() for o in origins],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health.router)
app.include_router(documents.router)
app.include_router(lessons.router)
app.include_router(qa.router)
app.include_router(voice.router)
