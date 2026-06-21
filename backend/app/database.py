from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
from sqlalchemy.dialects.postgresql import JSONB
from app.config import get_settings

settings = get_settings()

engine = create_async_engine(
    settings.database_url,
    echo=False,
    pool_size=10,
    max_overflow=20,
    pool_pre_ping=True,  # 使用前检查连接活性，防止使用已死连接
)
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
        # 设置 lock_timeout 防止被僵死事务阻塞启动
        from sqlalchemy import text
        await conn.execute(text("SET LOCAL lock_timeout = '3s'"))
        # 全局超时保护：防止僵尸事务无限期持锁
        await conn.execute(text("SET idle_in_transaction_session_timeout = '300000'"))  # 5min
        for stmt in [
            "ALTER TABLE interviews ADD COLUMN IF NOT EXISTS scoring_status VARCHAR(20)",
            "ALTER TABLE interviews ADD COLUMN IF NOT EXISTS scoring_progress VARCHAR(20)",
            "ALTER TABLE interviews ADD COLUMN IF NOT EXISTS scoring_error TEXT",
            "ALTER TABLE interview_questions ADD COLUMN IF NOT EXISTS thinking_duration_seconds INTEGER",
            "ALTER TABLE users ADD COLUMN IF NOT EXISTS llm_config JSONB",
        ]:
            try:
                await conn.execute(text(stmt))
            except Exception:
                pass

        # 为现有外键添加 ON DELETE CASCADE（防御性：即使 ORM cascade 失效，DB 层也能级联删除）
        # PostgreSQL 不支持 ADD CONSTRAINT IF NOT EXISTS，故用 DO $$ 块
        for fk_sql in [
            # interview_questions → interviews
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'interview_questions_interview_id_fkey'
                      AND table_name = 'interview_questions'
                ) THEN
                    ALTER TABLE interview_questions
                        DROP CONSTRAINT interview_questions_interview_id_fkey,
                        ADD CONSTRAINT interview_questions_interview_id_fkey
                        FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE;
                END IF;
            END $$;
            """,
            # interview_documents → interviews
            """
            DO $$
            BEGIN
                IF EXISTS (
                    SELECT 1 FROM information_schema.table_constraints
                    WHERE constraint_name = 'interview_documents_interview_id_fkey'
                      AND table_name = 'interview_documents'
                ) THEN
                    ALTER TABLE interview_documents
                        DROP CONSTRAINT interview_documents_interview_id_fkey,
                        ADD CONSTRAINT interview_documents_interview_id_fkey
                        FOREIGN KEY (interview_id) REFERENCES interviews(id) ON DELETE CASCADE;
                END IF;
            END $$;
            """,
        ]:
            try:
                await conn.execute(text(fk_sql))
            except Exception:
                pass
