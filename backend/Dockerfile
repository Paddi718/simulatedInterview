# syntax=docker/dockerfile:1
FROM python:3.11-slim

WORKDIR /app

# 系统依赖（weasyprint PDF 生成 + ffmpeg 音频转换）
# 中国大陆构建: docker compose build --build-arg USE_CHINA_MIRROR=true
ARG USE_CHINA_MIRROR=false
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

# Python 依赖 — pip 缓存挂载跨构建复用，只下载变更的包
ARG PIP_MIRROR=
COPY requirements.txt .
RUN --mount=type=cache,target=/root/.cache/pip \
    if [ -n "$PIP_MIRROR" ]; then \
        pip install --no-cache-dir -i "$PIP_MIRROR" -r requirements.txt; \
    else \
        pip install --no-cache-dir -r requirements.txt; \
    fi

# 源码
COPY . .

EXPOSE 8000
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8000"]
