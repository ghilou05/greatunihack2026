import type { DocumentIndex, Span, ViewerCommand } from "@/lib/types";

export type ViewerHandlers = {
  scrollToSpan: (spanId: string) => void;
  scrollToPage: (page: number) => void;
  setHighlights: (spanIds: string[]) => void;
  clearHighlights: () => void;
};

/** P1: Apply commands from P3 (and Q&A responses) to the PDF viewer. */
export function executeCommands(
  commands: ViewerCommand[],
  handlers: ViewerHandlers
): void {
  for (const cmd of commands) {
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
      default:
        break;
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

/** Unknown span_id → scroll_to_page for that unit's page (or first segment page). */
export function normalizeViewerCommands(
  commands: ViewerCommand[],
  index: DocumentIndex | null
): ViewerCommand[] {
  if (!index) return commands;
  const out: ViewerCommand[] = [];
  for (const cmd of commands) {
    if (cmd.type === "scroll_to_span") {
      const unit = lookupSpan(index, cmd.span_id);
      if (unit) {
        out.push(cmd);
      } else {
        out.push({ type: "scroll_to_page", page: 1 });
      }
      continue;
    }
    if (cmd.type === "set_highlights") {
      const valid = cmd.span_ids.filter((id) => lookupSpan(index, id));
      if (valid.length) out.push({ type: "set_highlights", span_ids: valid });
      continue;
    }
    out.push(cmd);
  }
  return out;
}
