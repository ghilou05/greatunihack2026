/** Mirrors shared/schemas — P1 imports fixtures; align with backend Pydantic models. */

export type BBox = { x0: number; y0: number; x1: number; y1: number };

export type Span = {
  span_id: string;
  unit_kind: "line";
  page: number;
  text: string;
  bbox: BBox;
};

export type DocumentIndex = {
  document_id: string;
  pages: { page: number; width: number; height: number }[];
  spans: Span[];
};

export type SegmentCue = {
  at_ms: number;
  commands: ViewerCommand[];
};

export type LessonSegment = {
  id: string;
  goal: string;
  page: number;
  span_ids: string[];
  narration: string;
  on_enter: { scroll_to_span: string; highlights: string[] };
  cues: SegmentCue[];
  check_question?: string | null;
  next: string | null;
};

export type LessonPlan = {
  lesson_id: string;
  document_id: string;
  title: string;
  segments: LessonSegment[];
};

export type ViewerCommand =
  | { type: "scroll_to_span"; span_id: string }
  | { type: "scroll_to_page"; page: number }
  | { type: "set_highlights"; span_ids: string[] }
  | { type: "clear_highlights" };

export type LessonStateStatus =
  | "idle"
  | "teaching"
  | "paused"
  | "answering"
  | "complete";

export type LessonState = {
  lesson_id: string;
  status: LessonStateStatus;
  segment_id: string | null;
  segment_index: number;
  interrupt: {
    at_segment_id: string;
    narration_offset_ms: number;
    narration_delivered: string;
  } | null;
};

export type QAResponse = {
  answer: string;
  cite_span_ids: string[];
  viewer_commands: ViewerCommand[];
  bridge?: string | null;
};

export type QATurn = { question: string; answer: string };

export type QARequest = {
  lesson_id: string;
  segment_id: string;
  question: string;
  playback_ms?: number;
  narration_delivered?: string;
  qa_turns?: QATurn[];
  max_cite_spans?: number;
};
