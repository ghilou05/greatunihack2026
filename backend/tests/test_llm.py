"""T-009: parse_structured mapping (offline)."""

import pytest

from app.errors import LLMTimeoutError, NotConfiguredError
from app.models.llm_drafts import QADraft
from app.services import llm
from openai import APITimeoutError


def test_blank_key_not_configured(monkeypatch):
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    with pytest.raises(NotConfiguredError):
        llm.parse_structured(
            "m",
            "sys",
            [("user", "u")],
            QADraft,
            max_output_tokens=10,
            timeout=1,
        )


def test_timeout_maps(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "sk-test")

    class Resp:
        output_parsed = None
        status = "completed"
        incomplete_details = None
        usage = None

    class Responses:
        def parse(self, **kwargs):
            raise APITimeoutError(request=None)

    class Client:
        def with_options(self, **kwargs):
            return self

        responses = Responses()

    monkeypatch.setattr(llm, "_client", Client())
    monkeypatch.setattr(llm, "get_client", lambda: Client())
    with pytest.raises(LLMTimeoutError):
        llm.parse_structured(
            "m",
            "sys",
            [("user", "u")],
            QADraft,
            max_output_tokens=10,
            timeout=1,
        )
