import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
from fastapi import HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.services.question_generator import generate_questions

logger = logging.getLogger(__name__)


class InterviewEngine:
    """面试状态机，管理面试流程"""

    @staticmethod
    async def create_interview(
        db: AsyncSession,
        user_id: uuid.UUID,
        resume_id: uuid.UUID,
        jd_id: uuid.UUID,
        resume_data: dict,
        jd_data: dict,
        difficulty: str = "mid",
        category: str = "private_enterprise",
        category_config: dict | None = None,
        question_count: int | None = None,
    ) -> Interview:
        # 查找用户 LLM 配置（用户 Key > 全局兜底）
        from app.models.user import User
        from app.services.llm_client import extract_llm_config
        u_result = await db.execute(select(User).where(User.id == user_id))
        user_db = u_result.scalar_one_or_none()
        llm_key, llm_base, llm_model = extract_llm_config(user_db.llm_config if user_db else None)

        if not llm_key:
            raise HTTPException(
                status_code=400,
                detail="请先在「设置」页面配置您的 LLM API Key，然后再创建面试",
            )

        cfg = category_config or {}

        # 按类别生成面试题
        if category == "civil_service":
            from app.services.question_generator import generate_questions_civil_service
            default_count = 3
            count = question_count or default_count
            questions_data = await generate_questions_civil_service(
                province=cfg.get("province", ""),
                position_category=cfg.get("position_category", "综合管理"),
                level=cfg.get("level", "省"),
                position_name=cfg.get("position_name", ""),
                total_count=count,
                api_key=llm_key, api_base=llm_base, model=llm_model,
            )
        elif category == "institution":
            from app.services.question_generator import generate_questions_institution
            default_count = 5
            count = question_count or default_count
            questions_data = await generate_questions_institution(
                province=cfg.get("province", ""),
                position_category=cfg.get("position_category", "综合管理"),
                level=cfg.get("level", "省"),
                position_name=cfg.get("position_name", ""),
                resume_data=resume_data if resume_data else None,
                jd_data=jd_data if jd_data else None,
                total_count=count,
                api_key=llm_key, api_base=llm_base, model=llm_model,
            )
        else:
            # private_enterprise — 现有逻辑不变
            questions_data = await generate_questions(resume_data, jd_data, difficulty,
                api_key=llm_key, api_base=llm_base, model=llm_model)

        # 创建面试会话
        interview = Interview(
            user_id=user_id,
            resume_id=resume_id if resume_id else None,
            jd_id=jd_id if jd_id else None,
            difficulty=difficulty if category != "civil_service" else "mid",
            interview_category=category,
            category_config=cfg,
            question_count=count,
            status="preparing",
        )
        db.add(interview)
        await db.flush()

        # 创建题目记录
        for idx, q in enumerate(questions_data):
            question = InterviewQuestion(
                interview_id=interview.id,
                question_text=q["question_text"],
                question_type=q.get("question_type", "behavioral"),
                order_index=idx + 1,
            )
            db.add(question)

        await db.commit()

        # 用 selectinload 预加载 questions，避免后续懒加载触发 MissingGreenlet
        from sqlalchemy.orm import selectinload
        result = await db.execute(
            select(Interview)
            .where(Interview.id == interview.id)
            .options(selectinload(Interview.questions))
        )
        loaded = result.scalar_one_or_none()
        if loaded is None:
            raise RuntimeError("面试创建后无法重新加载，请重试")

        # 后台预生成 TTS 音频（不阻塞面试创建响应）
        questions_for_tts = [
            (q.id, q.question_text)
            for q in sorted(loaded.questions, key=lambda x: x.order_index)
        ]
        asyncio.create_task(_pre_generate_tts(
            user_id=user_id,
            interview_id=loaded.id,
            questions=questions_for_tts,
        ))

        return loaded

    @staticmethod
    async def start_interview(db: AsyncSession, interview_id: uuid.UUID) -> Interview:
        result = await db.execute(select(Interview).where(Interview.id == interview_id))
        interview = result.scalar_one_or_none()
        if not interview:
            raise ValueError("Interview not found")
        interview.status = "in_progress"
        interview.started_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(interview)

        # 恢复面试时，后台预生成所有题目的 TTS 音频（避免首次播放等待 8 秒）
        from sqlalchemy.orm import selectinload
        r = await db.execute(
            select(Interview)
            .where(Interview.id == interview_id)
            .options(selectinload(Interview.questions))
        )
        iv = r.scalar_one_or_none()
        if iv and iv.questions:
            questions_for_tts = [
                (q.id, q.question_text)
                for q in sorted(iv.questions, key=lambda x: x.order_index)
            ]
            asyncio.create_task(_pre_generate_tts(
                user_id=interview.user_id,
                interview_id=interview_id,
                questions=questions_for_tts,
            ))

        return interview

    @staticmethod
    async def get_current_question(
        db: AsyncSession, interview_id: uuid.UUID, question_index: int
    ) -> Optional[InterviewQuestion]:
        result = await db.execute(
            select(InterviewQuestion).where(
                InterviewQuestion.interview_id == interview_id,
                InterviewQuestion.order_index == question_index,
            )
        )
        return result.scalar_one_or_none()

    @staticmethod
    async def submit_answer(
        db: AsyncSession,
        interview_id: uuid.UUID,
        order_index: int,
        transcript: str,
        audio_path: Optional[str] = None,
        duration: int = 0,
        thinking_duration: int = 0,
    ) -> InterviewQuestion:
        result = await db.execute(
            select(InterviewQuestion).where(
                InterviewQuestion.interview_id == interview_id,
                InterviewQuestion.order_index == order_index,
            )
        )
        question = result.scalar_one_or_none()
        if not question:
            raise ValueError("Question not found")
        question.user_answer_transcript = transcript
        question.duration_seconds = duration
        question.thinking_duration_seconds = thinking_duration
        if audio_path:
            question.user_audio_path = audio_path
        await db.commit()
        await db.refresh(question)
        return question

    @staticmethod
    async def complete_interview(
        db: AsyncSession, interview_id: uuid.UUID
    ) -> Interview:
        result = await db.execute(select(Interview).where(Interview.id == interview_id))
        interview = result.scalar_one_or_none()
        if not interview:
            raise ValueError("Interview not found")
        interview.status = "completed"
        interview.finished_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(interview)
        return interview


