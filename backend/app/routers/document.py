import uuid
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.interview import Interview
from app.utils.auth import get_current_user, get_current_user_query
from app.services.document_service import generate_document
from app.config import get_settings

router = APIRouter(prefix="/api/interview", tags=["document"])


@router.post("/{interview_id}/document/{fmt}")
async def create_document(
    interview_id: uuid.UUID,
    fmt: str,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    if fmt not in ("md", "html", "pdf", "docx"):
        raise HTTPException(status_code=400, detail="Format must be md, html, pdf, or docx")

    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")

    settings = get_settings()
    filepath = await generate_document(db, interview_id, fmt, settings.document_storage_path)

    return {"code": 0, "data": {"filepath": filepath, "format": fmt}, "message": "ok"}


@router.get("/{interview_id}/document/{fmt}")
async def download_document(
    interview_id: uuid.UUID,
    fmt: str,
    current_user: User = Depends(get_current_user_query),
    db: AsyncSession = Depends(get_db),
):
    if fmt not in ("md", "html", "pdf", "docx"):
        raise HTTPException(status_code=400, detail="Format must be md, html, pdf, or docx")

    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")

    settings = get_settings()
    filepath = await generate_document(db, interview_id, fmt, settings.document_storage_path)

    import os
    media_type_map = {"md": "text/markdown", "html": "text/html", "pdf": "application/pdf", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
    filename = os.path.basename(filepath)
    # PDF 用 inline 让浏览器预览而非强制下载；其他格式仍 attachment
    disposition = "inline" if fmt == "pdf" else "attachment"
    return FileResponse(
        filepath,
        media_type=media_type_map.get(fmt, "application/octet-stream"),
        filename=filename,
        content_disposition_type=disposition,
    )
