# 模拟面试应用 — 设计文档

> 日期: 2026-06-20
> 状态: 已确认设计

## 1. 产品概述

一款面向求职者的**AI 模拟面试 Web 应用**。用户上传简历和岗位介绍(JD)，AI 自动生成 10 道针对性面试题，以语音对话形式进行模拟面试，面试结束后输出多维度评分、参考答案、改进建议及简历优化建议，最终生成 PDF/MD/HTML 格式的面试报告。

### 核心价值

- 个性化：基于真实简历和 JD 出题，而非通用题库
- 沉浸式：语音对话模拟真实面试场景
- 可量化：百分制多维度评分，附详细评语
- 可行动：改进建议 + 简历优化建议，指向明确行动

## 2. 技术架构

### 2.1 整体架构

```
┌───────────────────────────────────────────────────────────────────┐
│                     Next.js 前端                                  │
│                                                                   │
│  ┌──────────┐  ┌──────────────┐  ┌──────────┐  ┌────────────┐   │
│  │ 面试准备页 │  │ 面试会话页    │  │ 结果报告页│  │ 历史记录页 │   │
│  │ 选岗位/题 │  │ 语音交互+实时 │  │ 评分+改  │  │ 面试记录  │   │
│  │ 库类型   │  │ 字幕+AI形象  │  │ 进建议   │  │ 列表     │   │
│  └──────────┘  └──────┬───────┘  └──────────┘  └────────────┘   │
│                       │ WebSocket (语音流)                        │
│                       │ SSE (AI 文本流)                          │
│                       │ REST (数据操作)                          │
└───────────────────────┼───────────────────────────────────────────┘
                        │
┌───────────────────────┼───────────────────────────────────────────┐
│           Python FastAPI 后端                                     │
│                                                                   │
│  ┌────────────────────────────────────────────────────────────┐   │
│  │              API 网关层 (路由/鉴权/限流)                    │   │
│  └──────┬──────┬──────┬──────┬──────┬──────┬─────────────────┘   │
│         ▼      ▼      ▼      ▼      ▼      ▼                     │
│  ┌────────┐┌──────┐┌──────┐┌──────┐┌──────┐┌────────┐          │
│  │面试编排 ││评分  ││文档  ││ASR   ││TTS   ││ 用户   │          │
│  │引擎    ││引擎  ││生成器 ││网关   ││网关  ││ 管理   │          │
│  │(状态机) ││(LLM)││      ││      ││      ││       │          │
│  └────────┘└──────┘└──────┘└──────┘└──────┘└────────┘          │
└───────────────────────────────────────────────────────────────────┘
```

### 2.2 Docker 容器架构

```
docker-compose.yml
├── service: postgres     → PostgreSQL 15 (数据卷: pgdata)
├── service: redis        → Redis 7 (缓存/会话)
├── service: backend      → Python FastAPI (依赖 postgres + redis)
└── service: frontend     → Next.js (依赖 backend)
```

### 2.3 技术选型

| 层 | 技术 | 选型理由 |
|-----|------|---------|
| 前端框架 | Next.js 14+ (App Router) | SSR/SSG 混合，API Routes 可做 BFF |
| UI | Tailwind CSS + shadcn/ui | 开发快，组件丰富，暗色模式原生支持 |
| 状态管理 | Zustand | 轻量，TypeScript 友好 |
| 前端语音 | MediaRecorder API + Web Audio API | 浏览器原生，无需额外依赖 |
| 实时通信 | WebSocket + Server-Sent Events | WS 传音频，SSE 传文本流 |
| 后端 | Python FastAPI | 异步原生，WebSocket 支持好，AI 生态丰富 |
| 数据库 | PostgreSQL 15 | 关系型 + JSONB 灵活存储 |
| 缓存 | Redis 7 | 面试会话状态 + 临时缓存 |
| ORM | SQLAlchemy 2.0 + Alembic | 成熟稳定，迁移管理 |
| 语音 ASR | 阿里云实时语音识别 | 中文识别率最高之一，WebSocket 流式 |
| 语音 TTS | 阿里云/讯飞 TTS | 多音色，SSML 支持 |
| LLM | Claude API / DeepSeek | 中文能力强，结构化输出稳定 |
| 简历解析 | PyMuPDF + python-docx + LLM | PDF/DOCX 文本提取 + LLM 结构化 |
| 文档生成 | Markdown + WeasyPrint | MD 中间格式，PDF 高质量渲染 |

