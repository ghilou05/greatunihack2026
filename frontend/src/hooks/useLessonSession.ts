"use client";

/**
 * P3: Central lesson state + viewer command bus — lift to page.tsx at integration.
 */
import type { LessonState, ViewerCommand } from "@/lib/types";
import { useCallback, useEffect, useState } from "react";

export type PlaybackStatus = "idle" | "loading" | "playing" | "paused" | "complete";

export function useLessonSession(lessonId: string) {
  const [state, setState] = useState<LessonState>({
    lesson_id: lessonId,
    status: "idle",
    segment_id: null,
    segment_index: 0,
    interrupt: null,
  });

  const [pendingCommands, setPendingCommands] = useState<ViewerCommand[]>([]);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>("idle");
  const [question, setQuestion] = useState("");

  useEffect(() => {
    setState({ lesson_id: lessonId, status: "idle", segment_id: null, segment_index: 0, interrupt: null });
    setPlaybackStatus("idle");
    setQuestion("");
  }, [lessonId]);

  const handleQuestion = useCallback((capturedQuestion: string) => {
    const text = capturedQuestion.trim();
    if (!text) return;
    setQuestion(text);
    setState((previous) => previous.segment_id ? { ...previous, status: "paused" } : previous);
  }, []);

  const emitViewerCommands = useCallback((cmds: ViewerCommand[]) => {
    setPendingCommands(cmds);
  }, []);

  const consumeCommands = useCallback(() => {
    const cmds = pendingCommands;
    setPendingCommands([]);
    return cmds;
  }, [pendingCommands]);

  return { state, setState, playbackStatus, setPlaybackStatus, question, handleQuestion, emitViewerCommands, consumeCommands, pendingCommands };
}
