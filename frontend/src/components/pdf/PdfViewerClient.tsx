"use client";

import {
  memo,
  useCallback,
  useEffect,
  useImperativeHandle,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/TextLayer.css";

import type { DocumentIndex, Span } from "@/lib/types";
import type { ViewerHandlers } from "@/lib/viewer-commands";
import { HighlightLayer } from "./HighlightLayer";
import styles from "./PdfViewer.module.css";

pdfjs.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

const PAGE_WIDTH_TOLERANCE_PT = 1;
const RESIZE_DEBOUNCE_MS = 100;
/** A scrolled-to span sits this far down the visible area. */
const SPAN_SCROLL_FRACTION = 1 / 3;
const NO_SPANS: Span[] = [];

export type PdfViewerHandle = ViewerHandlers & {
  hasSpan: (spanId: string) => boolean;
};

export type PdfViewerProps = {
  /** URL of the PDF. */
  file: string;
  index: DocumentIndex;
  /** Called with the 1-based page that fills most of the visible area. */
  onPageChange?: (page: number) => void;
  /** Debug: outline every span in the index to check bbox alignment. */
  showAllSpans?: boolean;
};

type Props = PdfViewerProps & { viewerRef?: Ref<PdfViewerHandle> };

/** Memoised so highlight changes don't re-render the canvas or text layer. */
const PageSurface = memo(function PageSurface({
  pageNumber,
  width,
  onLoaded,
}: {
  pageNumber: number;
  width: number;
  onLoaded: (page: { pageNumber: number; originalWidth: number }) => void;
}) {
  return (
    <Page
      pageNumber={pageNumber}
      width={width}
      renderAnnotationLayer={false}
      loading={null}
      onLoadSuccess={onLoaded}
    />
  );
});

function groupByPage(spans: Span[]): Map<number, Span[]> {
  const byPage = new Map<number, Span[]>();
  for (const span of spans) {
    const group = byPage.get(span.page);
    if (group) group.push(span);
    else byPage.set(span.page, [span]);
  }
  return byPage;
}

export default function PdfViewerClient({
  file,
  index,
  onPageChange,
  showAllSpans = false,
  viewerRef,
}: Props) {
  const [numPages, setNumPages] = useState<number | null>(null);
  const [width, setWidth] = useState(0);
  const [highlightIds, setHighlightIds] = useState<string[]>([]);

  const containerRef = useRef<HTMLDivElement>(null);
  const pageEls = useRef(new Map<number, HTMLDivElement>());
  const warnedPages = useRef(new Set<number>());
  const lastReportedPage = useRef<number | null>(null);
  const scrollFrame = useRef<number | null>(null);
  /** A scroll requested before the pages exist; only the latest one matters. */
  const pendingScroll = useRef<(() => void) | null>(null);

  const spansById = useMemo(
    () => new Map(index.spans.map((span) => [span.span_id, span])),
    [index]
  );
  const pagesByNumber = useMemo(
    () => new Map(index.pages.map((page) => [page.page, page])),
    [index]
  );
  const spansByPage = useMemo(() => groupByPage(index.spans), [index]);
  const highlightsByPage = useMemo(
    () =>
      groupByPage(
        highlightIds.flatMap((id) => spansById.get(id) ?? [])
      ),
    [highlightIds, spansById]
  );

  // Lets the handle stay stable and lets queued scrolls read current layout.
  const latest = useRef({ spansById, pagesByNumber, width, numPages, onPageChange });
  useLayoutEffect(() => {
    latest.current = { spansById, pagesByNumber, width, numPages, onPageChange };
  });

  // Highlight ids like p1_l0 exist in every document, so never carry them over.
  useEffect(() => {
    setNumPages(null);
    setHighlightIds([]);
    pendingScroll.current = null;
    warnedPages.current.clear();
    lastReportedPage.current = null;
  }, [file, index.document_id]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let measured = false;
    const observer = new ResizeObserver(([entry]) => {
      const next = Math.floor(entry.contentRect.width);
      if (next <= 0) return; // Hidden: keep the last good layout.
      clearTimeout(timer);
      if (measured) {
        timer = setTimeout(() => setWidth(next), RESIZE_DEBOUNCE_MS);
      } else {
        measured = true;
        setWidth(next);
      }
    });
    observer.observe(container);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, []);

  // Everything scales with width, so scaling scrollTop keeps the reader's place.
  const previousWidth = useRef(0);
  useLayoutEffect(() => {
    const container = containerRef.current;
    if (container && previousWidth.current > 0 && width > 0) {
      container.scrollTop *= width / previousWidth.current;
    }
    previousWidth.current = width;
  }, [width]);

  const reportVisiblePage = useCallback(() => {
    const container = containerRef.current;
    const { numPages: pageCount, onPageChange: notify } = latest.current;
    if (!container || !pageCount) return;
    const view = container.getBoundingClientRect();
    let visiblePage: number | null = null;
    let largestOverlap = 0;
    for (let page = 1; page <= pageCount; page++) {
      const rect = pageEls.current.get(page)?.getBoundingClientRect();
      if (!rect) continue;
      const overlap =
        Math.min(view.bottom, rect.bottom) - Math.max(view.top, rect.top);
      if (overlap > largestOverlap) {
        largestOverlap = overlap;
        visiblePage = page;
      }
    }
    if (visiblePage !== null && visiblePage !== lastReportedPage.current) {
      lastReportedPage.current = visiblePage;
      notify?.(visiblePage);
    }
  }, []);

  const handleScroll = useCallback(() => {
    if (scrollFrame.current !== null) return;
    scrollFrame.current = requestAnimationFrame(() => {
      scrollFrame.current = null;
      reportVisiblePage();
    });
  }, [reportVisiblePage]);

  useEffect(
    () => () => {
      if (scrollFrame.current !== null) {
        cancelAnimationFrame(scrollFrame.current);
        scrollFrame.current = null;
      }
    },
    []
  );

  // Pages have just been laid out: run any queued scroll and report the page.
  useEffect(() => {
    if (!numPages || width <= 0) return;
    const scroll = pendingScroll.current;
    pendingScroll.current = null;
    scroll?.();
    reportVisiblePage();
  }, [numPages, width, reportVisiblePage]);

  const handle = useMemo<PdfViewerHandle>(() => {
    /** Commands can arrive before the PDF has loaded, so queue them until it has. */
    const whenLaidOut = (scroll: () => void) => {
      const { numPages: pageCount, width: currentWidth } = latest.current;
      if (pageCount && currentWidth > 0) scroll();
      else pendingScroll.current = scroll;
    };
    /** Distance from the top of the scrollable content to the top of a page. */
    const pageOffset = (container: HTMLElement, pageEl: HTMLElement) =>
      pageEl.getBoundingClientRect().top -
      container.getBoundingClientRect().top +
      container.scrollTop;

    return {
      scrollToPage: (page) =>
        whenLaidOut(() => {
          const container = containerRef.current;
          const pageEl = pageEls.current.get(page);
          if (!container || !pageEl) {
            console.warn(`[PdfViewer] scrollToPage: no page ${page}`);
            return;
          }
          container.scrollTo({
            top: pageOffset(container, pageEl),
            behavior: "smooth",
          });
        }),
      scrollToSpan: (spanId) =>
        whenLaidOut(() => {
          const container = containerRef.current;
          const span = latest.current.spansById.get(spanId);
          const pageEl = span && pageEls.current.get(span.page);
          const pageMeta = span && latest.current.pagesByNumber.get(span.page);
          if (!container || !span || !pageEl || !pageMeta) {
            console.warn(`[PdfViewer] scrollToSpan: cannot locate ${spanId}`);
            return;
          }
          const scale = latest.current.width / pageMeta.width;
          container.scrollTo({
            top:
              pageOffset(container, pageEl) +
              span.bbox.y0 * scale -
              container.clientHeight * SPAN_SCROLL_FRACTION,
            behavior: "smooth",
          });
        }),
      setHighlights: (spanIds) =>
        setHighlightIds(
          spanIds.filter((id) => latest.current.spansById.has(id))
        ),
      clearHighlights: () => setHighlightIds([]),
      hasSpan: (spanId) => latest.current.spansById.has(spanId),
    };
  }, []);

  useImperativeHandle(viewerRef, () => handle, [handle]);

  const handlePageLoaded = useCallback(
    ({
      pageNumber,
      originalWidth,
    }: {
      pageNumber: number;
      originalWidth: number;
    }) => {
      if (warnedPages.current.has(pageNumber)) return;
      const indexWidth = latest.current.pagesByNumber.get(pageNumber)?.width;
      if (indexWidth === undefined) {
        warnedPages.current.add(pageNumber);
        console.warn(
          `[PdfViewer] Page ${pageNumber} is not in the document index, so it has no highlights.`
        );
      } else if (Math.abs(originalWidth - indexWidth) > PAGE_WIDTH_TOLERANCE_PT) {
        warnedPages.current.add(pageNumber);
        console.warn(
          `[PdfViewer] Page ${pageNumber} width mismatch: pdf.js ${originalWidth}pt, index ${indexWidth}pt. Highlights will be misaligned.`
        );
      }
    },
    []
  );

  return (
    <div
      ref={containerRef}
      className={styles.container}
      onScroll={handleScroll}
    >
      <Document
        file={file}
        className={styles.document}
        onLoadSuccess={(pdf) => setNumPages(pdf.numPages)}
        onLoadError={(error) =>
          console.error(`[PdfViewer] Failed to load ${file}:`, error)
        }
      >
        {numPages !== null &&
          width > 0 &&
          Array.from({ length: numPages }, (_, i) => i + 1).map((pageNumber) => {
            const pageMeta = pagesByNumber.get(pageNumber);
            const scale = pageMeta ? width / pageMeta.width : null;
            return (
              <div
                key={pageNumber}
                ref={(el) => {
                  if (el) pageEls.current.set(pageNumber, el);
                  else pageEls.current.delete(pageNumber);
                }}
                className={styles.page}
                style={{
                  width,
                  // Reserve the height up front so scroll targets are right
                  // even while earlier pages are still rendering.
                  minHeight:
                    pageMeta && scale !== null
                      ? pageMeta.height * scale
                      : undefined,
                }}
              >
                <PageSurface
                  pageNumber={pageNumber}
                  width={width}
                  onLoaded={handlePageLoaded}
                />
                {scale !== null && (
                  <HighlightLayer
                    scale={scale}
                    highlights={highlightsByPage.get(pageNumber) ?? NO_SPANS}
                    outlines={
                      showAllSpans
                        ? (spansByPage.get(pageNumber) ?? NO_SPANS)
                        : NO_SPANS
                    }
                  />
                )}
              </div>
            );
          })}
      </Document>
    </div>
  );
}
