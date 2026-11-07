"""T-004: storage ids, atomic writes, locks."""

from __future__ import annotations

import json
import threading
from pathlib import Path

import pytest

from app.errors import NotFoundError
from app.models.schemas import DocumentIndex, LessonPlan
from app.storage import local


def test_id_validation_rejects_bad_document_ids():
    for bad in ("../x", "doc_", "doc_ABC", "doc_" + "a" * 33, "les_demo", ""):
        with pytest.raises(NotFoundError):
            local.require_document_id(bad)


def test_id_validation_accepts_good_document_ids():
    assert local.require_document_id("doc_a1b2c3d4e5f6") == "doc_a1b2c3d4e5f6"
    assert local.require_document_id("doc_demo") == "doc_demo"


def test_lesson_id_validation():
    with pytest.raises(NotFoundError):
        local.require_lesson_id("les_../a")
    assert local.require_lesson_id("les_abc123") == "les_abc123"


def test_lesson_id_for():
    assert local.lesson_id_for("doc_a1b2c3d4e5f6") == "les_a1b2c3d4e5f6"
    assert local.lesson_id_for("doc_demo") == "les_demo"


def test_load_demo_plan_lesson_id(data_dir: Path):
    plan = local.load_plan("les_demo")
    assert plan.lesson_id == "les_demo"
    assert plan.document_id == "doc_demo"


def test_atomic_write_survives_replace_failure(monkeypatch, data_dir: Path):
    target = data_dir / "x.json"
    target.write_text('{"ok": true}')
    original = target.read_text()

    def boom(_src, _dst):
        raise OSError("replace failed")

    monkeypatch.setattr("os.replace", boom)
    with pytest.raises(OSError):
        local.atomic_write_text(target, '{"nope": 1}')
    assert target.read_text() == original
    temps = list(data_dir.glob(".x.json.*.tmp"))
    assert not temps


def test_atomic_write_concurrent_threads(data_dir: Path):
    target = data_dir / "race.json"
    errors: list[str] = []

    def worker(i: int):
        try:
            for _ in range(20):
                local.atomic_write_text(target, json.dumps({"i": i, "t": threading.get_ident()}))
                json.loads(target.read_text())
        except Exception as exc:
            errors.append(str(exc))

    threads = [threading.Thread(target=worker, args=(n,)) for n in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert not errors
    json.loads(target.read_text())


def test_document_lock_serializes_same_doc():
    order: list[str] = []
    lock = threading.Lock()

    def work(tag: str):
        with local.document_lock("doc_testlock1"):
            with lock:
                order.append(f"enter-{tag}")
            threading.Event().wait(0.05)
            with lock:
                order.append(f"exit-{tag}")

    t1 = threading.Thread(target=work, args=("a",))
    t2 = threading.Thread(target=work, args=("b",))
    t1.start()
    t2.start()
    t1.join()
    t2.join()
    # entries must not interleave
    assert order.index("exit-a") < order.index("enter-b") or order.index("exit-b") < order.index(
        "enter-a"
    )


def test_document_lock_different_docs_parallel():
    entered = threading.Barrier(2, timeout=2)

    def work(doc: str):
        with local.document_lock(doc):
            entered.wait()

    t1 = threading.Thread(target=work, args=("doc_aa",))
    t2 = threading.Thread(target=work, args=("doc_bb",))
    t1.start()
    t2.start()
    t1.join(timeout=3)
    t2.join(timeout=3)
    assert not t1.is_alive() and not t2.is_alive()