### 2.4 存储设计

#### 本地文件结构

```
/var/data/interview-app/          # Docker volume 挂载点
├── audio/                        # 用户录音
│   └── {user_id}/
│       └── {interview_id}/
│           ├── q1_回答.webm
│           ├── q2_回答.webm
│           └── ...
├── documents/                    # 生成的面试文档
│   └── {user_id}/
│       └── {interview_id}/
│           ├── report.pdf
│           ├── report.md
│           └── report.html
├── resumes/                      # 上传的简历文件
│   └── {user_id}/
│       └── {resume_id}_原始文件.pdf
└── exports/                      # 用户导出的文件
```

#### Docker Volumes

```yaml
volumes:
  pgdata:       # PostgreSQL 数据持久化
  redis_data:   # Redis 持久化
  app_data:     # 应用文件存储 (audio/documents/resumes)
```

## 3. 核心数据模型

### 3.1 用户 (User)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| username | VARCHAR(50) | 唯一用户名 |
| password_hash | VARCHAR(255) | bcrypt 哈希 |
| email | VARCHAR(255) | 可选 |
| avatar_url | TEXT | 头像路径 |
| created_at | TIMESTAMP | 创建时间 |
| tts_preference | JSONB | TTS 语速/音色偏好 |

### 3.2 简历 (Resume)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID → User | 所属用户 |
| original_filename | VARCHAR(255) | 原始文件名 |
| file_path | TEXT | 本地存储路径 |
| file_type | VARCHAR(10) | pdf/docx/txt |
| parsed_data | JSONB | LLM 结构化解析结果 |
| created_at | TIMESTAMP | 上传时间 |

`parsed_data` 结构示例:
```json
{
  "basic": {
    "name": "张三",
    "education": [
      {"school": "XX大学", "degree": "硕士", "major": "计算机", "period": "2018-2021"}
    ]
  },
  "experience": [
    {
      "company": "XX科技",
      "role": "后端开发工程师",
      "period": "2021-2024",
      "description": "负责电商平台后端架构",
      "tech_stack": ["Python", "Go", "PostgreSQL"],
      "highlights": ["设计了日活百万的推送系统"]
    }
  ],
  "projects": [
    {
      "name": "分布式任务调度系统",
      "description": "基于 Celery + Redis 实现的分布式任务调度",
      "role": "核心开发者",
      "highlights": ["支持 10 万+/天任务调度"]
    }
  ],
  "skills": ["Python", "Kubernetes", "PostgreSQL", "Celery", "Redis"],
  "certifications": ["CKA"],
  "self_evaluation": "5年后端开发经验..."
}
```

### 3.3 岗位介绍 (JobDescription)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID → User | 所属用户 |
| raw_text | TEXT | 原始 JD 文本 |
| parsed_data | JSONB | LLM 结构化解析 |
| source | VARCHAR(20) | manual / paste |
| created_at | TIMESTAMP | 创建时间 |

`parsed_data` 结构:
```json
{
  "company_info": "XX公司，B轮融资...",
  "position": "高级后端工程师",
  "key_responsibilities": ["负责核心业务系统设计开发", "技术方案评审"],
  "requirements": ["精通 Python/Go", "5年+分布式系统经验", "熟悉 K8s"],
  "preferred": ["大厂背景", "开源贡献"],
  "team_culture": "扁平化管理，技术驱动",
  "salary_range": "30k-50k·15薪"
}
```

