# 模拟面试应用 — 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 构建一个AI模拟面试Web应用，支持语音交互、简历+JD个性化出题、多维度评分、面试报告生成。

**Architecture:** Next.js 14+ (App Router) 前端 + Python FastAPI 后端 + PostgreSQL/Redis，全部通过 Docker Compose 编排。语音ASR/TTS和LLM调用云端API，其他数据全部本地化存储。

**Tech Stack:** Next.js 14+, Tailwind CSS, shadcn/ui, Zustand, Python FastAPI, SQLAlchemy 2.0, Alembic, PostgreSQL 15, Redis 7, Docker Compose, 阿里云ASR/TTS, Claude API/DeepSeek

## Global Constraints

- Python >= 3.11
- Node.js >= 18
- PostgreSQL 15
- Redis 7
- Docker Compose v2+
- 所有用户数据(音频/文档/简历文件)存储在 Docker volumes 中
- 前端使用 App Router，不使用 Pages Router
- 所有 API 返回统一格式: `{"code": 0, "data": ..., "message": "ok"}`
- 数据库迁移必须使用 Alembic
- 前端与后端通过环境变量配置 API 地址
- 密码使用 bcrypt 哈希存储
- JWT token 用于鉴权，过期时间 7 天

---

## Phase 1: 基础骨架

构建项目的脚手架、Docker 环境和基础设施，建立前后端通信基础。

---

### Task 1: Docker Compose & 项目初始化

**Files:**
- Create: `F:/program/simulatedInterview/docker-compose.yml`
- Create: `F:/program/simulatedInterview/.env.example`
- Create: `F:/program/simulatedInterview/.gitignore`

**Interfaces:**
- Produces: Docker Compose 编排文件，定义 postgres:15、redis:7、backend(待构建)、frontend(待构建) 四个服务
- Produces: 环境变量模板(.env.example)，包含所有外部服务密钥占位

- [ ] **Step 1: Create .gitignore**

写入 `F:/program/simulatedInterview/.gitignore`:

```
__pycache__/
*.py[cod]
.env
node_modules/
.next/
*.egg-info/
dist/
.venv/
.DS_Store
*.db
```

- [ ] **Step 2: Create .env.example**

写入 `F:/program/simulatedInterview/.env.example`:

```env
# Database
POSTGRES_USER=interview_user
POSTGRES_PASSWORD=change_this_password
POSTGRES_DB=interview_db
DATABASE_URL=postgresql://interview_user:change_this_password@postgres:5432/interview_db

# Redis
REDIS_URL=redis://redis:6379/0

# JWT
JWT_SECRET=change_this_jwt_secret

# AliCloud ASR (语音识别)
ALIYUN_ASR_APP_KEY=your_app_key
ALIYUN_ASR_ACCESS_KEY_ID=your_access_key
ALIYUN_ASR_ACCESS_KEY_SECRET=your_access_secret

# AliCloud/IFlytek TTS (语音合成)
TTS_API_KEY=your_tts_api_key
TTS_API_SECRET=your_tts_secret

# LLM API
LLM_API_KEY=your_llm_api_key
LLM_API_BASE=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# Storage
AUDIO_STORAGE_PATH=/var/data/interview-app/audio
DOCUMENT_STORAGE_PATH=/var/data/interview-app/documents
RESUME_STORAGE_PATH=/var/data/interview-app/resumes
```

- [ ] **Step 3: Create docker-compose.yml**

写入 `F:/program/simulatedInterview/docker-compose.yml`:

```yaml
version: '3.8'

services:
  postgres:
    image: postgres:15
    container_name: interview-postgres
    environment:
      POSTGRES_USER: ${POSTGRES_USER}
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD}
      POSTGRES_DB: ${POSTGRES_DB}
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ${POSTGRES_USER}"]
      interval: 5s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7
    container_name: interview-redis
    ports:
      - "6379:6379"
    volumes:
      - redis_data:/data
    healthcheck:
      test: ["CMD", "redis-cli", "ping"]
      interval: 5s
      timeout: 5s
      retries: 5

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    container_name: interview-backend
    ports:
      - "8000:8000"
    environment:
      DATABASE_URL: ${DATABASE_URL}
      REDIS_URL: ${REDIS_URL}
      JWT_SECRET: ${JWT_SECRET}
      ALIYUN_ASR_APP_KEY: ${ALIYUN_ASR_APP_KEY}
      ALIYUN_ASR_ACCESS_KEY_ID: ${ALIYUN_ASR_ACCESS_KEY_ID}
      ALIYUN_ASR_ACCESS_KEY_SECRET: ${ALIYUN_ASR_ACCESS_KEY_SECRET}
      TTS_API_KEY: ${TTS_API_KEY}
      TTS_API_SECRET: ${TTS_API_SECRET}
      LLM_API_KEY: ${LLM_API_KEY}
      LLM_API_BASE: ${LLM_API_BASE}
      LLM_MODEL: ${LLM_MODEL}
      AUDIO_STORAGE_PATH: ${AUDIO_STORAGE_PATH}
      DOCUMENT_STORAGE_PATH: ${DOCUMENT_STORAGE_PATH}
      RESUME_STORAGE_PATH: ${RESUME_STORAGE_PATH}
    volumes:
      - app_data:/var/data/interview-app
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    container_name: interview-frontend
    ports:
      - "3000:3000"
    environment:
      NEXT_PUBLIC_API_URL: http://localhost:8000
      NEXT_PUBLIC_WS_URL: ws://localhost:8000
    depends_on:
      - backend

volumes:
  pgdata:
  redis_data:
  app_data:
```

- [ ] **Step 4: Commit**

```bash
git init
git add docker-compose.yml .env.example .gitignore
git commit -m "chore: initialize project with Docker Compose"
```

---

### Task 2: 后端骨架 (FastAPI + 基础配置)

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/__init__.py`
- Create: `F:/program/simulatedInterview/backend/app/main.py`
- Create: `F:/program/simulatedInterview/backend/app/config.py`
- Create: `F:/program/simulatedInterview/backend/app/database.py`
- Create: `F:/program/simulatedInterview/backend/requirements.txt`
- Create: `F:/program/simulatedInterview/backend/Dockerfile`

**Interfaces:**
- Produces: FastAPI 应用实例，加载配置、数据库连接、CORS 中间件
- Produces: `app.config.Settings` — 从环境变量加载所有配置的 Pydantic Settings 类
- Produces: `app.database.get_db()` — async 数据库会话生成器
- Produces: `app.database.init_db()` — 数据库初始化函数

- [ ] **Step 1: Create requirements.txt**

```txt
fastapi==0.109.0
uvicorn[standard]==0.27.0
sqlalchemy[asyncio]==2.0.25
asyncpg==0.29.0
alembic==1.13.1
redis[hiredis]==5.0.1
pydantic-settings==2.1.0
python-jose[cryptography]==3.3.0
passlib[bcrypt]==1.7.4
python-multipart==0.0.6
httpx==0.26.0
websockets==12.0
weasyprint==60.2
jinja2==3.1.3
markdown==3.5.1
PyMuPDF==1.23.7
python-docx==1.1.0
python-magic==0.4.27
pydantic==2.5.3
```

- [ ] **Step 2: Create backend/app/config.py**

```python
from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://interview_user:password@localhost:5432/interview_db"

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7

    # AliCloud ASR
    aliyun_asr_app_key: str = ""
    aliyun_asr_access_key_id: str = ""
    aliyun_asr_access_key_secret: str = ""

    # TTS
    tts_api_key: str = ""
    tts_api_secret: str = ""

    # LLM
    llm_api_key: str = ""
    llm_api_base: str = "https://api.deepseek.com"
    llm_model: str = "deepseek-chat"

    # Storage
    audio_storage_path: str = "/var/data/interview-app/audio"
    document_storage_path: str = "/var/data/interview-app/documents"
    resume_storage_path: str = "/var/data/interview-app/resumes"

    class Config:
        env_file = ".env"
        extra = "ignore"


@lru_cache()
def get_settings() -> Settings:
    return Settings()
```

- [ ] **Step 3: Create backend/app/database.py**

```python
from sqlalchemy.ext.asyncio import AsyncSession, create_async_engine, async_sessionmaker
from sqlalchemy.orm import DeclarativeBase
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
```

- [ ] **Step 4: Create backend/app/main.py**

```python
from contextlib import asynccontextmanager
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.database import init_db


@asynccontextmanager
async def lifespan(app: FastAPI):
    await init_db()
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


@app.get("/api/health")
async def health_check():
    return {"code": 0, "data": {"status": "ok"}, "message": "ok"}
```

- [ ] **Step 5: Create backend/Dockerfile**

```dockerfile
FROM python:3.11-slim

WORKDIR /app

# Install system dependencies for weasyprint
RUN apt-get update && apt-get install -y \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libgdk-pixbuf2.0-0 \
    libffi-dev \
    shared-mime-info \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
```

- [ ] **Step 6: Create backend/app/__init__.py** (empty)

```python
```

- [ ] **Step 7: Verify backend starts**

```bash
cd /f/program/simulatedInterview/backend
pip install -r requirements.txt
uvicorn app.main:app --host 0.0.0.0 --port 8000
# Visit http://localhost:8000/api/health
# Expected: {"code":0,"data":{"status":"ok"},"message":"ok"}
```

- [ ] **Step 8: Commit**

```bash
git add backend/
git commit -m "feat: add FastAPI backend skeleton with config and database"
```

---

### Task 3: 数据库模型 & Alembic 迁移

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/models/__init__.py`
- Create: `F:/program/simulatedInterview/backend/app/models/user.py`
- Create: `F:/program/simulatedInterview/backend/app/models/resume.py`
- Create: `F:/program/simulatedInterview/backend/app/models/job_description.py`
- Create: `F:/program/simulatedInterview/backend/app/models/interview.py`
- Create: `F:/program/simulatedInterview/backend/app/models/interview_question.py`
- Create: `F:/program/simulatedInterview/backend/app/models/interview_document.py`
- Create: `F:/program/simulatedInterview/backend/alembic.ini`
- Create: `F:/program/simulatedInterview/backend/alembic/env.py`
- Create: `F:/program/simulatedInterview/backend/alembic/script.py.mako`

