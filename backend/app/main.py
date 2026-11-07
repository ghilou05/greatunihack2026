from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api import documents, health, lessons, qa
from app.config import get_settings
from app.errors import register_error_handlers


_settings = get_settings()
_settings.data_dir.mkdir(parents=True, exist_ok=True)

app = FastAPI(title="GreatUniHack Lesson API", version="0.1.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=list(_settings.cors_origins),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

register_error_handlers(app)

app.include_router(health.router)
app.include_router(documents.router)
app.include_router(lessons.router)
app.include_router(qa.router)
