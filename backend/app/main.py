import os
from contextlib import asynccontextmanager
from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import hashlib
import asyncio as _asyncio
from app.database import init_db
from app.routers import auth as auth_router
from app.routers import resume as resume_router
from app.routers import jd as jd_router
from app.routers import interview as interview_router
from app.routers import websocket as ws_router
from app.routers import document as doc_router
from app.routers import admin as admin_router
# 确保模型被 SQLAlchemy 识别（建表）
import app.models.favorited_question  # noqa: F401


# ---------- 速率限制（简易内存实现，生产建议用 Redis） ----------
_rate_window: dict[str, list[float]] = {}  # key → [timestamp, ...]


def _rate_limit(key: str, max_req: int, window: int) -> bool:
    """True = 通过，False = 限流"""
    now = __import__('time').time()
    if key not in _rate_window:
        _rate_window[key] = []
    # 清理过期记录
    cutoff = now - window
    _rate_window[key] = [t for t in _rate_window[key] if t > cutoff]
    if len(_rate_window[key]) >= max_req:
        return False
    _rate_window[key].append(now)
    return True


# 登录接口限流：每分钟 5 次（防暴力破解）
LOGIN_RATE = int(os.getenv("LOGIN_RATE_LIMIT", "5"))
# 音频转录限流：每分钟 10 次（防资源耗尽）
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
    yield

app = FastAPI(
    title="模拟面试 API",
    description="AI Mock Interview API",
    version="1.0.0",
    lifespan=lifespan,
)

# ---------- CORS ----------
# 生产环境通过 ALLOWED_ORIGINS 环境变量指定（逗号分隔），默认 localhost 开发
_default_origins = os.getenv("ALLOWED_ORIGINS", "http://localhost:3000,http://127.0.0.1:3000")
allowed_origins = [o.strip() for o in _default_origins.split(",") if o.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["GET", "POST", "PUT", "DELETE"],
    allow_headers=["Content-Type", "Authorization"],
)


# ---------- 全站访问统计 ----------
_traffic_buffer: dict = {}  # f"{date}|{path}" → count
_visit_buffer: list = []   # [{ip, path, user_agent, user_id}, ...]
_traffic_lock = _asyncio.Lock()
_geo_cache: dict = {}       # ip → {country, city}

_SKIP_PREFIXES = ("/api/health", "/api/ws/", "/api/cache/", "/_next/", "/favicon")
_SKIP_SUFFIXES = (".js", ".css", ".json", ".svg", ".ico", ".png", ".map", ".woff", ".woff2")


async def _geo_lookup(ip: str) -> tuple[str | None, str | None]:
    """查 IP 地理位置（本地/内网 IP 跳过）"""
    if ip in ("unknown", "127.0.0.1", "localhost") or ip.startswith(("172.", "192.168.", "10.")):
        return None, None
    if ip in _geo_cache:
        return _geo_cache[ip]
    try:
        import httpx
        async with httpx.AsyncClient(timeout=3.0) as c:
            r = await c.get(f"http://ip-api.com/json/{ip}?lang=zh-CN&fields=country,city")
            if r.status_code == 200:
                d = r.json()
                country = d.get("country") or None
                city = d.get("city") or None
                _geo_cache[ip] = (country, city)
                return country, city
    except Exception:
        pass
    _geo_cache[ip] = (None, None)
    return None, None


async def _flush_traffic():
    """每 60 秒将内存计数批量写入 DB"""
    while True:
        await _asyncio.sleep(60)
        async with _traffic_lock:
            has_traffic = bool(_traffic_buffer)
            has_visits = bool(_visit_buffer)
            traffic_batch = _traffic_buffer.copy()
            _traffic_buffer.clear()
            visit_batch = _visit_buffer.copy()
            _visit_buffer.clear()
        if not has_traffic and not has_visits:
            continue
        try:
            from datetime import date as _date
            from sqlalchemy import text
            from app.database import async_session_factory
            today = _date.today()
            async with async_session_factory() as db:
                for key, count in traffic_batch.items():
                    parts = key.split("|", 2)
                    if len(parts) != 2:
                        continue
                    path = parts[1][:100]
                    for _ in range(count):
                        await db.execute(
                            text("INSERT INTO daily_stats (date, path, count) VALUES (:d, :p, 1)"),
                            {"d": today, "p": path},
                        )
                for v in visit_batch:
                    country, city = await _geo_lookup(v["ip"])
                    await db.execute(
                        text(
                            "INSERT INTO visit_logs (ip, country, city, path, user_agent, user_id) "
                            "VALUES (:ip, :cc, :ct, :p, :ua, :uid)"
                        ),
                        {
                            "ip": v["ip"],
                            "cc": country,
                            "ct": city,
                            "p": v["path"],
                            "ua": v.get("user_agent", ""),
                            "uid": v.get("user_id"),
                        },
                    )
                await db.commit()
        except Exception:
            pass


@app.on_event("startup")
async def start_traffic_flusher():
    _asyncio.create_task(_flush_traffic())


@app.middleware("http")
async def traffic_middleware(request: Request, call_next):
    response = await call_next(request)
    if response.status_code < 400:
        path = request.url.path
        if not path.startswith(tuple(_SKIP_PREFIXES)) and not path.endswith(tuple(_SKIP_SUFFIXES)):
            key = f"_|{path}"
            client_ip = request.client.host if request.client else "unknown"
            ua = request.headers.get("user-agent", "")[:500]
            async with _traffic_lock:
                _traffic_buffer[key] = _traffic_buffer.get(key, 0) + 1
                _visit_buffer.append({"ip": client_ip, "path": path, "user_agent": ua, "user_id": None})
    return response


# ---------- 安全响应头 ----------
@app.middleware("http")
async def security_headers(request: Request, call_next):
    response = await call_next(request)
    response.headers["X-Content-Type-Options"] = "nosniff"
    response.headers["X-Frame-Options"] = "DENY"
    response.headers["X-XSS-Protection"] = "1; mode=block"
    response.headers["Referrer-Policy"] = "strict-origin-when-cross-origin"
    response.headers["Permissions-Policy"] = "camera=(), microphone=()"
    # 生产环境加 HSTS
    if os.getenv("ENV") == "production":
        response.headers["Strict-Transport-Security"] = "max-age=63072000; includeSubDomains"
    return response


# ---------- 速率限制中间件 ----------
@app.middleware("http")
async def rate_limit_middleware(request: Request, call_next):
    path = request.url.path
    client_ip = request.client.host if request.client else "unknown"

    # 登录接口限流
    if path == "/api/auth/login":
        if not _rate_limit(f"login:{client_ip}", LOGIN_RATE, 60):
            return JSONResponse(
                status_code=429,
                content={"code": 429, "message": "Too many login attempts, please try again later"},
            )

    # 音频相关接口限流
    if "/audio/" in path or "/transcribe" in path:
        if not _rate_limit(f"asr:{client_ip}", ASR_RATE, 60):
            return JSONResponse(
                status_code=429,
                content={"code": 429, "message": "Too many requests, please slow down"},
            )

    response = await call_next(request)
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
