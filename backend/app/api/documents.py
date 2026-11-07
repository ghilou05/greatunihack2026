"""P2: upload + ingest."""

import json
import uuid
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.models.schemas import DocumentIndex, DocumentStatus, IngestStatus, UploadResponse
from app.services.pdf_extract import extract_document_index
from app.storage.local import DATA, document_index_path, load_fixture_document_index

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