async def _pre_generate_tts(
    user_id: uuid.UUID,
    interview_id: uuid.UUID,
    questions: list[tuple[uuid.UUID, str]],  # [(question_id, question_text), ...]
):
    """后台任务：并行预生成所有题目的 TTS 音频（~8s 完成全部，而非 N×8s）"""
    try:
        from app.database import async_session_factory
        from app.services.tts_service import synthesize_speech
        from app.services.audio_cache import get_cached_tts, save_tts_cache, tts_cache_key
        from app.models.user import User

        # 先获取用户 TTS 偏好
        async with async_session_factory() as db:
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            tts_pref = user.tts_preference if user and user.tts_preference else {}
            voice = tts_pref.get('voice', 'zh-CN-XiaoxiaoNeural')
            speed = float(tts_pref.get('speed', 1.0))

        async def _gen_one(q_id: uuid.UUID, q_text: str):
            """生成单道题的 TTS + 写入缓存 + 更新 DB 路径"""
            if not q_text:
                return
            try:
                cached = await get_cached_tts(q_text, voice, speed)
                if cached is None:
                    audio_bytes = await synthesize_speech(q_text, voice, speed)
                    if audio_bytes and len(audio_bytes) > 220:
                        await save_tts_cache(q_text, voice, speed, audio_bytes)

                # 写入数据库路径
                cache_key = tts_cache_key(q_text, voice, speed)
                async with async_session_factory() as db:
                    await db.execute(
                        update(InterviewQuestion)
                        .where(InterviewQuestion.id == q_id)
                        .values(tts_audio_path=f"tts_cache/{cache_key}.mp3")
                    )
                    await db.commit()
            except asyncio.CancelledError:
                raise
            except Exception as e:
                logger.warning(f"[TTS pre-gen] Failed for question {q_id}: {e}")

        # 并行执行所有题目的 TTS 预生成
        await asyncio.gather(*[_gen_one(q_id, text) for q_id, text in questions])

        logger.info(f"[TTS pre-gen] Completed for interview {interview_id}, {len(questions)} questions")
    except asyncio.CancelledError:
        logger.info(f"[TTS pre-gen] Task cancelled for interview {interview_id}")
    except Exception as e:
        logger.error(f"[TTS pre-gen] Unexpected error for interview {interview_id}: {e}")
