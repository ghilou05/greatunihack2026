"""Shared test fixtures (offline; no network, no API key)."""

from pathlib import Path

import pymupdf
import pytest
from fastapi.testclient import TestClient

REPO_ROOT = Path(__file__).resolve().parents[2]
FIXTURES = REPO_ROOT / "shared" / "fixtures"
GOLDEN_PDF = FIXTURES / "golden-demo.pdf"

_SETTING_ENV_VARS = [
    "OPENAI_API_KEY",
    "OPENAI_PLAN_MODEL",
    "OPENAI_QA_MODEL",
    "OPENAI_PLAN_EFFORT",
    "OPENAI_QA_EFFORT",
    "OPENAI_SERVICE_TIER",
    "PLAN_STRATEGY",
    "PLAN_MAX_OUTPUT_TOKENS",
    "QA_MAX_OUTPUT_TOKENS",
    "PLAN_TIMEOUT_S",
    "QA_TIMEOUT_S",
    "PLAN_DEADLINE_S",
    "PLAN_RETRY_CUTOFF_S",
    "MAX_PAGES",
    "MAX_TOTAL_CHARS",
    "MIN_TOTAL_CHARS",
    "MIN_LINES",
    "MAX_UPLOAD_MB",
    "DATA_DIR",
    "CORS_ORIGINS",
]


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch: pytest.MonkeyPatch):
    """Every test starts from the design defaults regardless of the developer's shell/.env."""
    for name in _SETTING_ENV_VARS:
        monkeypatch.delenv(name, raising=False)


@pytest.fixture
def data_dir(tmp_path: Path, monkeypatch: pytest.MonkeyPatch) -> Path:
    path = tmp_path / "data"
    path.mkdir()
    monkeypatch.setenv("DATA_DIR", str(path))
    return path


@pytest.fixture
def client(data_dir: Path) -> TestClient:
    from app.main import app

    return TestClient(app)


@pytest.fixture
def golden_pdf_bytes() -> bytes:
    return GOLDEN_PDF.read_bytes()


# ---- PDF builders (generated in-test with PyMuPDF; no binary fixtures committed) ----

_LOREM = (
    "The quick brown fox jumps over the lazy dog while the learner reads the document carefully."
)


def build_text_pdf(n_pages: int = 2, lines_per_page: int = 12) -> bytes:
    doc = pymupdf.open()
    for p in range(n_pages):
        page = doc.new_page()
        y = 72
        for i in range(lines_per_page):
            page.insert_text((72, y), f"Page {p + 1} line {i}: {_LOREM}", fontsize=10)
            y += 14
    data = doc.tobytes()
    doc.close()
    return data


def build_blank_pdf(n_pages: int = 3) -> bytes:
    doc = pymupdf.open()
    for _ in range(n_pages):
        doc.new_page()
    data = doc.tobytes()
    doc.close()
    return data


def build_tiny_pdf() -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), "Hello there", fontsize=10)
    data = doc.tobytes()
    doc.close()
    return data


def build_encrypted_pdf(user_pw: str = "secret") -> bytes:
    doc = pymupdf.open()
    page = doc.new_page()
    page.insert_text((72, 72), _LOREM, fontsize=10)
    data = doc.tobytes(
        encryption=pymupdf.PDF_ENCRYPT_AES_256, user_pw=user_pw, owner_pw="owner-secret"
    )
    doc.close()
    return data


def build_owner_only_pdf() -> bytes:
    doc = pymupdf.open()
    for p in range(2):
        page = doc.new_page()
        y = 72
        for i in range(10):
            page.insert_text((72, y), f"Page {p + 1} line {i}: {_LOREM}", fontsize=10)
            y += 14
    data = doc.tobytes(encryption=pymupdf.PDF_ENCRYPT_AES_256, owner_pw="owner-secret")
    doc.close()
    return data
