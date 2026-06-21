#!/bin/bash
# 本地开发 — 在 venv 中运行后端（不需要 Docker）
# 用法: bash run_backend.sh

set -e
cd "$(dirname "$0")/backend"

# 创建 venv（如果不存在）
if [ ! -d "venv" ]; then
    echo "Creating virtual environment..."
    python -m venv venv
fi

# 激活 venv
source venv/Scripts/activate 2>/dev/null || source venv/bin/activate

# 安装依赖
echo "Installing dependencies..."
pip install -r requirements.txt -q

# 设置环境变量
export DATABASE_URL="${DATABASE_URL:-postgresql+asyncpg://interview_user:password@localhost:5432/interview_db}"
export REDIS_URL="${REDIS_URL:-redis://localhost:6379/0}"
export JWT_SECRET="${JWT_SECRET:-dev_jwt_secret_change_me}"
export ASR_MODEL_DIR="${ASR_MODEL_DIR:-../models/SenseVoiceSmall}"
export LLM_API_KEY="${LLM_API_KEY:-your_api_key_here}"
export LLM_API_BASE="${LLM_API_BASE:-https://api.deepseek.com}"
export LLM_MODEL="${LLM_MODEL:-deepseek-chat}"
export AUDIO_STORAGE_PATH="${AUDIO_STORAGE_PATH:-../data/audio}"
export DOCUMENT_STORAGE_PATH="${DOCUMENT_STORAGE_PATH:-../data/documents}"
export RESUME_STORAGE_PATH="${RESUME_STORAGE_PATH:-../data/resumes}"

echo "Starting backend on http://localhost:8000..."
uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
