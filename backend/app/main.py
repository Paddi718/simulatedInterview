from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db
from app.routers import auth as auth_router
from app.routers import resume as resume_router
from app.routers import jd as jd_router
from app.routers import interview as interview_router
from app.routers import websocket as ws_router
from app.routers import document as doc_router
# 确保模型被 SQLAlchemy 识别（建表）
import app.models.favorited_question  # noqa: F401


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    # 启动时清理过期 TTS 缓存
    try:
        from app.services.audio_cache import clean_expired_cache
        deleted = await clean_expired_cache()
        if deleted:
            print(f"[Startup] Cleaned {deleted} expired TTS cache files")
    except Exception:
        pass
    yield

app = FastAPI(
    title="模拟面试 API",
    description="AI Mock Interview API",
    version="1.0.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(auth_router.router)
app.include_router(resume_router.router)
app.include_router(jd_router.router)
app.include_router(interview_router.router)
app.include_router(ws_router.router)
app.include_router(doc_router.router)


@app.get("/api/health")
async def health_check():
    return {"code": 0, "data": {"status": "ok"}, "message": "ok"}


@app.get("/api/cache/stats")
async def cache_stats():
    from app.services.audio_cache import get_cache_stats
    stats = await get_cache_stats()
    return {"code": 0, "data": stats, "message": "ok"}
