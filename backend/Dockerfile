# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# 系统依赖（weasyprint PDF 生成 + ffmpeg 音频转换）
# 中国大陆构建: docker compose build --build-arg USE_CHINA_MIRROR=true
ARG USE_CHINA_MIRROR=false
ARG PIP_MIRROR=
RUN --mount=type=cache,target=/var/cache/apt,sharing=locked \
    --mount=type=cache,target=/var/lib/apt,sharing=locked \
    if [ "$USE_CHINA_MIRROR" = "true" ]; then \
        sed -i 's|deb.debian.org|mirrors.ustc.edu.cn|g' /etc/apt/sources.list.d/debian.sources \
        && sed -i 's|security.debian.org|mirrors.ustc.edu.cn|g' /etc/apt/sources.list.d/debian.sources; \
    fi \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libgdk-pixbuf-xlib-2.0-0 \
        libffi-dev \
        shared-mime-info \
        ffmpeg \
        curl \
    && rm -rf /var/lib/apt/lists/*

# ---------- Python 依赖 ----------
# PyTorch CPU 版（体积减半，生产无 GPU）
ARG PIP_MIRROR=
COPY requirements.txt .

RUN --mount=type=cache,target=/root/.cache/pip \
    pip install --no-cache-dir torch torchaudio --index-url https://download.pytorch.org/whl/cpu \
    && if [ -n "$PIP_MIRROR" ]; then \
        pip install --no-cache-dir -i "$PIP_MIRROR" -r requirements.txt; \
    else \
        pip install --no-cache-dir -r requirements.txt; \
    fi

# 源码
COPY . .

EXPOSE 8000

# 生产模式：多 worker + 无热重载
# UVICORN_WORKERS 可通过环境变量覆盖（默认 2）
CMD ["sh", "-c", "uvicorn app.main:app --host 0.0.0.0 --port 8000 --workers ${UVICORN_WORKERS:-2}"]
