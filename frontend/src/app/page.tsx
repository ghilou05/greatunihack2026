"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import {
  LessonPanel,
  type ReadyDocumentInfo,
} from "@/components/lesson/LessonPanel";
import { PdfViewer, type PdfViewerHandle } from "@/components/pdf/PdfViewer";
import { LessonPlayer } from "@/components/voice/LessonPlayer";
import type { LessonPlan, LessonSegment, ViewerCommand } from "@/lib/types";
import { executeCommands, onEnterToCommands } from "@/lib/viewer-commands";

type QueuedCommands = { commands: ViewerCommand[]; fallbackPage: number };

export default function HomePage() {
  const [document, setDocument] = useState<ReadyDocumentInfo | null>(null);
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [segmentIndex, setSegmentIndex] = useState(0);

  const [attachedViewer, setAttachedViewer] = useState<PdfViewerHandle | null>(
    null
  );
  /** Null until the react-pdf chunk has loaded and the viewer has reset itself. */
  const viewerRef = useRef<PdfViewerHandle | null>(null);
  const queuedCommands = useRef<QueuedCommands[]>([]);

  // The viewer clears its highlights and pending scroll in a mount effect, so
  // queued commands have to run here, after that reset, not when the ref attaches.
  useEffect(() => {
    viewerRef.current = attachedViewer;
    if (!attachedViewer) return;
    for (const { commands, fallbackPage } of queuedCommands.current) {
      executeCommands(commands, attachedViewer, fallbackPage);
    }
    queuedCommands.current = [];
  }, [attachedViewer]);

  /**
   * Runs commands now, or queues them until the viewer exists. Also handed to
   * Person 3's LessonPlayer as `onViewerCommands`: the player's only route to the
   * PDF. `fallbackPage` is the page of the segment the commands belong to, used
   * when a command names an unknown span.
   */
  const runViewerCommands = useCallback(
    (commands: ViewerCommand[], fallbackPage: number) => {
      if (viewerRef.current) {
        executeCommands(commands, viewerRef.current, fallbackPage);
      } else {
        queuedCommands.current.push({ commands, fallbackPage });
      }
    },
    []
  );

  const enterSegment = (segment: LessonSegment) => {
    runViewerCommands(onEnterToCommands(segment.on_enter), segment.page);
  };

  const handleDocumentReady = (ready: ReadyDocumentInfo) => {
    // Span ids like p1_l0 exist in every document, so drop anything still queued.
    queuedCommands.current = [];
    setLesson(null);
    setSegmentIndex(0);
    setDocument(ready);
  };

  const handleLessonReady = (ready: LessonPlan) => {
    setLesson(ready);
    setSegmentIndex(0);
    // The panel marks the first segment as current, so show it on the PDF too.
    if (ready.segments[0]) enterSegment(ready.segments[0]);
  };

  const handleSelectSegment = (index: number) => {
    const segment = lesson?.segments[index];
    if (!segment) return;
    setSegmentIndex(index);
    enterSegment(segment);
  };

  const segmentCount = lesson?.segments.length ?? 0;

  return (
    <div className="lesson-shell">
      <header className="lesson-topbar">
        <h1 className="lesson-title">
          {lesson ? `Lesson title: ${lesson.title}` : "PDF Voice Lesson"}
        </h1>
        {segmentCount > 0 && (
          <>
            <span className="lesson-progress" aria-hidden="true">
              <span
                className="lesson-progress-fill"
                style={{ width: `${((segmentIndex + 1) / segmentCount) * 100}%` }}
              />
            </span>
            <span className="lesson-step">
              Step {segmentIndex + 1} / {segmentCount}
            </span>
          </>
        )}
      </header>

      <main className="lesson-main">
        {/* Definite height: the viewer scrolls inside its own container. */}
        <div className="lesson-viewer">
          {document ? (
            <PdfViewer
              ref={setAttachedViewer}
              file={document.fileUrl}
              index={document.index}
            />
          ) : (
            <p className="lesson-empty">Upload a PDF to see it here.</p>
          )}
        </div>

        <aside className="lesson-rail">
          <div className="lesson-player">
            {lesson ? (
              <LessonPlayer
                key={lesson.lesson_id}
                lessonId={lesson.lesson_id}
                onViewerCommands={runViewerCommands}
              />
            ) : (
              // LessonPlayer requires a lessonId, so it can't mount until there is one.
              <p className="lesson-empty">
                Voice tutor (Person 3): starts once your lesson is ready.
              </p>
            )}
          </div>
          <LessonPanel
            currentSegmentIndex={segmentIndex}
            onSelectSegment={handleSelectSegment}
            onDocumentReady={handleDocumentReady}
            onLessonReady={handleLessonReady}
          />
        </aside>
      </main>
    </div>
  );
}
