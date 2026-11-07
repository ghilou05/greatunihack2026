"""P2: local persistence — paths, atomic writes, locks, fixture loaders."""

from __future__ import annotations

import json
import logging
import os
import re
import tempfile
import threading
from collections.abc import Iterator
from contextlib import contextmanager
from pathlib import Path

from app.config import get_settings
from app.errors import NotFoundError
from app.models.schemas import DocumentIndex, LessonPlan

logger = logging.getLogger("lesson.storage")

DEMO_DOCUMENT_ID = "doc_demo"
DEMO_LESSON_ID = "les_demo"

_DOC_ID_RE = re.compile(r"^doc_[a-z0-9]{1,32}$")
_LESSON_ID_RE = re.compile(r"^les_[a-z0-9]{1,32}$")

_LOCK_REGISTRY_GUARD = threading.Lock()
_DOC_LOCKS: dict[str, threading.Lock] = {}


def data_dir() -> Path:
    path = get_settings().data_dir
    path.mkdir(parents=True, exist_ok=True)
    return path


def fixtures_dir() -> Path:
    return get_settings().fixtures_dir


GOLDEN_PDF_FALLBACK = fixtures_dir() / "golden-demo.pdf"


def require_document_id(document_id: str) -> str:
    if not _DOC_ID_RE.fullmatch(document_id):
        raise NotFoundError("Document not found")
    return document_id


def require_lesson_id(lesson_id: str) -> str:
    if not _LESSON_ID_RE.fullmatch(lesson_id):
        raise NotFoundError("Lesson not found")
    return lesson_id


def lesson_id_for(document_id: str) -> str:
    require_document_id(document_id)
    return "les_" + document_id.removeprefix("doc_")


def _atomic_write(path: Path, data: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    fd, tmp_name = tempfile.mkstemp(dir=path.parent, prefix=f".{path.name}.", suffix=".tmp")
    tmp_path = Path(tmp_name)
    try:
        with os.fdopen(fd, "wb") as fh:
            fh.write(data)
            fh.flush()
            os.fsync(fh.fileno())
        os.replace(tmp_path, path)
    finally:
        if tmp_path.exists():
            try:
                tmp_path.unlink()
            except OSError:
                pass


def atomic_write_text(path: Path, text: str) -> None:
    _atomic_write(path, text.encode("utf-8"))


def atomic_write_bytes(path: Path, data: bytes) -> None:
    _atomic_write(path, data)


def document_pdf_path(document_id: str) -> Path:
    require_document_id(document_id)
    return data_dir() / f"{document_id}.pdf"


def document_index_path(document_id: str) -> Path:
    require_document_id(document_id)
    return data_dir() / f"{document_id}.index.json"


def lesson_plan_path(lesson_id: str) -> Path:
    require_lesson_id(lesson_id)
    return data_dir() / f"{lesson_id}.lesson.json"


def lesson_meta_path(lesson_id: str) -> Path:
    require_lesson_id(lesson_id)
    return data_dir() / f"{lesson_id}.meta.json"


def load_fixture_document_index() -> DocumentIndex:
    raw = json.loads((fixtures_dir() / "sample-document-index.json").read_text())
    return DocumentIndex.model_validate(raw)


def load_fixture_lesson_plan() -> LessonPlan:
    raw = json.loads((fixtures_dir() / "sample-lesson-plan.json").read_text())
    return LessonPlan.model_validate(raw)


def save_index(document_id: str, index: DocumentIndex) -> None:
    atomic_write_text(document_index_path(document_id), index.model_dump_json(indent=2))


def save_plan(lesson_id: str, plan: LessonPlan) -> None:
    atomic_write_text(lesson_plan_path(lesson_id), plan.model_dump_json(indent=2))


def save_meta(lesson_id: str, meta: dict) -> None:
    atomic_write_text(lesson_meta_path(lesson_id), json.dumps(meta, indent=2))


def save_pdf_bytes(document_id: str, data: bytes) -> None:
    atomic_write_bytes(document_pdf_path(document_id), data)


def load_index(document_id: str) -> DocumentIndex:
    require_document_id(document_id)
    if document_id == DEMO_DOCUMENT_ID:
        return load_fixture_document_index()
    path = data_dir() / f"{document_id}.index.json"
    if not path.is_file():
        raise NotFoundError("Document not found")
    try:
        return DocumentIndex.model_validate(json.loads(path.read_text()))
    except (json.JSONDecodeError, ValueError):
        raise NotFoundError("Document not found") from None


def load_plan(lesson_id: str) -> LessonPlan:
    require_lesson_id(lesson_id)
    if lesson_id == DEMO_LESSON_ID:
        return load_fixture_lesson_plan()
    path = data_dir() / f"{lesson_id}.lesson.json"
    if not path.is_file():
        raise NotFoundError("Lesson not found")
    try:
        return LessonPlan.model_validate(json.loads(path.read_text()))
    except (json.JSONDecodeError, ValueError):
        raise NotFoundError("Lesson not found") from None


def try_load_plan(lesson_id: str) -> LessonPlan | None:
    try:
        return load_plan(lesson_id)
    except NotFoundError:
        return None


@contextmanager
def document_lock(document_id: str) -> Iterator[None]:
    require_document_id(document_id)
    with _LOCK_REGISTRY_GUARD:
        lock = _DOC_LOCKS.setdefault(document_id, threading.Lock())
    lock.acquire()
    try:
        yield
    finally:
        lock.release()


# Backward-compat: `from app.storage.local import DATA` resolves at call time via data_dir().
def __getattr__(name: str):
    if name == "DATA":
        return data_dir()
    if name == "FIXTURES":
        return fixtures_dir()
    raise AttributeError(name)
