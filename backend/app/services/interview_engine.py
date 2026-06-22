import uuid
import asyncio
import logging
from datetime import datetime, timezone
from typing import Optional
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
    ) -> Interview:
        # 查找用户 LLM 配置
        from app.models.user import User
        from app.services.llm_client import extract_llm_config
        u_result = await db.execute(select(User).where(User.id == user_id))
        user_db = u_result.scalar_one_or_none()
        llm_key, llm_base, llm_model = extract_llm_config(user_db.llm_config if user_db else None)

        # 生成面试题
        questions_data = await generate_questions(resume_data, jd_data, difficulty,
            api_key=llm_key, api_base=llm_base, model=llm_model)

        # 创建面试会话
        interview = Interview(
            user_id=user_id,
            resume_id=resume_id,
            jd_id=jd_id,
            difficulty=difficulty,
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
    """后台任务：预生成所有题目的 TTS 音频并写入缓存 + 数据库路径"""
    try:
        from app.database import async_session_factory
        from app.services.tts_service import synthesize_speech
        from app.services.audio_cache import get_cached_tts, save_tts_cache, tts_cache_key

        async with async_session_factory() as db:
            # 获取用户的 TTS 偏好
            from app.models.user import User
            result = await db.execute(select(User).where(User.id == user_id))
            user = result.scalar_one_or_none()
            tts_pref = user.tts_preference if user and user.tts_preference else {}
            voice = tts_pref.get('voice', 'zh-CN-XiaoxiaoNeural')
            speed = float(tts_pref.get('speed', 1.0))

            for q_id, q_text in questions:
                if not q_text:
                    continue
                try:
                    # 检查缓存
                    cached = await get_cached_tts(q_text, voice, speed)
                    if cached is None:
                        # 生成 TTS 并缓存
                        audio_bytes = await synthesize_speech(q_text, voice, speed)
                        if audio_bytes and len(audio_bytes) > 220:
                            await save_tts_cache(q_text, voice, speed, audio_bytes)

                    # 将缓存路径写入数据库（确保前端可直接通过 ID 索引）
                    cache_key = tts_cache_key(q_text, voice, speed)
                    await db.execute(
                        update(InterviewQuestion)
                        .where(InterviewQuestion.id == q_id)
                        .values(tts_audio_path=f"tts_cache/{cache_key}.mp3")
                    )
                    await db.commit()
                except asyncio.CancelledError:
                    logger.info(f"[TTS pre-gen] Cancelled for interview {interview_id}")
                    return
                except Exception as e:
                    logger.warning(f"[TTS pre-gen] Failed for question {q_id}: {e}")
                    continue

            logger.info(f"[TTS pre-gen] Completed for interview {interview_id}, {len(questions)} questions")
    except asyncio.CancelledError:
        logger.info(f"[TTS pre-gen] Task cancelled for interview {interview_id}")
    except Exception as e:
        logger.error(f"[TTS pre-gen] Unexpected error for interview {interview_id}: {e}")
