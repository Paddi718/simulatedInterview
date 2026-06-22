import uuid
import asyncio
import json
import tempfile
import os
from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse, Response
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
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
from app.services.scoring_orchestrator import (
    run_scoring_pipeline, get_sse_event, cleanup_sse_event,
)

async def _sync_favorite_scores(q_text: str, user_id: uuid.UUID):
    """评分完成后，将最新分数同步到独立的收藏表"""
    try:
        from app.database import async_session_factory
        from app.models.favorited_question import FavoritedQuestion
        from app.models.interview_question import InterviewQuestion
        from app.models.interview import Interview

        async with async_session_factory() as s:
            # 查原题目的最新评分（可能有多道相同文本的题目，取最新有分数的）
            q_result = await s.execute(
                select(InterviewQuestion)
                .join(Interview, InterviewQuestion.interview_id == Interview.id)
                .where(
                    Interview.user_id == user_id,
                    InterviewQuestion.question_text == q_text,
                    InterviewQuestion.ai_score != None,
                )
                .order_by(InterviewQuestion.ai_score.desc())
                .limit(1)
            )
            latest = q_result.scalar_one_or_none()
            if not latest:
                return

            # 更新匹配的收藏记录
            from sqlalchemy import update as sql_update
            await s.execute(
                sql_update(FavoritedQuestion)
                .where(
                    FavoritedQuestion.user_id == user_id,
                    FavoritedQuestion.question_text == q_text,
                )
                .values(
                    ai_score=latest.ai_score,
                    score_detail=latest.score_detail,
                    ai_evaluation=latest.ai_evaluation,
                    reference_answer=latest.reference_answer,
                    improvement_suggestion=latest.improvement_suggestion,
                )
            )
            await s.commit()
    except Exception as e:
        print(f"[Sync] FavoritedQuestion sync failed: {e}")


router = APIRouter(prefix="/api/interview", tags=["interview"])

# 后台评分 task 映射：interview_id (str) → asyncio.Task，用于取消和防 GC
_bg_task_map: dict[str, asyncio.Task] = {}


def _register_bg_task(interview_id: str, task: asyncio.Task):
    """注册后台任务，自动在完成时清理"""
    _bg_task_map[interview_id] = task

    def _cleanup(t: asyncio.Task):
        _bg_task_map.pop(interview_id, None)

    task.add_done_callback(_cleanup)


async def _cancel_bg_task(interview_id: str):
    """取消指定面试的后台评分任务"""
    task = _bg_task_map.get(interview_id)
    if task and not task.done():
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
    _bg_task_map.pop(interview_id, None)


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
            "company": (jd_map.get(str(i.jd_id)).parsed_data or {}).get("company_info", "") if i.jd_id and str(i.jd_id) in jd_map else "",
            "category": getattr(i, 'interview_category', 'private_enterprise') or 'private_enterprise',
            "category_config": getattr(i, 'category_config', None) or None,
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
    import logging
    logger = logging.getLogger(__name__)

    sid = str(interview_id)
    uid = str(current_user.id)
    logger.info(f"[Delete] Request to delete interview {sid} by user {uid}")

    # 1. 取消该面试的后台评分任务（如果正在运行）
    await _cancel_bg_task(sid)

    # 2. 清除 SSE 事件
    cleanup_sse_event(sid)

    # 3. 查找面试记录
    result = await db.execute(
        select(Interview).where(
            Interview.id == interview_id, Interview.user_id == current_user.id
        )
    )
    interview = result.scalar_one_or_none()

    if not interview:
        logger.info(f"[Delete] Interview {sid} not found, idempotent success")
        return {"code": 0, "message": "ok"}

    logger.info(f"[Delete] Found interview {sid}: status={interview.status}, scoring_status={interview.scoring_status}")

    # 4. 清除 scoring_status（防止任何残留任务冲突）
    if interview.scoring_status is not None:
        logger.info(f"[Delete] Clearing scoring_status ({interview.scoring_status}) for interview {sid}")
        interview.scoring_status = None
        await db.flush()

    # 5. 级联删除（ORM cascade + DB ondelete CASCADE 双保险）
    logger.info(f"[Delete] Executing cascade delete for interview {sid}")
    try:
        await db.delete(interview)
        await db.commit()
        logger.info(f"[Delete] Successfully deleted interview {sid}")

        # 清理磁盘上的录音文件（异步，不影响响应）
        from app.services.audio_cache import clean_recording
        asyncio.create_task(clean_recording(sid))

        return {"code": 0, "message": "ok"}
    except Exception as e:
        logger.error(f"[Delete] Delete commit failed for {sid}: {type(e).__name__}: {e}", exc_info=True)
        await db.rollback()
        # 重新抛出，让前端知道删除失败，触发乐观删除回滚
        raise HTTPException(status_code=500, detail=f"删除失败: {type(e).__name__}")


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

    return {"code": 0, "data": {"id": str(new_interview.id)}, "message": "ok"}