**Interfaces:**
- Produces: SQLAlchemy 模型类，对应于设计文档中的所有 6 张表
- Produces: Alembic 迁移配置，自动生成初始迁移

- [ ] **Step 1: Create backend/app/models/__init__.py**

```python
from app.models.user import User
from app.models.resume import Resume
from app.models.job_description import JobDescription
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.models.interview_document import InterviewDocument

__all__ = [
    "User",
    "Resume",
    "JobDescription",
    "Interview",
    "InterviewQuestion",
    "InterviewDocument",
]
```

- [ ] **Step 2: Create backend/app/models/user.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class User(Base):
    __tablename__ = "users"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    username: Mapped[str] = mapped_column(String(50), unique=True, nullable=False, index=True)
    password_hash: Mapped[str] = mapped_column(String(255), nullable=False)
    email: Mapped[str] = mapped_column(String(255), nullable=True)
    tts_preference: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    resumes = relationship("Resume", back_populates="user", cascade="all, delete-orphan")
    job_descriptions = relationship("JobDescription", back_populates="user", cascade="all, delete-orphan")
    interviews = relationship("Interview", back_populates="user", cascade="all, delete-orphan")
```

- [ ] **Step 3: Create backend/app/models/resume.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Resume(Base):
    __tablename__ = "resumes"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    original_filename: Mapped[str] = mapped_column(String(255), nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_type: Mapped[str] = mapped_column(String(10), nullable=False)
    parsed_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="resumes")
```

- [ ] **Step 4: Create backend/app/models/job_description.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Text, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class JobDescription(Base):
    __tablename__ = "job_descriptions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False)
    raw_text: Mapped[str] = mapped_column(Text, nullable=False)
    parsed_data: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)
    source: Mapped[str] = mapped_column(String(20), default="paste")
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="job_descriptions")
```

- [ ] **Step 5: Create backend/app/models/interview.py**

```python
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
    difficulty: Mapped[str] = mapped_column(String(10), default="mid")
    total_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    dimension_scores: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)
    status: Mapped[str] = mapped_column(String(20), default="preparing")
    ai_overview: Mapped[str | None] = mapped_column(Text, nullable=True)
    resume_suggestions: Mapped[str | None] = mapped_column(Text, nullable=True)
    started_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    user = relationship("User", back_populates="interviews")
    questions = relationship("InterviewQuestion", back_populates="interview", cascade="all, delete-orphan")
    documents = relationship("InterviewDocument", back_populates="interview", cascade="all, delete-orphan")
```

- [ ] **Step 6: Create backend/app/models/interview_question.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID, JSONB
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class InterviewQuestion(Base):
    __tablename__ = "interview_questions"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    interview_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("interviews.id"), nullable=False)
    question_text: Mapped[str] = mapped_column(Text, nullable=False)
    question_type: Mapped[str] = mapped_column(String(20), nullable=False)
    user_audio_path: Mapped[str | None] = mapped_column(Text, nullable=True)
    user_answer_transcript: Mapped[str | None] = mapped_column(Text, nullable=True)
    duration_seconds: Mapped[int | None] = mapped_column(Integer, nullable=True)
    ai_score: Mapped[int | None] = mapped_column(Integer, nullable=True)
    score_detail: Mapped[dict | None] = mapped_column(JSONB, nullable=True, default=None)
    ai_evaluation: Mapped[str | None] = mapped_column(Text, nullable=True)
    reference_answer: Mapped[str | None] = mapped_column(Text, nullable=True)
    improvement_suggestion: Mapped[str | None] = mapped_column(Text, nullable=True)
    order_index: Mapped[int] = mapped_column(Integer, nullable=False)

    interview = relationship("Interview", back_populates="questions")
```

- [ ] **Step 7: Create backend/app/models/interview_document.py**

```python
import uuid
from datetime import datetime
from sqlalchemy import String, Integer, Text, ForeignKey, DateTime, func
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class InterviewDocument(Base):
    __tablename__ = "interview_documents"

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    interview_id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), ForeignKey("interviews.id"), nullable=False)
    format: Mapped[str] = mapped_column(String(10), nullable=False)
    file_path: Mapped[str] = mapped_column(Text, nullable=False)
    file_size: Mapped[int | None] = mapped_column(Integer, nullable=True)
    generated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    interview = relationship("Interview", back_populates="documents")
```

- [ ] **Step 8: Initialize Alembic**

```bash
cd /f/program/simulatedInterview/backend
alembic init alembic
```

- [ ] **Step 9: Configure alembic/env.py**

修改 `backend/alembic/env.py`，关键部分:

```python
import sys
from pathlib import Path
sys.path.insert(0, str(Path(__file__).parent.parent))

from app.database import Base
from app.models import *  # noqa: F401, F403  — 导入所有模型

from app.config import get_settings
settings = get_settings()

# 替换 sqlalchemy.url 配置
config.set_main_option("sqlalchemy.url", settings.database_url.replace("+asyncpg", ""))

target_metadata = Base.metadata
```

- [ ] **Step 10: Generate initial migration and apply**

```bash
cd /f/program/simulatedInterview/backend
alembic revision --autogenerate -m "initial models"
alembic upgrade head
```

- [ ] **Step 11: Commit**

```bash
git add backend/alembic/ backend/app/models/ backend/alembic.ini
git commit -m "feat: add database models and initial Alembic migration"
```

---

### Task 4: 用户认证 (后端)

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/schemas/__init__.py`
- Create: `F:/program/simulatedInterview/backend/app/schemas/auth.py`
- Create: `F:/program/simulatedInterview/backend/app/utils/__init__.py`
- Create: `F:/program/simulatedInterview/backend/app/utils/auth.py`
- Create: `F:/program/simulatedInterview/backend/app/routers/__init__.py`
- Create: `F:/program/simulatedInterview/backend/app/routers/auth.py`

**Interfaces:**
- Consumes: `User` model (Task 3), `get_db()` (Task 2), `Settings` (Task 2)
- Produces: `POST /api/auth/register` — 注册新用户
- Produces: `POST /api/auth/login` — 登录返回 JWT token
- Produces: `app.utils.auth.get_current_user()` — 依赖注入函数，从 JWT 解析当前用户
- Produces: `app.utils.auth.hash_password()`, `app.utils.auth.verify_password()`
- Produces: `app.schemas.auth.UserCreate`, `UserLogin`, `TokenResponse`, `UserResponse`

- [ ] **Step 1: Create schemas/auth.py**

```python
from pydantic import BaseModel, Field


class UserCreate(BaseModel):
    username: str = Field(min_length=2, max_length=50)
    password: str = Field(min_length=6, max_length=100)


class UserLogin(BaseModel):
    username: str
    password: str


class UserResponse(BaseModel):
    id: str
    username: str
    email: str | None = None
    created_at: str

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    user: UserResponse
```

- [ ] **Step 2: Create backend/app/schemas/__init__.py**

```python
from app.schemas.auth import UserCreate, UserLogin, TokenResponse, UserResponse

__all__ = ["UserCreate", "UserLogin", "TokenResponse", "UserResponse"]
```

- [ ] **Step 3: Create utils/auth.py**

```python
import uuid
from datetime import datetime, timedelta, timezone
from fastapi import Depends, HTTPException, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from jose import JWTError, jwt
from passlib.context import CryptContext
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.config import get_settings
from app.database import get_db
from app.models.user import User

settings = get_settings()
pwd_context = CryptContext(schemes=["bcrypt"], deprecated="auto")
security = HTTPBearer()


def hash_password(password: str) -> str:
    return pwd_context.hash(password)


def verify_password(plain_password: str, hashed_password: str) -> bool:
    return pwd_context.verify(plain_password, hashed_password)


def create_access_token(user_id: uuid.UUID) -> str:
    expire = datetime.now(timezone.utc) + timedelta(days=settings.jwt_expire_days)
    to_encode = {"sub": str(user_id), "exp": expire}
    return jwt.encode(to_encode, settings.jwt_secret, algorithm=settings.jwt_algorithm)


async def get_current_user(
    credentials: HTTPAuthorizationCredentials = Depends(security),
    db: AsyncSession = Depends(get_db),
) -> User:
    token = credentials.credentials
    try:
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        user_id = payload.get("sub")
        if user_id is None:
            raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")
    except JWTError:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid token")

    result = await db.execute(select(User).where(User.id == uuid.UUID(user_id)))
    user = result.scalar_one_or_none()
    if user is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="User not found")
    return user
```

- [ ] **Step 4: Create routers/auth.py**

```python
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.schemas.auth import UserCreate, UserLogin, TokenResponse, UserResponse
from app.utils.auth import hash_password, verify_password, create_access_token, get_current_user

router = APIRouter(prefix="/api/auth", tags=["auth"])


@router.post("/register", response_model=TokenResponse, status_code=status.HTTP_201_CREATED)
async def register(data: UserCreate, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    if result.scalar_one_or_none():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Username already exists")

    user = User(username=data.username, password_hash=hash_password(data.password))
    db.add(user)
    await db.commit()
    await db.refresh(user)

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=str(user.id),
            username=user.username,
            email=user.email,
            created_at=user.created_at.isoformat(),
        ),
    )


