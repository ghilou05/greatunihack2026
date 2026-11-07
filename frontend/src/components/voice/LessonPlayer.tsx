"use client";

/**
 * P3: ElevenLabs TTS/STT, segment state machine, interrupt + resume.
 */
import { getLesson, postLessonQA } from "@/lib/api";
import { segmentOnEnterCommands } from "@/lib/viewer-commands";
import { useEffect, useState } from "react";
import type { LessonPlan, LessonState } from "@/lib/types";

type Props = {
  lessonId: string;
};

const initialState = (lessonId: string): LessonState => ({
  lesson_id: lessonId,
  status: "idle",
  segment_id: null,
  segment_index: 0,
  open_loops: [],
  interrupt: null,
});

export function LessonPlayer({ lessonId }: Props) {
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

  const playSegment = (index: number) => {
    if (!plan || !plan.segments[index]) return;
    const seg = plan.segments[index];
    setState({
      ...state,
      status: "teaching",
      segment_id: seg.id,
      segment_index: index,
    });
    setTranscript(seg.narration);
    const cmds = segmentOnEnterCommands(seg.on_enter);
    console.info("[P3] on_enter → P1 viewer", cmds);
    // TODO(P3): TTS(seg.narration); onSegmentStart → window dispatch or callback to PdfViewer
  };

  const interruptDemo = async () => {
    if (!plan || state.segment_id == null) return;
    setState({ ...state, status: "paused" });
    try {
      const qa = await postLessonQA(lessonId, {
        lesson_id: lessonId,
        segment_id: state.segment_id,
        question: "Why does water move?",
      });
      setTranscript(`${qa.answer}\n\n${qa.bridge ?? ""}`);
      console.info("[P3] qa viewer_commands → P1", qa.viewer_commands);
    } catch {
      const res = await fetch("/fixtures/sample-qa-response.json");
      const qa = await res.json();
      setTranscript(qa.answer);
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
