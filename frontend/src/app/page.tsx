"use client";

import { LessonPanel } from "@/components/lesson/LessonPanel";
import { PdfViewer } from "@/components/pdf/PdfViewer";
import type { PdfViewerHandle } from "@/components/pdf/PdfViewer";
import { LessonPlayer } from "@/components/voice/LessonPlayer";
import type { ViewerCommand } from "@/lib/types";
import { useRef } from "react";

export default function HomePage() {
  const viewerRef = useRef<PdfViewerHandle>(null);
  const onViewerCommands = (commands: ViewerCommand[], fallbackPage = 1) => {
    viewerRef.current?.receiveCommands(commands, fallbackPage);
  };

  return (
    <main>
      <PdfViewer documentId="doc_demo" ref={viewerRef} />
      <aside style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
        <LessonPlayer lessonId="les_demo" onViewerCommands={onViewerCommands} />
        <LessonPanel lessonId="les_demo" documentId="doc_demo" />
      </aside>
    </main>
  );
}
