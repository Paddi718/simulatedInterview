# 部署指南

## 前置条件

- **Docker Compose v2+** — 推荐 Docker Desktop 24+
- **内存** — 建议 4GB+（运行 PostgreSQL + Redis + FastAPI + Next.js）
- **磁盘** — 建议 20GB+（含 Docker 镜像和数据卷）

## 环境配置

### 1. 复制环境变量模板

```bash
cp .env.example .env
```

### 2. 填写 API 密钥

编辑 `.env` 文件，至少需要配置以下项：

```env
# LLM 服务（必填）
LLM_API_KEY=sk-your-api-key
LLM_API_BASE=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# JWT（必填，请更换为随机字符串）
JWT_SECRET=your-random-secret-string

# 数据库（可选，默认即可用）
POSTGRES_USER=interview_user
POSTGRES_PASSWORD=change_this_password

# 语音服务（可选，不影响核心面试流程）
# ALIYUN_ASR_APP_KEY=
# ALIYUN_ASR_ACCESS_KEY_ID=
# ALIYUN_ASR_ACCESS_KEY_SECRET=
# TTS_API_KEY=
```

> **注意**：语音服务（ASR/TTS）配置后可获得完整语音交互体验。不配置时，面试流程仍可正常使用（文字输入模式）。

## Docker 部署

### 构建并启动

```bash
# 构建所有服务镜像
docker compose build

# 后台启动所有服务
docker compose up -d

# 查看运行状态
docker compose ps

# 查看日志
docker compose logs -f
```

### 数据库迁移

```bash
# 首次启动后，运行数据库迁移
docker compose exec backend alembic upgrade head
```

### 访问应用

| 服务 | 地址 |
|------|------|
| 前端应用 | http://localhost:3000 |
| API 文档 (Swagger) | http://localhost:8000/docs |
| 健康检查 | http://localhost:8000/api/health |

### 数据持久化

所有数据通过 Docker volumes 持久化：

| Volume | 用途 |
|--------|------|
| `pgdata` | PostgreSQL 数据库文件 |
| `redis_data` | Redis 缓存数据 |
| `app_data` | 用户上传文件（简历、音频、文档） |

### 停止和清理

```bash
# 停止所有服务
docker compose down

# 停止并删除数据卷（⚠️ 会丢失所有数据）
docker compose down -v
```

## 服务端口

| 服务 | 内部端口 | 宿主机端口 |
|------|---------|-----------|
| PostgreSQL | 5432 | 5432 |
| Redis | 6379 | 6379 |
| FastAPI | 8000 | 8000 |
| Next.js | 3000 | 3000 |

## 常见问题

### Q: 启动时提示端口被占用？

```bash
# 查看端口占用
netstat -an | grep 5432  # 或 6379, 8000, 3000

# 修改 .env 中的端口映射或 docker-compose.yml 中的 ports
```

### Q: 数据库连接失败？

检查后端日志：
```bash
docker compose logs backend
```

确保 PostgreSQL 健康检查通过后再启动后端。

### Q: LLM 调用失败？

检查：
1. `.env` 中 `LLM_API_KEY` 是否正确
2. 网络是否能访问 `LLM_API_BASE`
3. API 余额是否充足

## 生产部署建议

- 使用 nginx/Caddy 反向代理前端
- 配置 HTTPS 证书
- 设置 PostgreSQL 定期备份
- 配置日志收集（如 ELK / Loki）
- 使用强随机 JWT_SECRET
- 限制 CORS origins 为实际域名
