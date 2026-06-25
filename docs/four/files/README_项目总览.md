# br-ai-spec · 项目总览

> AI 规范驱动的前端项目交付底座 + 团队可视化控制面

---

## 📌 项目定位

br-ai-spec 是一个 **AI 规范驱动的前端项目交付体系**，由两个核心项目组成：

| 项目 | npm 包名 | 定位 | 核心价值 |
|------|----------|------|----------|
| **br-ai-spec** | `@engineered/ai-spec-auto` | 项目级交付底座 | 把需求、实现、检查、归档串成完整的团队开发链路 |
| **engineered-spec-visual** | — | 团队可视化与控制面 | 聚合已接入项目的运行态、变更、拓扑与采集数据，提供统一控制面 |

两项目协作关系：

```
┌─────────────────────────────────────────────────────┐
│                    engineered-spec-visual                 │
│                  （控制面 · 可视化）                   │
│  Workspace · Runs · Changes · 拓扑 · WebSocket 推送   │
└──────────┬──────────────────────┬────────────────────┘
           │  Hook 推送（实时）     │  Collector 批量上报
           │  控制回执（反向）      │  WebSocket 实时
           ▼                      ▼
┌─────────────────────────────────────────────────────┐
│                    br-ai-spec                        │
│                  （底座 · 运行时）                     │
│  .agents/ · .ai-spec/ · OpenSpec · CLI · IDE 入口    │
└─────────────────────────────────────────────────────┘
```

---

## 🎯 解决什么问题

| 痛点 | br-ai-spec 的解法 |
|------|-------------------|
| **需求到交付链路断裂**：PRD → 设计 → 实现 → 审查 → 归档各环节割裂 | 双流程分层（prd-to-delivery + bugfix-to-verification），端到端贯通 |
| **AI 辅助开发缺乏规范约束**：AI 生成的代码质量不可控、风格不一致 | 通过 `.agents/rules/` 注入项目级规范，AI 行为受规则约束 |
| **多 IDE 环境碎片化**：Cursor / Claude / VS Code 各自为战 | 统一注入 `.cursor/` `.claude/` `.opencode/` `.trae/` `.agents/` `.omc/` 入口 |
| **运行态不可见**：不知道 AI 在做什么、做到哪了、结果如何 | `.ai-spec/current-run.json` + `repo-map.json` 实时沉淀 + 控制面可视化 |
| **变更追踪困难**：谁改了什么、为什么改、是否闭环 | Runs / Changes 记录体系 + 上下文路由策略 |
| **团队规模化推广难**：接入成本高、学习曲线陡峭 | 渐进式接入（L1 → L2 → L3），按需启用能力层 |

---

## ⚡ 核心能力概览

### 底座能力（br-ai-spec）

| 能力域 | 说明 |
|--------|------|
| **项目规则注入** | 通过 `.agents/rules/` 注入项目级编码规范、架构约束、检查清单 |
| **技能与流程注入** | 通过 `.agents/skills/` 注入可复用的开发技能与流程模板 |
| **IDE 命令接入** | 支持 Cursor、Claude Code、OpenCode、Trae、VS Code、OMC 六大 IDE 入口 |
| **OpenSpec 流程落地** | 标准化产物：proposal → design → tasks → checklist → specs |
| **运行态沉淀** | `.ai-spec/current-run.json`（当前运行）+ `repo-map.json`（仓库映射） |
| **双流程分层** | `prd-to-delivery`（完整交付链）+ `bugfix-to-verification`（轻量修复链） |
| **上下文路由** | 5 种路由策略：当前 run 内修正、未归档 change 内补丁、归档前回退、归档后补丁、quick-fix |
| **角色注册表** | 32 个角色注册表，10 个激活角色，25 个技能，2 个激活流程 |
| **渐进式接入** | L1（仅 .agents）→ L2（.agents + IDE + MCP）→ L3（L2 + OpenSpec） |

### 控制面能力（engineered-spec-visual）

| 能力域 | 说明 |
|--------|------|
| **Workspace 管理** | 多项目纳管、成员权限管理、连接令牌（Connection Token） |
| **Runs / Changes 追踪** | 运行记录与变更追踪，支持按项目/时间/状态筛选 |
| **拓扑与规格可视化** | 基于 @xyflow/react 的交互式拓扑图，展示项目依赖与规格关系 |
| **WebSocket 实时推送** | 与 HTTP 同端口，实时推送运行态变更 |
| **Collector CLI 批量上报** | 支持批量采集与上报，降低实时推送压力 |
| **Installation 遥测统计** | 安装量、活跃度、功能使用率等遥测数据 |
| **首页仪表盘** | Onboarding 报告、运行态健康度、交付闭环进度、效率收益卡、阻塞变化流、规范资产命中情况 |

---

## 🗺️ 文档导航

