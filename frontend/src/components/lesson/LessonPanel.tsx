"use client";

/**
 * P1: bottom-right of the right rail (plan §3.5). Upload, progress, segment list
 * and static narration. Playback and transcript belong to P3's LessonPlayer.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import {
  generateLesson,
  getDocumentFileUrl,
  pollDocumentUntilReady,
  uploadDocument,
} from "@/lib/api";
import type { DocumentIndex, LessonPlan } from "@/lib/types";
import { SegmentList } from "./SegmentList";
import { UploadScreen } from "./UploadScreen";
import styles from "./LessonPanel.module.css";

export type ReadyDocumentInfo = {
  documentId: string;
  index: DocumentIndex;
  fileUrl: string;
};

type Props = {
  currentSegmentIndex?: number;
  onSelectSegment?: (index: number) => void;
  onDocumentReady?: (document: ReadyDocumentInfo) => void;
  onLessonReady?: (lesson: LessonPlan) => void;
};

type View =
  | { phase: "upload" }
  | { phase: "working"; message: string }
  | { phase: "error"; message: string }
  | { phase: "ready"; lesson: LessonPlan };

/** What to run. Updated as steps finish, so a retry doesn't repeat a finished upload. */
type Job = { file?: File; documentId?: string };

const READING = "Reading your document…";
const BUILDING = "Building your lesson…";

export function LessonPanel({
  currentSegmentIndex = 0,
  onSelectSegment,
  onDocumentReady,
  onLessonReady,
}: Props) {
  const [view, setView] = useState<View>({ phase: "upload" });
  const jobRef = useRef<Job>({});
  const abortRef = useRef<AbortController | null>(null);

  const callbacksRef = useRef({ onDocumentReady, onLessonReady });
  useEffect(() => {
    callbacksRef.current = { onDocumentReady, onLessonReady };
  });

  const run = useCallback(async (job: Job) => {
    abortRef.current?.abort();
    const controller = new AbortController();
    const { signal } = controller;
    abortRef.current = controller;
    jobRef.current = job;

    try {
      setView({ phase: "working", message: READING });

      if (job.file && !job.documentId) {
        job.documentId = (await uploadDocument(job.file, signal)).document_id;
      }

      const docId = job.documentId;
      if (!docId) throw new Error("No document to read.");

      const doc = await pollDocumentUntilReady(docId, { signal });
      if (signal.aborted) return;
      callbacksRef.current.onDocumentReady?.({
        documentId: docId,
        index: doc.index,
        fileUrl: getDocumentFileUrl(docId),
      });

      setView({ phase: "working", message: BUILDING });
      const lesson = await generateLesson(docId, signal);
      if (signal.aborted) return;

      callbacksRef.current.onLessonReady?.(lesson);
      setView({ phase: "ready", lesson });
    } catch (err) {
      if (signal.aborted) return;
      setView({
        phase: "error",
        message:
          err instanceof Error ? err.message : "Something went wrong.",
      });
    }
  }, []);

  useEffect(() => () => abortRef.current?.abort(), []);

  const startOver = () => {
    abortRef.current?.abort();
    jobRef.current = {};
    setView({ phase: "upload" });
  };

  return (
    <section className={styles.panel} aria-label="Lesson">
      {view.phase === "upload" && (
        <UploadScreen onFile={(file) => run({ file })} />
      )}

      {view.phase === "working" && (
        <div className={styles.center} role="status">
          <span className={styles.bars} aria-hidden="true">
            <span />
            <span />
            <span />
            <span />
            <span />
          </span>
          <p className={styles.statusText}>{view.message}</p>
        </div>
      )}

      {view.phase === "error" && (
        <div className={styles.center} role="alert">
          <p className={styles.errorText}>{view.message}</p>
          <div className={styles.actions}>
            <button
              type="button"
              className={styles.button}
              onClick={() => run(jobRef.current)}
            >
              Retry
            </button>
            <button
              type="button"
              className={styles.button}
              onClick={startOver}
            >
              Upload a different PDF
            </button>
          </div>
        </div>
      )}

      {view.phase === "ready" && (
        <ReadyLesson
          lesson={view.lesson}
          currentSegmentIndex={currentSegmentIndex}
          onSelectSegment={onSelectSegment}
        />
      )}
    </section>
  );
}

function ReadyLesson({
  lesson,
  currentSegmentIndex,
  onSelectSegment,
}: {
  lesson: LessonPlan;
  currentSegmentIndex: number;
  onSelectSegment?: (index: number) => void;
}) {
  const total = lesson.segments.length;
  const current = lesson.segments[currentSegmentIndex];

  if (total === 0) {
    return (
      <div className={styles.center}>
        <p className={styles.errorText}>This lesson has no segments.</p>
      </div>
    );
  }

  return (
    <>
      <header className={styles.header}>
        <h2 className={styles.title}>{lesson.title}</h2>
        {current && (
          <div className={styles.step}>
            <span className={styles.progress} aria-hidden="true">
              <span
                className={styles.progressFill}
                style={{ width: `${((currentSegmentIndex + 1) / total) * 100}%` }}
              />
            </span>
            <span>
              Step {currentSegmentIndex + 1} / {total}
            </span>
          </div>
        )}
      </header>

      <SegmentList
        segments={lesson.segments}
        currentSegmentIndex={currentSegmentIndex}
        onSelectSegment={onSelectSegment}
      />

      {current && (
        <div className={styles.narration}>
          <div className={styles.narrationCard}>
            <span className={styles.narrationLabel}>Lesson text</span>
            <p className={styles.narrationText}>{current.narration}</p>
          </div>
        </div>
      )}
    </>
  );
}
