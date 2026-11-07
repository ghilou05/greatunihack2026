"use client";

import { LessonPanel } from "@/components/lesson/LessonPanel";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import { LessonPlayer } from "@/components/voice/LessonPlayer";

export default function HomePage() {
  return (
    <main>
      <PdfViewer documentId="doc_demo" />
      <aside style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <LessonPlayer lessonId="les_demo" />
        <LessonPanel lessonId="les_demo" documentId="doc_demo" />
      </aside>
    </main>
  );
}
