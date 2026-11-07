/** Mirrors shared/schemas — P1 imports fixtures; align with backend Pydantic models. */

export type BBox = { x0: number; y0: number; x1: number; y1: number };

export type Span = {
  span_id: string;
  page: number;
  text: string;
  bbox: BBox;
};

export type DocumentIndex = {
  document_id: string;
  pages: { page: number; width: number; height: number }[];
  spans: Span[];
};

export type LessonSegment = {
  id: string;
  goal: string;
  span_ids: string[];
  narration: string;
  on_enter: { scroll_to_span: string; highlights: string[] };
  check_question: string | null;
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
  open_loops: string[];
  interrupt: { question: string; at_segment_id: string } | null;
};

export type QAResponse = {
  answer: string;
  cite_span_ids: string[];
  viewer_commands: ViewerCommand[];
  bridge?: string | null;
};

export type QARequest = {
  lesson_id: string;
  segment_id: string;
  question: string;
  max_cite_spans?: number;
};
