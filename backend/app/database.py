from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.dialects.postgresql import JSONB
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(settings.database_url, echo=False, pool_size=10, max_overflow=20)
async_session_factory = async_sessionmaker(engine, class_=AsyncSession, expire_on_commit=False)


class Base(DeclarativeBase):
    pass


async def get_db():
    async with async_session_factory() as session:
        try:
            yield session
        finally:
            await session.close()


async def init_db():
    async with engine.begin() as conn:
        await conn.run_sync(Base.metadata.create_all)
        # 补建缺失的列（create_all 只建表不建列）
        from sqlalchemy import text
        for stmt in [
            "ALTER TABLE interviews ADD COLUMN IF NOT EXISTS scoring_status VARCHAR(20)",
            "ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS thinking_duration_seconds INTEGER",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass
