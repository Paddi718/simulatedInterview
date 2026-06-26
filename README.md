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

- **智能出题** — 私企（简历+JD）/ 公务员/事业单位（省份省情 + 时政热点搜索），AI 自动生成个性化面试题
- **时政搜索** — 公务员/事业单位面试自动搜索近期热点，Serper → Tavily → 内置 Bing 三重兜底
- **语音交互** — 桌面/手机统一流式转写（硅基流动在线 ASR + VAD 分段），AI 面试官语音播报（Edge TTS）
- **多维度评分** — 按类别差异化评分维度，百分制 + 逐题打分
- **面试报告** — PDF / Markdown / HTML 三种格式，含雷达图、逐题评分、参考答案、简历优化建议
- **邮箱验证** — 注册邮箱验证 + 忘记密码重置，HTML 邮件模板
- **管理后台** — 用户管理、面试管理、系统统计、搜索配置（管理员可视化管理）
- **全栈 Docker 部署** — 一键启动前后端 + 数据库 + 缓存
- **生产安全** — HTTPS + nginx 反代、CORS 白名单、速率限制、LLM Key 脱敏、安全响应头

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14, Tailwind CSS, Lucide Icons, Zustand |
| 后端 | Python FastAPI, SQLAlchemy 2.0 (async), Alembic, Jinja2 |
| 数据库 | PostgreSQL 15 |
| 缓存 | Redis 7 |
| AI | 兼容 OpenAI 接口（DeepSeek / 通义千问 / GLM / Kimi 等），出题 + 评分 |
| 语音识别 | 硅基流动在线 ASR（FunAudioLLM/SenseVoiceSmall） / 本地 FunASR（开发可选） |
| 语音合成 | 微软 Edge TTS（免费） |
| 搜索 | Serper / Tavily / 内置 Bing 爬虫（免费，多源兜底） |
| 邮件 | SMTP（QQ / 163 / Gmail / 企业邮箱等，验证码发送） |
| 部署 | Docker Compose + BuildKit 缓存 + nginx 反向代理 + Let's Encrypt |

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
pip install -r requirements.txt           # 生产依赖（在线 ASR）
# 如需本地 FunASR 模型: pip install -r requirements-local.txt
bash ../run_backend.sh    # → http://localhost:8010

