"use client";

/**
 * P1: Draw bbox overlays from DocumentIndex (PyMuPDF coords → viewport scale).
 */
import { lookupSpan } from "@/lib/viewer-commands";
import type { DocumentIndex } from "@/lib/types";

type Props = {
  index: DocumentIndex;
  highlightSpanIds: string[];
};

export function HighlightLayer({ index, highlightSpanIds }: Props) {
  return (
    <ul style={{ listStyle: "none", padding: 0, marginTop: "1rem" }}>
      {highlightSpanIds.map((id) => {
        const span = lookupSpan(index, id);
        if (!span) return null;
        return (
          <li
            key={id}
            style={{
              background: "var(--highlight)",
              borderRadius: 6,
              padding: "0.5rem",
              marginBottom: "0.5rem",
              fontSize: "0.85rem",
            }}
          >
            <strong>{id}</strong> p{span.page}: {span.text.slice(0, 120)}…
          </li>
        );
      })}
    </ul>
  );
}
