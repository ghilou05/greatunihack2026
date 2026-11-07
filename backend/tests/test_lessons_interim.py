"""T-007: interim lessons route."""

from fastapi.testclient import TestClient


def test_get_les_demo(client: TestClient):
    r = client.get("/lessons/les_demo")
    assert r.status_code == 200
    body = r.json()
    assert body["lesson_id"] == "les_demo"
    assert body["document_id"] == "doc_demo"


def test_post_non_demo_returns_503(client: TestClient, golden_pdf_bytes: bytes):
    up = client.post(
        "/documents",
        files={"file": ("g.pdf", golden_pdf_bytes, "application/pdf")},
    )
    doc_id = up.json()["document_id"]
    r = client.post(f"/documents/{doc_id}/lessons")
    assert r.status_code == 503
    assert r.json()["detail"] == "Lesson generator is not configured"


def test_unknown_document_404(client: TestClient):
    r = client.post("/documents/doc_unknown999ab/lessons")
    assert r.status_code == 404
    assert r.json()["detail"] == "Document not found"
