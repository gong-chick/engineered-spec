# OPS_部署运维文档 — BR AI Spec

> 📌 **适用对象**：运维工程师、平台管理员、DevOps 工程师  
> 📖 **关联文档**：[TECH](./TECH_技术架构文档.md) · [DB](./DB_数据库设计文档.md) · [API](./API_接口定义文档.md)  
> 🎯 **核心目标**：定义 BR AI Spec 体系的部署架构、运维流程、监控告警与故障排查

---

## 1. 部署架构

### 1.1 整体架构

BR AI Spec 体系包含两个独立部署单元：

| 单元 | 角色 | 部署方式 |
|------|------|----------|
| br-ai-spec（底座） | npm 包，安装到业务项目 | `npx @engineered/ai-spec-auto init .` |
| engineered-spec-visual（控制面） | Next.js 应用 | Docker / docker-compose / 裸机 |

```mermaid
flowchart TB
    subgraph 业务项目
        A[br-ai-spec<br/>npm 包]
    end
    
    subgraph 独立部署
        B[engineered-spec-visual<br/>Next.js 应用]
        C[(MySQL/MariaDB)]
    end
    
    A -- Hook 推送 / Collector 上报 --> B
    B --> C
```

### 1.2 网络拓扑

```
┌─────────────────────────────────────────────────────────────┐
│                         内网环境                              │
│                                                             │
│  ┌─────────────┐    ┌─────────────┐    ┌─────────────┐      │
│  │ 业务项目 A   │    │ 业务项目 B   │    │ 业务项目 C   │      │
│  │ br-ai-spec  │    │ br-ai-spec  │    │ br-ai-spec  │      │
│  └──────┬──────┘    └──────┬──────┘    └──────┬──────┘      │
│         │                  │                  │              │
│         └──────────────────┼──────────────────┘              │
│                            │ Hook/Collector                  │
│                            ▼                                 │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ engineered-spec-visual (Next.js + WebSocket)              │     │
│  │ 端口：3000                                           │     │
│  └────────────────────┬────────────────────────────────┘     │
│                       │                                      │
│                       ▼                                      │
│  ┌─────────────────────────────────────────────────────┐     │
│  │ MySQL/MariaDB (8.0+)                                │     │
│  │ 端口：3306                                           │     │
│  └─────────────────────────────────────────────────────┘     │
│                                                             │
└─────────────────────────────────────────────────────────────┘
```

---

## 2. br-ai-spec 部署（底座）

### 2.1 前置条件

| 条件 | 版本 | 说明 |
|------|------|------|
| Node.js | 18+ | 建议使用 LTS 版本 |
| npm | 8+ | 或 pnpm 8+ / yarn 1.22+ |
| Git | 2.30+ | 用于版本控制 |

### 2.2 内网 Registry 配置

**首次接入前**，在 `~/.npmrc` 中配置：

```ini
@ex:registry=http://nodejs.100credit.cn/
```

**验证配置：**

```bash
npm config get @ex:registry
# 应输出：http://nodejs.100credit.cn/
```

### 2.3 项目初始化

**完整安装（推荐）：**

```bash
cd /path/to/your-project
npx @engineered/ai-spec-auto@latest init .
```

**指定技术栈：**

```bash
# Vue 项目
npx @engineered/ai-spec-auto@latest init . --profile vue

# React 项目
npx @engineered/ai-spec-auto@latest init . --profile react
```

**Monorepo 子包：**

```bash
npx @engineered/ai-spec-auto@latest init . --package packages/web
```

### 2.4 安装后验证

```bash
# 检查安装状态
npx @engineered/ai-spec-auto@latest check .

# 查看已安装资产
ls -la .agents/rules/
ls -la .agents/skills/
ls -la openspec/
ls -la .ai-spec/
```

### 2.5 更新与卸载

```bash
# 更新
npx @engineered/ai-spec-auto@latest update .

# 部分更新
npx @engineered/ai-spec-auto@latest update . --skip-skills --skip-configs

# 卸载
npx @engineered/ai-spec-auto@latest uninstall .
```

---

## 3. engineered-spec-visual 部署（控制面）

### 3.1 前置条件

| 条件 | 版本 | 说明 |
|------|------|------|
| Node.js | 18+ | 建议使用 LTS 版本 |
| MySQL/MariaDB | 8.0+ / 10.5+ | 用于持久化存储 |
| Docker | 20+ | 可选，用于容器化部署 |
| Docker Compose | 2.0+ | 可选，用于容器编排 |

### 3.2 环境变量配置

创建 `.env` 或 `.env.local`：

