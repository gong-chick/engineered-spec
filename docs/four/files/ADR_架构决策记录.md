# ADR_架构决策记录 — BR AI Spec

> 📌 **适用对象**：架构师、技术评审、框架维护者、新加入开发者  
> 📖 **关联文档**：[TECH](./TECH_技术架构文档.md) · [DB](./DB_数据库设计文档.md)  
> 🎯 **核心目标**：记录 BR AI Spec 体系的关键架构决策及其背景、理由、影响

---

## ADR-001: 为什么选择 OpenSpec 作为规范产物框架

### 状态
**Accepted**

### 背景

团队在引入 AI开发后，发现过程只存在于聊天记录中，缺少可追溯、可归档的交付产物。需要一种标准化的方式来承载需求从发起到归档的完整生命周期。

### 决策

选择 **OpenSpec** 作为规范产物框架，承载 `proposal`（提案）、`design`（设计）、`tasks`（任务）、`checklist`（检查清单）、`iterations`（迭代）、`specs`（规范）等交付产物。

### 理由

1. **结构化产物**：OpenSpec 提供标准化的目录结构和文件模板，避免产物散乱
2. **可追溯**：每次需求变更都记录在 `changes/` 目录下，支持版本对比
3. **可归档**：归档后产物移入 `specs/` 目录，形成团队知识库
4. **工具兼容**：OpenSpec 产物可被 Git 版本控制、被 IDE 索引、被 AI 工具读取

### 替代方案

| 方案 | 优点 | 缺点 | 不选择理由 |
|------|------|------|-----------|
| 纯文档（Markdown） | 简单灵活 | 缺少结构化、难以追溯变更 | 无法支撑流程推进和状态管理 |
| Jira/Confluence | 功能完善 | 重量级、团队接入成本高 | 不适合 AI 工具链集成 |
| 自定义 JSON Schema | 灵活 | 需要自研工具链 | 重复造轮子，OpenSpec 已满足需求 |

### 影响

- 所有需求必须通过 OpenSpec 产物承载
- 归档后产物不可修改（只读）
- 需要维护 OpenSpec 目录结构规范

---

## ADR-002: 为什么选择双流程分层

### 状态
**Accepted**

### 背景

团队发现所有需求都走同一条重流程，导致低风险小修（如文案修改、样式调整）也被迫经过完整评审，效率低下。

### 决策

实现 **双流程分层**：
- `prd-to-delivery`：面向需求、设计和需要 OpenSpec 沉淀的完整交付链
- `bugfix-to-verification`：面向全新低风险小修正的轻量修复链

### 理由

1. **风险匹配**：不同复杂度的需求走与自身风险匹配的路径
2. **效率提升**：低风险小修跳过不必要的评审环节
3. **治理平衡**：高风险需求保留完整治理链，低风险小修保留基本留痕
4. **上下文路由**：系统自动判断应该走哪条链，降低开发者认知负担

### 替代方案

| 方案 | 优点 | 缺点 | 不选择理由 |
|------|------|------|-----------|
| 单流程 + 可选评审 | 简单 | 容易遗漏评审环节 | 治理风险高 |
| 多流程（3+） | 更精细 | 认知负担重 | 过度设计，当前双流程已覆盖 90% 场景 |
| 无流程（自由开发） | 最灵活 | 无法追溯、无法治理 | 违背规范驱动初衷 |

### 影响

- 开发者需要理解两条流程的适用场景
- 变更分流决策器需要准确判断流程类型
- 轻量链仍需写入 `.ai-spec/history/` 留痕

---

## ADR-003: 为什么选择 Prisma + MySQL 作为 Visual 数据层

### 状态
**Accepted**

### 背景

BR AI Spec Visual 需要持久化存储多项目的运行态、变更、规范资产等数据，需要选择合适的数据层方案。

### 决策

选择 **Prisma 7.7 + MySQL/MariaDB** 作为数据层：
- ORM：Prisma 7.7（`prisma-client-js`）
- 数据库：MySQL/MariaDB
- 驱动：`@prisma/adapter-mariadb` + `mariadb`

### 理由

1. **类型安全**：Prisma 生成 TypeScript 类型，编译期检查
2. **迁移友好**：`prisma generate` / `prisma push` / `prisma migrate` 支持开发/生产环境
3. **关系建模**：Workspace-Run-Change 天然适合关系型数据模型
4. **生态成熟**：MySQL/MariaDB 在企业级部署中广泛使用，运维成本低
5. **JSON 字段支持**：Prisma 支持 JSON 类型，适合存储动态 payload

### 替代方案

