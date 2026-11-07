import json
from pathlib import Path

from app.models.schemas import DocumentIndex, LessonPlan

ROOT = Path(__file__).resolve().parents[3]
FIXTURES = ROOT / "shared" / "fixtures"
DATA = ROOT / "backend" / "data"


def load_fixture_document_index() -> DocumentIndex:
    raw = json.loads((FIXTURES / "sample-document-index.json").read_text())
    return DocumentIndex.model_validate(raw)


def load_fixture_lesson_plan() -> LessonPlan:
    raw = json.loads((FIXTURES / "sample-lesson-plan.json").read_text())
    return LessonPlan.model_validate(raw)


def document_index_path(document_id: str) -> Path:
    DATA.mkdir(parents=True, exist_ok=True)
    return DATA / f"{document_id}.index.json"


def lesson_plan_path(lesson_id: str) -> Path:
    DATA.mkdir(parents=True, exist_ok=True)
    return DATA / f"{lesson_id}.lesson.json"


def document_pdf_path(document_id: str) -> Path:
    return DATA / f"{document_id}.pdf"


GOLDEN_PDF_FALLBACK = FIXTURES / "golden-demo.pdf"
