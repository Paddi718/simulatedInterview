import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.job_description import JobDescription
from app.schemas.jd import JDCreate, JDResponse, JDListResponse
from app.utils.auth import get_current_user

router = APIRouter(prefix="/api/jd", tags=["job_description"])


@router.post("/create", response_model=JDResponse, status_code=201)
async def create_jd(
    data: JDCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """创建岗位描述：直接存 raw_text，不调 LLM 解析。面试出题时直接用原文。"""
    jd = JobDescription(
        user_id=current_user.id,
        raw_text=data.raw_text,
        parsed_data=None,
        source="paste",
    )
    db.add(jd)
    await db.commit()
    await db.refresh(jd)

    return JDResponse(
        id=str(jd.id),
        raw_text=jd.raw_text,
        parsed_data=jd.parsed_data,
        source=jd.source,
        created_at=jd.created_at.isoformat(),
    )


@router.get("/list", response_model=JDListResponse)
async def list_jds(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobDescription).where(JobDescription.user_id == current_user.id)
        .order_by(JobDescription.created_at.desc())
    )
    items = result.scalars().all()
    return JDListResponse(
        items=[JDResponse(
            id=str(j.id), raw_text=j.raw_text, parsed_data=j.parsed_data,
            source=j.source, created_at=j.created_at.isoformat(),
        ) for j in items],
        total=len(items),
    )


@router.get("/{jd_id}", response_model=JDResponse)
async def get_jd(
    jd_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobDescription).where(JobDescription.id == jd_id, JobDescription.user_id == current_user.id)
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="JD not found")
    return JDResponse(
        id=str(jd.id), raw_text=jd.raw_text, parsed_data=jd.parsed_data,
        source=jd.source, created_at=jd.created_at.isoformat(),
    )


@router.delete("/{jd_id}")
async def delete_jd(
    jd_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobDescription).where(JobDescription.id == jd_id, JobDescription.user_id == current_user.id)
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="JD not found")

    # 解除关联面试的引用
    from app.models.interview import Interview
    intv_rows = (await db.execute(
        select(Interview).where(Interview.jd_id == jd_id)
    )).scalars().all()
    for intv in intv_rows:
        intv.jd_id = None
    await db.flush()

    await db.delete(jd)
    await db.commit()
    return {"code": 0, "message": "ok"}