```bash
# ===== 必填 =====
# MySQL 连接串
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/br_ai_spec_visual"

# ===== 可选（生产环境务必配置） =====
# 会话密钥（强随机字符串）
ENGINEERED_SPEC_VISUAL_SESSION_SECRET="your-strong-random-secret-here"

# Cookie 名称
ENGINEERED_SPEC_VISUAL_COOKIE_NAME="engineered-spec-visual-session"

# 应用名称
ENGINEERED_SPEC_VISUAL_APP_NAME="Engineered Spec Visual"

# Collector / 内部 ingest 校验密钥
REALTIME_CONNECT_SECRET="your-realtime-connect-secret-here"

# ===== Collector 配置 =====
# Visual 地址（Collector 上报目标）
AI_SPEC_VISUAL_URL="http://127.0.0.1:3000"

# 遥测开关（可选）
AI_SPEC_TELEMETRY_DISABLED=0

# ===== 调试（可选） =====
AI_SPEC_TELEMETRY_DEBUG=0
```

### 3.3 数据库初始化

```bash
# 1. 生成 Prisma Client
npm run prisma:generate

# 2. 同步 Schema 到数据库（开发环境）
npm run prisma:push

# 或使用迁移（生产环境）
npx prisma migrate deploy

# 3. 插入种子数据
npm run prisma:seed
```

### 3.4 开发环境启动

```bash
# 安装依赖
npm install

# 启动开发服务（含 Next.js + WebSocket）
npm run dev
```

访问 http://localhost:3000

### 3.5 生产环境构建

```bash
# 构建
npm run build

# 启动生产服务
npm run start
```

### 3.6 Docker 部署

**Dockerfile：**

```dockerfile
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM node:18-alpine AS runner
WORKDIR /app
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/.next ./.next
COPY --from=builder /app/public ./public
COPY --from=builder /app/node_modules ./node_modules
COPY --from=builder /app/prisma ./prisma
RUN npm run prisma:generate
EXPOSE 3000
CMD ["npm", "run", "start"]
```

**docker-compose.yml：**

```yaml
version: '3.8'

services:
  visual:
    build: .
    ports:
      - "3000:3000"
    environment:
      - DATABASE_URL=mysql://root:password@db:3306/br_ai_spec_visual
      - ENGINEERED_SPEC_VISUAL_SESSION_SECRET=your-secret-here
      - REALTIME_CONNECT_SECRET=your-connect-secret-here
    depends_on:
      - db
    restart: unless-stopped

  db:
    image: mysql:8.0
    ports:
      - "3306:3306"
    environment:
      - MYSQL_ROOT_PASSWORD=password
      - MYSQL_DATABASE=br_ai_spec_visual
    volumes:
      - mysql_data:/var/lib/mysql
    restart: unless-stopped

volumes:
  mysql_data:
```

**启动：**

```bash
docker-compose up -d

# 初始化数据库
docker-compose exec visual npm run prisma:generate
docker-compose exec visual npm run prisma:push
docker-compose exec visual npm run prisma:seed
```

### 3.7 Nginx 反向代理

```nginx
server {
    listen 80;
    server_name visual.example.com;

    location / {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        proxy_read_timeout 86400;
    }
}
```

**WebSocket 支持：**

Nginx 已配置 `Upgrade` 和 `Connection` header 转发，支持 WebSocket 同端口。

---

## 4. Collector 配置

### 4.1 基本用法

在已安装 ai-spec-auto 的业务项目中运行：

```bash
# 基本上报
npm run collector -- \
  --workspace-id my-workspace \
  --server http://localhost:3000

# 带认证密钥
npm run collector -- \
  --workspace-id my-workspace \
  --server http://localhost:3000 \
  --connect-token your-token-here

# 指定项目路径
npm run collector -- \
  --workspace-id my-workspace \
  --server http://localhost:3000 \
  --project /path/to/auto-project
```

### 4.2 定时上报

**Linux/macOS（cron）：**

```bash
# 每 5 分钟上报一次
*/5 * * * * cd /path/to/visual && npm run collector -- --workspace-id my-workspace --server http://localhost:3000
```

**Windows（任务计划程序）：**

创建定时任务，每 5 分钟执行：

```cmd
cd /d C:\path\to\visual
npm run collector -- --workspace-id my-workspace --server http://localhost:3000
```

### 4.3 验证 Collector 状态

```bash
# 查看上报日志
npm run collector -- --workspace-id my-workspace --server http://localhost:3000 --json

# 检查 Visual 首页是否显示数据
curl http://localhost:3000/api/dashboard/onboarding
```

---

## 5. 监控与告警

### 5.1 健康检查

```bash
# Visual 健康检查
curl http://localhost:3000/api/health

# 预期响应
# {"status":"ok","timestamp":"2026-04-23T23:00:00.000Z"}
```

### 5.2 数据库监控

**关键表状态查询：**

