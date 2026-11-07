"use client";

/**
 * P1: PDF.js / react-pdf viewer, scroll, execute ViewerCommand handlers.
 */
import { HighlightLayer } from "@/components/pdf/HighlightLayer";
import { useCallback, useEffect, useImperativeHandle, useRef, useState } from "react";
import type { DocumentIndex, ViewerCommand } from "@/lib/types";
import { executeCommands, normalizeViewerCommands } from "@/lib/viewer-commands";

export type PdfViewerHandle = {
  receiveCommands: (commands: ViewerCommand[], fallbackPage: number) => void;
};

type Props = {
  documentId: string;
  ref?: React.Ref<PdfViewerHandle>;
};

export function PdfViewer({ documentId, ref }: Props) {
  const [index, setIndex] = useState<DocumentIndex | null>(null);
  const [highlightSpanIds, setHighlightSpanIds] = useState<string[]>([]);
  const pendingCommands = useRef<{ commands: ViewerCommand[]; fallbackPage: number }[]>([]);

  const handlers = {
    scrollToSpan: (spanId: string) => {
      console.info("[P1] scroll_to_span", spanId);
    },
    scrollToPage: (page: number) => {
      console.info("[P1] scroll_to_page", page);
    },
    setHighlights: (spanIds: string[]) => setHighlightSpanIds(spanIds),
    clearHighlights: () => setHighlightSpanIds([]),
  };

  const loadDemoIndex = useCallback(async () => {
    const res = await fetch("/fixtures/sample-document-index.json");
    const data = (await res.json()) as DocumentIndex;
    setIndex(data);
  }, []);

  useEffect(() => {
    if (documentId === "doc_demo") void loadDemoIndex();
  }, [documentId, loadDemoIndex]);

  useImperativeHandle(ref, () => ({
    receiveCommands: (commands, fallbackPage) => {
      if (!index) {
        pendingCommands.current.push({ commands, fallbackPage });
        return;
      }
      executeCommands(normalizeViewerCommands(commands, index, fallbackPage), handlers);
    },
  }));

  useEffect(() => {
    if (!index) return;
    for (const { commands, fallbackPage } of pendingCommands.current.splice(0)) {
      executeCommands(normalizeViewerCommands(commands, index, fallbackPage), handlers);
    }
  }, [index]);

  return (
    <section
      style={{
        background: "var(--panel)",
        borderRadius: 12,
        padding: "1rem",
        minHeight: 480,
      }}
    >
      <header style={{ display: "flex", justifyContent: "space-between" }}>
        <h2 style={{ margin: 0, fontSize: "1.1rem" }}>PDF (P1)</h2>
        <span style={{ color: "var(--muted)", fontSize: "0.85rem" }}>
          {documentId}
        </span>
      </header>
      <p style={{ color: "var(--muted)", fontSize: "0.9rem" }}>
        Wire react-pdf here. Load fixture index until upload flow works.
      </p>
      <button type="button" onClick={loadDemoIndex}>
        Load demo document index
      </button>
      {index && (
        <HighlightLayer index={index} highlightSpanIds={highlightSpanIds} />
      )}
    </section>
  );
}