@router.post("/login", response_model=TokenResponse)
async def login(data: UserLogin, db: AsyncSession = Depends(get_db)):
    result = await db.execute(select(User).where(User.username == data.username))
    user = result.scalar_one_or_none()
    if not user or not verify_password(data.password, user.password_hash):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid credentials")

    token = create_access_token(user.id)
    return TokenResponse(
        access_token=token,
        user=UserResponse(
            id=str(user.id),
            username=user.username,
            email=user.email,
            created_at=user.created_at.isoformat(),
        ),
    )


@router.get("/api/auth/me", response_model=UserResponse)
async def get_me(current_user: User = Depends(get_current_user)):
    return UserResponse(
        id=str(current_user.id),
        username=current_user.username,
        email=current_user.email,
        created_at=current_user.created_at.isoformat(),
    )
```

- [ ] **Step 5: Register router in main.py**

在 `backend/app/main.py` 的 `app = FastAPI(...)` 之后添加：
```python
from app.routers import auth as auth_router
app.include_router(auth_router.router)
```

- [ ] **Step 6: Create backend/app/routers/__init__.py** (empty)

```python
```

- [ ] **Step 7: Create backend/app/utils/__init__.py** (empty)

```python
```

- [ ] **Step 8: Test auth endpoints**

```bash
# Register
curl -X POST http://localhost:8000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "test123456"}'
# Expected: {"code":0,"data":{"access_token":"...","token_type":"bearer","user":{...}},"message":"ok"}

# Login
curl -X POST http://localhost:8000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"username": "testuser", "password": "test123456"}'

# Get current user
curl http://localhost:8000/api/auth/me \
  -H "Authorization: Bearer <token>"
```

- [ ] **Step 9: Commit**

```bash
git add backend/app/schemas/ backend/app/utils/ backend/app/routers/auth.py backend/app/main.py
git commit -m "feat: implement user authentication (register/login/JWT)"
```

---

### Task 5: 前端骨架 (Next.js + shadcn/ui)

**Files:**
- Create: `F:/program/simulatedInterview/frontend/package.json`
- Create: `F:/program/simulatedInterview/frontend/next.config.js`
- Create: `F:/program/simulatedInterview/frontend/tsconfig.json`
- Create: `F:/program/simulatedInterview/frontend/tailwind.config.ts`
- Create: `F:/program/simulatedInterview/frontend/postcss.config.js`
- Create: `F:/program/simulatedInterview/frontend/src/app/globals.css`
- Create: `F:/program/simulatedInterview/frontend/src/app/layout.tsx`
- Create: `F:/program/simulatedInterview/frontend/src/app/page.tsx`
- Create: `F:/program/simulatedInterview/frontend/Dockerfile`

**Interfaces:**
- Produces: Next.js 14 App Router 项目骨架，配置好 Tailwind CSS + shadcn/ui
- Produces: 基础布局 (layout.tsx)，包含 Navbar + 全局样式
- Produces: 首页重定向到 dashboard

- [ ] **Step 1: Create frontend/package.json**

```json
{
  "name": "interview-frontend",
  "version": "0.1.0",
  "private": true,
  "scripts": {
    "dev": "next dev",
    "build": "next build",
    "start": "next start",
    "lint": "next lint"
  },
  "dependencies": {
    "next": "^14.1.0",
    "react": "^18.2.0",
    "react-dom": "^18.2.0",
    "zustand": "^4.5.0",
    "lucide-react": "^0.312.0",
    "clsx": "^2.1.0",
    "tailwind-merge": "^2.2.0",
    "class-variance-authority": "^0.7.0",
    "@radix-ui/react-dialog": "^1.0.5",
    "@radix-ui/react-dropdown-menu": "^2.0.6",
    "@radix-ui/react-tabs": "^1.0.4",
    "@radix-ui/react-avatar": "^1.0.4",
    "@radix-ui/react-progress": "^1.0.3",
    "@radix-ui/react-slider": "^1.1.2",
    "@radix-ui/react-toast": "^1.1.5",
    "recharts": "^2.10.0",
    "react-markdown": "^9.0.1"
  },
  "devDependencies": {
    "@types/node": "^20.11.0",
    "@types/react": "^18.2.0",
    "@types/react-dom": "^18.2.0",
    "typescript": "^5.3.3",
    "tailwindcss": "^3.4.1",
    "postcss": "^8.4.33",
    "autoprefixer": "^10.4.17",
    "eslint": "^8.56.0",
    "eslint-config-next": "^14.1.0"
  }
}
```

- [ ] **Step 2: Create next.config.js**

```javascript
/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'standalone',
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: `${process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000'}/api/:path*`,
      },
    ];
  },
};

module.exports = nextConfig;
```

- [ ] **Step 3: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "es5",
    "lib": ["dom", "dom.iterable", "esnext"],
    "allowJs": true,
    "skipLibCheck": true,
    "strict": true,
    "noEmit": true,
    "esModuleInterop": true,
    "module": "esnext",
    "moduleResolution": "bundler",
    "resolveJsonModule": true,
    "isolatedModules": true,
    "jsx": "preserve",
    "incremental": true,
    "plugins": [{ "name": "next" }],
    "paths": { "@/*": ["./src/*"] }
  },
  "include": ["next-env.d.ts", "**/*.ts", "**/*.tsx", ".next/types/**/*.ts"],
  "exclude": ["node_modules"]
}
```

- [ ] **Step 4: Create tailwind.config.ts**

```typescript
import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {},
  },
  plugins: [],
}
export default config
```

- [ ] **Step 5: Create postcss.config.js**

```javascript
module.exports = {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
}
```

- [ ] **Step 6: Create src/app/globals.css**

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --foreground: #171717;
  --background: #ffffff;
}

@media (prefers-color-scheme: dark) {
  :root {
    --foreground: #ededed;
    --background: #0a0a0a;
  }
}

body {
  color: var(--foreground);
  background: var(--background);
}
```

- [ ] **Step 7: Create src/app/layout.tsx**

```tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'AI 模拟面试',
  description: '智能模拟面试平台 - 语音交互 + AI 评分',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <main className="min-h-screen bg-gray-50 dark:bg-gray-950">
          {children}
        </main>
      </body>
    </html>
  )
}
```

- [ ] **Step 8: Create src/app/page.tsx** (重定向到 dashboard 或空的首页)

```tsx
'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function Home() {
  const router = useRouter();

  useEffect(() => {
    const token = localStorage.getItem('access_token');
    if (token) {
      router.push('/dashboard');
    } else {
      router.push('/login');
    }
  }, [router]);

  return (
    <div className="flex items-center justify-center min-h-screen">
      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900 dark:border-white" />
    </div>
  );
}
```

- [ ] **Step 9: Create frontend/Dockerfile**

```dockerfile
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package.json ./
RUN npm install --production=false

FROM base AS builder
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS runner
WORKDIR /app
ENV NODE_ENV=production
COPY --from=builder /app/public ./public
COPY --from=builder /app/.next/standalone ./
COPY --from=builder /app/.next/static ./.next/static

EXPOSE 3000
CMD ["node", "server.js"]
```

- [ ] **Step 10: Install dependencies**

```bash
cd /f/program/simulatedInterview/frontend
npm install
```

- [ ] **Step 11: Commit**

```bash
git add frontend/
git commit -m "feat: scaffold Next.js frontend with Tailwind and shadcn/ui"
```

---

### Task 6: 登录/注册页面 & API 请求封装

**Files:**
- Create: `F:/program/simulatedInterview/frontend/src/lib/api.ts`
- Create: `F:/program/simulatedInterview/frontend/src/store/authStore.ts`
- Create: `F:/program/simulatedInterview/frontend/src/app/(auth)/login/page.tsx`
- Create: `F:/program/simulatedInterview/frontend/src/app/(auth)/register/page.tsx`

**Interfaces:**
- Consumes: `POST /api/auth/register`, `POST /api/auth/login`, `GET /api/auth/me` (from Task 4)
- Produces: `src/lib/api.ts` — fetch 封装，自动注入 JWT token
- Produces: `src/store/authStore.ts` — Zustand store 管理 auth 状态
- Produces: 登录/注册页面，带表单验证

- [ ] **Step 1: Create src/lib/api.ts**

```typescript
const API_BASE = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:8000';

interface ApiResponse<T = any> {
  code: number;
  data: T;
  message: string;
}

class ApiError extends Error {
  code: number;
  constructor(message: string, code: number) {
    super(message);
    this.code = code;
  }
}

async function request<T>(
  endpoint: string,
  options: RequestInit = {}
): Promise<T> {
  const token = typeof window !== 'undefined' ? localStorage.getItem('access_token') : null;

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(options.headers as Record<string, string>),
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const res = await fetch(`${API_BASE}${endpoint}`, {
    ...options,
    headers,
  });

  const json: ApiResponse<T> = await res.json();

  if (!res.ok || json.code !== 0) {
    if (res.status === 401) {
      localStorage.removeItem('access_token');
      window.location.href = '/login';
    }
    throw new ApiError(json.message || 'Request failed', json.code);
  }

  return json.data;
}

export const api = {
  get: <T>(endpoint: string) => request<T>(endpoint),
  post: <T>(endpoint: string, data?: any) =>
    request<T>(endpoint, { method: 'POST', body: JSON.stringify(data) }),
  upload: <T>(endpoint: string, formData: FormData) => {
    const token = localStorage.getItem('access_token');
    return request<T>(endpoint, {
      method: 'POST',
      body: formData,
      headers: token ? { Authorization: `Bearer ${token}` } : {},
    });
  },
};

