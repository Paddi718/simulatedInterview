import uuid
import os
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.resume import Resume
from app.schemas.resume import ResumeResponse, ResumeListResponse
from app.utils.auth import get_current_user
from app.services.resume_parser import (
    validate_file, extract_text, save_upload_file,
)

router = APIRouter(prefix="/api/resume", tags=["resume"])


@router.post("/upload", response_model=ResumeResponse, status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """上传简历：PyMuPDF 提取文字 → 存 raw_text，秒级返回。
    不调 LLM 解析——面试出题时直接用 raw_text 喂 LLM，更准且不浪费请求。"""
    content = await file.read()
    ext = f".{file.filename.split('.')[-1].lower()}" if file.filename else ".txt"
    validate_file(file.filename, len(content))

    filepath = save_upload_file(content, current_user.id, file.filename)
    raw_text = ""
    try:
        raw_text = extract_text(filepath, ext)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"文件解析失败：{e}")

    if not raw_text or len(raw_text.strip()) < 20:
        raise HTTPException(
            status_code=400,
            detail="未能从文件中提取到文字。文件可能为扫描版图片PDF，请使用可选中文字的PDF。",
        )

    resume = Resume(
        user_id=current_user.id,
        original_filename=file.filename,
        file_path=filepath,
        file_type=ext.lstrip('.'),
        raw_text=raw_text.strip(),
        parsed_data=None,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)

    return ResumeResponse(
        id=str(resume.id),
        original_filename=resume.original_filename,
        file_type=resume.file_type,
        raw_text=resume.raw_text,
        parsed_data=resume.parsed_data,
        created_at=resume.created_at.isoformat(),
    )


@router.get("/list", response_model=ResumeListResponse)
async def list_resumes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Resume).where(Resume.user_id == current_user.id).order_by(Resume.created_at.desc())
    )
    resumes = result.scalars().all()
    return ResumeListResponse(
        resumes=[
            ResumeResponse(
                id=str(r.id),
                original_filename=r.original_filename,
                file_type=r.file_type,
                raw_text=r.raw_text,
                parsed_data=r.parsed_data,
                created_at=r.created_at.isoformat(),
            )
            for r in resumes
        ],
        total=len(resumes),
    )


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return ResumeResponse(
        id=str(resume.id),
        original_filename=resume.original_filename,
        file_type=resume.file_type,
        raw_text=resume.raw_text,
        parsed_data=resume.parsed_data,
        created_at=resume.created_at.isoformat(),
    )


@router.delete("/{resume_id}", status_code=204)
async def delete_resume(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    # 解除关联面试的引用
    from app.models.interview import Interview
    intv_rows = (await db.execute(
        select(Interview).where(Interview.resume_id == resume_id)
    )).scalars().all()
    for intv in intv_rows:
        intv.resume_id = None
    await db.flush()

    if os.path.exists(resume.file_path):
        os.remove(resume.file_path)
    await db.delete(resume)
    await db.commit()
