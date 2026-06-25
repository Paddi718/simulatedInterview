import uuid
import os
from fastapi import APIRouter, Depends, HTTPException
from fastapi.responses import FileResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.user import User
from app.models.interview import Interview
from app.utils.auth import get_current_user, get_current_user_query
from app.services.document_service import generate_document
from app.config import get_settings

router = APIRouter(prefix="/api/interview", tags=["document"])


# ── 发送到邮箱（必须排在 /document/{fmt} 之前，否则 FastAPI 会把 email 当作 fmt）──

@router.post("/{interview_id}/document/email")
async def send_document_email(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """生成 PDF 报告并发送到用户邮箱。SMTP 未配置时返回 503。"""
    from app.services.email_service import is_smtp_configured, send_report_email

    if not await is_smtp_configured():
        raise HTTPException(status_code=503, detail="邮件服务未配置，请联系管理员")

    result = await db.execute(
        select(Interview)
        .where(Interview.id == interview_id, Interview.user_id == current_user.id)
        .options(selectinload(Interview.questions))
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    settings = get_settings()
    pdf_path = await generate_document(db, interview_id, "pdf", settings.document_storage_path)

    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalar_one_or_none()
    email = (user.email or '').strip() if user else ''
    if not email:
        raise HTTPException(status_code=400, detail="您的账号未绑定邮箱，请先在设置页添加邮箱")

    success = await send_report_email(email, pdf_path, interview)
    if not success:
        raise HTTPException(status_code=500, detail="邮件发送失败，请稍后重试")

    return {"code": 0, "data": None, "message": f"面试报告已发送至 {email}"}


# ── 生成文档 ──

@router.post("/{interview_id}/document/{fmt}")
async def create_document(
    interview_id: uuid.UUID,
    fmt: str,
    generate_only: bool = False,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """生成文档。generate_only=true 时只生成不返回路径。"""
    if fmt not in ("md", "html", "pdf", "docx"):
        raise HTTPException(status_code=400, detail="Format must be md, html, pdf, or docx")

    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")

    settings = get_settings()
    filepath = await generate_document(db, interview_id, fmt, settings.document_storage_path)

    if generate_only:
        return {"code": 0, "data": {"ok": True}, "message": "ok"}
    return {"code": 0, "data": {"filepath": filepath, "format": fmt}, "message": "ok"}


# ── 下载文档 ──

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

    media_type_map = {"md": "text/markdown", "html": "text/html", "pdf": "application/pdf", "docx": "application/vnd.openxmlformats-officedocument.wordprocessingml.document"}
    from urllib.parse import quote
    filename = os.path.basename(filepath)
    # ASCII 回退名 + RFC 5987 中文名（双保险兼容所有浏览器）
    ascii_name = "interview_report." + fmt
    encoded = quote(filename)
    return FileResponse(
        filepath,
        media_type=media_type_map.get(fmt, "application/octet-stream"),
        filename=filename,
        headers={
            "Content-Disposition": f"attachment; filename=\"{ascii_name}\"; filename*=UTF-8''{encoded}",
        },
    )
