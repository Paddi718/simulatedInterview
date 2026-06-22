import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Interview(Base):
    __tablename__ = "interviews"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    resume_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("resumes.id"), nullable=True)
    jd_id: Mapped[uuid.UUID | None] = mapped_column(UUID(as_uuid=True), ForeignKey("job_descriptions.id"), nullable=True)
    interview_category: Mapped[str] = mapped_column(String(30), default="private_enterprise")
    # private_enterprise | civil_service | institution
    category_config: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)
    # {province, position_category, level, position_name, hot_events, ...}
    question_count: Mapped[int | None] = mapped_column(Integer, nullable=True)
    # 题目数量（null 时使用类别默认值）
    difficulty: Mapped[str] = mapped_column(String(10), default="mid")
    total_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dimension_scores: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)
    status: Mapped[str] = mapped_column(String(20), default="preparing")
    scoring_status: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # scoring_status: null | "pending" | "scoring_questions" | "aggregating" | "generating_overview" | "done" | "failed"
    scoring_progress: Mapped[str | None] = mapped_column(String(20), nullable=True)
    # scoring_progress: e.g. "3/10" 记录评分进度
    scoring_error: Mapped[str | None] = mapped_column(Text, nullable=True)
    # scoring_error: 评分失败时的错误信息
    ai_overview: Mapped[str | None] = mapped_column(Text, nullable=True)
    resume_suggestions: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="interviews")
    questions = relationship("InterviewQuestion", back_populates="interview", cascade="all, delete-orphan")
    documents = relationship("InterviewDocument", back_populates="interview", cascade="all, delete-orphan")