### 3.4 面试会话 (Interview)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| user_id | UUID → User | 所属用户 |
| resume_id | UUID → Resume | 关联简历 |
| jd_id | UUID → JobDescription | 关联岗位介绍 |
| difficulty | VARCHAR(10) | junior/mid/senior |
| total_score | INTEGER | 总分 (0-100) |
| dimension_scores | JSONB | 各维度得分 |
| status | VARCHAR(20) | preparing/in_progress/completed/interrupted |
| ai_overview | TEXT | AI 面试总评 |
| resume_suggestions | TEXT | 简历优化建议全文 |
| started_at | TIMESTAMP | 开始时间 |
| finished_at | TIMESTAMP | 完成时间 |
| created_at | TIMESTAMP | 创建时间 |

`dimension_scores` 示例:
```json
{
  "content_completeness": 85,
  "professionalism": 78,
  "expression": 90,
  "star_method": 82
}
```

### 3.5 面试题目 (InterviewQuestion)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| interview_id | UUID → Interview | 所属面试 |
| question_text | TEXT | 题目内容 |
| question_type | VARCHAR(20) | behavioral/technical/situational/career/introduction |
| user_audio_path | TEXT | 录音文件路径 |
| user_answer_transcript | TEXT | ASR 转写文本 |
| duration_seconds | INTEGER | 回答用时 |
| ai_score | INTEGER | 该题总分 |
| score_detail | JSONB | 各维度细分得分 |
| ai_evaluation | TEXT | AI 评语 |
| reference_answer | TEXT | AI 生成的参考答案 |
| improvement_suggestion | TEXT | 改进建议 |
| order_index | INTEGER | 题目顺序 (1-10) |

### 3.6 面试文档 (InterviewDocument)

| 字段 | 类型 | 说明 |
|------|------|------|
| id | UUID | 主键 |
| interview_id | UUID → Interview | 所属面试 |
| format | VARCHAR(10) | pdf/markdown/html |
| file_path | TEXT | 本地存储路径 |
| file_size | INTEGER | 文件大小(bytes) |
| generated_at | TIMESTAMP | 生成时间 |

## 4. 核心业务流程

### 4.1 面试会话状态机

```
准备面试 → AI开场 → 逐题循环(×10) → 面试结束 → 评分生成 → 文档生成 → 查看报告
```

### 4.2 每道题的交互时序

1. **请求题目**: 前端请求 REST API 获取下一题文本
2. **TTS 播题**: 后端调用 TTS API 合成语音，SSE 流式返回音频 → 前端播放
3. **用户回答**: 前端通过 WebSocket 实时发送音频流 → 后端转发 ASR → 实时字幕回传
4. **回答完成**: 用户点击"提交"或自动检测静音结束
5. **AI 即时反馈**: LLM 对回答给予简短评语/追问（不展示分数）
6. **保存**: 录音文件存本地 + 转写文本存入数据库

### 4.3 双阶段评分策略

| 阶段 | 时机 | 内容 | 展示位置 |
|------|------|------|---------|
| 即时反馈 | 每题回答后 | 简短评语 + 引导（无分数） | 面试进行中 |
| 正式评分 | 全部10题完成后 | 4维度百分制 + 详细评语 + 参考答案 | 结果报告 |

### 4.4 简历+JD → 个性化出题

```
简历上传 → LLM解析 → 结构化简历数据
                                         → 能力差距矩阵 → 题目生成(10题)
JD输入 → LLM解析 → 结构化JD数据
```

题目类型分配:
- 3 题 行为面试 (Behavioral) — 针对简历经历深挖
- 3 题 专业技能 (Technical) — 针对 JD 技术要求
- 2 题 情景题 (Situational) — 针对 JD 职责描述
- 1 题 职业规划 — 评估求职动机
- 1 题 自我介绍 — 验证简历与表达的匹配度

## 5. 面试报告结构

生成的报告包含以下章节:

