"use client";

/**
 * Public entry point for the PDF viewer. pdf.js touches browser globals on
 * import, so the implementation is only ever loaded on the client.
 *
 * The ref is null until that chunk has loaded. The parent must give the viewer
 * a definite height, because it scrolls inside its own container.
 */
import dynamic from "next/dynamic";
import { forwardRef } from "react";
import type { PdfViewerHandle, PdfViewerProps } from "./PdfViewerClient";

export type { PdfViewerHandle, PdfViewerProps };

const PdfViewerClient = dynamic(() => import("./PdfViewerClient"), {
  ssr: false,
  loading: () => <p>Loading viewer…</p>,
});

export const PdfViewer = forwardRef<PdfViewerHandle, PdfViewerProps>(
  function PdfViewer(props, ref) {
    return <PdfViewerClient {...props} viewerRef={ref} />;
  }
);