# ASR 后端选择: 管理后台「系统配置」→ 语音转文字
#   siliconflow = 在线 API（推荐，无需本地模型）
#   local       = 本地 FunASR（需安装 requirements-local.txt + 挂载模型）

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
│   ├── Dockerfile                  # 生产轻量镜像（不含 torch/funasr）
│   ├── app/
│   │   ├── main.py                 # 应用入口（CORS / 速率限制 / 安全头）
│   │   ├── config.py               # 配置管理（Pydantic Settings）
│   │   ├── database.py             # 数据库连接池
│   │   ├── models/                 # SQLAlchemy 模型 (7 张表)
│   │   ├── schemas/                # Pydantic 请求/响应模型
│   │   ├── routers/                # API 路由 (auth/resume/jd/interview/ws/doc)
│   │   ├── services/               # 业务逻辑 (出题/引擎/评分/文档/ASR/TTS/缓存/搜索)
│   │   │   └── search/             # 多源搜索编排 (Serper/Tavily/Bing 内置)
│   │   └── utils/                  # 工具函数 (JWT 认证、管理员权限)
│   ├── alembic/                    # 数据库迁移
│   └── requirements.txt
├── frontend/                       # Next.js 前端
│   ├── Dockerfile                  # 多阶段构建 + 非 root 运行
│   ├── next.config.js              # Rewrite 代理 + 安全头 + 压缩
│   └── src/
│       ├── app/                    # App Router 页面 (含 admin/ 管理后台)
│       ├── components/             # 通用组件 (含 admin/ 管理组件)
│       ├── lib/api.ts              # API 客户端（相对路径，不暴露后端）
│       ├── types/                  # TypeScript 类型定义
│       └── store/                  # Zustand 状态管理
├── models/                         # 本地 ASR 模型（可选；在线模式不需要）
└── data/                           # 运行时数据（不纳入版本控制）
```

## 🔑 环境变量

参见 `.env.example`，关键配置项：

| 变量 | 说明 | 必填 |
|------|------|------|
| `JWT_SECRET` | JWT 签名密钥（生产环境必须修改） | ✅ |
| `LLM_API_KEY` | 全局兜底 Key（生产环境留空，用户自备） | ❌ |
| `LLM_API_BASE` | LLM API 地址 | ❌ |
| `LLM_MODEL` | LLM 模型名称（如 `deepseek-chat`、`qwen-plus`） | ❌ |
| `ASR_PROVIDER` | ASR 后端（`siliconflow` / `local`） | 可在管理后台配置 |
| `ASR_SILICONFLOW_API_KEY` | 硅基流动 API Key | 可在管理后台配置 |
| `FIRST_ADMIN_USERNAME` | 首个管理员用户名（首次启动自动创建） | ❌ |
| `FIRST_ADMIN_PASSWORD` | 首个管理员密码 | ❌ |
| `FIRST_ADMIN_EMAIL` | 首个管理员邮箱 | ❌ |
| `SMTP_HOST` | 邮箱 SMTP 服务器（如 `smtp.qq.com`） | 可在管理后台配置 |
| `SMTP_PORT` | SMTP 端口（QQ: 465，其他: 587 等） | 可在管理后台配置 |
| `SMTP_USER` / `SMTP_PASSWORD` | SMTP 认证信息（密码/授权码） | 可在管理后台配置 |
| `SMTP_FROM` | 发件人地址（通常与 SMTP_USER 相同） | 可在管理后台配置 |
| `ALLOWED_ORIGINS` | CORS 白名单 | 生产建议 |
| `ASR_MAX_CONCURRENT` | ASR 并发上限（3-5） | 生产建议 |
| `UVICORN_WORKERS` | Uvicorn worker 数量（2） | 生产建议 |
| `DB_POOL_SIZE` | 数据库连接池（20） | 生产建议 |

> 搜索 API Key（Serper/Tavily）在管理后台「系统配置」页面配置，不通过环境变量管理。

### 💡 LLM API Key 设计

**生产环境：每个用户自带 Key。** 用户注册后去「设置」页配置自己的 LLM API Key（兼容 OpenAI 接口的模型均可，如 DeepSeek、通义千问、GLM、Kimi 等），出题和评分的费用由各用户承担。没有配置 Key 时创建面试会提示「请先在设置页配置 API Key」。

**自托管/开发环境：** 可以在 `.env` 配一个全局 Key 作为兜底，未配置个人 Key 的用户自动使用此 Key。

### 🛡 管理后台

管理员登录后侧边栏出现「管理后台」入口，包含：

| 页面 | 功能 |
|------|------|
| 管理仪表盘 | 系统统计（总用户/今日面试/7日活跃）+ 最近用户/面试 |
| 用户管理 | 搜索/分页/详情/设为管理员/禁用/恢复/软删除/硬删除/在线状态（🟢/⚫） |
| 面试管理 | 按类别筛选/分页/删除/题目数量显示 |
| 系统配置 | 搜索 Key + 邮箱 SMTP + ASR（在线/本地切换），可视化修改即时生效 |

**创建管理员**：在 `.env` 中设置 `FIRST_ADMIN_USERNAME` / `FIRST_ADMIN_PASSWORD` / `FIRST_ADMIN_EMAIL`，首次启动自动创建。

### 📰 时政搜索（公务员/事业单位）

出题时自动搜索省份近期的时政热点新闻，融入题目场景：

```
优先级：Serper（Google 结果）→ Tavily（AI 优化）→ 内置 Bing 爬虫（自动兜底）
```

- 搜索 API Key 在管理后台「系统配置」页面配置，存入数据库，无需修改 `.env`
- 所有搜索源免费（Serper 2,500 次 / Tavily 1,000 次/月 / 内置 Bing 无限）
- 全部故障时自动降级为 LLM 基于训练知识出题

### 🎙 语音实时转写（桌面 + 手机统一）

录音采用 VAD（语音活动检测）+ WebSocket PCM 流式架构，桌面与手机统一行为：

```
录音 → AudioContext 16kHz PCM → 64ms 分帧 → base64 → WebSocket
  → 后端 VAD 累积 + 500ms 静音判句尾 → 在线 ASR 转写（~2s）
  → transcript_segment 回推前端 → 实时显示文字
  → 停录时 asr_flush 等待最后一段转完 → 进入复核
