"""T-005: ingest guards + golden regression."""

from __future__ import annotations

import json
from pathlib import Path

import pymupdf
import pytest

from app.errors import IngestError
from app.services.pdf_extract import extract_document_index
from tests.conftest import (
    FIXTURES,
    build_blank_pdf,
    build_encrypted_pdf,
    build_owner_only_pdf,
    build_text_pdf,
    build_tiny_pdf,
    golden_pdf_bytes,
)


def _fixture_span_tuples() -> list[tuple[str, int, str]]:
    raw = json.loads((FIXTURES / "sample-document-index.json").read_text())
    return [(s["span_id"], s["page"], s["text"]) for s in raw["spans"]]


def test_golden_pdf_matches_fixture_index(golden_pdf_bytes: bytes):
    index = extract_document_index("doc_golden", golden_pdf_bytes)
    assert len(index.pages) == 4
    assert len(index.spans) == 175
    got = [(s.span_id, s.page, s.text) for s in index.spans]
    assert got == _fixture_span_tuples()


def test_encrypted_user_password_raises():
    with pytest.raises(IngestError) as ei:
        extract_document_index("doc_x", build_encrypted_pdf())
    assert ei.value.status_code == 422
    assert ei.value.detail == "PDF is password-protected"


def test_blank_pdf_scanned_message():
    with pytest.raises(IngestError) as ei:
        extract_document_index("doc_x", build_blank_pdf())
    assert "scanned" in ei.value.detail.lower()


def test_eleven_pages_raises(monkeypatch):
    monkeypatch.setenv("MAX_PAGES", "10")
    with pytest.raises(IngestError) as ei:
        extract_document_index("doc_x", build_text_pdf(n_pages=11))
    assert "11 pages" in ei.value.detail
    assert "limit is 10" in ei.value.detail


def test_tiny_pdf_not_enough_text():
    with pytest.raises(IngestError) as ei:
        extract_document_index("doc_x", build_tiny_pdf())
    assert ei.value.detail == "Not enough text to build a lesson"


def test_garbage_bytes():
    with pytest.raises(IngestError) as ei:
        extract_document_index("doc_x", b"not a pdf at all")
    assert ei.value.detail == "Could not read PDF"


def test_owner_only_pdf_accepted_if_constructible():
    try:
        data = build_owner_only_pdf()
    except Exception:
        pytest.skip("PyMuPDF could not build owner-only PDF in this environment")
    index = extract_document_index("doc_owner", data)
    assert len(index.spans) >= 10


def test_golden_cli_path_still_works():
    path = FIXTURES / "golden-demo.pdf"
    index = extract_document_index("cli", path)
    assert (len(index.pages), len(index.spans)) == (4, 175)