# ── 出题流式 SSE 基础设施 ──
_question_queues: dict[str, asyncio.Queue] = {}


def _get_question_queue(interview_id: str) -> asyncio.Queue:
    if interview_id not in _question_queues:
        _question_queues[interview_id] = asyncio.Queue()
    return _question_queues[interview_id]


def _cleanup_question_queue(interview_id: str):
    _question_queues.pop(interview_id, None)


async def _stream_generate_questions(
    interview_id: uuid.UUID,
    prompt_name: str,
    prompt_vars: dict,
    total_count: int,
    api_key: str | None,
    api_base: str | None,
    model: str | None,
):
    """后台任务：流式生成题目 → 存入 DB → 推送到 SSE 队列"""
    from app.services.question_generator import generate_questions_stream

    queue = _get_question_queue(str(interview_id))
    count = 0

    try:
        async with async_session_factory() as db:
            async for q in generate_questions_stream(
                prompt_name, prompt_vars, total_count,
                api_key=api_key, api_base=api_base, model=model,
            ):
                count += 1
                question = InterviewQuestion(
                    interview_id=interview_id,
                    question_text=q["question_text"],
                    question_type=q.get("question_type", "behavioral"),
                    order_index=count,
                )
                db.add(question)
                await db.commit()

                # 推送到 SSE 队列
                event_data = {
                    "type": "question",
                    "index": count,
                    "total": total_count,
                    "question": {
                        "order_index": count,
                        "question_text": q["question_text"],
                        "question_type": q.get("question_type", "behavioral"),
                    },
                }
                try:
                    queue.put_nowait(json.dumps(event_data))
                except asyncio.QueueFull:
                    pass

            # 全部生成完成
            await db.execute(
                update(Interview)
                .where(Interview.id == interview_id)
                .values(status="preparing")
            )
            await db.commit()

    except Exception as e:
        print(f"[StreamGen] Failed for {interview_id}: {e}")
        # 标记失败
        try:
            async with async_session_factory() as db:
                await db.execute(
                    update(Interview)
                    .where(Interview.id == interview_id)
                    .values(status="generating_failed")
                )
                await db.commit()
        except Exception:
            pass

    finally:
        # 发送完成/失败信号
        try:
            queue.put_nowait(json.dumps({"type": "done", "total": count}))
        except asyncio.QueueFull:
            pass


