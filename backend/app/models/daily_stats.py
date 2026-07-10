"""全站访问统计 — 按日期+路径+用户粒度聚合，IP 哈希保护隐私"""
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Date, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class DailyStats(Base):
    __tablename__ = "daily_stats"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    date: Mapped[datetime] = mapped_column(Date, nullable=False, index=True)
    path: Mapped[str] = mapped_column(String(100), nullable=False)
    user_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)  # 登录用户ID，未登录为 None
    ip_hash: Mapped[str | None] = mapped_column(String(16), nullable=True)  # SHA256 前8位
    count: Mapped[int] = mapped_column(Integer, nullable=False, default=1)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
