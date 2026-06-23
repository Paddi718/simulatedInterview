from pydantic_settings import BaseSettings
from functools import lru_cache


class Settings(BaseSettings):
    # Database
    database_url: str = "postgresql+asyncpg://interview_user:password@localhost:5432/interview_db"
    db_pool_size: int = 10
    db_max_overflow: int = 20

    # Redis
    redis_url: str = "redis://localhost:6379/0"

    # JWT
    jwt_secret: str = "dev-secret-change-in-production"
    jwt_algorithm: str = "HS256"
    jwt_expire_days: int = 7

    # FunASR (本地语音识别 — 免费，无需 API Key)
    asr_model_dir: str = "models/SenseVoiceSmall"
    asr_max_concurrent: int = 0  # 0=不限制，生产建议3-5

    # TTS (Edge TTS — free, no API key required)

    # 搜索（公务员/事业单位面试热点 — 多源兜底）
    search_serper_api_key: str = ""       # Serper: https://serper.dev
    search_tavily_api_key: str = ""       # Tavily: https://app.tavily.com

    # LLM
    llm_api_key: str = ""
    llm_api_base: str = "https://api.deepseek.com/v1"
    llm_model: str = "deepseek-chat"

    # Email (SMTP — 邮箱验证)
    smtp_host: str = "smtp.qq.com"
    smtp_port: int = 465
    smtp_user: str = ""
    smtp_password: str = ""
    smtp_from: str = ""

    # Server
    uvicorn_workers: int = 1

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
