"use client";

import { memo, type CSSProperties } from "react";
import type { Span } from "@/lib/types";
import styles from "./PdfViewer.module.css";

type Props = {
  /** renderedPageWidth / index page width. */
  scale: number;
  highlights: Span[];
  outlines: Span[];
};

/**
 * Span bboxes are PyMuPDF points: top-left origin, already the right way up.
 * They only need scaling. pdf.js convertToViewportRectangle would flip the y-axis.
 */
function bboxStyle({ bbox }: Span, scale: number): CSSProperties {
  return {
    left: bbox.x0 * scale,
    top: bbox.y0 * scale,
    width: (bbox.x1 - bbox.x0) * scale,
    height: (bbox.y1 - bbox.y0) * scale,
  };
}

/** Overlay for one page. Fills the page and never intercepts text selection. */
export const HighlightLayer = memo(function HighlightLayer({
  scale,
  highlights,
  outlines,
}: Props) {
  return (
    <div className={styles.overlay}>
      {outlines.map((span) => (
        <div
          key={span.span_id}
          className={styles.spanOutline}
          style={bboxStyle(span, scale)}
          title={span.span_id}
        />
      ))}
      {highlights.map((span) => (
        <div
          key={span.span_id}
          className={styles.highlight}
          style={bboxStyle(span, scale)}
          data-span-id={span.span_id}
        />
      ))}
    </div>
  );
});
