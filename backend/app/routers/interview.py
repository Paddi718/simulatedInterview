import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db
from app.models.user import User
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.models.resume import Resume
from app.models.job_description import JobDescription
from app.schemas.interview import (
    CreateInterviewRequest, InterviewResponse, QuestionItem, SubmitAnswerRequest,
)
from app.utils.auth import get_current_user
from app.services.interview_engine import InterviewEngine

router = APIRouter(prefix="/api/interview", tags=["interview"])


@router.get("/list")
async def list_interviews(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Interview).where(Interview.user_id == current_user.id)
        .order_by(Interview.created_at.desc())
    )
    interviews = result.scalars().all()
    return [
        {
            "id": str(i.id),
            "status": i.status,
            "difficulty": i.difficulty,
            "total_score": i.total_score,
            "created_at": i.created_at.isoformat(),
        }
        for i in interviews
    ]


@router.post("/create", response_model=InterviewResponse, status_code=201)
async def create_interview(
    data: CreateInterviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    resume_result = await db.execute(
        select(Resume).where(Resume.id == uuid.UUID(data.resume_id), Resume.user_id == current_user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    jd_result = await db.execute(
        select(JobDescription).where(JobDescription.id == uuid.UUID(data.jd_id), JobDescription.user_id == current_user.id)
    )
    jd = jd_result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job description not found")

    interview = await InterviewEngine.create_interview(
        db=db,
        user_id=current_user.id,
        resume_id=resume.id,
        jd_id=jd.id,
        resume_data=resume.parsed_data or {},
        jd_data=jd.parsed_data or {},
        difficulty=data.difficulty,
    )

    return await _interview_to_response(interview, db)


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Interview)
        .where(Interview.id == interview_id, Interview.user_id == current_user.id)
        .options(selectinload(Interview.questions))
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return await _interview_to_response(interview, db)


@router.post("/{interview_id}/start", response_model=InterviewResponse)
async def start_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")
    interview = await InterviewEngine.start_interview(db, interview_id)
    return await _interview_to_response(interview, db)


@router.get("/{interview_id}/next-question/{index}", response_model=QuestionItem)
async def get_next_question(
    interview_id: uuid.UUID,
    index: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")

    question = await InterviewEngine.get_current_question(db, interview_id, index)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    return QuestionItem(
        order_index=question.order_index,
        question_text=question.question_text,
        question_type=question.question_type,
    )


@router.post("/{interview_id}/submit-answer")
async def submit_answer(
    interview_id: uuid.UUID,
    data: SubmitAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    question = await InterviewEngine.submit_answer(
        db,
        uuid.UUID(data.question_id),
        data.answer_transcript,
        duration=data.duration_seconds,
    )
    return {"code": 0, "data": {"id": str(question.id)}, "message": "ok"}


@router.post("/{interview_id}/complete", response_model=InterviewResponse)
async def complete_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")
    interview = await InterviewEngine.complete_interview(db, interview_id)
    # 触发评分
    try:
        from app.services.scoring_service import run_full_scoring
        interview = await run_full_scoring(db, interview_id)
    except Exception:
        pass
    return await _interview_to_response(interview, db)


@router.post("/{interview_id}/rescore", response_model=InterviewResponse)
async def rescore_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    from app.services.scoring_service import run_full_scoring
    interview = await run_full_scoring(db, interview_id)
    return await _interview_to_response(interview, db)


async def _interview_to_response(interview: Interview, db: AsyncSession) -> InterviewResponse:
    # 主动查询 questions，避免 MissingGreenlet 懒加载问题
    q_result = await db.execute(
        select(InterviewQuestion)
        .where(InterviewQuestion.interview_id == interview.id)
        .order_by(InterviewQuestion.order_index)
    )
    db_questions = q_result.scalars().all()

    questions = [
        QuestionItem(
            order_index=q.order_index,
            question_text=q.question_text,
            question_type=q.question_type,
        )
        for q in db_questions
    ]
    return InterviewResponse(
        id=str(interview.id),
        status=interview.status,
        difficulty=interview.difficulty,
        total_score=interview.total_score,
        dimension_scores=interview.dimension_scores,
        ai_overview=interview.ai_overview,
        resume_suggestions=interview.resume_suggestions,
        questions=questions,
        created_at=interview.created_at.isoformat(),
    )
