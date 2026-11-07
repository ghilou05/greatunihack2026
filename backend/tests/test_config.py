from pathlib import Path

from fastapi.testclient import TestClient

from app.config import BACKEND_DIR, get_settings


def test_defaults_match_design():
    s = get_settings()
    assert s.plan_model == "gpt-6.1-terra"
    assert s.qa_model == "gpt-6.1-terra"
    assert s.plan_effort == "low"
    assert s.qa_effort == "low"
    assert s.service_tier == ""
    assert (s.max_pages, s.max_total_chars, s.min_total_chars, s.min_lines, s.max_upload_mb) == (
        10,
        80_000,
        200,
        10,
        20,
    )
    assert (s.plan_timeout_s, s.qa_timeout_s) == (45, 20)
    assert s.plan_deadline_s == 80
    assert s.plan_retry_cutoff_s == 45
    assert (s.plan_max_output_tokens, s.qa_max_output_tokens) == (6000, 1200)
    assert s.plan_strategy == "single"
    assert s.data_dir == BACKEND_DIR / "data"
    assert s.cors_origins == ("http://localhost:3000",)


def test_data_dir_absolute_env(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", str(tmp_path / "x"))
    assert get_settings().data_dir == (tmp_path / "x").resolve()


def test_data_dir_relative_resolves_against_backend_not_cwd(monkeypatch, tmp_path):
    monkeypatch.setenv("DATA_DIR", "./data")
    monkeypatch.chdir(tmp_path)
    assert get_settings().data_dir == (BACKEND_DIR / "data").resolve()


def test_empty_effort_means_omit(monkeypatch):
    monkeypatch.setenv("OPENAI_PLAN_EFFORT", "")
    assert get_settings().plan_effort == ""


def test_env_overrides_read_at_call_time(monkeypatch):
    monkeypatch.setenv("PLAN_MAX_OUTPUT_TOKENS", "9000")
    assert get_settings().plan_max_output_tokens == 9000
    monkeypatch.setenv("PLAN_MAX_OUTPUT_TOKENS", "7000")
    assert get_settings().plan_max_output_tokens == 7000


def test_health_and_cors(client: TestClient):
    r = client.get("/health", headers={"Origin": "http://localhost:3000"})
    assert r.status_code == 200
    assert r.headers.get("access-control-allow-origin") == "http://localhost:3000"
    assert isinstance(Path(get_settings().data_dir), Path)
