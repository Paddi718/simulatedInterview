import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.services.question_generator import generate_questions


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
        # 生成面试题
        questions_data = await generate_questions(resume_data, jd_data, difficulty)

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
        await db.refresh(interview)
        return interview

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
        question_id: uuid.UUID,
        transcript: str,
        audio_path: Optional[str] = None,
        duration: int = 0,
    ) -> InterviewQuestion:
        result = await db.execute(
            select(InterviewQuestion).where(InterviewQuestion.id == question_id)
        )
        question = result.scalar_one_or_none()
        if not question:
            raise ValueError("Question not found")
        question.user_answer_transcript = transcript
        question.duration_seconds = duration
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
