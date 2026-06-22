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

    # FunASR (本地语音识别 — 免费，无需 API Key)
    asr_model_dir: str = "models/SenseVoiceSmall"

    # TTS (Edge TTS — free, no API key required)

    # Bing Search (用于公务员/事业单位面试热点搜索，可选)
    bing_search_api_key: str = ""

    # LLM
    llm_api_key: str = ""
    llm_api_base: str = "https://api.deepseek.com/v1"
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
