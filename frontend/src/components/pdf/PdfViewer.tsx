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

/**
 * TEMPORARY: app/page.tsx still passes the scaffold's `documentId`. Delete this
 * type and the branch below once page.tsx passes `file` and `index`.
 */
type ScaffoldProps = { documentId: string };

export const PdfViewer = forwardRef<
  PdfViewerHandle,
  PdfViewerProps | ScaffoldProps
>(function PdfViewer(props, ref) {
  if ("documentId" in props) {
    return <p>PDF viewer not wired up yet ({props.documentId}).</p>;
  }
  return <PdfViewerClient {...props} viewerRef={ref} />;
});