```sql
-- 检查 SyncJob 状态
SELECT status, COUNT(*) FROM SyncJob GROUP BY status;

-- 检查 Alert 表（未处理告警）
SELECT level, title, message FROM Alert WHERE status = 'open';

-- 检查 RawIngestEvent 最近上报
SELECT eventType, occurredAt FROM RawIngestEvent ORDER BY occurredAt DESC LIMIT 10;
```

### 5.3 告警规则

| 告警条件 | 级别 | 处理方式 |
|----------|------|----------|
| SyncJob 失败率 > 50% | warning | 检查 Collector 配置 |
| Alert 表 open 状态 > 10 | critical | 排查根本原因 |
| RawIngestEvent 24 小时无新增 | warning | 检查 Collector 是否运行 |
| ControlOutbox pending > 100 | warning | 检查控制指令执行 |
| 数据库连接池耗尽 | critical | 扩容或优化查询 |

### 5.4 日志管理

**Visual 日志：**

```bash
# 查看日志
tail -f /path/to/visual/logs/*.log

# 日志轮转（logrotate 配置）
/path/to/visual/logs/*.log {
    daily
    rotate 30
    compress
    delaycompress
    missingok
    notifempty
    create 0644 node node
}
```

**业务项目日志：**

```bash
# .omx/logs/ 目录
ls -la /path/to/project/.omx/logs/

# 查看最近日志
tail -f /path/to/project/.omx/logs/*.jsonl
```

---

## 6. 备份与恢复

### 6.1 数据库备份

**mysqldump：**

```bash
# 全量备份
mysqldump -u root -p br_ai_spec_visual > backup_$(date +%Y%m%d_%H%M%S).sql

# 压缩备份
mysqldump -u root -p br_ai_spec_visual | gzip > backup_$(date +%Y%m%d_%H%M%S).sql.gz
```

**定时备份（cron）：**

```bash
# 每天凌晨 2 点备份
0 2 * * * mysqldump -u root -p'password' br_ai_spec_visual | gzip > /backup/br_ai_spec_visual_$(date +\%Y\%m\%d).sql.gz
```

### 6.2 .ai-spec 目录备份

```bash
# 备份业务项目的 .ai-spec 目录
tar -czf ai-spec-backup_$(date +%Y%m%d).tar.gz /path/to/project/.ai-spec/
```

### 6.3 恢复流程

**数据库恢复：**

```bash
# 解压备份
gunzip backup_20260423.sql.gz

# 导入数据库
mysql -u root -p br_ai_spec_visual < backup_20260423.sql
```

**.ai-spec 恢复：**

```bash
# 解压备份
tar -xzf ai-spec-backup_20260423.tar.gz -C /path/to/project/
```

---

## 7. 常见问题排查

### 7.1 Collector 断连

**现象：** Visual 首页显示"Collector 未上报数据"

**排查步骤：**

```bash
# 1. 检查 Collector 是否运行
ps aux | grep collector

# 2. 手动运行 Collector 查看错误
npm run collector -- --workspace-id my-workspace --server http://localhost:3000 --json

# 3. 检查网络连接
curl http://localhost:3000/api/health

# 4. 检查 Visual 日志
tail -f /path/to/visual/logs/*.log

# 5. 检查 connect_token 是否匹配
# Visual .env 中的 REALTIME_CONNECT_SECRET 应与 Collector --connect-token 一致
```

**解决方案：**
- 重启 Collector
- 检查网络连通性
- 验证 connect_token

### 7.2 Hook 推送失败

**现象：** 业务项目 Run 状态变更未同步到 Visual

**排查步骤：**

```bash
# 1. 检查 visual-config.json
cat /path/to/project/.ai-spec/visual-config.json

# 2. 检查 push-client.js 日志
cat /path/to/project/.omx/logs/*.jsonl | grep push

# 3. 手动测试 Hook 推送
curl -X POST http://localhost:3000/api/internal/ingest/raw \
  -H "Content-Type: application/json" \
  -H "X-Workspace-ID: my-workspace" \
  -d '{"sourceKind":"hook-event","eventType":"run.started","rawEvents":[]}'
```

**解决方案：**
- 检查 visual-config.json 配置
- 检查网络连通性
- Hook 推送 fire-and-forget，失败不影响协议推进

### 7.3 WebSocket 连接异常

**现象：** 浏览器无法实时接收更新

**排查步骤：**

```bash
# 1. 检查 server.mjs 是否启动 WebSocket
ps aux | grep server.mjs

# 2. 检查端口是否被占用
lsof -i :3000

# 3. 检查 Nginx 配置（如使用反向代理）
# 确保配置了 Upgrade 和 Connection header

# 4. 浏览器开发者工具 Network 面板
# 查看 WebSocket 连接状态
```

**解决方案：**
- 重启 Visual 服务
- 检查 Nginx 配置
- 检查防火墙规则

