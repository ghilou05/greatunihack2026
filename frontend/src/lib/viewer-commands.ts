import type { DocumentIndex, Span, ViewerCommand } from "@/lib/types";

export type ViewerHandlers = {
  scrollToSpan: (spanId: string) => void;
  scrollToPage: (page: number) => void;
  setHighlights: (spanIds: string[]) => void;
  clearHighlights: () => void;
};

export function runViewerCommands(
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

export function segmentOnEnterCommands(
  onEnter: { scroll_to_span: string; highlights: string[] }
): ViewerCommand[] {
  return [
    { type: "scroll_to_span", span_id: onEnter.scroll_to_span },
    { type: "set_highlights", span_ids: onEnter.highlights },
  ];
}

export function lookupSpan(index: DocumentIndex, spanId: string): Span | undefined {
  return index.spans.find((s) => s.span_id === spanId);
}
