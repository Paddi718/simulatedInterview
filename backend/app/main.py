import os
import asyncio as _asyncio
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from app.database import init_db
from app.routers import auth as auth_router
from app.routers import resume as resume_router
from app.routers import jd as jd_router
from app.routers import interview as interview_router
from app.routers import websocket as ws_router
from app.routers import document as doc_router
from app.routers import admin as admin_router
import app.models.favorited_question  # noqa: F401
import app.models.daily_stats         # noqa: F401
import app.models.visit_log           # noqa: F401


# ---------- 速率限制（简易内存实现） ----------
_rate_window: dict[str, list[float]] = {}

def _rate_limit(key: str, max_req: int, window: int) -> bool:
    now = __import__('time').time()
    if key not in _rate_window:
        _rate_window[key] = []
    cutoff = now - window
    _rate_window[key] = [t for t in _rate_window[key] if t > cutoff]
    if len(_rate_window[key]) >= max_req:
        return False
    _rate_window[key].append(now)
    return True


LOGIN_RATE = int(os.getenv("LOGIN_RATE_LIMIT", "5"))
ASR_RATE = int(os.getenv("ASR_RATE_LIMIT", "10"))


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
    try:
        from app.services.audio_cache import clean_expired_cache
        deleted = await clean_expired_cache()
        if deleted:
            print(f"[Startup] Cleaned {deleted} expired TTS cache files")
    except Exception:
        pass
    # 启动全站访问统计收集器
    try:
        from app.services.traffic_collector import run_collector
        _asyncio.create_task(run_collector())
    except Exception:
        pass
    yield


app = FastAPI(
    title="模拟面试 API",
    description="AI Mock Interview API",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------- CORS ----------
_default_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allowed_origins = [o.strip() for o in _default_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------- 安全响应头 + 速率限制 ----------
@app.middleware("http")
async def security_and_rate_limit(request: Request, call_next):
    path = request.url.path
    client_ip = request.client.host if request.client else "unknown"

    # 登录限流
    if path == "/api/auth/login":
        if not _rate_limit(f"login:{client_ip}", LOGIN_RATE, 60):
            return JSONResponse(status_code=429, content={"code": 429, "message": "Too many login attempts"})
    # ASR 限流
    if "/audio/" in path or "/transcribe" in path:
        if not _rate_limit(f"asr:{client_ip}", ASR_RATE, 60):
            return JSONResponse(status_code=429, content={"code": 429, "message": "Too many requests"})

    response = await call_next(request)

    # 安全头
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=()"
    if os.getenv("ENV") == "production":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


app.include_router(auth_router.router)
app.include_router(resume_router.router)
app.include_router(jd_router.router)
app.include_router(interview_router.router)
app.include_router(ws_router.router)
app.include_router(doc_router.router)
app.include_router(admin_router.router)


@app.get("/api/health")
async def health_check():
    return {"code": 0, "data": {"status": "ok"}, "message": "ok"}


@app.get("/api/cache/stats")
async def cache_stats():
    from app.services.audio_cache import get_cache_stats
    stats = await get_cache_stats()
    return {"code": 0, "data": stats, "message": "ok"}