| 章节 | 内容 |
|------|------|
| 1. 面试概览 | 岗位、时间、总分、维度雷达图 |
| 2. 能力差距分析 | JD要求 vs 展示能力对比，优势/待提升/缺失 |
| 3. 逐题评分 (×10) | 题目、回答转写、各维度评分、评语、参考答案、改进建议 |
| 4. 综合提升计划 | 短期/中期/长期学习路径 |
| 5. 简历优化建议 | 基于面试表现反推简历改进点，JD关键词匹配建议 |
| 6. 下一步行动 | 推荐学习资源，建议再次模拟的主题 |

## 6. 前端页面结构

### 路由设计

| 路径 | 页面 | 说明 |
|------|------|------|
| `/` | 首页/登录 | 登录注册入口 |
| `/dashboard` | 仪表盘 | 统计概览、快速开始 |
| `/interview/prepare` | 面试准备 | 上传简历、填写JD、预览题目 |
| `/interview/session` | 面试会话 | 核心语音交互页面 |
| `/interview/result/[id]` | 面试结果 | 评分报告、导出 |
| `/history` | 历史记录 | 面试记录列表 |
| `/resume` | 简历管理 | 已上传简历 |
| `/settings` | 设置 | 语音偏好、导出格式 |

## 7. 项目目录结构

```
F:\program\simulatedInterview\
├── docker-compose.yml
├── Dockerfile.frontend
├── Dockerfile.backend
├── .env.example                    # 环境变量模板
│
├── frontend/
│   ├── src/
│   │   ├── app/                    # App Router
│   │   │   ├── (auth)/
│   │   │   ├── dashboard/
│   │   │   ├── interview/
│   │   │   │   ├── prepare/
│   │   │   │   ├── session/
│   │   │   │   └── result/
│   │   │   ├── history/
│   │   │   ├── resume/
│   │   │   └── settings/
│   │   ├── components/
│   │   │   ├── interview/          # 面试专用组件
│   │   │   ├── document/           # 文档预览组件
│   │   │   └── common/             # 通用组件
│   │   ├── lib/                    # 工具库
│   │   │   ├── websocket.ts
│   │   │   ├── audio.ts
│   │   │   └── api.ts
│   │   └── store/                  # Zustand 状态管理
│   └── package.json
│
├── backend/
│   ├── app/
│   │   ├── main.py                 # 入口
│   │   ├── config.py               # 配置
│   │   ├── routers/
│   │   │   ├── auth.py
│   │   │   ├── interview.py
│   │   │   ├── resume.py
│   │   │   ├── document.py
│   │   │   └── websocket.py
│   │   ├── services/
│   │   │   ├── interview_engine.py # 面试状态机
│   │   │   ├── scoring_service.py  # LLM评分
│   │   │   ├── resume_parser.py    # 简历解析
│   │   │   ├── question_generator.py # 智能出题
│   │   │   ├── asr_service.py      # 语音识别
│   │   │   ├── tts_service.py      # 语音合成
│   │   │   └── document_service.py # 文档生成
│   │   ├── models/                 # SQLAlchemy
│   │   ├── schemas/                # Pydantic
│   │   └── utils/
│   ├── Dockerfile
│   └── requirements.txt
│
└── docs/
    └── specs/
        └── 2026-06-20-interview-app-design.md
```

## 8. API 端点设计

### REST API

| 方法 | 路径 | 说明 |
|------|------|------|
| POST | `/api/auth/register` | 注册 |
| POST | `/api/auth/login` | 登录 |
| POST | `/api/resume/upload` | 上传简历 |
| GET | `/api/resume/:id` | 获取解析后的简历 |
| DELETE | `/api/resume/:id` | 删除简历 |
| GET | `/api/resume/list` | 简历列表 |
| POST | `/api/jd/create` | 创建岗位介绍 |
| GET | `/api/jd/:id` | 获取解析后的JD |
| POST | `/api/interview/create` | 创建面试(传resume_id, jd_id) |
| GET | `/api/interview/:id` | 获取面试详情 |
| POST | `/api/interview/:id/start` | 开始面试 |
| POST | `/api/interview/:id/next-question` | 获取下一题 |
| POST | `/api/interview/:id/submit-answer` | 提交答案(音频) |
| POST | `/api/interview/:id/complete` | 完成面试(触发评分) |
| GET | `/api/interview/:id/result` | 获取评分结果 |
| GET | `/api/interview/:id/document/:format` | 下载文档(PDF/MD/HTML) |
| GET | `/api/interview/list` | 面试历史列表 |
| GET | `/api/user/stats` | 用户统计 |
| PUT | `/api/user/settings` | 更新设置 |

