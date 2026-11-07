"""P2: env-driven settings (single source of truth), read at call time."""

import os
from dataclasses import dataclass
from pathlib import Path

from dotenv import load_dotenv

BACKEND_DIR = Path(__file__).resolve().parents[1]
REPO_ROOT = BACKEND_DIR.parent
FIXTURES_DIR = REPO_ROOT / "shared" / "fixtures"

load_dotenv(BACKEND_DIR / ".env", override=False)


@dataclass(frozen=True)
class Settings:
    data_dir: Path
    fixtures_dir: Path
    cors_origins: tuple[str, ...]

    # ingest caps
    max_pages: int
    max_total_chars: int
    min_total_chars: int
    min_lines: int
    max_upload_mb: int

    # llm
    openai_api_key: str
    plan_model: str
    qa_model: str
    plan_effort: str
    qa_effort: str
    service_tier: str
    plan_strategy: str
    plan_max_output_tokens: int
    qa_max_output_tokens: int
    plan_timeout_s: float
    qa_timeout_s: float
    plan_deadline_s: float
    plan_retry_cutoff_s: float


def _env_str(name: str, default: str) -> str:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip()


def _env_int(name: str, default: int) -> int:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return int(raw)


def _env_float(name: str, default: float) -> float:
    raw = os.environ.get(name)
    if raw is None or raw.strip() == "":
        return default
    return float(raw)


def _resolve_data_dir() -> Path:
    raw = os.environ.get("DATA_DIR")
    if raw is None or raw.strip() == "":
        return BACKEND_DIR / "data"
    path = Path(raw.strip())
    if not path.is_absolute():
        path = BACKEND_DIR / path
    return path.resolve()


def get_settings() -> Settings:
    origins = tuple(
        o.strip()
        for o in _env_str("CORS_ORIGINS", "http://localhost:3000").split(",")
        if o.strip()
    )
    return Settings(
        data_dir=_resolve_data_dir(),
        fixtures_dir=FIXTURES_DIR,
        cors_origins=origins,
        max_pages=_env_int("MAX_PAGES", 10),
        max_total_chars=_env_int("MAX_TOTAL_CHARS", 80_000),
        min_total_chars=_env_int("MIN_TOTAL_CHARS", 200),
        min_lines=_env_int("MIN_LINES", 10),
        max_upload_mb=_env_int("MAX_UPLOAD_MB", 20),
        openai_api_key=_env_str("OPENAI_API_KEY", ""),
        plan_model=_env_str("OPENAI_PLAN_MODEL", "gpt-6.1-terra"),
        qa_model=_env_str("OPENAI_QA_MODEL", "gpt-6.1-terra"),
        plan_effort=_env_str("OPENAI_PLAN_EFFORT", "low"),
        qa_effort=_env_str("OPENAI_QA_EFFORT", "low"),
        service_tier=_env_str("OPENAI_SERVICE_TIER", ""),
        plan_strategy=_env_str("PLAN_STRATEGY", "single"),
        plan_max_output_tokens=_env_int("PLAN_MAX_OUTPUT_TOKENS", 6000),
        qa_max_output_tokens=_env_int("QA_MAX_OUTPUT_TOKENS", 1200),
        plan_timeout_s=_env_float("PLAN_TIMEOUT_S", 45),
        qa_timeout_s=_env_float("QA_TIMEOUT_S", 20),
        plan_deadline_s=_env_float("PLAN_DEADLINE_S", 80),
        plan_retry_cutoff_s=_env_float("PLAN_RETRY_CUTOFF_S", 45),
    )
