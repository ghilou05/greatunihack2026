"""T-006: documents API."""

from __future__ import annotations

import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

from tests.conftest import FIXTURES, build_encrypted_pdf, build_text_pdf, golden_pdf_bytes


def test_demo_upload_no_file(client: TestClient):
    r = client.post("/documents?demo=true")
    assert r.status_code == 200
    assert r.json() == {"document_id": "doc_demo", "status": "ready"}


def test_golden_upload_and_fetch(client: TestClient, data_dir: Path, golden_pdf_bytes: bytes):
    r = client.post(
        "/documents",
        files={"file": ("golden-demo.pdf", golden_pdf_bytes, "application/pdf")},
    )
    assert r.status_code == 200
    body = r.json()
    assert body["status"] == "ready"
    doc_id = body["document_id"]
    assert doc_id.startswith("doc_")

    status = client.get(f"/documents/{doc_id}").json()
    assert len(status["index"]["spans"]) == 175

    index = client.get(f"/documents/{doc_id}/index").json()
    assert index == status["index"]

    pdf = client.get(f"/documents/{doc_id}/file")
    assert pdf.status_code == 200
    assert pdf.content == golden_pdf_bytes


def test_failed_ingest_leaves_no_orphans(client: TestClient, data_dir: Path):
    before = set(data_dir.glob("*"))
    r = client.post(
        "/documents",
        files={"file": ("locked.pdf", build_encrypted_pdf(), "application/pdf")},
    )
    assert r.status_code == 422
    assert r.json()["detail"] == "PDF is password-protected"
    after = set(data_dir.glob("*"))
    assert before == after


def test_non_pdf_400(client: TestClient):
    r = client.post(
        "/documents",
        files={"file": ("readme.md", b"# hello", "text/plain")},
    )
    assert r.status_code == 400
    assert r.json()["detail"] == "Expected a PDF file"


def test_oversized_413(client: TestClient, monkeypatch):
    monkeypatch.setenv("MAX_UPLOAD_MB", "1")
    big = build_text_pdf(n_pages=2) + b"x" * (2 * 1024 * 1024)
    r = client.post(
        "/documents",
        files={"file": ("big.pdf", big, "application/pdf")},
    )
    assert r.status_code == 413
    assert r.json()["detail"] == "PDF exceeds 1 MB limit"


def test_malformed_document_id_404(client: TestClient):
    r = client.get("/documents/doc_ABC")
    assert r.status_code == 404
    assert r.json()["detail"] == "Document not found"