| 文档 | 路径 | 说明 |
|------|------|------|
| 📋 **PRD 产品需求文档** | `PRD_产品需求文档.md` | 产品定位、目标用户、功能需求、里程碑规划 |
| 📐 **架构设计文档** | `ARCH_架构设计文档.md` | 系统架构、模块划分、接口设计、部署架构 |
| 🔧 **技术架构文档** | `TECH_技术架构文档.md` | 技术栈详解、分层架构、通信协议、数据流、安全设计 |
| 📦 **数据模型文档** | `DATA_数据模型文档.md` | Prisma Schema、ER 图、字段定义、索引策略 |
| 🔌 **API 接口文档** | `API_接口文档.md` | RESTful API 定义、请求/响应示例、错误码 |
| 🔄 **工作流文档** | `WORKFLOW_工作流文档.md` | prd-to-delivery 流程、bugfix-to-verification 流程、上下文路由 |
| 📖 **快速开始指南** | `QUICKSTART_快速开始.md` | 环境准备、安装配置、L1/L2/L3 渐进接入 |
| 📊 **首页仪表盘文档** | `DASHBOARD_首页仪表盘.md` | 六大模块设计、指标定义、交互原型 |

---

## 🚀 快速开始路径

### 路径一：最快体验（L1 接入，5 分钟）

```bash
# 1. 安装底座包
npm install @engineered/ai-spec-auto --save-dev

# 2. 初始化（仅注入 .agents/ 目录）
npx ai-spec init --level 1

# 3. 查看注入的规范文件
ls -la .agents/
```

### 路径二：完整接入（L2 接入，15 分钟）

```bash
# 1. L1 初始化
npx ai-spec init --level 2

# 2. 配置 IDE 入口（自动检测已安装的 IDE）
npx ai-spec ide-setup

# 3. 配置 MCP 连接
npx ai-spec mcp-config
```

### 路径三：生产就绪（L3 接入，30 分钟）

```bash
# 1. L2 初始化
npx ai-spec init --level 3

# 2. 配置 OpenSpec 流程
npx ai-spec openspec-setup

# 3. 连接控制面
npx ai-spec connect --workspace <workspace-id> --token <connection-token>
```

### 控制面部署

```bash
# 1. 克隆控制面项目
git clone <engineered-spec-visual-repo>

# 2. 安装依赖
cd engineered-spec-visual && npm install

# 3. 配置数据库
cp .env.example .env   # 编辑数据库连接
npx prisma migrate dev

# 4. 启动
npm run dev
```

---

## 🛠️ 技术栈总览

### br-ai-spec（底座）

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **运行时** | Node.js | 18+ | CLI 运行环境 |
| **语言** | JavaScript | ESM | 模块系统 |
| **规范框架** | OpenSpec | — | 规范产物定义 |
| **包管理** | npm | — | 内网 registry: `http://nodejs.100credit.cn/` |
| **包名** | @engineered/ai-spec-auto | 0.1.11 | 当前发布版本 |

### engineered-spec-visual（控制面）

| 类别 | 技术 | 版本 | 用途 |
|------|------|------|------|
| **框架** | Next.js | 16.2.4 | App Router 全栈框架 |
| **UI** | React | 19.2.4 | 组件库 |
| **语言** | TypeScript | 5.x | 类型安全 |
| **样式** | Tailwind CSS | 4.x | 原子化 CSS |
| **图标** | lucide-react | — | 图标库 |
| **拓扑图** | @xyflow/react | — | 交互式拓扑可视化 |
| **ORM** | Prisma | 7.7 | 数据库 ORM |
| **数据库** | MySQL / MariaDB | — | 持久化存储 |
| **适配器** | @prisma/adapter-mariadb | — | MariaDB 连接 |
| **校验** | Zod | 4.3.6 | 运行时类型校验 |
| **认证** | bcryptjs + Cookie | — | 密码哈希 + 会话管理 |
| **实时通信** | ws | — | WebSocket（与 HTTP 同端口） |
| **CLI** | Commander | — | Collector CLI 框架 |
| **文件监听** | chokidar | — | 文件变更监听 |
| **文件匹配** | glob | — | 文件路径匹配 |
| **TS 执行** | tsx | — | TypeScript 直接执行 |
| **工具库** | date-fns / nanoid / framer-motion | — | 日期/ID/动画 |
| **测试** | Vitest | 4.x | 单元测试 |
| **Lint** | ESLint | 9.x | 代码规范 |

---

## 📐 设计原则

| 原则 | 说明 |
|------|------|
| **单源多链接** | 规范定义单一来源，通过多链接方式注入不同 IDE 和工具链 |
| **声明 + 过程双层** | 声明式规则定义 + 过程式流程执行，各司其职 |
| **Profile 分层** | 按项目规模和复杂度分层（L1/L2/L3），渐进式启用 |
| **非侵入性** | 不修改项目源码结构，通过 `.agents/` `.ai-spec/` 等约定目录注入 |

---

## 📅 里程碑规划

| 里程碑 | 目标 | 核心交付 |
|--------|------|----------|
| **M1：能接入** | 项目可快速接入底座 | L1/L2 初始化、IDE 入口、基础规则注入 |
| **M2：能闭环** | 需求到交付完整闭环 | OpenSpec 流程、双流程分层、上下文路由 |
| **M3：能复盘** | 数据可追踪、可分析 | 控制面仪表盘、Runs/Changes 追踪、遥测统计 |
| **M4：能推广** | 团队级规模化推广 | 多项目纳管、权限体系、Onboarding 报告 |

---

## 🔗 相关链接

- **npm 包**：`@engineered/ai-spec-auto`（内网 registry: `http://nodejs.100credit.cn/`）
- **底座仓库**：`br-ai-spec`
- **控制面仓库**：`engineered-spec-visual`
- **试点场景**：组件替换类需求

---

*文档版本：v1.0 · 最后更新：2026-04-23*