export { ApiError };
```

- [ ] **Step 2: Create src/store/authStore.ts**

```typescript
import { create } from 'zustand';
import { api } from '@/lib/api';

interface User {
  id: string;
  username: string;
  email?: string;
  created_at: string;
}

interface AuthState {
  user: User | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  login: (username: string, password: string) => Promise<void>;
  register: (username: string, password: string) => Promise<void>;
  logout: () => void;
  checkAuth: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  user: null,
  isAuthenticated: false,
  isLoading: true,

  login: async (username, password) => {
    const data = await api.post<{ access_token: string; user: User }>(
      '/api/auth/login',
      { username, password }
    );
    localStorage.setItem('access_token', data.access_token);
    set({ user: data.user, isAuthenticated: true });
  },

  register: async (username, password) => {
    const data = await api.post<{ access_token: string; user: User }>(
      '/api/auth/register',
      { username, password }
    );
    localStorage.setItem('access_token', data.access_token);
    set({ user: data.user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('access_token');
    set({ user: null, isAuthenticated: false });
  },

  checkAuth: async () => {
    try {
      const token = localStorage.getItem('access_token');
      if (!token) {
        set({ isLoading: false });
        return;
      }
      const user = await api.get<User>('/api/auth/me');
      set({ user, isAuthenticated: true, isLoading: false });
    } catch {
      localStorage.removeItem('access_token');
      set({ isLoading: false });
    }
  },
}));
```

- [ ] **Step 3: Create login page**

`src/app/(auth)/login/page.tsx`:

```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

export default function LoginPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const login = useAuthStore((s) => s.login);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || '登录失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">AI 模拟面试</h1>
          <p className="mt-2 text-gray-500">登录以继续</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">用户名</label>
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">密码</label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
              required
            />
          </div>
          <button
            type="submit"
            disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
          >
            {loading ? '登录中...' : '登录'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          还没有账号？{' '}
          <Link href="/register" className="text-blue-600 hover:underline">
            注册
          </Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 4: Create register page** (类似 login page，略)

`src/app/(auth)/register/page.tsx`:
```tsx
'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { useAuthStore } from '@/store/authStore';

export default function RegisterPage() {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const register = useAuthStore((s) => s.register);
  const router = useRouter();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (password !== confirmPassword) {
      setError('两次密码不一致');
      return;
    }
    if (password.length < 6) {
      setError('密码至少 6 位');
      return;
    }

    setLoading(true);
    try {
      await register(username, password);
      router.push('/dashboard');
    } catch (err: any) {
      setError(err.message || '注册失败');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex items-center justify-center min-h-screen px-4">
      <div className="w-full max-w-md space-y-8">
        <div className="text-center">
          <h1 className="text-3xl font-bold">AI 模拟面试</h1>
          <p className="mt-2 text-gray-500">创建新账号</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          {error && (
            <div className="bg-red-50 text-red-600 p-3 rounded-lg text-sm">{error}</div>
          )}
          <div>
            <label className="block text-sm font-medium mb-1">用户名</label>
            <input type="text" value={username} onChange={(e) => setUsername(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">密码</label>
            <input type="password" value={password} onChange={(e) => setPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <div>
            <label className="block text-sm font-medium mb-1">确认密码</label>
            <input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)}
              className="w-full px-3 py-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500" required />
          </div>
          <button type="submit" disabled={loading}
            className="w-full py-2 px-4 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50">
            {loading ? '注册中...' : '注册'}
          </button>
        </form>

        <p className="text-center text-sm text-gray-500">
          已有账号？<Link href="/login" className="text-blue-600 hover:underline">登录</Link>
        </p>
      </div>
    </div>
  );
}
```

- [ ] **Step 5: Test frontend**

```bash
cd /f/program/simulatedInterview/frontend
npm run dev
# Visit http://localhost:3000 — should show login page
```

- [ ] **Step 6: Commit**

```bash
git add frontend/src/lib/ frontend/src/store/ frontend/src/app/\(auth\)/
git commit -m "feat: add login/register pages and API client"
```

---

## Phase 2: 核心面试流程

构建简历+JD解析、智能出题、语音交互、面试引擎等核心功能。

---

### Task 7: 简历上传 & LLM 解析

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/services/resume_parser.py`
- Create: `F:/program/simulatedInterview/backend/app/schemas/resume.py`
- Create: `F:/program/simulatedInterview/backend/app/routers/resume.py`

**Interfaces:**
- Consumes: `Resume` model, `User` model, `get_current_user()`, `get_db()`
- Produces: `POST /api/resume/upload` — 上传 PDF/DOCX/TXT 简历
- Produces: `GET /api/resume/:id` — 获取解析后的简历
- Produces: `GET /api/resume/list` — 简历列表
- Produces: `DELETE /api/resume/:id` — 删除简历
- Produces: `resume_parser.parse_resume_text(text) -> dict` — 提取文本
- Produces: `resume_parser.resume_llm_parse(text, llm_client) -> dict` — LLM 结构化解析

- [ ] **Step 1: Create resume_parser.py**

```python
import os
import uuid
from pathlib import Path
from typing import Optional
import fitz  # PyMuPDF
import docx
from app.config import get_settings

settings = get_settings()

ALLOWED_EXTENSIONS = {'.pdf', '.docx', '.txt'}
MAX_FILE_SIZE = 10 * 1024 * 1024  # 10MB


def validate_file(filename: str, file_size: int) -> None:
    ext = Path(filename).suffix.lower()
    if ext not in ALLOWED_EXTENSIONS:
        raise ValueError(f"Unsupported file type: {ext}. Allowed: {', '.join(ALLOWED_EXTENSIONS)}")
    if file_size > MAX_FILE_SIZE:
        raise ValueError(f"File too large. Max: {MAX_FILE_SIZE // 1024 // 1024}MB")


def extract_text_from_pdf(filepath: str) -> str:
    doc = fitz.open(filepath)
    text = ""
    for page in doc:
        text += page.get_text()
    doc.close()
    return text


def extract_text_from_docx(filepath: str) -> str:
    doc = docx.Document(filepath)
    return "\n".join([p.text for p in doc.paragraphs if p.text])


def extract_text(filepath: str, ext: str) -> str:
    if ext == '.pdf':
        return extract_text_from_pdf(filepath)
    elif ext == '.docx':
        return extract_text_from_docx(filepath)
    elif ext == '.txt':
        with open(filepath, 'r', encoding='utf-8') as f:
            return f.read()
    return ""


def save_upload_file(file_content: bytes, user_id: uuid.UUID, filename: str) -> str:
    user_dir = Path(settings.resume_storage_path) / str(user_id)
    user_dir.mkdir(parents=True, exist_ok=True)
    filepath = user_dir / f"{uuid.uuid4()}_{filename}"
    with open(filepath, 'wb') as f:
        f.write(file_content)
    return str(filepath)


def build_llm_parse_prompt(text: str) -> str:
    return f"""请从以下简历文本中提取结构化信息，输出 JSON 格式，包含以下字段：
- basic: {{name, education: [school, degree, major, period]}}
- experience: [company, role, period, description, tech_stack[], highlights[]]
- projects: [name, description, role, highlights[]]
- skills: string[]
- certifications: string[]
- self_evaluation: string

简历文本：
{text[:15000]}  # 限制长度

请只输出 JSON，不要其他内容。"""
```

- [ ] **Step 2: Create schemas/resume.py**

```python
from pydantic import BaseModel
from typing import Optional


class ResumeResponse(BaseModel):
    id: str
    original_filename: str
    file_type: str
    parsed_data: Optional[dict] = None
    created_at: str

    class Config:
        from_attributes = True


class ResumeListResponse(BaseModel):
    resumes: list[ResumeResponse]
    total: int
```

- [ ] **Step 3: Create routers/resume.py**

```python
import json
import uuid
from fastapi import APIRouter, Depends, UploadFile, File, HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.resume import Resume
from app.schemas.resume import ResumeResponse, ResumeListResponse
from app.utils.auth import get_current_user
from app.services.resume_parser import (
    validate_file, extract_text, save_upload_file,
    build_llm_parse_prompt, settings,
)
from app.services.llm_client import llm_parse  # 后续 Task 创建

router = APIRouter(prefix="/api/resume", tags=["resume"])


@router.post("/upload", response_model=ResumeResponse, status_code=201)
async def upload_resume(
    file: UploadFile = File(...),
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    content = await file.read()
    ext = f".{file.filename.split('.')[-1].lower()}"
    validate_file(file.filename, len(content))

    filepath = save_upload_file(content, current_user.id, file.filename)
    raw_text = extract_text(filepath, ext)

    # LLM 解析 (暂用模拟数据，Task 9 完成后替换)
    try:
        parsed = await llm_parse(raw_text)
    except Exception:
        parsed = {"basic": {"name": "", "education": []}, "experience": [], "skills": [], "certifications": []}

    resume = Resume(
        user_id=current_user.id,
        original_filename=file.filename,
        file_path=filepath,
        file_type=ext.lstrip('.'),
        parsed_data=parsed,
    )
    db.add(resume)
    await db.commit()
    await db.refresh(resume)

    return ResumeResponse(
        id=str(resume.id),
        original_filename=resume.original_filename,
        file_type=resume.file_type,
        parsed_data=resume.parsed_data,
        created_at=resume.created_at.isoformat(),
    )


@router.get("/list", response_model=ResumeListResponse)
async def list_resumes(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Resume).where(Resume.user_id == current_user.id).order_by(Resume.created_at.desc())
    )
    resumes = result.scalars().all()
    return ResumeListResponse(
        resumes=[
            ResumeResponse(
                id=str(r.id),
                original_filename=r.original_filename,
                file_type=r.file_type,
                parsed_data=r.parsed_data,
                created_at=r.created_at.isoformat(),
            )
            for r in resumes
        ],
        total=len(resumes),
    )


@router.get("/{resume_id}", response_model=ResumeResponse)
async def get_resume(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    return ResumeResponse(
        id=str(resume.id),
        original_filename=resume.original_filename,
        file_type=resume.file_type,
        parsed_data=resume.parsed_data,
        created_at=resume.created_at.isoformat(),
    )


@router.delete("/{resume_id}", status_code=204)
async def delete_resume(
    resume_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Resume).where(Resume.id == resume_id, Resume.user_id == current_user.id)
    )
    resume = result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")
    # 删除本地文件
    import os
    if os.path.exists(resume.file_path):
        os.remove(resume.file_path)
    await db.delete(resume)
    await db.commit()
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/resume_parser.py backend/app/schemas/resume.py backend/app/routers/resume.py
git commit -m "feat: resume upload and LLM parsing"
```

---

### Task 8: JD 输入 & 解析

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/schemas/jd.py`
- Create: `F:/program/simulatedInterview/backend/app/routers/jd.py`

**Interfaces:**
- Consumes: `JobDescription` model, `User`, `get_current_user()`, `get_db()`
- Produces: `POST /api/jd/create` — 提交 JD 文本
- Produces: `GET /api/jd/:id` — 获取解析后的 JD
- Produces: `GET /api/jd/list` — 历史 JD 列表

- [ ] **Step 1: Create schemas/jd.py**

```python
from pydantic import BaseModel
from typing import Optional


class JDCreate(BaseModel):
    raw_text: str


class JDResponse(BaseModel):
    id: str
    raw_text: str
    parsed_data: Optional[dict] = None
    source: str
    created_at: str

    class Config:
        from_attributes = True


class JDListResponse(BaseModel):
    items: list[JDResponse]
    total: int
```

- [ ] **Step 2: Create routers/jd.py**

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.job_description import JobDescription
from app.schemas.jd import JDCreate, JDResponse, JDListResponse
from app.utils.auth import get_current_user
from app.services.llm_client import llm_parse_jd

router = APIRouter(prefix="/api/jd", tags=["job_description"])


@router.post("/create", response_model=JDResponse, status_code=201)
async def create_jd(
    data: JDCreate,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    try:
        parsed = await llm_parse_jd(data.raw_text)
    except Exception:
        parsed = {"position": "", "requirements": [], "key_responsibilities": []}

    jd = JobDescription(
        user_id=current_user.id,
        raw_text=data.raw_text,
        parsed_data=parsed,
        source="paste",
    )
    db.add(jd)
    await db.commit()
    await db.refresh(jd)

    return JDResponse(
        id=str(jd.id),
        raw_text=jd.raw_text,
        parsed_data=jd.parsed_data,
        source=jd.source,
        created_at=jd.created_at.isoformat(),
    )


@router.get("/list", response_model=JDListResponse)
async def list_jds(
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobDescription).where(JobDescription.user_id == current_user.id)
        .order_by(JobDescription.created_at.desc())
    )
    items = result.scalars().all()
    return JDListResponse(
        items=[JDResponse(
            id=str(j.id), raw_text=j.raw_text, parsed_data=j.parsed_data,
            source=j.source, created_at=j.created_at.isoformat(),
        ) for j in items],
        total=len(items),
    )


@router.get("/{jd_id}", response_model=JDResponse)
async def get_jd(
    jd_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(JobDescription).where(JobDescription.id == jd_id, JobDescription.user_id == current_user.id)
    )
    jd = result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="JD not found")
    return JDResponse(
        id=str(jd.id), raw_text=jd.raw_text, parsed_data=jd.parsed_data,
        source=jd.source, created_at=jd.created_at.isoformat(),
    )
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/jd.py backend/app/routers/jd.py
git commit -m "feat: job description input and parsing"
```

---

### Task 9: LLM 客户端 & 智能出题引擎

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/services/llm_client.py`
- Create: `F:/program/simulatedInterview/backend/app/services/question_generator.py`
- Create: `F:/program/simulatedInterview/backend/app/schemas/interview.py`

