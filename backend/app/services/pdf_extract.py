"""P2: PyMuPDF extraction → DocumentIndex."""

from __future__ import annotations

import logging
from pathlib import Path
from typing import Union

import pymupdf as fitz

from app.config import get_settings
from app.errors import IngestError
from app.models.schemas import BBox, DocumentIndex, PageMeta, Span

logger = logging.getLogger("lesson.ingest")

PdfSource = Union[Path, bytes]


def _open_pdf(source: PdfSource) -> fitz.Document:
    try:
        if isinstance(source, bytes):
            return fitz.open(stream=source, filetype="pdf")
        return fitz.open(source)
    except Exception as exc:
        raise IngestError(422, "Could not read PDF") from exc


def _extract_lines(doc: fitz.Document, document_id: str) -> DocumentIndex:
    """Core extraction loop — id/line semantics frozen for fixture compatibility."""
    pages: list[PageMeta] = []
    spans: list[Span] = []

    for page_idx in range(len(doc)):
        page = doc[page_idx]
        page_number = page_idx + 1
        rect = page.rect
        pages.append(
            PageMeta(page=page_number, width=float(rect.width), height=float(rect.height))
        )
        blocks = page.get_text("dict").get("blocks", [])
        line_idx = 0
        for block in blocks:
            if block.get("type") != 0:
                continue
            for line in block.get("lines", []):
                parts: list[str] = []
                x0 = y0 = x1 = y1 = None
                for span in line.get("spans", []):
                    text = (span.get("text") or "").strip()
                    if not text:
                        continue
                    parts.append(text)
                    sx0, sy0, sx1, sy1 = span["bbox"]
                    if x0 is None:
                        x0, y0, x1, y1 = sx0, sy0, sx1, sy1
                    else:
                        x0 = min(x0, sx0)
                        y0 = min(y0, sy0)
                        x1 = max(x1, sx1)
                        y1 = max(y1, sy1)
                if not parts or x0 is None:
                    continue
                spans.append(
                    Span(
                        span_id=f"p{page_number}_l{line_idx}",
                        unit_kind="line",
                        page=page_number,
                        text=" ".join(parts),
                        bbox=BBox(x0=x0, y0=y0, x1=x1, y1=y1),
                    )
                )
                line_idx += 1

    return DocumentIndex(document_id=document_id, pages=pages, spans=spans)


def extract_document_index(document_id: str, source: PdfSource) -> DocumentIndex:
    settings = get_settings()
    doc = _open_pdf(source)
    try:
        if doc.needs_pass:
            raise IngestError(422, "PDF is password-protected")
        n_pages = doc.page_count
        if n_pages > settings.max_pages:
            raise IngestError(
                422, f"PDF has {n_pages} pages; the limit is {settings.max_pages}"
            )

        index = _extract_lines(doc, document_id)

        lines_per_page: dict[int, int] = {}
        for span in index.spans:
            lines_per_page[span.page] = lines_per_page.get(span.page, 0) + 1
        empty_pages = [p.page for p in index.pages if lines_per_page.get(p.page, 0) == 0]
        total_chars = sum(len(s.text) for s in index.spans)
        n_lines = len(index.spans)

        if total_chars == 0 or (n_pages and empty_pages and len(empty_pages) / n_pages > 0.5):
            raise IngestError(
                422,
                "This PDF has no selectable text (scanned?). Upload a text-based PDF — OCR isn't supported yet.",
            )
        if total_chars < settings.min_total_chars or n_lines < settings.min_lines:
            raise IngestError(422, "Not enough text to build a lesson")
        if total_chars > settings.max_total_chars:
            raise IngestError(
                422,
                "PDF has too much text for an MVP lesson (limit 80,000 characters)",
            )

        if empty_pages and len(empty_pages) / n_pages <= 0.5:
            logger.info(
                "ingest partial empty pages document_id=%s empty_pages=%s",
                document_id,
                empty_pages,
            )

        logger.info(
            "ingest complete document_id=%s pages=%s line_units=%s chars=%s empty_pages=%s",
            document_id,
            n_pages,
            n_lines,
            total_chars,
            empty_pages,
        )
        return index
    finally:
        doc.close()


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        raise SystemExit("Usage: python -m app.services.pdf_extract <path-to.pdf>")
    path = Path(sys.argv[1])
    index = extract_document_index("cli", path)
    print(f"pages={len(index.pages)} line_units={len(index.spans)}")
