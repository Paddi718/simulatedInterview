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
    try:
        from app.services.llm_client import llm_parse_jd
        parsed = await llm_parse_jd(data.raw_text)
    except Exception:
        parsed = {"position": "", "requirements": [], "key_responsibilities": []}

    jd = JobDescription(
        user_id=current_user.id,
        raw_text=data.raw_text,
        parsed_data=parsed,
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
    await db.delete(jd)
    await db.commit()
    return {"code": 0, "message": "ok"}