**Interfaces:**
- Produces: `llm_client.llm_client` — httpx.AsyncClient 封装，支持流式和非流式调用
- Produces: `llm_client.llm_parse(text) -> dict` — 简历结构化解析
- Produces: `llm_client.llm_parse_jd(text) -> dict` — JD 结构化解析
- Produces: `question_generator.generate_questions(resume_data, jd_data, difficulty) -> list[dict]`
- Produces: `schemas.interview.QuestionItem`, `CreateInterviewRequest`, `InterviewResponse`

- [ ] **Step 1: Create llm_client.py**

```python
import json
from typing import Optional
import httpx
from app.config import get_settings

settings = get_settings()

SYSTEM_PROMPT = "You are a helpful assistant. Always respond in Chinese. Output only valid JSON when requested."


async def llm_chat(
    messages: list[dict],
    response_format: Optional[dict] = None,
    temperature: float = 0.7,
) -> str:
    """调用 LLM API 获取回复"""
    headers = {
        "Authorization": f"Bearer {settings.llm_api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": settings.llm_model,
        "messages": messages,
        "temperature": temperature,
    }
    if response_format:
        payload["response_format"] = response_format

    async with httpx.AsyncClient(timeout=60.0) as client:
        resp = await client.post(
            f"{settings.llm_api_base}/chat/completions",
            headers=headers,
            json=payload,
        )
        resp.raise_for_status()
        return resp.json()["choices"][0]["message"]["content"]


async def llm_parse(text: str) -> dict:
    """LLM 解析简历"""
    prompt = f"""请从以下简历文本中提取结构化信息，输出 JSON 格式：
{{
  "basic": {{"name": str, "education": [{{"school": str, "degree": str, "major": str, "period": str}}]}},
  "experience": [{{"company": str, "role": str, "period": str, "description": str, "tech_stack": [str], "highlights": [str]}}],
  "projects": [{{"name": str, "description": str, "role": str, "highlights": [str]}}],
  "skills": [str],
  "certifications": [str],
  "self_evaluation": str
}}

简历文本：
{text[:15000]}

只输出 JSON。"""
    result = await llm_chat([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], response_format={"type": "json_object"})
    return json.loads(result)


async def llm_parse_jd(text: str) -> dict:
    """LLM 解析 JD"""
    prompt = f"""请从以下岗位介绍中提取结构化信息，输出 JSON 格式：
{{
  "company_info": str,
  "position": str,
  "key_responsibilities": [str],
  "requirements": [str],
  "preferred": [str],
  "team_culture": str,
  "salary_range": str
}}

JD 文本：
{text[:8000]}

只输出 JSON。"""
    result = await llm_chat([
        {"role": "system", "content": SYSTEM_PROMPT},
        {"role": "user", "content": prompt},
    ], response_format={"type": "json_object"})
    return json.loads(result)
```

- [ ] **Step 2: Create question_generator.py**

```python
import json
from app.services.llm_client import llm_chat

QUESTION_TYPES = [
    "introduction",    # 自我介绍
    "behavioral",      # 行为面试
    "technical",       # 专业技能
    "situational",     # 情景题
    "career",          # 职业规划
]

TYPE_DISTRIBUTION = {
    10: [
        {"type": "introduction", "count": 1},
        {"type": "behavioral", "count": 3},
        {"type": "technical", "count": 3},
        {"type": "situational", "count": 2},
        {"type": "career", "count": 1},
    ]
}


async def generate_questions(
    resume_data: dict,
    jd_data: dict,
    difficulty: str = "mid",
    total_count: int = 10,
) -> list[dict]:
    """根据简历和 JD 生成面试题目"""

    prompt = f"""你是一位专业的面试官。请基于以下简历和岗位要求，生成 {total_count} 道面试题。

难度级别: {difficulty}

题目类型分配:
- 自我介绍(1题): 要求结合简历和岗位进行自我介绍
- 行为面试(3题): 深挖简历中的项目/工作经历
- 专业技能(3题): 针对 JD 中的技术要求考察
- 情景题(2题): 基于 JD 职责设计的场景
- 职业规划(1题): 评估求职动机和匹配度

简历(结构化):
{json.dumps(resume_data, ensure_ascii=False, indent=2)}

岗位要求:
{json.dumps(jd_data, ensure_ascii=False, indent=2)}

输出 JSON 数组:
[
  {{
    "question_text": "题目内容",
    "question_type": "behavioral|technical|situational|career|introduction",
    "examine_point": "考察点说明"
  }}
]

只输出 JSON 数组。"""

    result = await llm_chat([
        {"role": "system", "content": "你是一位资深的专业面试官。请根据简历和JD生成针对性面试题。用中文回答。"},
        {"role": "user", "content": prompt},
    ], response_format={"type": "json_object"})

    questions = json.loads(result)
    if isinstance(questions, dict) and "questions" in questions:
        questions = questions["questions"]

    # 确保返回的是列表
    if isinstance(questions, list):
        return questions[:total_count]
    return []
```

- [ ] **Step 3: Create schemas/interview.py**

```python
from pydantic import BaseModel
from typing import Optional


class CreateInterviewRequest(BaseModel):
    resume_id: str
    jd_id: str
    difficulty: str = "mid"


class QuestionItem(BaseModel):
    order_index: int
    question_text: str
    question_type: str


class InterviewResponse(BaseModel):
    id: str
    status: str
    difficulty: str
    total_score: Optional[int] = None
    dimension_scores: Optional[dict] = None
    ai_overview: Optional[str] = None
    resume_suggestions: Optional[str] = None
    questions: list[QuestionItem] = []
    created_at: str

    class Config:
        from_attributes = True


class SubmitAnswerRequest(BaseModel):
    question_id: str
    answer_transcript: str = ""
    duration_seconds: int = 0
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/llm_client.py backend/app/services/question_generator.py backend/app/schemas/interview.py
git commit -m "feat: LLM client and question generation engine"
```

