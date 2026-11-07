"use client";

/**
 * P3: ElevenLabs TTS/STT, segment state machine, interrupt + resume.
 */
import { getLesson, postLessonQA } from "@/lib/api";
import {
  captureInterrupt,
  resumeAfterQA,
  startSegment,
} from "@/lib/lesson-orchestrator";
import type { ViewerCommand } from "@/lib/types";
import { useEffect, useState } from "react";
import type { LessonPlan, LessonState } from "@/lib/types";

type Props = {
  lessonId: string;
  onViewerCommands?: (commands: ViewerCommand[]) => void;
};

const initialState = (lessonId: string): LessonState => ({
  lesson_id: lessonId,
  status: "idle",
  segment_id: null,
  segment_index: 0,
  interrupt: null,
});

export function LessonPlayer({ lessonId, onViewerCommands }: Props) {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [state, setState] = useState<LessonState>(() => initialState(lessonId));
  const [transcript, setTranscript] = useState("");

  useEffect(() => {
    getLesson(lessonId)
      .then(setPlan)
      .catch(async () => {
        const res = await fetch("/fixtures/sample-lesson-plan.json");
        setPlan(await res.json());
      });
  }, [lessonId]);

  const handlers = {
    onViewerCommands: (commands: ViewerCommand[]) => {
      onViewerCommands?.(commands);
      console.info("[P3] viewer commands → P1", commands);
    },
    onTranscript: setTranscript,
  };

  const playSegment = (index: number) => {
    if (!plan) return;
    const { state: next } = startSegment(plan, index, handlers);
    setState(next);
    // TODO(P3): TTS from narration; track playback_ms for interrupt
  };

  const interruptDemo = async () => {
    if (!plan || state.segment_id == null) return;
    const seg = plan.segments[state.segment_index];
    const delivered = seg.narration.slice(0, Math.min(60, seg.narration.length));
    const offsetMs = 8000;
    setState(captureInterrupt(state, offsetMs, delivered));
    try {
      const qa = await postLessonQA(lessonId, {
        lesson_id: lessonId,
        segment_id: state.segment_id,
        question: "Why does water move?",
        playback_ms: offsetMs,
        narration_delivered: delivered,
        qa_turns: [],
      });
      setTranscript(`${qa.answer}\n\n${qa.bridge ?? ""}`);
      handlers.onViewerCommands(qa.viewer_commands);
      setState((s) => resumeAfterQA(s));
    } catch {
      const res = await fetch("/fixtures/sample-qa-response.json");
      const qa = await res.json();
      setTranscript(qa.answer);
      handlers.onViewerCommands(qa.viewer_commands);
    }
  };

  return (
    <section
      style={{
        background: "var(--panel)",
        borderRadius: 12,
        padding: "1rem",
      }}
    >
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Voice (P3)</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
        Status: {state.status} · segment {state.segment_index}
        {state.interrupt
          ? ` · resume @ ${state.interrupt.narration_offset_ms}ms`
          : ""}
      </p>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <button type="button" onClick={() => playSegment(0)}>
          Play segment 1
        </button>
        <button type="button" onClick={() => playSegment(1)}>
          Play segment 2
        </button>
        <button type="button" onClick={interruptDemo}>
          Ask (demo)
        </button>
      </div>
      <p
        style={{
          marginTop: "1rem",
          fontSize: "0.9rem",
          lineHeight: 1.45,
          minHeight: "4rem",
        }}
      >
        {transcript || "Transcript will appear here."}
      </p>
    </section>
  );
}