| 方案 | 优点 | 缺点 | 不选择理由 |
|------|------|------|-----------|
| SQLite | 零配置、单文件 | 并发写入受限 | 不适合多项目并发场景 |
| PostgreSQL | 功能强大 | 团队熟悉度低 | MySQL 生态更成熟 |
| MongoDB | 灵活 Schema | 缺少事务支持 | 关系型数据更适合关系型数据库 |
| Redis | 高性能 | 非持久化 | 仅适合缓存场景 |

### 影响

- 需要维护 Prisma Schema 与数据库同步
- JSON 字段需要应用层校验
- 需要定期备份 MySQL 数据库

---

## ADR-004: 为什么选择 WebSocket + HTTP 同端口架构

### 状态
**Accepted**

### 背景

Visual 需要实时推送 Run 状态变更、Collector 上报事件等，需要选择实时通信方案。

### 决策

选择 **WebSocket + HTTP 同端口**架构：
- 自定义 `server.mjs` 创建 HTTP 服务
- Next.js 和 WebSocket 挂在同一端口
- 使用 `ws` 库实现 WebSocket 服务端

### 理由

1. **部署简化**：只需暴露一个端口，Nginx 配置简单
2. **同源策略**：WebSocket 与 HTTP 同源，避免 CORS 问题
3. **资源节省**：共享进程，减少内存占用
4. **开发友好**：本地开发只需启动一个服务

### 替代方案

| 方案 | 优点 | 缺点 | 不选择理由 |
|------|------|------|-----------|
| 独立 WebSocket 服务 | 可独立扩展 | 部署复杂、跨域问题 | 首版无需独立扩展 |
| Server-Sent Events (SSE) | 简单 | 单向通信 | 需要双向通信（控制回执） |
| Socket.IO | 功能完善 | 体积大、协议不标准 | `ws` 更轻量、标准 |

### 影响

- 需要处理 WebSocket 断连重连
- 需要实现心跳检测
- 需要限制并发连接数

---

## ADR-005: 为什么选择 Collector 批量上报 + Hook 实时推送双通道

### 状态
**Accepted**

### 背景

Visual 需要接收来自多个业务项目的运行态数据，需要选择数据传输方案。

### 决策

实现 **双通道** 数据传输：
- **Hook 推送（auto → visual，实时）**：`internal/visual-hooks/push-client.js` 在关键节点实时推送
- **Collector 批量上报（visual 自带 CLI → visual，按需/定时）**：扫描业务项目目录批量上报

### 理由

1. **互补性**：Hook 推送覆盖实时事件，Collector 覆盖历史数据和基线扫描
2. **容错性**：Hook 推送失败时，Collector 可补报
3. **灵活性**：支持按需触发 Collector，也支持定时自动上报
4. **低侵入**：Hook 推送 fire-and-forget，不阻塞协议推进

### 替代方案

| 方案 | 优点 | 缺点 | 不选择理由 |
|------|------|------|-----------|
| 仅 Hook 推送 | 实时 | 历史数据无法补报 | 缺少基线扫描能力 |
| 仅 Collector | 完整 | 非实时 | 无法支持实时 Dashboard |
| Webhook 回调 | 标准 | 需要业务项目暴露公网 | 内网环境不适用 |

### 影响

- 需要实现去重逻辑（`dedupeKey`）
- 需要维护两种客户端（Hook + Collector）
- 需要处理数据冲突（Hook 与 Collector 可能上报相同数据）

---

## ADR-006: 为什么选择 Next.js App Router 作为 Visual 前端框架

### 状态
**Accepted**

### 背景

Visual 需要构建一个管理后台，需要选择前端框架。

### 决策

选择 **Next.js 16.2 + App Router** 作为前端框架：
- React 19.2
- TypeScript 5
- Tailwind CSS 4
- App Router（`src/app/` 目录）

### 理由

1. **全栈能力**：App Router 支持 API Routes，前后端代码同仓
2. **SSR/SSG**：支持服务端渲染和静态生成，首屏加载快
3. **生态成熟**：Next.js 是 React 全栈框架首选，社区活跃
4. **部署友好**：支持 Vercel、Docker、自定义服务器
5. **TypeScript 原生支持**：编译期类型检查

### 替代方案

| 方案 | 优点 | 缺点 | 不选择理由 |
|------|------|------|-----------|
| Create React App | 简单 | 缺少 SSR、路由需自配 | 全栈能力不足 |
| Vue 3 + Vite | 性能好 | 团队 React 生态更成熟 | 技术栈统一性 |
| Angular | 企业级 | 学习曲线陡 | 过度设计 |
| Remix | 全栈 | 生态不如 Next.js | 社区规模小 |