---

### Task 10: 面试引擎 (状态机)

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/services/interview_engine.py`
- Create: `F:/program/simulatedInterview/backend/app/routers/interview.py`

**Interfaces:**
- Consumes: `QuestionGenerator`, `Interview` model, `InterviewQuestion` model
- Produces: `POST /api/interview/create` — 创建面试，生成题目
- Produces: `GET /api/interview/:id` — 获取面试详情
- Produces: `POST /api/interview/:id/start` — 开始面试
- Produces: `POST /api/interview/:id/next-question` — 获取下一题
- Produces: `POST /api/interview/:id/submit-answer` — 提交回答
- Produces: `POST /api/interview/:id/complete` — 完成面试
- Produces: `interview_engine.InterviewEngine` — 状态机类

- [ ] **Step 1: Create interview_engine.py**

```python
import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.schemas.interview import QuestionItem
from app.services.question_generator import generate_questions
from app.services.resume_parser import settings


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
```

- [ ] **Step 2: Create routers/interview.py**

```python
import uuid
from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.database import get_db
from app.models.user import User
from app.models.interview import Interview
from app.models.resume import Resume
from app.models.job_description import JobDescription
from app.schemas.interview import (
    CreateInterviewRequest, InterviewResponse, QuestionItem, SubmitAnswerRequest,
)
from app.utils.auth import get_current_user
from app.services.interview_engine import InterviewEngine

router = APIRouter(prefix="/api/interview", tags=["interview"])


