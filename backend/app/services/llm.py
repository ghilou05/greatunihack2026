"""P2: OpenAI Responses API seam."""

from __future__ import annotations

import logging
import sys
import time
from dataclasses import dataclass
from typing import Any, TypeVar

from openai import APIConnectionError, APIStatusError, APITimeoutError, OpenAI, RateLimitError
from pydantic import BaseModel, ValidationError

from app.config import get_settings
from app.errors import LLMTimeoutError, LLMUpstreamError, NotConfiguredError

logger = logging.getLogger("lesson.llm")

T = TypeVar("T", bound=BaseModel)

_client: OpenAI | None = None


@dataclass
class ParsedResult:
    parsed: BaseModel | None
    failure: str | None  # None | refusal | incomplete | invalid
    status: str
    incomplete_reason: str | None
    usage: dict[str, int]
    duration_ms: int
    model: str
    kind: str


def get_client() -> OpenAI:
    global _client
    settings = get_settings()
    if not settings.openai_api_key.strip():
        raise NotConfiguredError()
    if _client is None:
        _client = OpenAI(api_key=settings.openai_api_key, max_retries=0)
    return _client


def _usage_dict(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None)
    if usage is None:
        return {
            "input_tokens": 0,
            "output_tokens": 0,
            "cached_tokens": 0,
            "reasoning_tokens": 0,
        }
    out_detail = getattr(usage, "output_tokens_details", None)
    reasoning = int(getattr(out_detail, "reasoning_tokens", 0) or 0) if out_detail else 0
    in_detail = getattr(usage, "input_tokens_details", None)
    cached = int(getattr(in_detail, "cached_tokens", 0) or 0) if in_detail else 0
    return {
        "input_tokens": int(getattr(usage, "input_tokens", 0) or 0),
        "output_tokens": int(getattr(usage, "output_tokens", 0) or 0),
        "cached_tokens": cached,
        "reasoning_tokens": reasoning,
    }


def parse_structured(
    model: str,
    system: str,
    turns: list[tuple[str, str]],
    schema: type[T],
    *,
    max_output_tokens: int,
    timeout: float,
    max_retries: int = 0,
    prompt_cache_key: str | None = None,
    reasoning_effort: str = "",
    service_tier: str = "",
    kind: str = "structured",
    attempt: int = 1,
) -> ParsedResult:
    if not get_settings().openai_api_key.strip():
        raise NotConfiguredError()

    client = get_client().with_options(timeout=timeout, max_retries=max_retries)
    messages: list[dict[str, str]] = [{"role": "system", "content": system}]
    for role, text in turns:
        messages.append({"role": role, "content": text})

    kwargs: dict[str, Any] = {
        "model": model,
        "input": messages,
        "text_format": schema,
        "max_output_tokens": max_output_tokens,
        "store": False,
    }
    if reasoning_effort:
        kwargs["reasoning"] = {"effort": reasoning_effort}
    if service_tier:
        kwargs["service_tier"] = service_tier
    if prompt_cache_key:
        kwargs["prompt_cache_key"] = prompt_cache_key

    start = time.perf_counter()
    try:
        response = client.responses.parse(**kwargs)
    except APITimeoutError as exc:
        raise LLMTimeoutError() from exc
    except (APIConnectionError, RateLimitError, APIStatusError) as exc:
        raise LLMUpstreamError(exc) from exc
    except ValidationError:
        duration_ms = int((time.perf_counter() - start) * 1000)
        usage = _usage_dict(None)
        result = ParsedResult(
            parsed=None,
            failure="invalid",
            status="invalid",
            incomplete_reason=None,
            usage=usage,
            duration_ms=duration_ms,
            model=model,
            kind=kind,
        )
        _log_call(kind, model, attempt, result)
        return result

    duration_ms = int((time.perf_counter() - start) * 1000)
    status = str(getattr(response, "status", "") or "")
    incomplete = getattr(response, "incomplete_details", None)
    incomplete_reason = getattr(incomplete, "reason", None) if incomplete else None

    parsed = response.output_parsed
    failure: str | None = None
    if parsed is None:
        failure = "refusal"
    elif status == "incomplete":
        failure = "incomplete"

    usage = _usage_dict(response)
    result = ParsedResult(
        parsed=parsed,
        failure=failure,
        status=status,
        incomplete_reason=incomplete_reason,
        usage=usage,
        duration_ms=duration_ms,
        model=model,
        kind=kind,
    )
    _log_call(kind, model, attempt, result)
    return result


def _log_call(kind: str, model: str, attempt: int, result: ParsedResult) -> None:
    logger.info(
        "llm_call kind=%s model=%s attempt=%s duration_ms=%s input_tokens=%s "
        "output_tokens=%s cached_tokens=%s reasoning_tokens=%s status=%s failure=%s",
        kind,
        model,
        attempt,
        result.duration_ms,
        result.usage.get("input_tokens", 0),
        result.usage.get("output_tokens", 0),
        result.usage.get("cached_tokens", 0),
        result.usage.get("reasoning_tokens", 0),
        result.status,
        result.failure,
    )


class _PingSchema(BaseModel):
    answer: str


def _run_ping(label: str, model: str, effort: str) -> int:
    settings = get_settings()
    print(f"--- ping {label} model={model} effort={effort!r} ---")
    r = parse_structured(
        model,
        "Reply with a one-word greeting in the answer field.",
        [("user", "Say hello.")],
        _PingSchema,
        max_output_tokens=200,
        timeout=settings.plan_timeout_s,
        reasoning_effort=effort,
        service_tier=settings.service_tier,
        kind=f"ping-{label}",
    )
    print(
        f"parsed={getattr(r.parsed, 'answer', None)!r} failure={r.failure} "
        f"duration_ms={r.duration_ms} reasoning_tokens={r.usage.get('reasoning_tokens')}"
    )
    if r.failure:
        return 1
    return 0


def _run_truncated_ping(model: str, effort: str) -> None:
    settings = get_settings()
    print("--- truncated ping ---")
    try:
        r = parse_structured(
            model,
            "Write a long essay.",
            [("user", "Write 500 words about water.")],
            _PingSchema,
            max_output_tokens=16,
            timeout=settings.plan_timeout_s,
            reasoning_effort=effort,
            kind="ping-truncated",
        )
        print(f"truncated failure shape: {r.failure!r} status={r.status} reason={r.incomplete_reason}")
    except (LLMTimeoutError, LLMUpstreamError) as exc:
        print(f"truncated raised {type(exc).__name__}")


def main() -> None:
    settings = get_settings()
    if not settings.openai_api_key.strip():
        print("OPENAI_API_KEY not set", file=sys.stderr)
        raise SystemExit(2)
    code = 0
    code |= _run_ping("plan", settings.plan_model, settings.plan_effort)
    _run_truncated_ping(settings.plan_model, settings.plan_effort)
    if settings.qa_model != settings.plan_model:
        code |= _run_ping("qa", settings.qa_model, settings.qa_effort)
    raise SystemExit(code)


if __name__ == "__main__":
    main()