@router.get("/{interview_id}/stream-questions")
async def stream_questions_sse(
    interview_id: uuid.UUID,
    request: Request,
    token: str = "",
):
    """SSE: 实时推送流式生成的面试题"""
    from jose import JWTError, jwt
    from app.config import get_settings
    settings = get_settings()
    if not token:
        token = request.headers.get("Authorization", "").replace("Bearer ", "")
    if not token:
        return Response(status_code=401)
    try:
        jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
    except JWTError:
        return Response(status_code=401)

    sid = str(interview_id)
    queue = _get_question_queue(sid)

    async def event_generator():
        try:
            while True:
                try:
                    data = await asyncio.wait_for(queue.get(), timeout=30)
                    yield f"data: {data}\n\n"
                    parsed = json.loads(data)
                    if parsed.get("type") in ("done", "error"):
                        break
                except asyncio.TimeoutError:
                    yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
        except asyncio.CancelledError:
            pass

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/create", response_model=InterviewResponse, status_code=201)
async def create_interview(
    data: CreateInterviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    category = data.category or "private_enterprise"

    # ── 按类别条件加载简历/JD ──
    resume_id = None; resume_data = {}
    jd_id = None; jd_data = {}

    if category == "private_enterprise":
        # 私企：简历和 JD 必选
        if not data.resume_id or not data.jd_id:
            raise HTTPException(status_code=400, detail="私企面试需要选择简历和岗位")
        try:
            resume_id = uuid.UUID(data.resume_id)
            jd_id = uuid.UUID(data.jd_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid resume_id or jd_id format")

        resume = (await db.execute(
            select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
        )).scalar_one_or_none()
        if not resume:
            raise HTTPException(status_code=404, detail="Resume not found")
        resume_data = resume.parsed_data or {}

        jd = (await db.execute(
            select(JobDescription).where(JobDescription.id == jd_id, JobDescription.user_id == current_user.id)
        )).scalar_one_or_none()
        if not jd:
            raise HTTPException(status_code=404, detail="Job description not found")
        jd_data = jd.parsed_data or {}

    elif category == "institution" and data.resume_id:
        # 事业单位：简历可选
        try:
            resume_id = uuid.UUID(data.resume_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid resume_id format")
        resume = (await db.execute(
            select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
        )).scalar_one_or_none()
        if resume:
            resume_data = resume.parsed_data or {}

    elif category == "institution" and data.jd_id:
        # 事业单位：JD 可选
        try:
            jd_id = uuid.UUID(data.jd_id)
        except ValueError:
            raise HTTPException(status_code=400, detail="Invalid jd_id format")
        jd = (await db.execute(
            select(JobDescription).where(JobDescription.id == jd_id, JobDescription.user_id == current_user.id)
        )).scalar_one_or_none()
        if jd:
            jd_data = jd.parsed_data or {}

    # ── 验证 category_config ──
    if category in ("civil_service", "institution"):
        if not data.category_config.get("province"):
            raise HTTPException(status_code=400, detail="请选择面试省份")

    # ── 查找用户 LLM 配置 ──
    from app.models.user import User as UserModel
    from app.services.llm_client import extract_llm_config
    u_result = await db.execute(select(UserModel).where(UserModel.id == current_user.id))
    user_db = u_result.scalar_one_or_none()
    llm_key, llm_base, llm_model = extract_llm_config(user_db.llm_config if user_db else None)

    # ── 构建提示词变量 ──
    cfg = data.category_config or {}
    default_count = {"civil_service": 3, "institution": 5}.get(category, 10)
    total_count = data.question_count or default_count

    if category == "civil_service":
        # 预搜索热点（异步但不阻塞返回）
        from app.services.question_generator import _search_hot_events
        hot_events = await _search_hot_events(cfg.get("province", ""))
        prompt_name = "generate_questions_civil_service"
        prompt_vars = {
            "province": cfg.get("province", ""),
            "position_category": cfg.get("position_category", "综合管理"),
            "level": cfg.get("level", "省"),
            "position_name": cfg.get("position_name", ""),
            "hot_events": hot_events,
            "total_count": total_count,
        }
    elif category == "institution":
        from app.services.question_generator import _search_hot_events
        hot_events = await _search_hot_events(cfg.get("province", ""))
        prompt_name = "generate_questions_institution"
        prompt_vars = {
            "province": cfg.get("province", ""),
            "position_category": cfg.get("position_category", "综合管理"),
            "level": cfg.get("level", ""),
            "position_name": cfg.get("position_name", ""),
            "hot_events": hot_events,
            "resume_data_json": resume_data or {},
            "jd_data_json": jd_data or {},
            "total_count": total_count,
        }
    else:
        prompt_name = "generate_questions"
        prompt_vars = {
            "total_count": total_count,
            "difficulty": data.difficulty,
            "resume_data_json": resume_data,
            "jd_data_json": jd_data,
        }

    # ── 立即创建空面试骨架 ──
    interview = Interview(
        user_id=current_user.id,
        resume_id=resume_id,
        jd_id=jd_id,
        difficulty=data.difficulty if category != "civil_service" else "mid",
        interview_category=category,
        category_config=cfg,
        question_count=data.question_count,
        status="generating",  # 流式生成中
    )
    db.add(interview)
    await db.commit()
    await db.refresh(interview)

    # ── 后台任务：流式生成题目 ──
    asyncio.create_task(_stream_generate_questions(
        interview_id=interview.id,
        prompt_name=prompt_name,
        prompt_vars=prompt_vars,
        total_count=total_count,
        api_key=llm_key,
        api_base=llm_base,
        model=llm_model,
    ))

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

    # 后台评分：使用 asyncio.create_task（与主事件循环共享，避免线程+event_loop 的兼容问题）
    if data.answer_transcript and data.answer_transcript.strip():
        _q_id = question.id
        _i_id = interview_id

        async def _bg_score_question():
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
                    # 同步到收藏表（如果用户已收藏此题）
                    await _sync_favorite_scores(q.question_text, i.user_id)
                except Exception as e:
                    print(f"[BG Score] Question scoring failed: {e}")

        # 保持 task 引用防止被 GC（模块级 _bg_task_map）
        task = asyncio.create_task(_bg_score_question())
        _register_bg_task(f"{_i_id}_q{data.order_index}", task)

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

    # 原子"认领"评分权：只有 scoring_status 为 None 的才能被认领，防止并发重复创建 task
    from sqlalchemy import update as sql_update
    claimed = await db.execute(
        sql_update(Interview)
        .where(Interview.id == interview_id, Interview.scoring_status == None)
        .values(scoring_status="pending")
    )
    await db.commit()
    if claimed.rowcount == 0:
        # 已被认领（或已评分完成/失败），重新查询返回当前状态
        reloaded = await db.execute(
            select(Interview).where(Interview.id == interview_id)
        )
        interview = reloaded.scalar_one_or_none()
        if not interview:
            raise HTTPException(status_code=404, detail="Interview not found")
        return await _interview_to_response(interview, db)

    # 标记面试完成
    interview = await InterviewEngine.complete_interview(db, interview_id)

    # 确保 SSE 事件已创建
    get_sse_event(str(interview_id))

    # 使用 asyncio.create_task 启动后台评分（不阻塞响应）
    task = asyncio.create_task(run_scoring_pipeline(interview_id))
    _register_bg_task(str(interview_id), task)

    return await _interview_to_response(interview, db)


@router.get("/{interview_id}/stream")
async def stream_interview_result(
    interview_id: uuid.UUID,
    request: Request,
    token: str = "",
):
    """SSE: 实时推送面试评分进度和完成事件。

    事件类型:
    - heartbeat: 每 5s 发送，保活
    - progress: 评分进度更新 {phase, progress}
    - completed: 评分完成 {total_score, dimension_scores, ai_overview, resume_suggestions}
    - timeout: 60s 超时，前端应降级为轮询
    """
    # 鉴权
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
    event = get_sse_event(sid)

    async def event_generator():
        heartbeat_interval = 5  # 每 5 秒心跳
        max_wait = 60  # 最多等待 60 秒

        try:
            # 循环等待 event.set()，同时发送心跳
            elapsed = 0
            while elapsed < max_wait:
                # 等待 event 或 heartbeat 超时
                try:
                    await asyncio.wait_for(event.wait(), timeout=heartbeat_interval)
                    # event.set() 被调用 → 推送最终结果
                    async with async_session_factory() as s:
                        r = await s.execute(
                            select(Interview).where(Interview.id == interview_id)
                        )
                        i = r.scalar_one_or_none()
                        yield (
                            f"data: {json.dumps({'type': 'completed', 'total_score': i.total_score if i else None, 'dimension_scores': i.dimension_scores if i else None, 'ai_overview': i.ai_overview if i else None, 'resume_suggestions': i.resume_suggestions if i else None, 'scoring_status': i.scoring_status if i else None})}\n\n"
                        )
                    return
                except asyncio.TimeoutError:
                    # heartbeat: 检查当前评分状态
                    elapsed += heartbeat_interval
                    try:
                        async with async_session_factory() as s:
                            r = await s.execute(
                                select(Interview).where(Interview.id == interview_id)
                            )
                            i = r.scalar_one_or_none()
                            if i:
                                yield (
                                    f"data: {json.dumps({'type': 'progress', 'scoring_status': i.scoring_status, 'scoring_progress': i.scoring_progress, 'total_score': i.total_score})}\n\n"
                                )
                                # 如果已经 done/failed，提前退出（event 可能已被之前的连接消费）
                                if i.scoring_status in ("done", "failed"):
                                    yield (
                                        f"data: {json.dumps({'type': 'completed', 'total_score': i.total_score, 'dimension_scores': i.dimension_scores, 'ai_overview': i.ai_overview, 'resume_suggestions': i.resume_suggestions, 'scoring_status': i.scoring_status})}\n\n"
                                    )
                                    return
                    except Exception:
                        # 心跳查询失败不中断 SSE
                        yield f"data: {json.dumps({'type': 'heartbeat'})}\n\n"
            else:
                # 超时
                yield f"data: {json.dumps({'type': 'timeout'})}\n\n"
        except asyncio.CancelledError:
            # 客户端断开连接
            pass
        except Exception as e:
            print(f"[SSE] Error: {e}")
            yield f"data: {json.dumps({'type': 'error', 'message': str(e)})}\n\n"

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.post("/{interview_id}/transcribe")
async def transcribe_audio(
    interview_id: uuid.UUID,
    request: Request,
    current_user: User = Depends(get_current_user),
):
    """接收上传的音频文件(webm/opus)，返回 FunASR 转写文本。同时保存录音用于回放。"""
    from app.services.asr_service import transcribe_pcm
    from app.services.audio_cache import save_recording_sync

    # 获取题目序号（用于回放）
    order_index = int(request.query_params.get("order_index", 0))

    body = await request.body()
    if not body or len(body) < 100:
        return {"code": 0, "data": {"text": ""}, "message": "ok"}

    tmp_path = None
    wav_path = None
    webm_bytes = body

    # 立即保存原始录音（在转写之前），确保回放可用
    try:
        await asyncio.to_thread(save_recording_sync, str(interview_id), order_index, webm_bytes)
    except Exception:
        pass  # 录音保存失败不影响转写

    try:
        with tempfile.NamedTemporaryFile(suffix='.webm', delete=False) as f:
            f.write(body)
            tmp_path = f.name

        wav_path = tmp_path + '.wav'
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


@router.get("/{interview_id}/audio/{order_index}")
async def get_question_audio(
    interview_id: uuid.UUID,
    order_index: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取预生成的 TTS 题目朗读音频"""
    # 验证面试属于当前用户
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")

    # 查询题目
    q_result = await db.execute(
        select(InterviewQuestion).where(
            InterviewQuestion.interview_id == interview_id,
            InterviewQuestion.order_index == order_index,
        )
    )
    question = q_result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # 尝试从缓存路径读取
    from app.services.audio_cache import get_cached_tts, tts_cache_key
    from app.services.tts_service import synthesize_speech
    from pathlib import Path

    # 获取用户 TTS 偏好
    user_result = await db.execute(select(User).where(User.id == current_user.id))
    user = user_result.scalar_one_or_none()
    tts_pref = user.tts_preference if user and user.tts_preference else {}
    voice = tts_pref.get('voice', 'zh-CN-XiaoxiaoNeural')
    speed = float(tts_pref.get('speed', 1.0))

    # 先查缓存
    audio = await get_cached_tts(question.question_text, voice, speed)
    if audio is None:
        # 缓存未命中，实时生成
        try:
            audio = await synthesize_speech(question.question_text, voice, speed)
            if audio and len(audio) > 220:
                from app.services.audio_cache import save_tts_cache
                await save_tts_cache(question.question_text, voice, speed, audio)
        except Exception as e:
            raise HTTPException(status_code=500, detail=f"TTS generation failed: {e}")

    if not audio:
        raise HTTPException(status_code=404, detail="Audio not available")

    return Response(content=audio, media_type="audio/mpeg")


@router.post("/{interview_id}/question/{order_index}/favorite")
async def toggle_question_favorite(
    interview_id: uuid.UUID,
    order_index: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """切换题目的收藏状态（同时维护独立的收藏表，不受面试删除影响）"""
    from app.models.favorited_question import FavoritedQuestion

    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")

    q_result = await db.execute(
        select(InterviewQuestion).where(
            InterviewQuestion.interview_id == interview_id,
            InterviewQuestion.order_index == order_index,
        )
    )
    question = q_result.scalar_one_or_none()
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    # 切换标记
    question.is_favorited = not question.is_favorited

    if question.is_favorited:
        # 收藏：将题目数据复制到独立收藏表
        existing = await db.execute(
            select(FavoritedQuestion).where(
                FavoritedQuestion.user_id == current_user.id,
                FavoritedQuestion.question_text == question.question_text,
            )
        )
        if not existing.scalar_one_or_none():
            fav = FavoritedQuestion(
                user_id=current_user.id,
                source_interview_id=interview_id,
                question_text=question.question_text,
                question_type=question.question_type,
                reference_answer=question.reference_answer,
                improvement_suggestion=question.improvement_suggestion,
                ai_score=question.ai_score,
                score_detail=question.score_detail,
                ai_evaluation=question.ai_evaluation,
            )
            db.add(fav)
    else:
        # 取消收藏：从独立收藏表删除
        fav_result = await db.execute(
            select(FavoritedQuestion).where(
                FavoritedQuestion.user_id == current_user.id,
                FavoritedQuestion.question_text == question.question_text,
            )
        )
        fav = fav_result.scalar_one_or_none()
        if fav:
            await db.delete(fav)

    await db.commit()

    return {"code": 0, "data": {"order_index": order_index, "is_favorited": question.is_favorited}, "message": "ok"}


@router.get("/favorites/list")
async def list_favorited_questions(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取当前用户所有收藏的题目，按岗位@公司分类分组"""
    from app.models.favorited_question import FavoritedQuestion
    from app.models.interview import Interview
    from app.models.job_description import JobDescription

    # JOIN Interview + JobDescription 获取 position/company
    result = await db.execute(
        select(FavoritedQuestion, Interview, JobDescription)
        .outerjoin(Interview, FavoritedQuestion.source_interview_id == Interview.id)
        .outerjoin(JobDescription, Interview.jd_id == JobDescription.id)
        .where(FavoritedQuestion.user_id == current_user.id)
        .order_by(FavoritedQuestion.created_at.desc())
    )
    rows = result.all()

    def _item(fav: FavoritedQuestion):
        return {
            "id": str(fav.id),
            "source_interview_id": str(fav.source_interview_id) if fav.source_interview_id else None,
            "question_text": fav.question_text,
            "question_type": fav.question_type,
            "reference_answer": fav.reference_answer,
            "improvement_suggestion": fav.improvement_suggestion,
            "created_at": fav.created_at.isoformat(),
        }

    # 按 position@company 分组，公务员/事业单位 fallback 到 category_config
    categories: dict[str, dict] = {}
    for fav, interview, jd in rows:
        jd_data = jd.parsed_data if jd and jd.parsed_data else {}
        position = (jd_data.get("position") or "").strip()
        company = (jd_data.get("company_info") or "").strip()

        # 公务员/事业单位：无 JD 时用 category_config 作为分类标签
        if not position and not company:
            iv_category = getattr(interview, 'interview_category', '') if interview else ''
            iv_config = getattr(interview, 'category_config', None) if interview else None
            if iv_category == 'civil_service':
                province = (iv_config or {}).get('province', '')
                position = f"{province}公务员面试" if province else "公务员面试"
                company = (iv_config or {}).get('position_category', '')
            elif iv_category == 'institution':
                province = (iv_config or {}).get('province', '')
                position = f"{province}事业单位面试" if province else "事业单位面试"
                company = (iv_config or {}).get('position_category', '')

        if position or company:
            key = f"{position}@{company}" if position and company else (position or company)
            label_position = position or "未指定岗位"
            label_company = company or "未指定公司"
        else:
            key = "__uncategorized__"
            label_position = "未分类"
            label_company = ""

        if key not in categories:
            categories[key] = {
                "category_key": key,
                "position": label_position,
                "company": label_company,
                "items": [],
            }
        categories[key]["items"].append(_item(fav))

    # 计算计数
    result_list = []
    for cat in categories.values():
        cat["count"] = len(cat["items"])
        result_list.append(cat)

    return {"code": 0, "data": result_list, "message": "ok"}


@router.delete("/favorites/{fav_id}")
async def delete_favorited_question(
    fav_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """删除单条收藏题目，同时同步源题目的 is_favorited 状态"""
    from app.models.favorited_question import FavoritedQuestion
    from app.models.interview_question import InterviewQuestion

    result = await db.execute(
        select(FavoritedQuestion).where(
            FavoritedQuestion.id == fav_id,
            FavoritedQuestion.user_id == current_user.id,
        )
    )
    fav = result.scalar_one_or_none()
    if not fav:
        raise HTTPException(status_code=404, detail="Favorite not found")

    # 同步更新源题目的收藏标记
    if fav.source_interview_id and fav.question_text:
        q_result = await db.execute(
            select(InterviewQuestion).where(
                InterviewQuestion.interview_id == fav.source_interview_id,
                InterviewQuestion.question_text == fav.question_text,
            )
        )
        src_question = q_result.scalar_one_or_none()
        if src_question:
            src_question.is_favorited = False

    await db.delete(fav)
    await db.commit()
    return {"code": 0, "message": "ok"}


@router.post("/favorites/backfill")
async def backfill_favorite_scores(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """回填已有收藏题目的评分数据（从 InterviewQuestion 同步到 FavoritedQuestion）"""
    from app.models.favorited_question import FavoritedQuestion
    from app.models.interview_question import InterviewQuestion as IQ
    from app.models.interview import Interview as IV

    updated = 0
    # 查找当前用户所有 ai_score 为空的收藏记录
    fav_result = await db.execute(
        select(FavoritedQuestion).where(
            FavoritedQuestion.user_id == current_user.id,
            FavoritedQuestion.ai_score == None,
        )
    )
    favs = fav_result.scalars().all()

    for fav in favs:
        # 查找同文本、同用户、已评分的最新题目
        iq_result = await db.execute(
            select(IQ)
            .join(IV, IQ.interview_id == IV.id)
            .where(
                IV.user_id == current_user.id,
                IQ.question_text == fav.question_text,
                IQ.ai_score != None,
            )
            .order_by(IQ.ai_score.desc())
            .limit(1)
        )
        latest = iq_result.scalar_one_or_none()
        if latest:
            fav.ai_score = latest.ai_score
            fav.score_detail = latest.score_detail
            fav.ai_evaluation = latest.ai_evaluation
            fav.reference_answer = latest.reference_answer
            fav.improvement_suggestion = latest.improvement_suggestion
            updated += 1

    await db.commit()
    return {"code": 0, "data": {"updated": updated, "total_checked": len(favs)}, "message": "ok"}


@router.get("/{interview_id}/recording/{order_index}")
async def get_question_recording(
    interview_id: uuid.UUID,
    order_index: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """获取指定题目的录音文件，用于回放"""
    # 验证面试属于当前用户
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")

    from app.services.audio_cache import get_recording
    audio = await get_recording(str(interview_id), order_index)
    if audio is None:
        raise HTTPException(status_code=404, detail="Recording not found")

    return Response(content=audio, media_type="audio/webm")


@router.post("/{interview_id}/rescore", response_model=InterviewResponse)
async def rescore_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """重新评分：重置评分状态并启动后台评分流水线"""
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")

    # 重置评分状态
    interview.scoring_status = "pending"
    interview.scoring_progress = None
    interview.scoring_error = None
    interview.total_score = None
    interview.dimension_scores = None
    interview.ai_overview = None
    interview.resume_suggestions = None

    # 清除已有评分数据
    q_result = await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.interview_id == interview_id)
    )
    for q in q_result.scalars().all():
        q.ai_score = None
        q.score_detail = None
        q.ai_evaluation = None
        q.reference_answer = None
        q.improvement_suggestion = None

    await db.commit()

    # 确保 SSE 事件已创建
    get_sse_event(str(interview_id))

    # 启动后台评分
    task = asyncio.create_task(run_scoring_pipeline(interview_id))
    _register_bg_task(str(interview_id), task)

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
            is_favorited=q.is_favorited,
        )
        for q in db_questions
    ]
    return InterviewResponse(
        id=str(interview.id),
        category=interview.interview_category,
        category_config=interview.category_config,
        status=interview.status,
        difficulty=interview.difficulty,
        total_score=interview.total_score,
        dimension_scores=interview.dimension_scores,
        ai_overview=interview.ai_overview,
        resume_suggestions=interview.resume_suggestions,
        questions=questions,
        created_at=interview.created_at.isoformat(),
        scoring_status=interview.scoring_status,
        scoring_progress=interview.scoring_progress,
        scoring_error=interview.scoring_error,
    )
