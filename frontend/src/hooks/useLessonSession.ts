"use client";

/**
 * P3: Central lesson state + viewer command bus — lift to page.tsx at integration.
 */
import type { LessonState, ViewerCommand } from "@/lib/types";
import { useCallback, useState } from "react";

export function useLessonSession(lessonId: string) {
  const [state, setState] = useState<LessonState>({
    lesson_id: lessonId,
    status: "idle",
    segment_id: null,
    segment_index: 0,
    interrupt: null,
  });

  const [pendingCommands, setPendingCommands] = useState<ViewerCommand[]>([]);

  const emitViewerCommands = useCallback((cmds: ViewerCommand[]) => {
    setPendingCommands(cmds);
  }, []);

  const consumeCommands = useCallback(() => {
    const cmds = pendingCommands;
    setPendingCommands([]);
    return cmds;
  }, [pendingCommands]);

  return { state, setState, emitViewerCommands, consumeCommands, pendingCommands };
}
