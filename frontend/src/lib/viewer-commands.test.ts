import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ViewerCommand } from "@/lib/types";
import {
  executeCommands,
  normalizeViewerCommands,
  onEnterToCommands,
} from "./viewer-commands";

const FALLBACK_PAGE = 4;

function makeHandlers(knownSpans: string[] = ["p1_l0", "p1_l1"]) {
  const calls: unknown[][] = [];
  return {
    calls,
    hasSpan: (id: string) => knownSpans.includes(id),
    scrollToSpan: vi.fn((id: string) => void calls.push(["scrollToSpan", id])),
    scrollToPage: vi.fn((page: number) => void calls.push(["scrollToPage", page])),
    setHighlights: vi.fn((ids: string[]) => void calls.push(["setHighlights", ids])),
    clearHighlights: vi.fn(() => void calls.push(["clearHighlights"])),
  };
}

/** Run commands through `executeCommands` and return the handler calls in order. */
function run(commands: ViewerCommand[]) {
  const handlers = makeHandlers();
  executeCommands(commands, handlers, FALLBACK_PAGE);
  return handlers.calls;
}

let warn: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warn = vi.spyOn(console, "warn").mockImplementation(() => {});
});

afterEach(() => {
  warn.mockRestore();
});

describe("onEnterToCommands", () => {
  it("returns scroll_to_span, then set_highlights", () => {
    expect(
      onEnterToCommands({ scroll_to_span: "p1_l0", highlights: ["p1_l0", "p1_l1"] })
    ).toEqual([
      { type: "scroll_to_span", span_id: "p1_l0" },
      { type: "set_highlights", span_ids: ["p1_l0", "p1_l1"] },
    ]);
  });
});

describe("executeCommands", () => {
  it("applies a normal on_enter in order", () => {
    const commands = onEnterToCommands({
      scroll_to_span: "p1_l0",
      highlights: ["p1_l0", "p1_l1"],
    });

    expect(run(commands)).toEqual([
      ["scrollToSpan", "p1_l0"],
      ["setHighlights", ["p1_l0", "p1_l1"]],
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("scrolls to the fallback page for an unknown scroll span", () => {
    expect(run([{ type: "scroll_to_span", span_id: "nope" }])).toEqual([
      ["scrollToPage", FALLBACK_PAGE],
    ]);
    expect(warn).toHaveBeenCalled();
  });

  it("keeps only the known ids of partially unknown highlights", () => {
    expect(
      run([{ type: "set_highlights", span_ids: ["p1_l0", "nope", "p1_l1"] }])
    ).toEqual([["setHighlights", ["p1_l0", "p1_l1"]]]);
    expect(warn).toHaveBeenCalled();
  });

  it("does not fuzzy match span ids", () => {
    expect(run([{ type: "set_highlights", span_ids: ["P1_L0", "p1_l", "p1_l0 "] }])).toEqual([
      ["setHighlights", []],
      ["scrollToPage", FALLBACK_PAGE],
    ]);
  });

  it("scrolls to the fallback page exactly once when every span is unknown", () => {
    const commands = onEnterToCommands({ scroll_to_span: "nope", highlights: ["nope"] });

    expect(run(commands)).toEqual([
      ["scrollToPage", FALLBACK_PAGE],
      ["setHighlights", []],
    ]);
  });

  it("does nothing for an empty command list", () => {
    expect(run([])).toEqual([]);
    expect(warn).not.toHaveBeenCalled();
  });

  it("applies clear_highlights without adding a scroll", () => {
    expect(run([{ type: "clear_highlights" }])).toEqual([["clearHighlights"]]);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ["null", null],
    ["a string", "scroll"],
    ["undefined", undefined],
  ])("warns instead of throwing when commands is %s", (_label, bad) => {
    expect(run(bad as unknown as ViewerCommand[])).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });

  it("drops malformed commands and still applies the valid ones", () => {
    const commands = [
      null,
      { type: "explode" },
      { type: "clear_highlights" },
    ] as unknown as ViewerCommand[];

    expect(run(commands)).toEqual([["clearHighlights"]]);
    expect(warn).toHaveBeenCalledTimes(2);
  });

  it("uses the fallbacks when command fields are malformed", () => {
    const commands = [
      { type: "scroll_to_span" },
      { type: "scroll_to_page", page: 0 },
      { type: "set_highlights", span_ids: "p1_l0" },
    ] as unknown as ViewerCommand[];

    expect(run(commands)).toEqual([
      ["scrollToPage", FALLBACK_PAGE],
      ["scrollToPage", FALLBACK_PAGE],
      ["setHighlights", []],
    ]);
  });

  it("keeps going when a handler throws", () => {
    const handlers = makeHandlers();
    handlers.scrollToSpan.mockImplementation(() => {
      throw new Error("viewer not ready");
    });

    expect(() =>
      executeCommands(
        onEnterToCommands({ scroll_to_span: "p1_l0", highlights: ["p1_l0"] }),
        handlers,
        FALLBACK_PAGE
      )
    ).not.toThrow();
    expect(handlers.setHighlights).toHaveBeenCalledWith(["p1_l0"]);
    expect(warn).toHaveBeenCalled();
  });

  it("warns instead of throwing when hasSpan throws", () => {
    const handlers = {
      ...makeHandlers(),
      hasSpan: () => {
        throw new Error("index not loaded");
      },
    };

    expect(() =>
      executeCommands([{ type: "scroll_to_span", span_id: "p1_l0" }], handlers, FALLBACK_PAGE)
    ).not.toThrow();
    expect(handlers.calls).toEqual([]);
    expect(warn).toHaveBeenCalled();
  });
});

describe("normalizeViewerCommands", () => {
  const normalize = (commands: ViewerCommand[]) =>
    normalizeViewerCommands(commands, makeHandlers(), FALLBACK_PAGE);

  it("adds a fallback scroll when highlights end up empty and nothing scrolled", () => {
    expect(normalize([{ type: "set_highlights", span_ids: ["nope"] }])).toEqual([
      { type: "set_highlights", span_ids: [] },
      { type: "scroll_to_page", page: FALLBACK_PAGE },
    ]);
  });

  it("adds no fallback scroll when empty highlights come before a real scroll", () => {
    expect(
      normalize([
        { type: "set_highlights", span_ids: ["nope"] },
        { type: "scroll_to_span", span_id: "p1_l0" },
      ])
    ).toEqual([
      { type: "set_highlights", span_ids: [] },
      { type: "scroll_to_span", span_id: "p1_l0" },
    ]);
  });

  it("adds no fallback scroll when an explicit scroll_to_page is present", () => {
    expect(
      normalize([
        { type: "scroll_to_page", page: 2 },
        { type: "set_highlights", span_ids: ["nope"] },
      ])
    ).toEqual([
      { type: "scroll_to_page", page: 2 },
      { type: "set_highlights", span_ids: [] },
    ]);
  });

  it("does not mutate its input", () => {
    const commands: ViewerCommand[] = [{ type: "set_highlights", span_ids: ["p1_l0", "nope"] }];

    normalize(commands);

    expect(commands).toEqual([{ type: "set_highlights", span_ids: ["p1_l0", "nope"] }]);
  });
});
