"""访问日志 — 记录 IP、国家/城市、页面路径"""
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class VisitLog(Base):
    __tablename__ = "visit_logs"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    ip: Mapped[str] = mapped_column(String(45), nullable=False, index=True)
    country: Mapped[str | None] = mapped_column(String(50), nullable=True)
    city: Mapped[str | None] = mapped_column(String(50), nullable=True)
    path: Mapped[str] = mapped_column(String(200), nullable=False)
    user_agent: Mapped[str | None] = mapped_column(String(500), nullable=True)  # 浏览器标识
    user_id: Mapped[str | None] = mapped_column(String(50), nullable=True, index=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), index=True)
