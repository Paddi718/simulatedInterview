import uuid
import asyncio
import tempfile
import os
from fastapi import APIRouter, Depends, HTTPException, Request
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


@router.delete("/{interview_id}")
async def delete_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Interview).where(
            Interview.id == interview_id, Interview.user_id == current_user.id
        )
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    await db.delete(interview)
    await db.commit()
    return {"code": 0, "message": "ok"}


@router.post("/create", response_model=InterviewResponse, status_code=201)
async def create_interview(
    data: CreateInterviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        resume_id = uuid.UUID(data.resume_id)
        jd_id = uuid.UUID(data.jd_id)
    except ValueError:
        raise HTTPException(status_code=400, detail="Invalid resume_id or jd_id format")

    resume_result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    jd_result = await db.execute(
        select(JobDescription).where(JobDescription.id == jd_id, JobDescription.user_id == current_user.id)
    )
    jd = jd_result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job description not found")

    try:
        interview = await InterviewEngine.create_interview(
            db=db,
            user_id=current_user.id,
            resume_id=resume.id,
            jd_id=jd.id,
            resume_data=resume.parsed_data or {},
            jd_data=jd.parsed_data or {},
            difficulty=data.difficulty,
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate interview: {str(e)}")

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


@router.post("/{interview_id}/score-question")
async def score_single_question(
    data: SubmitAnswerRequest,
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """REST 接口：单题评分（WebSocket 降级方案）"""
    from app.services.scoring_service import score_question as do_score
    from app.models.resume import Resume as RModel
    from app.models.job_description import JobDescription as JDModel
    r = await db.execute(select(InterviewQuestion).where(
        InterviewQuestion.interview_id == interview_id,
        InterviewQuestion.order_index == data.order_index,
    ))
    question = r.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")
    i = (await db.execute(select(Interview).where(Interview.id == interview_id))).scalar_one_or_none()
    resume_data, jd_data = {}, {}
    if i:
        rr = (await db.execute(select(Resume).where(Resume.id == i.resume_id))).scalar_one_or_none()
        resume_data = rr.parsed_data if rr else {}
        jr = (await db.execute(select(JobDescription).where(JobDescription.id == i.jd_id))).scalar_one_or_none()
        jd_data = jr.parsed_data if jr else {}
    scores = await do_score(question, resume_data, jd_data)
    question.ai_score = scores.get("total_score", 0)
    question.score_detail = {k: v for k, v in scores.items() if k in ["content_completeness", "professionalism", "expression", "star_method"]}
    question.ai_evaluation = scores.get("evaluation", "")
    question.reference_answer = scores.get("reference_answer", "")
    question.improvement_suggestion = scores.get("improvement_suggestion", "")
    await db.commit()
    return {
        "order_index": data.order_index, "total_score": question.ai_score,
        "dimension_scores": question.score_detail, "evaluation": question.ai_evaluation,
        "reference_answer": question.reference_answer,
        "improvement_suggestion": question.improvement_suggestion,
    }


@router.post("/{interview_id}/submit-answer")
async def submit_answer(
    interview_id: uuid.UUID,
    data: SubmitAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    question = await InterviewEngine.submit_answer(
        db,
        interview_id,
        data.order_index,
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

    # 用线程池后台评分，避免 asyncio task 被取消
    import threading
    def _bg_score():
        import asyncio
        async def _run():
            from app.database import async_session_factory
            async with async_session_factory() as bg_db:
                try:
                    from app.services.scoring_service import run_full_scoring
                    await run_full_scoring(bg_db, interview_id)
                except Exception:
                    pass
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_run())
        loop.close()

    threading.Thread(target=_bg_score, daemon=True).start()

    return await _interview_to_response(interview, db)


@router.post("/{interview_id}/transcribe")
async def transcribe_audio(
    interview_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """接收上传的音频文件(webm/opus)，返回 FunASR 转写文本"""
    from app.services.asr_service import transcribe_pcm

    body = await request.body()
    if not body or len(body) < 100:
        return {"code": 0, "data": {"text": ""}, "message": "ok"}

    tmp_path = None
    wav_path = None
    try:
        # 写入临时 webm 文件
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
            f.write(body)
            tmp_path = f.name

        wav_path = tmp_path + '.wav'
        # ffmpeg: webm → 16kHz mono WAV
        proc = await asyncio.create_subprocess_exec(
            'ffmpeg', '-y', '-i', tmp_path,
            '-ar', '16000', '-ac', '1', '-f', 'wav', wav_path,
            stdout=asyncio.subprocess.PIPE, stderr=asyncio.subprocess.PIPE,
        )
        await proc.communicate()

        if os.path.exists(wav_path) and os.path.getsize(wav_path) > 44:
            with open(wav_path, 'rb') as f:
                wav_bytes = f.read()
            pcm_bytes = wav_bytes[44:]
            text = await transcribe_pcm(pcm_bytes)
            return {"code": 0, "data": {"text": text}, "message": "ok"}

        return {"code": 0, "data": {"text": ""}, "message": "ok"}
    except Exception as e:
        return {"code": 0, "data": {"text": ""}, "message": str(e)}
    finally:
        for p in (tmp_path, wav_path):
            if p:
                try:
                    os.unlink(p)
                except OSError:
                    pass


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
            user_answer_transcript=q.user_answer_transcript,
            duration_seconds=q.duration_seconds,
            ai_score=q.ai_score,
            score_detail=q.score_detail,
            ai_evaluation=q.ai_evaluation,
            reference_answer=q.reference_answer,
            improvement_suggestion=q.improvement_suggestion,
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
