"use client";

/**
 * P1: PDF.js / react-pdf viewer, scroll, execute ViewerCommand handlers.
 */
import { HighlightLayer } from "@/components/pdf/HighlightLayer";
import { useCallback, useState } from "react";
import type { DocumentIndex } from "@/lib/types";

type Props = {
  documentId: string;
};

export function PdfViewer({ documentId }: Props) {
  const [index, setIndex] = useState<DocumentIndex | null>(null);
  const [highlightSpanIds, setHighlightSpanIds] = useState<string[]>([]);

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
