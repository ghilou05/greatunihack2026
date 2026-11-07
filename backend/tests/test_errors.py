import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.errors import (
    AppError,
    IngestError,
    LLMTimeoutError,
    LLMUpstreamError,
    NotConfiguredError,
    NotFoundError,
    PlanInvalidError,
    register_error_handlers,
    with_detail,
)

CASES = [
    (IngestError(422, "PDF is password-protected"), 422, "PDF is password-protected"),
    (IngestError(400, "Expected a PDF file"), 400, "Expected a PDF file"),
    (IngestError(413, "PDF exceeds 20 MB limit"), 413, "PDF exceeds 20 MB limit"),
    (NotFoundError("Document not found"), 404, "Document not found"),
    (NotFoundError("Lesson not found"), 404, "Lesson not found"),
    (NotFoundError("Segment not found"), 404, "Segment not found"),
    (NotConfiguredError(), 503, "Lesson generator is not configured"),
    (LLMTimeoutError(), 504, "Lesson generation timed out. Please try again."),
    (LLMUpstreamError(), 502, "Lesson generation failed. Please try again."),
    (PlanInvalidError("reason with sk-test"), 502, "Lesson generation failed. Please try again."),
    (AppError(422, "Question is empty"), 422, "Question is empty"),
]


def _app_raising(exc: Exception) -> TestClient:
    app = FastAPI()
    register_error_handlers(app)

    @app.get("/boom")
    def boom():
        raise exc

    return TestClient(app)


@pytest.mark.parametrize("exc,status,detail", CASES)
def test_each_error_status_and_detail(exc, status, detail):
    r = _app_raising(exc).get("/boom")
    assert r.status_code == status
    assert r.json() == {"detail": detail}


def test_upstream_error_does_not_leak_provider_text():
    cause = RuntimeError("Incorrect API key provided: sk-test-123 at /Users/someone/file.py")
    err = LLMUpstreamError(cause)
    r = _app_raising(err).get("/boom")
    body = r.text
    assert "sk-test" not in body
    assert "/Users" not in body
    assert "Traceback" not in body
    assert "sk-test" not in str(err)
    assert "sk-test" not in err.detail


def test_with_detail_helper_changes_detail_keeps_status():
    err = with_detail(LLMUpstreamError(), "Couldn't answer right now.")
    r = _app_raising(err).get("/boom")
    assert r.status_code == 502
    assert r.json() == {"detail": "Couldn't answer right now."}
    r2 = _app_raising(with_detail(LLMTimeoutError(), "Couldn't answer right now.")).get("/boom")
    assert r2.status_code == 504
    assert r2.json() == {"detail": "Couldn't answer right now."}
