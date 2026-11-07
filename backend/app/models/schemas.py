from enum import Enum
from typing import Literal

from pydantic import BaseModel, Field


class BBox(BaseModel):
    x0: float
    y0: float
    x1: float
    y1: float


class PageMeta(BaseModel):
    page: int
    width: float
    height: float


class Span(BaseModel):
    span_id: str
    unit_kind: Literal["line"] = "line"
    page: int
    text: str
    bbox: BBox


class DocumentIndex(BaseModel):
    document_id: str
    pages: list[PageMeta]
    spans: list[Span]


class IngestStatus(str, Enum):
    pending = "pending"
    ready = "ready"
    failed = "failed"


class DocumentStatus(BaseModel):
    document_id: str
    status: IngestStatus
    index: DocumentIndex | None = None
    error: str | None = None


class SegmentOnEnter(BaseModel):
    scroll_to_span: str
    highlights: list[str]


class ScrollToSpan(BaseModel):
    type: Literal["scroll_to_span"] = "scroll_to_span"
    span_id: str


class ScrollToPage(BaseModel):
    type: Literal["scroll_to_page"] = "scroll_to_page"
    page: int


class SetHighlights(BaseModel):
    type: Literal["set_highlights"] = "set_highlights"
    span_ids: list[str]


class ClearHighlights(BaseModel):
    type: Literal["clear_highlights"] = "clear_highlights"


ViewerCommand = ScrollToSpan | ScrollToPage | SetHighlights | ClearHighlights


class SegmentCue(BaseModel):
    at_ms: int = Field(ge=0)
    commands: list[ViewerCommand]


class LessonSegment(BaseModel):
    id: str
    goal: str
    span_ids: list[str]
    narration: str
    on_enter: SegmentOnEnter
    cues: list[SegmentCue] = Field(default_factory=list)
    check_question: str | None = None
    next: str | None = None


class LessonPlan(BaseModel):
    lesson_id: str
    document_id: str
    title: str
    segments: list[LessonSegment]


class QATurn(BaseModel):
    question: str
    answer: str


class QARequest(BaseModel):
    lesson_id: str
    segment_id: str
    question: str
    playback_ms: int | None = Field(default=None, ge=0)
    narration_delivered: str | None = None
    qa_turns: list[QATurn] = Field(default_factory=list)
    max_cite_spans: int = Field(default=5, ge=1)


class QAResponse(BaseModel):
    answer: str
    cite_span_ids: list[str]
    viewer_commands: list[ViewerCommand]
    bridge: str | None = None


class UploadResponse(BaseModel):
    document_id: str
    status: IngestStatus
