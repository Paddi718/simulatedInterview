#!/bin/bash
# 本地开发 — 运行前端（不需要 Docker）
# 用法: bash run_frontend.sh
#
# 前置条件：后端已启动在 localhost:8010

set -e
cd "$(dirname "$0")/frontend"

# 安装依赖（如果 node_modules 不存在）
if [ ! -d "node_modules" ]; then
    echo "Installing frontend dependencies..."
    npm install
fi

# 设置环境变量指向本地后端
export NEXT_PUBLIC_API_URL="${NEXT_PUBLIC_API_URL:-http://localhost:8010}"
export NEXT_PUBLIC_WS_URL="${NEXT_PUBLIC_WS_URL:-ws://localhost:8010}"

echo "Starting frontend on http://localhost:3000..."
npm run dev
