import uuid
import asyncio
import json
import tempfile
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from sqlalchemy.orm import selectinload
from app.database import get_db, async_session_factory
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

# SSE 事件通知：interview_id → asyncio.Event（用于推送总评完成）
_sse_events: dict[str, asyncio.Event] = {}



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

    # 批量加载 JD 获取岗位名称
    jd_ids = [i.jd_id for i in interviews if i.jd_id]
    jd_map = {}
    if jd_ids:
        from app.models.job_description import JobDescription
        jd_result = await db.execute(
            select(JobDescription).where(JobDescription.id.in_(jd_ids))
        )
        for jd in jd_result.scalars().all():
            jd_map[str(jd.id)] = jd

    return [
        {
            "id": str(i.id),
            "status": i.status,
            "difficulty": i.difficulty,
            "total_score": i.total_score,
            "position": (jd_map.get(str(i.jd_id)).parsed_data or {}).get("position", "") if i.jd_id and str(i.jd_id) in jd_map else "",
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


@router.post("/{interview_id}/retry", status_code=201)
async def retry_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """基于已有面试创建新模拟（题目相同，答案清空）"""
    result = await db.execute(
        select(Interview).where(
            Interview.id == interview_id, Interview.user_id == current_user.id
        ).options(selectinload(Interview.questions))
    )
    original = result.scalar_one_or_none()
    if not original:
        raise HTTPException(status_code=404, detail="Interview not found")

    # 创建新面试记录（复用简历、JD、难度）
    new_interview = Interview(
        user_id=current_user.id,
        resume_id=original.resume_id,
        jd_id=original.jd_id,
        difficulty=original.difficulty,
        status="preparing",
    )
    db.add(new_interview)
    await db.flush()

    # 复制题目（内容相同，答案相关字段清空）
    for q in sorted(original.questions, key=lambda x: x.order_index):
        new_q = InterviewQuestion(
            interview_id=new_interview.id,
            question_text=q.question_text,
            question_type=q.question_type,
            order_index=q.order_index,
        )
        db.add(new_q)

    await db.commit()
    await db.refresh(new_interview)

    return {"code": 0, "data": {"id": str(new_interview.id)}, "message": "ok"}


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
        thinking_duration=data.thinking_duration_seconds,
    )

    # 后台评分：不阻塞用户，用独立线程+session评分
    if data.answer_transcript and data.answer_transcript.strip():
        import threading
        _q_id = question.id
        _i_id = interview_id

        def _bg_score_question():
            import asyncio
            async def _run():
                from app.database import async_session_factory
                from app.services.scoring_service import score_question as do_score
                from app.models.resume import Resume as RModel
                from app.models.job_description import JobDescription as JDModel
                async with async_session_factory() as bg_db:
                    try:
                        qr = await bg_db.execute(
                            select(InterviewQuestion).where(InterviewQuestion.id == _q_id)
                        )
                        q = qr.scalar_one_or_none()
                        if not q or q.ai_score is not None:
                            return  # 已评分或不存在
                        ir = await bg_db.execute(select(Interview).where(Interview.id == _i_id))
                        i = ir.scalar_one_or_none()
                        if not i:
                            return
                        rr = await bg_db.execute(select(RModel).where(RModel.id == i.resume_id))
                        resume = rr.scalar_one_or_none()
                        resume_data = resume.parsed_data if resume else {}
                        jr = await bg_db.execute(select(JDModel).where(JDModel.id == i.jd_id))
                        jd = jr.scalar_one_or_none()
                        jd_data = jd.parsed_data if jd else {}
                        scores = await do_score(q, resume_data, jd_data)
                        q.ai_score = scores.get("total_score", 0)
                        q.score_detail = {
                            k: v for k, v in scores.items()
                            if k in ["content_completeness", "professionalism", "expression", "star_method"]
                        }
                        q.ai_evaluation = scores.get("evaluation", "")
                        q.reference_answer = scores.get("reference_answer", "")
                        q.improvement_suggestion = scores.get("improvement_suggestion", "")
                        await bg_db.commit()
                    except Exception as e:
                        print(f"[BG Score] Question scoring failed: {e}")
            loop = asyncio.new_event_loop()
            loop.run_until_complete(_run())
            loop.close()

        threading.Thread(target=_bg_score_question, daemon=True).start()

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
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # 幂等保护：如果已在评分或已完成评分，不重复启动
    if interview.scoring_status in ("scoring_questions", "scoring_overview", "done"):
        return await _interview_to_response(interview, db)

    interview = await InterviewEngine.complete_interview(db, interview_id)

    # 标记评分开始（列可能不存在，失败不阻塞流程）
    try:
        interview.scoring_status = "pending"
        await db.commit()
    except Exception:
        pass

    # 创建 SSE 通知事件
    event = asyncio.Event()
    _sse_events[str(interview_id)] = event
    _main_loop = asyncio.get_running_loop()

    # 用线程池后台评分，避免 asyncio task 被取消
    import threading
    def _bg_score():
        import asyncio
        async def _run():
            from app.database import async_session_factory
            from app.services.scoring_service import run_full_scoring as _run_scoring
            async with async_session_factory() as bg_db:
                # 尝试更新状态（失败不影响评分流程）
                try:
                    ir = await bg_db.execute(select(Interview).where(Interview.id == interview_id))
                    i = ir.scalar_one_or_none()
                    if i:
                        i.scoring_status = "scoring_questions"
                        await bg_db.commit()
                except Exception:
                    pass  # scoring_status 列可能不存在，忽略

                # 执行评分（核心逻辑，必须执行）
                try:
                    await _run_scoring(bg_db, interview_id)
                except Exception as e:
                    print(f"[Complete] run_full_scoring failed: {e}")

                # 尝试更新最终状态
                try:
                    ir2 = await bg_db.execute(select(Interview).where(Interview.id == interview_id))
                    i2 = ir2.scalar_one_or_none()
                    if i2:
                        i2.scoring_status = "done"
                        await bg_db.commit()
                except Exception:
                    pass

            # 通知 SSE 监听者（无论评分成功与否都通知）
            _main_loop.call_soon_threadsafe(event.set)
        loop = asyncio.new_event_loop()
        loop.run_until_complete(_run())
        loop.close()

    threading.Thread(target=_bg_score, daemon=True).start()

    return await _interview_to_response(interview, db)


@router.get("/{interview_id}/stream")
async def stream_interview_result(
    interview_id: uuid.UUID,
    request: Request,
    token: str = "",
):
    """SSE: 实时推送面试总评完成事件。前端 EventSource 监听。
    EventSource 不支持 Authorization header，token 通过 query string 传递。
    """
    # 鉴权：从 query string 或 header 获取 token 并手动解码
    from jose import JWTError, jwt
    from app.config import get_settings
    settings = get_settings()
    if not token:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        from fastapi.responses import Response
        return Response(status_code=401, headers={"Content-Type": "text/plain"})
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        from fastapi.responses import Response
        return Response(status_code=401, headers={"Content-Type": "text/plain"})

    sid = str(interview_id)
    event = _sse_events.get(sid)
    if not event:
        event = asyncio.Event()
        _sse_events[sid] = event

    async def event_generator():
        try:
            # 等待 scoring 完成（最多 60s）
            await asyncio.wait_for(event.wait(), timeout=60.0)
            # 推送完成事件
            async with async_session_factory() as s:
                r = await s.execute(select(Interview).where(Interview.id == interview_id))
                i = r.scalar_one_or_none()
                if i and i.ai_overview:
                    yield f"data: {json.dumps({'type': 'overview_ready', 'total_score': i.total_score, 'dimension_scores': i.dimension_scores, 'ai_overview': i.ai_overview, 'resume_suggestions': i.resume_suggestions})}\n\n"
                    return
            yield f"data: {json.dumps({'type': 'done'})}\n\n"
        except asyncio.TimeoutError:
            yield f"data: {json.dumps({'type': 'timeout'})}\n\n"
        finally:
            _sse_events.pop(sid, None)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "X-Accel-Buffering": "no"},
    )


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
            thinking_duration_seconds=q.thinking_duration_seconds,
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
