"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LessonPanel,
  type ReadyDocumentInfo,
} from "@/components/lesson/LessonPanel";
import { PdfViewer, type PdfViewerHandle } from "@/components/pdf/PdfViewer";
import { LessonPlayer } from "@/components/voice/LessonPlayer";
import type { LessonPlan, ViewerCommand } from "@/lib/types";
import { executeCommands, onEnterToCommands } from "@/lib/viewer-commands";

type QueuedCommands = { commands: ViewerCommand[]; fallbackPage: number };

export default function HomePage() {
  const viewerRef = useRef<PdfViewerHandle | null>(null);
  const queuedCommands = useRef<QueuedCommands[]>([]);
  const [viewerAttached, setViewerAttached] = useState(false);
  const [viewerDocument, setViewerDocument] =
    useState<ReadyDocumentInfo | null>(null);
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);

  const attachViewer = useCallback((viewer: PdfViewerHandle | null) => {
    viewerRef.current = viewer;
    setViewerAttached(viewer !== null);
  }, []);

  /** The ref is null until react-pdf has loaded, so hold commands until then. */
  const sendToViewer = useCallback(
    (commands: ViewerCommand[], fallbackPage: number) => {
      const viewer = viewerRef.current;
      if (viewer) executeCommands(commands, viewer, fallbackPage);
      else queuedCommands.current.push({ commands, fallbackPage });
    },
    []
  );

  // Flush from an effect, not attachViewer: the ref attaches before the viewer's
  // mount effect, which resets its highlights and queued scroll.
  useEffect(() => {
    const viewer = viewerRef.current;
    if (!viewerAttached || !viewer) return;
    for (const { commands, fallbackPage } of queuedCommands.current.splice(0)) {
      executeCommands(commands, viewer, fallbackPage);
    }
  }, [viewerAttached]);

  const selectSegment = useCallback(
    (plan: LessonPlan, index: number) => {
      const segment = plan.segments[index];
      if (!segment) return;
      setCurrentSegmentIndex(index);
      sendToViewer(onEnterToCommands(segment.on_enter), segment.page);
    },
    [sendToViewer]
  );

  const handleLessonReady = useCallback(
    (plan: LessonPlan) => {
      setLesson(plan);
      // The panel opens on step 1, so show that step's highlights straight away.
      selectSegment(plan, 0);
    },
    [selectSegment]
  );

  const currentPage = lesson?.segments[currentSegmentIndex]?.page ?? 1;

  return (
    <main>
      <div className="viewer-pane">
        {viewerDocument ? (
          <PdfViewer
            ref={attachViewer}
            file={viewerDocument.fileUrl}
            index={viewerDocument.index}
          />
        ) : (
          <p className="pane-message">Upload a PDF to see it here.</p>
        )}
      </div>

      <aside className="right-rail">
        <div className="player-pane">
          {lesson ? (
            /*
             * LessonPlayer (Person 3) sends viewer commands through this callback:
             * segment on_enter on play or resume, and viewer_commands from Q&A
             * answers. It runs them on the viewer, queueing until the viewer is
             * ready. Unknown spans fall back to the current segment's page.
             */
            <LessonPlayer
              key={lesson.lesson_id}
              lessonId={lesson.lesson_id}
              onViewerCommands={(commands) =>
                sendToViewer(commands, currentPage)
              }
            />
          ) : (
            <p className="pane-message">
              Voice player (Person 3) appears once a lesson is ready.
            </p>
          )}
        </div>

        <LessonPanel
          currentSegmentIndex={currentSegmentIndex}
          onSelectSegment={(index) => {
            if (lesson) selectSegment(lesson, index);
          }}
          onDocumentReady={setViewerDocument}
          onLessonReady={handleLessonReady}
        />
      </aside>
    </main>
  );
}
