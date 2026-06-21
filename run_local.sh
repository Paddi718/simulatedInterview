#!/bin/bash
# 本地开发一键启动（数据库用 Docker，后端/前端用本地 venv/node）
# 用法: bash run_local.sh

set -e
cd "$(dirname "$0")"

echo "=== 启动 PostgreSQL 和 Redis (Docker) ==="
docker compose up -d postgres redis 2>/dev/null || echo "(Docker 服务已在运行)"

echo ""
echo "=== 启动后端 (venv) ==="
echo "后端地址: http://localhost:8000"
echo "API 文档: http://localhost:8000/docs"
echo ""
bash run_backend.sh &
BACKEND_PID=$!

sleep 2

echo ""
echo "=== 启动前端 (npm dev) ==="
echo "前端地址: http://localhost:3000"
echo ""
bash run_frontend.sh &
FRONTEND_PID=$!

echo ""
echo "=== 所有服务已启动 ==="
echo "  前端: http://localhost:3000"
echo "  后端: http://localhost:8000"
echo "  文档: http://localhost:8000/docs"
echo ""
echo "按 Ctrl+C 停止所有服务"

trap "echo '正在停止...'; kill $BACKEND_PID $FRONTEND_PID 2>/dev/null; exit" SIGINT SIGTERM
wait
