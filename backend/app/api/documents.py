"""P2: upload + ingest."""

from __future__ import annotations

import uuid

from fastapi import APIRouter, File, UploadFile
from fastapi.responses import FileResponse

from app.errors import IngestError, NotFoundError
from app.models.schemas import DocumentIndex, DocumentStatus, IngestStatus, UploadResponse
from app.services.pdf_extract import extract_document_index
from app.storage import local

router = APIRouter(prefix="/documents", tags=["documents"])

_DEMO_ID = local.DEMO_DOCUMENT_ID
_MAX_PDF_MAGIC = b"%PDF-"


def _document_status(document_id: str) -> DocumentStatus:
    index = local.load_index(document_id)
    return DocumentStatus(document_id=document_id, status=IngestStatus.ready, index=index)


@router.post("", response_model=UploadResponse)
def upload_document(
    file: UploadFile | None = File(None),
    demo: bool = False,
) -> UploadResponse:
    if demo:
        return UploadResponse(document_id=_DEMO_ID, status=IngestStatus.ready)

    if file is None:
        raise IngestError(400, "Expected a PDF file")

    if file.content_type not in ("application/pdf", "application/octet-stream"):
        raise IngestError(400, "Expected a PDF file")

    from app.config import get_settings

    settings = get_settings()
    max_bytes = settings.max_upload_mb * 1024 * 1024 + 1
    contents = file.file.read(max_bytes)
    if len(contents) >= settings.max_upload_mb * 1024 * 1024 + 1:
        raise IngestError(413, f"PDF exceeds {settings.max_upload_mb} MB limit")

    if not contents.startswith(_MAX_PDF_MAGIC):
        raise IngestError(400, "Expected a PDF file")

    document_id = f"doc_{uuid.uuid4().hex[:12]}"
    local.require_document_id(document_id)

    index = extract_document_index(document_id, contents)
    pdf_path = local.document_pdf_path(document_id)
    try:
        local.save_pdf_bytes(document_id, contents)
        local.save_index(document_id, index)
    except Exception:
        if pdf_path.exists():
            pdf_path.unlink(missing_ok=True)
        raise

    return UploadResponse(document_id=document_id, status=IngestStatus.ready)


@router.get("/{document_id}", response_model=DocumentStatus)
def get_document(document_id: str) -> DocumentStatus:
    local.require_document_id(document_id)
    try:
        return _document_status(document_id)
    except NotFoundError:
        raise NotFoundError("Document not found") from None


@router.get("/{document_id}/index", response_model=DocumentIndex)
def get_document_index(document_id: str) -> DocumentIndex:
    status = get_document(document_id)
    assert status.index is not None
    return status.index


@router.get("/{document_id}/file")
def get_document_file(document_id: str) -> FileResponse:
    """Stream PDF bytes for viewer (uploads in data dir; demo uses golden fallback)."""
    local.require_document_id(document_id)
    if document_id == _DEMO_ID:
        path = local.GOLDEN_PDF_FALLBACK
        if not path.is_file():
            raise NotFoundError(
                "Add shared/fixtures/golden-demo.pdf for doc_demo, or upload a PDF"
            )
        return FileResponse(path, media_type="application/pdf", filename="golden-demo.pdf")

    pdf_path = local.document_pdf_path(document_id)
    if not pdf_path.is_file():
        raise NotFoundError("PDF file not found")
    return FileResponse(pdf_path, media_type="application/pdf", filename=f"{document_id}.pdf")
