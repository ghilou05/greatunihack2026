"""P2: upload + ingest."""

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile
from fastapi.responses import FileResponse

from app.models.schemas import DocumentIndex, DocumentStatus, IngestStatus, UploadResponse
from app.services.pdf_extract import extract_document_index
from app.storage.local import (
    DATA,
    GOLDEN_PDF_FALLBACK,
    document_index_path,
    document_pdf_path,
    load_fixture_document_index,
)

router = APIRouter(prefix="/documents", tags=["documents"])

DEMO_ID = "doc_demo"


@router.post("", response_model=UploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    demo: bool = False,
) -> UploadResponse:
    if demo:
        return UploadResponse(document_id=DEMO_ID, status=IngestStatus.ready)

    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise HTTPException(status_code=400, detail="Expected a PDF file")

    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    DATA.mkdir(parents=True, exist_ok=True)
    pdf_path = DATA / f"{document_id}.pdf"
    contents = await file.read()
    pdf_path.write_bytes(contents)

    try:
        index = extract_document_index(document_id, pdf_path)
        document_index_path(document_id).write_text(index.model_dump_json(indent=2))
    except Exception as exc:
        raise HTTPException(status_code=422, detail=f"Ingest failed: {exc}") from exc

    return UploadResponse(document_id=document_id, status=IngestStatus.ready)


@router.get("/{document_id}", response_model=DocumentStatus)
def get_document(document_id: str) -> DocumentStatus:
    if document_id == DEMO_ID:
        return DocumentStatus(
            document_id=DEMO_ID,
            status=IngestStatus.ready,
            index=load_fixture_document_index(),
        )

    index_path = document_index_path(document_id)
    if not index_path.exists():
        raise HTTPException(status_code=404, detail="Document not found")

    index = DocumentIndex.model_validate(json.loads(index_path.read_text()))
    return DocumentStatus(document_id=document_id, status=IngestStatus.ready, index=index)


@router.get("/{document_id}/index", response_model=DocumentIndex)
def get_document_index(document_id: str) -> DocumentIndex:
    status = get_document(document_id)
    if status.index is None:
        raise HTTPException(status_code=404, detail="Index not ready")
    return status.index


@router.get("/{document_id}/file")
def get_document_file(document_id: str) -> FileResponse:
    """Stream PDF bytes for viewer (uploads in backend/data; demo uses golden fallback)."""
    if document_id == DEMO_ID:
        if GOLDEN_PDF_FALLBACK.is_file():
            return FileResponse(
                GOLDEN_PDF_FALLBACK,
                media_type="application/pdf",
                filename="golden-demo.pdf",
            )
        raise HTTPException(
            status_code=404,
            detail="Add shared/fixtures/golden-demo.pdf for doc_demo, or upload a PDF",
        )

    path = document_pdf_path(document_id)
    if not path.is_file():
        raise HTTPException(status_code=404, detail="PDF file not found")
    return FileResponse(path, media_type="application/pdf", filename=f"{document_id}.pdf")
