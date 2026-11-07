import type { DocumentIndex, Span, ViewerCommand } from "@/lib/types";

export type ViewerHandlers = {
  scrollToSpan: (spanId: string) => void;
  scrollToPage: (page: number) => void;
  setHighlights: (spanIds: string[]) => void;
  clearHighlights: () => void;
};

/** Span lookup that normalization needs; `PdfViewer` provides it alongside `ViewerHandlers`. */
export type SpanLookup = {
  hasSpan: (spanId: string) => boolean;
};

/**
 * P1: Apply commands from P3 (and Q&A responses) to the PDF viewer.
 * Pass `segment.page` as `fallbackPage`. Never throws: problems are logged as warnings.
 */
export function executeCommands(
  commands: ViewerCommand[],
  handlers: ViewerHandlers & SpanLookup,
  fallbackPage: number
): void {
  let normalized: ViewerCommand[];
  try {
    normalized = normalizeViewerCommands(commands, handlers, fallbackPage);
  } catch (err) {
    console.warn("[viewer-commands] could not normalize commands", err);
    return;
  }

  for (const cmd of normalized) {
    try {
      switch (cmd.type) {
        case "scroll_to_span":
          handlers.scrollToSpan(cmd.span_id);
          break;
        case "scroll_to_page":
          handlers.scrollToPage(cmd.page);
          break;
        case "set_highlights":
          handlers.setHighlights(cmd.span_ids);
          break;
        case "clear_highlights":
          handlers.clearHighlights();
          break;
      }
    } catch (err) {
      console.warn(`[viewer-commands] handler failed for ${cmd.type}`, err);
    }
  }
}

/** P3: Convert lesson segment `on_enter` → commands before calling `executeCommands`. */
export function onEnterToCommands(
  onEnter: { scroll_to_span: string; highlights: string[] }
): ViewerCommand[] {
  return [
    { type: "scroll_to_span", span_id: onEnter.scroll_to_span },
    { type: "set_highlights", span_ids: onEnter.highlights },
  ];
}

/** @deprecated Use onEnterToCommands */
export const segmentOnEnterCommands = onEnterToCommands;

/** @deprecated Use executeCommands */
export const runViewerCommands = executeCommands;

export function lookupSpan(index: DocumentIndex, spanId: string): Span | undefined {
  return index.spans.find((s) => s.span_id === spanId);
}

/**
 * Drop span ids the viewer doesn't know (exact match only) and malformed commands.
 * - Unknown `scroll_to_span` → `scroll_to_page(fallbackPage)`.
 * - `set_highlights` stays even when empty, so stale highlights are still replaced.
 * - Empty `set_highlights` with no scroll anywhere in the list → append `scroll_to_page(fallbackPage)`.
 */
export function normalizeViewerCommands(
  commands: ViewerCommand[],
  handlers: SpanLookup,
  fallbackPage: number
): ViewerCommand[] {
  if (!Array.isArray(commands)) {
    console.warn("[viewer-commands] expected a command list, got", commands);
    return [];
  }

  const isKnownSpan = (id: unknown): id is string =>
    typeof id === "string" && handlers.hasSpan(id);

  const out: ViewerCommand[] = [];
  let scrolled = false;
  let highlightsEmptied = false;

  for (const cmd of commands) {
    switch (cmd?.type) {
      case "scroll_to_span":
        scrolled = true;
        if (isKnownSpan(cmd.span_id)) {
          out.push(cmd);
        } else {
          console.warn(`[viewer-commands] unknown scroll span: ${cmd.span_id}`);
          out.push({ type: "scroll_to_page", page: fallbackPage });
        }
        break;
      case "scroll_to_page":
        scrolled = true;
        if (Number.isInteger(cmd.page) && cmd.page >= 1) {
          out.push(cmd);
        } else {
          console.warn(`[viewer-commands] invalid page: ${cmd.page}`);
          out.push({ type: "scroll_to_page", page: fallbackPage });
        }
        break;
      case "set_highlights": {
        const requested: unknown[] = Array.isArray(cmd.span_ids) ? cmd.span_ids : [];
        const known = requested.filter(isKnownSpan);
        if (known.length !== requested.length || !Array.isArray(cmd.span_ids)) {
          console.warn("[viewer-commands] dropped unknown highlight spans", cmd.span_ids);
        }
        if (known.length === 0) highlightsEmptied = true;
        out.push({ type: "set_highlights", span_ids: known });
        break;
      }
      case "clear_highlights":
        out.push(cmd);
        break;
      default:
        console.warn("[viewer-commands] dropped malformed command", cmd);
    }
  }

  if (highlightsEmptied && !scrolled) {
    out.push({ type: "scroll_to_page", page: fallbackPage });
  }
  return out;
}