### WebSocket

| 端点 | 说明 |
|------|------|
| `ws://host/api/ws/interview/{interview_id}` | 面试音频流 |
| → 上行: 二进制音频 chunk | 用户录音实时传输 |
| ← 下行: JSON {type: "transcript", text: "..."} | ASR 实时字幕 |
| ← 下行: JSON {type: "ai_feedback", text: "..."} | AI 即时反馈 |

## 9. 错误处理策略

| 场景 | 处理方式 |
|------|---------|
| ASR 服务超时/失败 | 降级为手动输入文本，不阻塞流程 |
| LLM API 调用失败 | 重试 2 次，仍失败标记"评分待定"，面试可继续 |
| 网络中断 | 前端缓存录音，恢复后断点续传 |
| 麦克风权限拒绝 | 提示授权，降级为文字输入模式 |
| TTS 合成失败 | 回退为文字展示，流程继续 |
| Docker 容器重启 | 进行中面试标记"已中断"，数据不丢失 |
| 文件上传格式错误 | 前端校验前端拦截，明确提示支持格式 |

## 10. 实现路线图

### Phase 1: 基础骨架 (1-2周)
- Docker 环境搭建 (PostgreSQL + Redis + 基础服务)
- 用户认证系统 (注册/登录/JWT)
- 基本页面路由框架
- 数据库表结构 & Alembic 迁移

### Phase 2: 核心面试流程 (2-3周)
- 简历上传 & LLM 解析
- JD 输入 & 解析
- AI 智能出题引擎
- 面试状态机实现
- 前端面试会话页面 (录音/字幕/控制)
- ASR + TTS 服务集成

### Phase 3: 评分与报告 (2周)
- LLM 评分引擎 (4维度评估)
- 评分结果可视化 (雷达图/对比)
- 文档生成 (PDF/MD/HTML)
- 简历优化建议生成
- 结果页面展示

### Phase 4: 体验完善 (1周)
- AI 即时反馈优化
- 历史记录管理
- 导出功能完善
- 设置页面
- 边缘情况处理 & 错误状态覆盖

### Phase 5: 上线准备 (1周)
- Docker Compose 最终集成测试
- 部署文档编写
- 使用文档编写

## 11. UI设计原则

- **面试会话页**: 沉浸式暗色主题，减少干扰，聚焦语音交互
- **结果报告页**: 清晰的信息层级，雷达图可视化，可折叠的逐题详情
- **准备页**: 向导式步骤引导，每一步有明确反馈
- **响应式**: 桌面优先，但布局适配平板尺寸（为后续移动端做铺垫）

## 12. 边界状态覆盖

| 状态 | 前端表现 | 后端处理 |
|------|---------|---------|
| 加载中 | Skeleton 骨架屏 | - |
| 空状态 | 引导提示(无面试记录/无简历) | - |
| 错误 | 错误提示 + 重试按钮 | 错误日志 + 返回友好信息 |
| 上传中 | 进度条 + 文件名校验 | 文件大小/类型校验 |
| 面试进行中 | 全屏沉浸模式，防止误退出 | 每步自动保存 |
| 面试中断 | 提示"是否恢复" | 标记 interrupted 可恢复 |
| 评分进行中 | 加载动画 + "正在分析你的表现..." | 异步任务处理 |
| 导出中 | 进度提示 | PDF/MD 异步生成 |
