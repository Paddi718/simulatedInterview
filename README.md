# AI 模拟面试 (AI Mock Interview)

> 智能模拟面试平台 — 语音交互 + AI 评分 + 报告生成

## 📖 简介

一款面向求职者的 AI 模拟面试 Web 应用。用户上传简历和岗位介绍(JD)，AI 自动生成 10 道针对性面试题，以语音对话形式进行模拟面试，面试结束后输出多维度评分、参考答案、改进建议及简历优化建议，最终生成 PDF/MD/HTML 格式的面试报告。

## ✨ 核心功能

- **智能出题** — 基于简历 + JD，AI 自动生成个性化面试题
- **语音交互** — 语音录制 + 实时转写（ASR），AI 面试官语音播报（TTS）
- **多维度评分** — 内容完整性、专业度、表达能力、STAR法则，百分制
- **面试报告** — PDF / Markdown / HTML 三种格式，含雷达图、逐题评分、参考答案、简历优化建议
- **全栈 Docker 部署** — 一键启动前后端 + 数据库 + 缓存

## 🛠 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14, Tailwind CSS, shadcn/ui, Zustand, Recharts |
| 后端 | Python FastAPI, SQLAlchemy 2.0, Alembic |
| 数据库 | PostgreSQL 15 |
| 缓存 | Redis 7 |
| AI | DeepSeek / Claude API (出题 + 评分) |
| 语音 | 阿里云 ASR + 微软 Edge TTS（免费） |
| 部署 | Docker Compose |

## 🚀 快速开始

### 前置条件

- Docker Compose v2+
- Node.js >= 18（本地开发）
- Python >= 3.11（本地开发）

### 一键启动

```bash
# 1. 配置环境变量
cp .env.example .env
# 编辑 .env 填入你的 API 密钥

# 2. 构建并启动所有服务
docker compose build
docker compose up -d

# 3. 运行数据库迁移
docker compose exec backend alembic upgrade head

# 4. 访问应用
# 前端: http://localhost:3000
# 后端 API 文档: http://localhost:8000/docs
```

### 本地开发

```bash
# 后端
cd backend
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000

# 前端
cd frontend
npm install
npm run dev
# 访问 http://localhost:3000
```

## 📂 项目结构

```
simulatedInterview/
├── docker-compose.yml          # Docker 编排
├── backend/                    # FastAPI 后端
│   ├── app/
│   │   ├── main.py             # 应用入口
│   │   ├── config.py           # 配置管理
│   │   ├── database.py         # 数据库连接
│   │   ├── models/             # SQLAlchemy 模型 (6张表)
│   │   ├── schemas/            # Pydantic 请求/响应模型
│   │   ├── routers/            # API 路由 (auth/resume/jd/interview/websocket/document)
│   │   ├── services/           # 业务逻辑 (解析/出题/引擎/评分/文档/ASR/TTS)
│   │   ├── utils/              # 工具函数 (JWT认证)
│   │   └── templates/          # 报告模板
│   ├── alembic/                # 数据库迁移
│   └── requirements.txt
├── frontend/                   # Next.js 前端
│   ├── src/
│   │   ├── app/                # App Router 页面
│   │   │   ├── (auth)/login/   # 登录页
│   │   │   ├── (auth)/register/# 注册页
│   │   │   ├── dashboard/      # 仪表盘
│   │   │   ├── interview/
│   │   │   │   ├── prepare/    # 面试准备
│   │   │   │   ├── session/    # 面试会话
│   │   │   │   └── result/[id]/# 结果报告
│   │   │   ├── history/        # 历史记录
│   │   │   ├── resume/         # 简历管理
│   │   │   └── settings/       # 设置
│   │   ├── components/         # 通用组件
│   │   ├── lib/                # API 客户端
│   │   └── store/              # Zustand 状态管理
│   └── package.json
└── docs/                       # 设计文档
```

## 📊 数据模型

- **User** — 用户信息
- **Resume** — 简历（上传 + 解析结果）
- **JobDescription** — 岗位介绍（JD）
- **Interview** — 面试会话（含总分、维度评分、总评）
- **InterviewQuestion** — 面试题目（含回答、逐题评分、参考答案）
- **InterviewDocument** — 导出的文档记录

## 🔑 环境变量

参见 `.env.example`，关键配置项：

- `LLM_API_KEY` / `LLM_API_BASE` / `LLM_MODEL` — LLM 服务配置
- `ALIYUN_ASR_*` — 阿里云语音识别
- `TTS_API_KEY` — 语音合成
- `JWT_SECRET` — JWT 签名密钥

## 📄 许可

MIT License