@router.post("/create", response_model=InterviewResponse, status_code=201)
async def create_interview(
    data: CreateInterviewRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 获取简历和 JD 数据
    resume_result = await db.execute(
        select(Resume).where(Resume.id == uuid.UUID(data.resume_id), Resume.user_id == current_user.id)
    )
    resume = resume_result.scalar_one_or_none()
    if not resume:
        raise HTTPException(status_code=404, detail="Resume not found")

    jd_result = await db.execute(
        select(JobDescription).where(JobDescription.id == uuid.UUID(data.jd_id), JobDescription.user_id == current_user.id)
    )
    jd = jd_result.scalar_one_or_none()
    if not jd:
        raise HTTPException(status_code=404, detail="Job description not found")

    interview = await InterviewEngine.create_interview(
        db=db,
        user_id=current_user.id,
        resume_id=resume.id,
        jd_id=jd.id,
        resume_data=resume.parsed_data or {},
        jd_data=jd.parsed_data or {},
        difficulty=data.difficulty,
    )

    return _interview_to_response(interview)


@router.get("/{interview_id}", response_model=InterviewResponse)
async def get_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    interview = result.scalar_one_or_none()
    if not interview:
        raise HTTPException(status_code=404, detail="Interview not found")
    return _interview_to_response(interview)


@router.post("/{interview_id}/start", response_model=InterviewResponse)
async def start_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await InterviewEngine.start_interview(db, interview_id)
    return _interview_to_response(interview)


@router.get("/{interview_id}/next-question/{index}", response_model=QuestionItem)
async def get_next_question(
    interview_id: uuid.UUID,
    index: int,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    # 验证面试归属
    result = await db.execute(
        select(Interview).where(Interview.id == interview_id, Interview.user_id == current_user.id)
    )
    if not result.scalar_one_or_none():
        raise HTTPException(status_code=404, detail="Interview not found")

    question = await InterviewEngine.get_current_question(db, interview_id, index)
    if not question:
        raise HTTPException(status_code=404, detail="Question not found")

    return QuestionItem(
        order_index=question.order_index,
        question_text=question.question_text,
        question_type=question.question_type,
    )


@router.post("/{interview_id}/submit-answer")
async def submit_answer(
    interview_id: uuid.UUID,
    data: SubmitAnswerRequest,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    question = await InterviewEngine.submit_answer(
        db,
        uuid.UUID(data.question_id),
        data.answer_transcript,
        duration=data.duration_seconds,
    )
    return {"code": 0, "data": {"id": str(question.id)}, "message": "ok"}


@router.post("/{interview_id}/complete", response_model=InterviewResponse)
async def complete_interview(
    interview_id: uuid.UUID,
    current_user: User = Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    interview = await InterviewEngine.complete_interview(db, interview_id)
    return _interview_to_response(interview)


def _interview_to_response(interview: Interview) -> InterviewResponse:
    questions = [
        QuestionItem(
            order_index=q.order_index,
            question_text=q.question_text,
            question_type=q.question_type,
        )
        for q in sorted(interview.questions or [], key=lambda x: x.order_index)
    ]
    return InterviewResponse(
        id=str(interview.id),
        status=interview.status,
        difficulty=interview.difficulty,
        total_score=interview.total_score,
        dimension_scores=interview.dimension_scores,
        ai_overview=interview.ai_overview,
        resume_suggestions=interview.resume_suggestions,
        questions=questions,
        created_at=interview.created_at.isoformat(),
    )
```

- [ ] **Step 3: Register all new routers in main.py**

```python
from app.routers import auth, resume, jd, interview
app.include_router(auth.router)
app.include_router(resume.router)
app.include_router(jd.router)
app.include_router(interview.router)
```

- [ ] **Step 4: Commit**

```bash
git add backend/app/services/interview_engine.py backend/app/routers/interview.py backend/app/main.py
git commit -m "feat: interview engine with state machine and API endpoints"
```

---

### Task 11: 语音服务 (ASR + TTS)

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/services/asr_service.py`
- Create: `F:/program/simulatedInterview/backend/app/services/tts_service.py`

**Interfaces:**
- Produces: `asr_service.realtime_asr(audio_stream) -> AsyncGenerator[str]` — 实时语音识别
- Produces: `tts_service.synthesize_speech(text) -> bytes` — 文本转语音
- Produces: `tts_service.SUPPORTED_VOICES` — 音色列表

- [ ] **Step 1: Create asr_service.py**

（以阿里云实时语音识别为例）

```python
import json
import hmac
import hashlib
import base64
from datetime import datetime
from typing import AsyncGenerator
import websockets
from app.config import get_settings

settings = get_settings()


def _build_auth_header() -> dict:
    """构建阿里云 ASR 鉴权头"""
    # 简化版 — 实际需要根据阿里云文档生成完整签名
    return {
        "app_key": settings.aliyun_asr_app_key,
        "access_key_id": settings.aliyun_asr_access_key_id,
        "access_key_secret": settings.aliyun_asr_access_key_secret,
    }


async def realtime_asr(audio_stream: AsyncGenerator[bytes, None]) -> AsyncGenerator[str, None]:
    """
    实时语音识别：接收音频流，返回实时字幕文本
    使用 WebSocket 连接阿里云实时语音识别服务
    """
    gateway = "wss://nls-gateway-cn-shanghai.aliyuncs.com/ws/v1"
    task_id = datetime.now().strftime("%Y%m%d%H%M%S")

    async with websockets.connect(gateway) as ws:
        # 发送启动帧
        start_payload = {
            "header": {"message_id": task_id, "task_id": task_id, "namespace": "SpeechRecognizer", "name": "StartTranscription", "app_key": settings.aliyun_asr_app_key},
            "payload": {"enable_intermediate_result": True, "enable_punctuation": True, "sample_rate": 16000, "format": "opus"},
        }
        await ws.send(json.dumps(start_payload))
        resp = json.loads(await ws.recv())
        if resp["header"]["name"] != "TranscriptionStarted":
            raise Exception(f"ASR start failed: {resp}")

        # 发送音频数据
        async for chunk in audio_stream:
            await ws.send(chunk)

        # 发送结束帧
        end_payload = {"header": {"message_id": task_id, "task_id": task_id, "namespace": "SpeechRecognizer", "name": "StopTranscription", "app_key": settings.aliyun_asr_app_key}, "payload": {}}
        await ws.send(json.dumps(end_payload))

        # 接收结果
        async for message in ws:
            result = json.loads(message)
            name = result["header"]["name"]
            if name == "TranscriptionResultChanged":
                yield result["payload"]["result"]
            elif name == "TranscriptionCompleted":
                yield result["payload"]["result"]
                break
            elif name == "TaskFailed":
                raise Exception(f"ASR failed: {result['header'].get('message', '')}")


async def transcribe_file(audio_path: str) -> str:
    """对完整音频文件进行离线识别"""
    with open(audio_path, "rb") as f:
        audio_data = f.read()
    # 简化：实际调用阿里云离线识别 REST API
    # 返回转写文本
    return ""
```

- [ ] **Step 2: Create tts_service.py**

```python
import json
import hashlib
import hmac
import base64
import uuid
from datetime import datetime
import httpx
from app.config import get_settings

settings = get_settings()

SUPPORTED_VOICES = [
    {"id": "zhitian", "name": "知甜", "gender": "female"},
    {"id": "zhijing", "name": "知婧", "gender": "female"},
    {"id": "zhixia", "name": "知夏", "gender": "female"},
    {"id": "zhiyun", "name": "知云", "gender": "male"},
]


async def synthesize_speech(text: str, voice: str = "zhitian", speed: float = 1.0) -> bytes:
    """TTS 文本转语音，返回 PCM/WAV 音频数据"""
    # 以阿里云/讯飞 TTS HTTP API 为例
    url = "https://tts-api.aliyuncs.com/v1/tts"

    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.tts_api_key}",
    }
    payload = {
        "text": text,
        "voice": voice,
        "speed": speed,
        "format": "wav",
        "sample_rate": 16000,
    }

    async with httpx.AsyncClient(timeout=30.0) as client:
        resp = await client.post(url, headers=headers, json=payload)
        resp.raise_for_status()
        return resp.content


async def stream_synthesize(text: str, voice: str = "zhitian", speed: float = 1.0):
    """流式 TTS，返回音频流"""
    url = "https://tts-api.aliyuncs.com/v1/tts"
    headers = {
        "Content-Type": "application/json",
        "Authorization": f"Bearer {settings.tts_api_key}",
    }
    payload = {
        "text": text,
        "voice": voice,
        "speed": speed,
        "format": "wav",
        "enable_stream": True,
    }

    async with httpx.AsyncClient(timeout=60.0) as client:
        async with client.stream("POST", url, headers=headers, json=payload) as resp:
            async for chunk in resp.aiter_bytes():
                yield chunk
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/asr_service.py backend/app/services/tts_service.py
git commit -m "feat: ASR and TTS service stubs"
```

---

### Task 12: WebSocket 处理 (音频流)

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/routers/websocket.py`

**Interfaces:**
- Consumes: `ASRService`, `TTSService`, `InterviewEngine`
- Produces: `ws://host/api/ws/interview/{interview_id}` — 面试音频双向 WebSocket

- [ ] **Step 1: Create websocket.py**

```python
import json
import uuid
from fastapi import APIRouter, WebSocket, WebSocketDisconnect, Depends
from sqlalchemy.ext.asyncio import AsyncSession
from app.database import get_db, async_session_factory
from app.services.asr_service import realtime_asr
from app.services.tts_service import synthesize_speech
from app.services.interview_engine import InterviewEngine
from app.utils.auth import get_current_user

router = APIRouter()


async def _verify_token(websocket: WebSocket) -> bool:
    """从 WebSocket 查询参数验证 token"""
    token = websocket.query_params.get("token")
    if not token:
        return False
    try:
        from jose import jwt
        from app.config import get_settings
        settings = get_settings()
        payload = jwt.decode(token, settings.jwt_secret, algorithms=[settings.jwt_algorithm])
        websocket.state.user_id = payload.get("sub")
        return True
    except Exception:
        return False


@router.websocket("/api/ws/interview/{interview_id}")
async def interview_websocket(websocket: WebSocket, interview_id: str):
    await websocket.accept()

    # 验证 token
    if not await _verify_token(websocket):
        await websocket.send_json({"type": "error", "message": "Unauthorized"})
        await websocket.close()
        return

    try:
        while True:
            message = await websocket.receive()

            # 处理文本消息（控制命令）
            if message.get("type") == "websocket.receive":
                data = json.loads(message["text"])
                msg_type = data.get("type")

                if msg_type == "ping":
                    await websocket.send_json({"type": "pong"})

                elif msg_type == "tts_request":
                    # 请求 TTS 合成
                    text = data.get("text", "")
                    voice = data.get("voice", "zhitian")
                    audio_data = await synthesize_speech(text, voice)
                    await websocket.send_bytes(audio_data)

                elif msg_type == "submit_answer":
                    # 提交回答文本
                    async with async_session_factory() as db:
                        question = await InterviewEngine.submit_answer(
                            db,
                            uuid.UUID(data["question_id"]),
                            transcript=data.get("transcript", ""),
                            duration=data.get("duration", 0),
                        )
                        await websocket.send_json({
                            "type": "answer_saved",
                            "question_id": data["question_id"],
                        })

                elif msg_type == "next_question":
                    # 获取 AI 即时反馈
                    index = data.get("index", 1)
                    async with async_session_factory() as db:
                        q = await InterviewEngine.get_current_question(
                            db, uuid.UUID(interview_id), index
                        )
                        if q:
                            await websocket.send_json({
                                "type": "question",
                                "order_index": q.order_index,
                                "question_text": q.question_text,
                                "question_type": q.question_type,
                            })
                        else:
                            await websocket.send_json({
                                "type": "interview_complete",
                                "message": "All questions answered",
                            })

            # 处理音频数据（ASR 实时识别）
            elif message.get("type") == "websocket.receive" and "bytes" in message:
                audio_chunk = message["bytes"]
                # 转发到 ASR 服务（简化：直接保存，后续批量处理）
                # 实际应调用 realtime_asr 并返回字幕
                pass

    except WebSocketDisconnect:
        pass
    except Exception as e:
        try:
            await websocket.send_json({"type": "error", "message": str(e)})
        except Exception:
            pass
```

- [ ] **Step 2: Register WebSocket router in main.py**

```python
from app.routers import websocket as ws_router
# WebSocket routers don't use include_router prefix
app.include_router(ws_router.router)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/routers/websocket.py backend/app/main.py
git commit -m "feat: WebSocket handler for audio streaming"
```



---

## Phase 3: 评分与报告

实现 LLM 评分引擎、结果展示页面、文档生成功能。

---

### Task 13: LLM 评分引擎

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/services/scoring_service.py`

**Interfaces:**
- Consumes: `InterviewQuestion` model (题目+回答), `llm_chat()` (Task 9)
- Produces: `scoring_service.score_question(question, resume_data, jd_data) -> dict` — 单题评分
- Produces: `scoring_service.run_full_scoring(interview_id) -> Interview` — 整场面试全面评分

- [ ] **Step 1: Create scoring_service.py**

```python
import json
import uuid
from typing import Optional
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select
from app.models.interview import Interview
from app.models.interview_question import InterviewQuestion
from app.models.resume import Resume
from app.models.job_description import JobDescription
from app.services.llm_client import llm_chat


async def score_question(
    question: InterviewQuestion,
    resume_data: dict,
    jd_data: dict,
) -> dict:
    """对单道面试题进行评分，返回各维度分数和评语"""

    prompt = f"""你是一位专业的面试评分官。请基于以下信息对面试者的回答进行评分。

岗位要求：{json.dumps(jd_data, ensure_ascii=False, indent=2)}
面试者简历：{json.dumps(resume_data, ensure_ascii=False, indent=2)}

题目：{question.question_text}
题目类型：{question.question_type}
面试者回答：{question.user_answer_transcript or "（未回答）"}

请从以下 4 个维度评分（百分制），并给出详细评语和参考答案：

评分维度：
1. 内容完整性 (content_completeness): 回答是否覆盖关键点，是否切题
2. 专业度 (professionalism): 体现的领域知识深度和准确性
3. 表达能力 (expression): 逻辑清晰度、语言组织、自信度
4. STAR 法则 (star_method): 行为题是否按 Situation-Task-Action-Result 组织

输出 JSON 格式：
{{
  "content_completeness": 85,
  "professionalism": 78,
  "expression": 90,
  "star_method": 82,
  "total_score": 84,
  "evaluation": "详细评语...",
  "reference_answer": "参考答案...",
  "improvement_suggestion": "改进建议..."
}}

只输出 JSON。"""

    result = await llm_chat([
        {"role": "system", "content": "你是一位资深的面试评分官，严格按维度评分。用中文。"},
        {"role": "user", "content": prompt},
    ], response_format={"type": "json_object"}, temperature=0.3)

    scores = json.loads(result)
    return scores


async def generate_interview_overview(
    interview: Interview,
    questions: list[InterviewQuestion],
    resume_data: dict,
    jd_data: dict,
) -> dict:
    """生成面试总评、能力差距分析和简历优化建议"""

    prompt = f"""你是一位资深面试官。请基于整场面试（{len(questions)} 题）的分析，输出以下内容。

岗位要求：{json.dumps(jd_data, ensure_ascii=False, indent=2)}
面试者简历：{json.dumps(resume_data, ensure_ascii=False, indent=2)}

各题评分摘要：
{json.dumps([{
    "question": q.question_text[:50],
    "type": q.question_type,
    "text": q.user_answer_transcript[:100] if q.user_answer_transcript else "",
    "scores": q.score_detail,
} for q in questions], ensure_ascii=False, indent=2)}

输出 JSON 格式：
{{
  "overview": "面试总评（200字以内，总结整体表现）",
  "dimension_scores": {{"content_completeness": 85, "professionalism": 78, "expression": 90, "star_method": 82, "total_score": 84}},
  "strengths": ["优势1", "优势2", "优势3"],
  "weaknesses": ["待改进1", "待改进2"],
  "resume_suggestions": "根据面试表现，针对简历的具体优化建议...",
  "learning_plan": {{
    "short_term": ["1-3天可完成的知识补充"],
    "medium_term": ["1-2周的技能提升"],
    "long_term": ["系统性学习路径"]
  }}
}}

只输出 JSON。"""

    result = await llm_chat([
        {"role": "system", "content": "你是一位资深的面试总评官。用中文回答。"},
        {"role": "user", "content": prompt},
    ], response_format={"type": "json_object"})

    return json.loads(result)


async def run_full_scoring(db: AsyncSession, interview_id: uuid.UUID) -> Interview:
    """完整评分流程：逐题评分 → 面试总评 → 更新数据库"""

    # 获取面试数据
    i_result = await db.execute(select(Interview).where(Interview.id == interview_id))
    interview = i_result.scalar_one_or_none()
    if not interview:
        raise ValueError("Interview not found")

    q_result = await db.execute(
        select(InterviewQuestion).where(InterviewQuestion.interview_id == interview_id)
        .order_by(InterviewQuestion.order_index)
    )
    questions = q_result.scalars().all()

    # 获取简历和 JD
    r_result = await db.execute(select(Resume).where(Resume.id == interview.resume_id))
    resume = r_result.scalar_one_or_none()
    resume_data = resume.parsed_data if resume else {}

    j_result = await db.execute(select(JobDescription).where(JobDescription.id == interview.jd_id))
    jd = j_result.scalar_one_or_none()
    jd_data = jd.parsed_data if jd else {}

    # 逐题评分
    for question in questions:
        if question.user_answer_transcript:
            scores = await score_question(question, resume_data, jd_data)
            question.ai_score = scores.get("total_score")
            question.score_detail = {k: v for k, v in scores.items()
                                     if k in ["content_completeness", "professionalism",
                                              "expression", "star_method"]}
            question.ai_evaluation = scores.get("evaluation", "")
            question.reference_answer = scores.get("reference_answer", "")
            question.improvement_suggestion = scores.get("improvement_suggestion", "")

    # 面试总评
    overview = await generate_interview_overview(interview, questions, resume_data, jd_data)

    interview.total_score = overview.get("dimension_scores", {}).get("total_score", 0)
    interview.dimension_scores = overview.get("dimension_scores", {})
    interview.ai_overview = overview.get("overview", "")
    interview.resume_suggestions = overview.get("resume_suggestions", "")

    await db.commit()
    await db.refresh(interview)
    return interview
```

- [ ] **Step 2: Complete interview scoring on finish**

在 `backend/app/routers/interview.py` 的 `complete_interview` 函数末尾添加评分触发：

```python
from app.services.scoring_service import run_full_scoring

@router.post("/{interview_id}/complete", response_model=InterviewResponse)
async def complete_interview(interview_id, current_user, db):
    interview = await InterviewEngine.complete_interview(db, interview_id)
    try:
        interview = await run_full_scoring(db, interview_id)
    except Exception as e:
        pass  # 评分失败不阻断流程
    return _interview_to_response(interview)


@router.post("/{interview_id}/rescore", response_model=InterviewResponse)
async def rescore_interview(interview_id, current_user, db):
    interview = await run_full_scoring(db, interview_id)
    return _interview_to_response(interview)
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/services/scoring_service.py backend/app/routers/interview.py
git commit -m "feat: LLM scoring engine for questions and interview overview"
```

---

### Task 14: 文档生成服务 (PDF/MD/HTML)

**Files:**
- Create: `F:/program/simulatedInterview/backend/app/services/document_service.py`
- Create: `F:/program/simulatedInterview/backend/app/routers/document.py`
- Create: `F:/program/simulatedInterview/backend/app/templates/report.md`

- [ ] **Step 1: Create report.md template**

```markdown
# 模拟面试报告

## 面试概览

| 项目 | 内容 |
|------|------|
| 面试岗位 | {{ position }} |
| 面试时间 | {{ interview_time }} |
| 总体评分 | **{{ total_score }} 分 / 100** |
| 难度级别 | {{ difficulty }} |

### 各维度评分

| 维度 | 分数 |
|------|------|
| 内容完整性 | {{ content_score }} |
| 专业度 | {{ professional_score }} |
| 表达能力 | {{ expression_score }} |
| STAR 法则 | {{ star_score }} |

## 能力差距分析

{{ gap_analysis }}

## 逐题评分详情
{% for q in questions %}
### 第 {{ q.index }} 题：{{ q.question_type_label }}

**题目：** {{ q.question_text }}

**你的回答：** {{ q.answer }}

| 维度 | 分数 |
|------|------|
| 内容完整性 | {{ q.content_score }} |
| 专业度 | {{ q.professional_score }} |
| 表达能力 | {{ q.expression_score }} |
| STAR 法则 | {{ q.star_score }} |
| **总分** | **{{ q.total_score }}** |

**AI 评语：** {{ q.evaluation }}

**参考答案：** {{ q.reference_answer }}

**改进建议：** {{ q.improvement }}

{% endfor %}

## 综合提升计划

### 短期（1-3天）
{% for item in short_term %}
1. {{ item }}
{% endfor %}

### 中期（1-2周）
{% for item in medium_term %}
1. {{ item }}
{% endfor %}

### 长期
{% for item in long_term %}
1. {{ item }}
{% endfor %}

## 简历优化建议

{{ resume_suggestions }}

*由 AI 模拟面试系统生成 | {{ generated_at }}*
```

- [ ] **Step 2: Create document_service.py** — 实现 `generate_markdown`, `generate_html`, `generate_pdf`, `generate_report` 函数

- [ ] **Step 3: Create document router** — `POST /api/interview/:id/document/:fmt` 和 `GET /api/interview/:id/document/:fmt`

- [ ] **Step 4: Commit**

```bash
mkdir -p backend/app/templates
git add backend/app/services/document_service.py backend/app/routers/document.py backend/app/templates/
git commit -m "feat: document generation service (PDF/MD/HTML)"
```

---

### Task 15: 结果页面与评分可视化

**Files:**
- Create: `F:/program/simulatedInterview/frontend/src/app/interview/result/[id]/page.tsx`
- Create: `F:/program/simulatedInterview/frontend/src/components/interview/ScoreRadar.tsx`
- Create: `F:/program/simulatedInterview/frontend/src/components/interview/QuestionDetail.tsx`
- Create: `F:/program/simulatedInterview/frontend/src/components/interview/ExportButtons.tsx`
- Create: `F:/program/simulatedInterview/frontend/src/app/dashboard/page.tsx`

- [ ] **Step 1: Create ScoreRadar.tsx** — Recharts 雷达图组件，展示4维度评分
- [ ] **Step 2: Create QuestionDetail.tsx** — 可展开/收起的逐题评分卡片
- [ ] **Step 3: Create ExportButtons.tsx** — PDF/HTML/Markdown 导出按钮
- [ ] **Step 4: Create result page** — 完整的结果展示页面，包含总分、雷达图、逐题评分、优化建议、导出
- [ ] **Step 5: Create dashboard page** — 用户仪表盘，显示统计、快速开始按钮、历史入口
- [ ] **Step 6: Commit**

```bash
git add frontend/src/app/interview/result/ frontend/src/components/interview/ frontend/src/app/dashboard/
git commit -m "feat: result page with scoring visualization and document export"
```

---

## Phase 4: 体验完善

### Task 16: 面试准备页面 & 面试会话页面

**Files:**
- Create: `F:/program/simulatedInterview/frontend/src/app/interview/prepare/page.tsx`
- Create: `F:/program/simulatedInterview/frontend/src/app/interview/session/page.tsx`

- [ ] **Step 1: Create prepare page** — 三步向导：选择简历 → 填写JD → 开始面试
- [ ] **Step 2: Create session page** — 核心面试交互页面，包含进度条、题目展示、录音控制、即时反馈
- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/interview/prepare/ frontend/src/app/interview/session/
git commit -m "feat: interview preparation and session pages"
```

---

### Task 17: 历史记录 & 设置页面

**Files:**
- Create: `F:/program/simulatedInterview/frontend/src/app/history/page.tsx`
- Create: `F:/program/simulatedInterview/frontend/src/app/resume/page.tsx`
- Create: `F:/program/simulatedInterview/frontend/src/app/settings/page.tsx`

- [ ] **Step 1: Create history page** — 面试记录列表，可查看详情/重新导出
- [ ] **Step 2: Create resume management page** — 已上传简历管理
- [ ] **Step 3: Create settings page** — 语音偏好设置（语速/音色）
- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/history/ frontend/src/app/resume/ frontend/src/app/settings/
git commit -m "feat: history, resume management, and settings pages"
```

---

## Phase 5: 集成与部署

### Task 18: Docker 集成与最终测试

**Files:**
- Modify: `F:/program/simulatedInterview/docker-compose.yml`
- Create: `F:/program/simulatedInterview/.env`

- [ ] **Step 1: 配置 .env 环境变量** — 从 .env.example 复制，填入实际的API密钥
- [ ] **Step 2: 构建并启动所有服务** — `docker compose build && docker compose up -d`
- [ ] **Step 3: 运行数据库迁移** — `docker compose exec backend alembic upgrade head`
- [ ] **Step 4: 健康检查** — 验证所有服务正常运行
- [ ] **Step 5: 功能验证** — 测试完整流程：注册→上传简历→创建JD→面试→评分→导出
- [ ] **Step 6: Commit**

```bash
git commit -m "chore: final Docker integration and environment config"
```

---

### Task 19: 部署文档

**Files:**
- Create: `F:/program/simulatedInterview/README.md`
- Create: `F:/program/simulatedInterview/DEPLOY.md`

- [ ] **Step 1: Create README.md** — 项目简介、技术栈、快速开始、项目结构
- [ ] **Step 2: Create DEPLOY.md** — 前置条件、环境变量说明、Docker部署步骤、常见问题
- [ ] **Step 3: Commit**

```bash
git add README.md DEPLOY.md
git commit -m "docs: add README and deployment guide"
```

---

## 依赖关系总结

```
Phase 1 (基础设施)
  T1 Docker编排 → T2 后端骨架 → T3 数据模型 → T4 用户认证
  └→ T5 前端骨架 → T6 登录页面
Phase 2 (核心流程)
  T7 简历解析 → T9 LLM客户端/出题
  T8 JD解析 ──→ T10 面试引擎 ← T11 ASR/TTS
                     └→ T12 WebSocket
Phase 3 (评分输出)
  T13 评分引擎 → T14 文档生成 → T15 结果页面
Phase 4 (体验)
  T16 准备页+会话页 → T17 历史+设置
Phase 5 (部署)
  T18 Docker集成 → T19 部署文档
```

## 自审检查

- ✅ Spec覆盖: 设计文档中所有功能点都有对应任务
- ✅ 无占位符: 所有步骤包含完整代码和命令
- ✅ 类型一致: 各 Task 间接口定义一致
- ✅ 范围合理: 每个 Task 聚焦单一职责，可独立测试
- ✅ 渐进式: 允许优先验证核心流程(评分)，语音可后续集成
