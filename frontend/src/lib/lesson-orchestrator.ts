/**
 * P3: Browser-only lesson FSM. Calls P1 viewer handlers + P2 HTTP for Q&A.
 * No server-side orchestration in MVP.
 */
import type { LessonPlan, LessonSegment, LessonState, ViewerCommand } from "@/lib/types";
import { segmentOnEnterCommands } from "@/lib/viewer-commands";

export type OrchestratorHandlers = {
  onViewerCommands: (commands: ViewerCommand[]) => void;
  onTranscript: (text: string) => void;
};

export function createInitialState(lessonId: string): LessonState {
  return {
    lesson_id: lessonId,
    status: "idle",
    segment_id: null,
    segment_index: 0,
    interrupt: null,
  };
}

export function startSegment(
  plan: LessonPlan,
  index: number,
  handlers: OrchestratorHandlers
): { state: LessonState; segment: LessonSegment } {
  const segment = plan.segments[index];
  const state: LessonState = {
    lesson_id: plan.lesson_id,
    status: "teaching",
    segment_id: segment.id,
    segment_index: index,
    interrupt: null,
  };
  handlers.onViewerCommands(segmentOnEnterCommands(segment.on_enter));
  handlers.onTranscript(segment.narration);
  return { state, segment };
}

export function captureInterrupt(
  state: LessonState,
  narrationOffsetMs: number,
  narrationDelivered: string
): LessonState {
  if (!state.segment_id) return state;
  return {
    ...state,
    status: "paused",
    interrupt: {
      at_segment_id: state.segment_id,
      narration_offset_ms: narrationOffsetMs,
      narration_delivered: narrationDelivered,
    },
  };
}

export function resumeAfterQA(state: LessonState): LessonState {
  return {
    ...state,
    status: "teaching",
    interrupt: state.interrupt,
  };
}
