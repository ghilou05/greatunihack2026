"use client";

import { useEffect, useRef, useState } from "react";
import { PdfViewer, type PdfViewerHandle } from "@/components/pdf/PdfViewer";
import type { DocumentIndex } from "@/lib/types";

const PDF_URL = "/documents/golden-demo.pdf";
const INDEX_URL = "/fixtures/sample-document-index.json";
const UNKNOWN_SPAN_ID = "does_not_exist";

export default function DevViewerPage() {
  const viewer = useRef<PdfViewerHandle>(null);
  const [index, setIndex] = useState<DocumentIndex | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [visiblePage, setVisiblePage] = useState<number | null>(null);
  const [showAllSpans, setShowAllSpans] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch(INDEX_URL)
      .then((res) => {
        if (!res.ok) throw new Error(`${INDEX_URL}: HTTP ${res.status}`);
        return res.json() as Promise<DocumentIndex>;
      })
      .then((data) => {
        if (!cancelled) setIndex(data);
      })
      .catch((error: Error) => {
        if (!cancelled) setLoadError(error.message);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  if (loadError) return <p>Failed to load index: {loadError}</p>;
  if (!index) return <p>Loading index…</p>;

  // Page 2 has content above it, so the "third from the top" position is visible.
  const scrollTarget =
    index.spans.find((span) => span.page === 2) ?? index.spans[0];
  const highlightTargets = index.spans.slice(0, 3).map((s) => s.span_id);

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100vh" }}>
      <div
        style={{
          display: "flex",
          flexWrap: "wrap",
          alignItems: "center",
          gap: "0.5rem",
          padding: "0.5rem",
        }}
      >
        <button type="button" onClick={() => viewer.current?.scrollToPage(2)}>
          Scroll to page 2
        </button>
        <button
          type="button"
          onClick={() => viewer.current?.scrollToSpan(scrollTarget.span_id)}
        >
          Scroll to span {scrollTarget.span_id}
        </button>
        <button
          type="button"
          // The unknown id should be ignored, leaving exactly 3 highlights.
          onClick={() =>
            viewer.current?.setHighlights([...highlightTargets, UNKNOWN_SPAN_ID])
          }
        >
          Highlight 3 spans
        </button>
        <button type="button" onClick={() => viewer.current?.clearHighlights()}>
          Clear
        </button>
        <label>
          <input
            type="checkbox"
            checked={showAllSpans}
            onChange={(event) => setShowAllSpans(event.target.checked)}
          />{" "}
          showAllSpans
        </label>
        <output>Visible page: {visiblePage ?? "–"}</output>
      </div>
      <div style={{ flex: 1, minHeight: 0 }}>
        <PdfViewer
          ref={viewer}
          file={PDF_URL}
          index={index}
          onPageChange={setVisiblePage}
          showAllSpans={showAllSpans}
        />
      </div>
    </div>
  );
}