### 7.4 数据库连接失败

**现象：** Visual 启动失败，日志显示数据库连接错误

**排查步骤：**

```bash
# 1. 检查 DATABASE_URL
echo $DATABASE_URL

# 2. 测试数据库连接
mysql -u USER -p -h 127.0.0.1 -P 3306 br_ai_spec_visual

# 3. 检查 MySQL 是否运行
systemctl status mysql

# 4. 检查 Prisma 生成
npm run prisma:generate
```

**解决方案：**
- 检查 DATABASE_URL 格式
- 重启 MySQL 服务
- 重新生成 Prisma Client

### 7.5 首页数据不显示

**现象：** 首页显示空态，但 Collector 已上报

**排查步骤：**

```bash
# 1. 检查 RawIngestEvent 表是否有数据
mysql -u root -p br_ai_spec_visual -e "SELECT COUNT(*) FROM RawIngestEvent;"

# 2. 检查 RunState 表是否有数据
mysql -u root -p br_ai_spec_visual -e "SELECT COUNT(*) FROM RunState;"

# 3. 检查 API 接口
curl http://localhost:3000/api/dashboard/summary

# 4. 检查浏览器控制台网络请求
```

**解决方案：**
- 检查数据投影逻辑
- 检查 API 接口实现
- 检查浏览器缓存

---

## 8. 性能优化建议

### 8.1 数据库优化

**索引优化：**

```sql
-- RunState 表
CREATE INDEX idx_workspace_status ON RunState(workspaceId, status);

-- RunEvent 表
CREATE INDEX idx_workspace_occurred ON RunEvent(workspaceId, occurredAt);

-- RawIngestEvent 表
CREATE INDEX idx_workspace_eventType ON RawIngestEvent(workspaceId, eventType);

-- Installation 表
CREATE INDEX idx_lastSeen ON Installation(lastSeenAt);
```

**查询优化：**

- 避免全表扫描，使用索引
- 限制查询结果数量（LIMIT）
- 使用 JOIN 替代子查询

### 8.2 缓存策略

**应用层缓存：**

- 首页聚合数据缓存 5 分钟
- Onboarding 状态缓存 1 分钟
- 趋势数据缓存 10 分钟

**Redis 缓存（可选）：**

```bash
# 安装 Redis
npm install redis

# 配置缓存
const redis = require('redis');
const client = redis.createClient();

// 缓存首页数据
await client.setEx('dashboard:summary:ws1', 300, JSON.stringify(data));
```

### 8.3 连接池优化

**MySQL 连接池：**

```bash
# .env 配置
DATABASE_URL="mysql://USER:PASSWORD@127.0.0.1:3306/br_ai_spec_visual?connectionLimit=10"
```

**Prisma 连接池：**

```typescript
// prisma/prisma.config.ts
import { defineConfig } from '@prisma/client';

export default defineConfig({
  datasource: {
    db: {
      url: process.env.DATABASE_URL,
      connectionLimit: 10,
    },
  },
});
```

---

## 9. 安全建议

### 9.1 生产环境必配

| 配置项 | 说明 |
|--------|------|
| ENGINEERED_SPEC_VISUAL_SESSION_SECRET | 强随机字符串（≥32 字符） |
| REALTIME_CONNECT_SECRET | Collector 认证密钥 |
| HTTPS | 生产环境必须启用 HTTPS |
| 防火墙 | 仅暴露 3000 端口（通过 Nginx） |
| 数据库密码 | 强密码，定期轮换 |

### 9.2 权限控制

- Workspace 成员权限（admin / maintainer / viewer）
- API 接口鉴权（Cookie + 服务端校验）
- Collector 上报认证（HMAC 校验）

### 9.3 数据脱敏

- 用户密码使用 bcryptjs 哈希存储
- 日志中不记录敏感信息（密码、Token）
- 数据库备份加密存储

---

## 10. 运维检查清单

### 每日检查

- [ ] Visual 服务状态（`curl /api/health`）
- [ ] Collector 上报状态（最近 24 小时有新增）
- [ ] 数据库连接状态
- [ ] 磁盘空间使用率

### 每周检查

- [ ] 日志文件大小（轮转是否正常）
- [ ] 数据库备份是否成功
- [ ] SyncJob 失败率
- [ ] Alert 表 open 状态数量

### 每月检查

- [ ] 数据库性能（慢查询日志）
- [ ] 磁盘空间清理
- [ ] 依赖包更新（`npm outdated`）
- [ ] 安全审计（漏洞扫描）

---

> 📌 **关联文档**：
> - [TECH](./TECH_技术架构文档.md) - 技术架构约束
> - [DB](./DB_数据库设计文档.md) - 数据库设计
> - [API](./API_接口定义文档.md) - 接口定义
