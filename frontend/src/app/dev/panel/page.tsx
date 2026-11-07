"use client";

import { useEffect, useState, type CSSProperties } from "react";
import { LessonPanel } from "@/components/lesson/LessonPanel";
import { enableFixtureMode } from "@/lib/api";
import type { LessonPlan } from "@/lib/types";

enableFixtureMode();

const ADVANCE_MS = 5000;

const placeholder: CSSProperties = {
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  background: "#ddd",
  border: "1px solid #444",
  color: "#444",
  font: "12px Arial, Helvetica, sans-serif",
};

export default function DevPanelPage() {
  const [lesson, setLesson] = useState<LessonPlan | null>(null);
  const [currentSegmentIndex, setCurrentSegmentIndex] = useState(0);
  const segmentCount = lesson?.segments.length ?? 0;

  // Re-arms on every index change, so clicking a segment gives it a full 5s.
  useEffect(() => {
    if (segmentCount === 0) return;
    const timer = setTimeout(
      () => setCurrentSegmentIndex((index) => (index + 1) % segmentCount),
      ADVANCE_MS
    );
    return () => clearTimeout(timer);
  }, [segmentCount, currentSegmentIndex]);

  return (
    <main style={{ height: "100vh", background: "#e8e8e8" }}>
      <div style={placeholder}>PdfViewer placeholder</div>
      <aside
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "1rem",
          minHeight: 0,
        }}
      >
        <div style={{ ...placeholder, flex: "0 0 35%" }}>
          LessonPlayer placeholder (Person 3)
        </div>
        <LessonPanel
          currentSegmentIndex={currentSegmentIndex}
          onSelectSegment={setCurrentSegmentIndex}
          onLessonReady={(ready) => {
            setCurrentSegmentIndex(0);
            setLesson(ready);
          }}
        />
      </aside>
    </main>
  );
}
