"""P2: PyMuPDF extraction → DocumentIndex."""

from pathlib import Path

import pymupdf as fitz

from app.models.schemas import BBox, DocumentIndex, PageMeta, Span


def extract_document_index(document_id: str, pdf_path: Path) -> DocumentIndex:
    doc = fitz.open(pdf_path)
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

    doc.close()
    return DocumentIndex(document_id=document_id, pages=pages, spans=spans)


if __name__ == "__main__":
    import sys

    if len(sys.argv) < 2:
        raise SystemExit("Usage: python -m app.services.pdf_extract <path-to.pdf>")
    path = Path(sys.argv[1])
    index = extract_document_index("cli", path)
    print(f"pages={len(index.pages)} line_units={len(index.spans)}")
