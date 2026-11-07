"use client";

/**
 * P1: Lesson text, upload UI, wire to backend APIs.
 */
import { getDocument, getLesson } from "@/lib/api";
import { useEffect, useState } from "react";
import type { LessonPlan } from "@/lib/types";

type Props = {
  lessonId: string;
  documentId: string;
};

export function LessonPanel({ lessonId, documentId }: Props) {
  const [plan, setPlan] = useState<LessonPlan | null>(null);
  const [apiStatus, setApiStatus] = useState<string>("idle");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        setApiStatus("loading");
        const [lesson, doc] = await Promise.all([
          getLesson(lessonId),
          getDocument(documentId),
        ]);
        if (!cancelled) {
          setPlan(lesson);
          setApiStatus(doc.index ? "ready" : "no-index");
        }
      } catch {
        if (!cancelled) setApiStatus("fixture-fallback");
        const res = await fetch("/fixtures/sample-lesson-plan.json");
        if (!cancelled) setPlan(await res.json());
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [lessonId, documentId]);

  return (
    <section
      style={{
        background: "var(--panel)",
        borderRadius: 12,
        padding: "1rem",
        flex: 1,
      }}
    >
      <h2 style={{ margin: "0 0 0.5rem", fontSize: "1.1rem" }}>Lesson (P1)</h2>
      <p style={{ color: "var(--muted)", fontSize: "0.8rem" }}>API: {apiStatus}</p>
      {plan ? (
        <>
          <h3 style={{ fontSize: "1rem" }}>{plan.title}</h3>
          <ol style={{ paddingLeft: "1.25rem", fontSize: "0.9rem" }}>
            {plan.segments.map((s) => (
              <li key={s.id} style={{ marginBottom: "0.75rem" }}>
                <strong>{s.goal}</strong>
                <div style={{ color: "var(--muted)" }}>{s.narration}</div>
              </li>
            ))}
          </ol>
        </>
      ) : (
        <p>Loading…</p>
      )}
    </section>
  );
}