### 影响

- 需要掌握 App Router 新范式（`page.tsx`、`layout.tsx`、`loading.tsx`）
- 需要处理客户端/服务端组件边界
- 需要优化首屏加载（SSR/SSG 策略）

---

## ADR-007: 为什么选择内网 npm registry 分发

### 状态
**Accepted**

### 背景

`@engineered/ai-spec-auto` 需要在团队内部分发，需要选择包管理方案。

### 决策

选择 **内网 npm registry** 分发：
- Registry 地址：`http://nodejs.100credit.cn/`
- 包名：`@engineered/ai-spec-auto`
- 配置：`~/.npmrc` 中添加 `@ex:registry=http://nodejs.100credit.cn/`

### 理由

1. **内网环境**：团队开发环境在内网，无法访问公网 npm
2. **权限控制**：内网 registry 可控制访问权限
3. **版本管理**：支持语义化版本，支持 `latest` tag
4. **安装简单**：开发者只需配置 `.npmrc`，之后 `npx` 自动拉取

### 替代方案

| 方案 | 优点 | 缺点 | 不选择理由 |
|------|------|------|-----------|
| 公网 npm | 无需配置 | 内网无法访问 | 环境限制 |
| Git 子模块 | 版本可控 | 安装复杂、无法使用 `npx` | 用户体验差 |
| 本地文件 | 离线可用 | 无法自动更新 | 维护成本高 |
| Docker 镜像 | 环境一致 | 需要 Docker、启动慢 | 过度复杂 |

### 影响

- 开发者首次接入前需配置 `~/.npmrc`
- 需要维护内网 registry 可用性
- 发布新版本需推送至内网 registry

---

## ADR-008: 为什么选择 JSON 字段存储 payload 而非关系型展开

### 状态
**Accepted**

### 背景

Visual 需要存储各种动态数据（Run 事件 payload、Collector 上报数据、Registry 条目等），需要选择存储方案。

### 决策

选择 **JSON 字段** 存储 payload：
- Prisma Schema 中使用 `Json` 类型
- 应用层负责序列化/反序列化
- 数据库层使用 MySQL `JSON` 类型

### 理由

1. **灵活性**：不同事件类型的 payload 结构差异大，JSON 可容纳任意结构
2. **演进友好**：新增字段无需修改数据库 Schema
3. **查询支持**：MySQL 5.7+ 支持 JSON 函数（`JSON_EXTRACT`、`JSON_CONTAINS`）
4. **开发效率**：避免频繁修改 Prisma Schema 和数据库迁移

### 替代方案

| 方案 | 优点 | 缺点 | 不选择理由 |
|------|------|------|-----------|
| 关系型展开 | 查询高效、类型安全 | Schema 频繁变更、开发成本高 | payload 结构不稳定 |
| EAV 模型 | 灵活 | 查询性能差、复杂度高 | 过度设计 |
| NoSQL | 灵活 | 缺少事务、团队不熟悉 | 关系型数据更适合关系型数据库 |

### 影响

- 应用层需要负责 JSON 校验（使用 Zod）
- 复杂查询需要使用 JSON 函数
- 需要定期清理无用 payload 数据
- JSON 字段无法建立外键约束

---

## 决策记录维护

| ADR | 标题 | 状态 | 创建日期 |
|-----|------|------|----------|
| ADR-001 | 为什么选择 OpenSpec 作为规范产物框架 | Accepted | 2026-03-01 |
| ADR-002 | 为什么选择双流程分层 | Accepted | 2026-03-01 |
| ADR-003 | 为什么选择 Prisma + MySQL 作为 Visual 数据层 | Accepted | 2026-03-01 |
| ADR-004 | 为什么选择 WebSocket + HTTP 同端口架构 | Accepted | 2026-03-01 |
| ADR-005 | 为什么选择 Collector 批量上报 + Hook 实时推送双通道 | Accepted | 2026-03-01 |
| ADR-006 | 为什么选择 Next.js App Router 作为 Visual 前端框架 | Accepted | 2026-03-01 |
| ADR-007 | 为什么选择内网 npm registry 分发 | Accepted | 2026-03-01 |
| ADR-008 | 为什么选择 JSON 字段存储 payload 而非关系型展开 | Accepted | 2026-03-01 |

---

> 📌 **关联文档**：
> - [TECH](./TECH_技术架构文档.md) - 技术架构约束
> - [DB](./DB_数据库设计文档.md) - 数据库设计