```

- 桌面端不再依赖浏览器 SpeechRecognition（兼容性差、手机不支持）
- ASR 配置在管理后台「系统配置」→「语音转文字」管理（在线/本地切换、API Key）

### 🔒 HTTPS 与域名

- 推荐配置 Let's Encrypt 正式证书（支持 wss:// 实时转写）
- 域名未备案导致 HTTP 拦截时，可用 DNS-01 方式签发证书（绕过 80 端口）
- 临时可通过 `https://<IP>` 访问（证书警告不影响功能，wss 正常连接）

### 生产部署安全清单

- [ ] `JWT_SECRET` 已改为强随机值 (`openssl rand -hex 32`)
- [ ] `.env` 中 `LLM_API_KEY` 已**留空**（生产环境用户自备 Key）
- [ ] `FIRST_ADMIN_USERNAME` / `FIRST_ADMIN_PASSWORD` 已配置（创建管理员账号）
- [ ] SMTP 邮箱配置已完成（注册验证 + 忘记密码）
- [ ] ASR 配置已设（管理后台「语音转文字」→ 在线模式 + API Key）
- [ ] `ALLOWED_ORIGINS` 已设为实际域名
- [ ] HTTPS 证书已配置（Let's Encrypt）

## 🖥 服务器选型

| 规模 | 配置 | 并发 |
|------|------|------|
| 入门 | 2 核 2 GB | 2-5 人 |
| **推荐** | **2 核 4 GB** | **10-20 人** |
| 进阶 | 4 核 8 GB | 20-50 人 |

> 2 核 4 GB 生产优化后稳跑 10-20 并发用户，后端内存约 200 MB（在线 ASR 免本地模型）。

## 📊 数据模型

- **User** — 用户信息（含 JWT 认证、邮箱验证、管理员角色、禁用/软删除标记、最后活跃时间）
- **Resume** — 简历（上传 + PyMuPDF 提取原文 `raw_text`，面试出题直接引用）
- **JobDescription** — 岗位介绍（JD，存储原始文本，面试出题直接引用）
- **Interview** — 面试会话（含总分、维度评分、总评、类别配置、评分状态）
- **InterviewQuestion** — 面试题目（含回答、逐题评分、参考答案、TTS 缓存路径）
- **InterviewDocument** — 导出的文档记录
- **FavoritedQuestion** — 收藏的题目
- **SystemConfig** — 系统配置（Key-Value，搜索/ASR/SMTP 等）

## ⚡ 性能优化

- **在线 ASR**: 硅基流动在线模型替代本地 FunASR，服务器内存 1.2 GB → 200 MB，无 OOM 风险
- **BuildKit 缓存**: pip/apt/npm 跨构建复用，增量构建秒级完成
- **TTS 并行预生成**: `asyncio.gather` 所有题目同时合成，40s → 8s
- **TTS 缓存非阻塞**: 缓存未命中返回 202 后台生成，前端轮询不卡 UI
- **流式音频转写**: VAD 分段 + WebSocket PCM 流，桌面/手机统一实时显示
- **ASR 信号量**: 限制并行转录数，保护 API 速率和带宽
- **后端镜像瘦身**: 移除 torch/funasr 依赖（约 1 GB），镜像从 2.5 GB → 1 GB
- **推理模型兼容**: llm_chat_stream 兼容 `reasoning_content` 字段（qwen3.7+/R1 等推理模型）
- **出题等待优化**: 流式生成 + 3 秒轮询降级，首题即显示，进度实时更新
- **管理员在线状态**: 用户认证时自动记录 `last_active_at`，管理后台展示在线/离线
- **前端相对路径**: API 请求走 Next.js Rewrite，后端地址不暴露

## 📄 许可

MIT License
