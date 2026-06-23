# AI 模拟面试 (AI Mock Interview)

> 智能模拟面试平台 — 语音交互 + AI 评分 + 报告生成，支持私企/公务员/事业单位三类面试

[![License](https://img.shields.io/badge/license-MIT-blue.svg)](LICENSE)

## 📖 简介

一款面向求职者的 AI 模拟面试 Web 应用。用户上传简历和岗位介绍(JD)，AI 自动生成针对性面试题，以语音对话形式进行模拟面试，面试结束后输出多维度评分、参考答案、改进建议及简历优化建议，最终生成 PDF/MD/HTML 格式的面试报告。

### 三种面试模式

| 类型 | 输入 | 题目数 | 评分维度 |
|------|------|--------|----------|
| 🏢 私企面试 | 简历 + JD | 10 题 | 内容完整性、专业度、表达、STAR 法则 |
| 🏛️ 公务员面试 | 省份 + 岗位 + 层级 | 3-4 题 | 分析能力、组织协调、应急应变、人际沟通、语言表达 |
| 🏥 事业单位 | 省份 + 岗位 + 层级 (可选简历/JD) | 5 题 | 分析能力、组织协调、专业知识、人际沟通、语言表达 |

## ✨ 核心功能

- **智能出题** — 基于简历 + JD / 省份省情 + 热点事件，AI 自动生成个性化面试题
- **语音交互** — 语音录制 + 实时转写（FunASR），AI 面试官语音播报（Edge TTS）
- **多维度评分** — 按类别差异化评分维度，百分制 + 逐题打分
- **面试报告** — PDF / Markdown / HTML 三种格式，含雷达图、逐题评分、参考答案、简历优化建议
- **全栈 Docker 部署** — 一键启动前后端 + 数据库 + 缓存，镜像 3.5 GB
- **生产安全** — CORS 白名单、速率限制、LLM Key 脱敏、安全响应头

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14, Tailwind CSS, shadcn/ui, Zustand, Recharts |
| 后端 | Python FastAPI, SQLAlchemy 2.0 (async), Alembic |
| 数据库 | PostgreSQL 15 (连接池 20) |
| 缓存 | Redis 7 |
| AI | DeepSeek API (出题 + 评分) |
| 语音识别 | FunASR SenseVoiceSmall 本地模型（免费） |
| 语音合成 | 微软 Edge TTS（免费） |
| 部署 | Docker Compose + BuildKit 缓存 |

## 🚀 快速开始

### 前置条件

- Docker Compose v2+
- Node.js >= 18（本地开发）
- Python >= 3.11（本地开发）

### Docker 部署（推荐）

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填入 LLM_API_KEY 和 JWT_SECRET

# 2. 构建并启动（中国大陆加镜像加速）
docker compose build --build-arg USE_CHINA_MIRROR=true
docker compose up -d

# 3. 数据库迁移
docker compose exec backend alembic stamp head

# 4. 访问
# 前端: http://localhost:3000
# API 文档: http://localhost:8000/docs
```

### 本地开发

```bash
# 1. 启动 PostgreSQL 和 Redis
docker compose up -d postgres redis

# 2. 后端
cd backend
pip install -r requirements.txt
bash ../run_backend.sh    # → http://localhost:8010

# 3. 前端
cd frontend
npm install
bash ../run_frontend.sh   # → http://localhost:3000
```

## 📂 项目结构

```
simulatedInterview/
├── docker-compose.yml              # Docker 编排（含资源限制、健康检查）
├── .env.example                    # 环境变量模板
├── backend/                        # FastAPI 后端
│   ├── Dockerfile                  # PyTorch CPU + 多 worker
│   ├── app/
│   │   ├── main.py                 # 应用入口（CORS / 速率限制 / 安全头）
│   │   ├── config.py               # 配置管理（Pydantic Settings）
│   │   ├── database.py             # 数据库连接池
│   │   ├── models/                 # SQLAlchemy 模型 (7 张表)
│   │   ├── schemas/                # Pydantic 请求/响应模型
│   │   ├── routers/                # API 路由 (auth/resume/jd/interview/ws/doc)
│   │   ├── services/               # 业务逻辑 (出题/引擎/评分/文档/ASR/TTS/缓存)
│   │   └── utils/                  # 工具函数 (JWT 认证)
│   ├── alembic/                    # 数据库迁移
│   └── requirements.txt
├── frontend/                       # Next.js 前端
│   ├── Dockerfile                  # 多阶段构建 + 非 root 运行
│   ├── next.config.js              # Rewrite 代理 + 安全头 + 压缩
│   └── src/
│       ├── app/                    # App Router 页面
│       ├── components/             # 通用组件
│       ├── lib/api.ts              # API 客户端（相对路径，不暴露后端）
│       └── store/                  # Zustand 状态管理
├── models/                         # FunASR 模型文件（不纳入版本控制）
└── data/                           # 运行时数据（不纳入版本控制）
```

## 🔑 环境变量

参见 `.env.example`，关键配置项：

| 变量 | 说明 | 必填 |
|------|------|------|
| `JWT_SECRET` | JWT 签名密钥（生产环境必须修改） | ✅ |
| `LLM_API_KEY` | 全局兜底 Key（生产环境留空，用户自备） | ❌ |
| `LLM_API_BASE` | LLM API 地址 | 有用户配置则不需要 |
| `LLM_MODEL` | LLM 模型名称 | 有用户配置则不需要 |
| `ALLOWED_ORIGINS` | CORS 白名单 | 生产建议 |
| `ASR_MAX_CONCURRENT` | ASR 并发上限（3-5） | 生产建议 |
| `UVICORN_WORKERS` | Uvicorn worker 数量（2） | 生产建议 |
| `DB_POOL_SIZE` | 数据库连接池（20） | 生产建议 |

### 💡 LLM API Key 设计

**生产环境：每个用户自带 Key。** 用户注册后去「设置」页配置自己的 DeepSeek API Key，出题和评分的费用由各用户承担。没有配置 Key 时创建面试会提示「请先在设置页配置 API Key」。

**自托管/开发环境：** 可以在 `.env` 配一个全局 Key 作为兜底，未配置个人 Key 的用户自动使用此 Key。

### 生产部署安全清单

- [ ] `JWT_SECRET` 已改为强随机值 (`openssl rand -hex 32`)
- [ ] `.env` 中 `LLM_API_KEY` 已**留空**（生产环境用户自备 Key）
- [ ] `ALLOWED_ORIGINS` 已设为实际域名
- [ ] HTTPS 已配置（nginx/Caddy 反向代理）

## 🖥 服务器选型

| 规模 | 配置 | 并发 |
|------|------|------|
| 入门 | 2 核 4 GB | 2-5 人 |
| **推荐** | **4 核 8 GB** | **15-25 人** |
| 进阶 | 8 核 16 GB | 25-50 人 |

> 4 核 8 GB 经生产优化后可稳跑 15-25 并发用户，内存占用约 2.5 GB（含 FunASR 模型）。

## 📊 数据模型

- **User** — 用户信息（含 JWT 认证）
- **Resume** — 简历（上传 + 解析结果）
- **JobDescription** — 岗位介绍（JD）
- **Interview** — 面试会话（含总分、维度评分、总评、类别配置）
- **InterviewQuestion** — 面试题目（含回答、逐题评分、参考答案、TTS 缓存路径）
- **InterviewDocument** — 导出的文档记录
- **FavoritedQuestion** — 收藏的题目

## ⚡ 性能优化

- **PyTorch CPU**: 镜像体积从 12 GB → 3.5 GB（-70%）
- **BuildKit 缓存**: pip/apt/npm 跨构建复用，增量构建秒级完成
- **TTS 并行预生成**: `asyncio.gather` 所有题目同时合成，40s → 8s
- **TTS 缓存非阻塞**: 缓存未命中返回 202 后台生成，前端轮询不卡 UI
- **ASR 信号量**: 限制并行转录数，防止 OOM
- **前端相对路径**: API 请求走 Next.js Rewrite，后端地址不暴露

## 📄 许可

MIT License
