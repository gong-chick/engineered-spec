# 团队培训大纲（2 小时）

## 培训目标

面向 **前端团队**（Vue / React Profile），让成员理解 **规则 + 技能 + OpenSpec + MCP** 在同一项目内的协同方式，并能在自己的前端仓库中完成第一轮试点落地（可先 L2 再升 L3）。

---

## 第一部分：为什么（20 分钟）

### 核心问题

1. AI 只会写"能跑的代码"，不会遵守团队目录结构和组件分层
2. 不同项目规范不同，AI 一换仓库就"失忆"
3. 团队里只有少数人会写高质量提示词，无法规模化复制

### 核心理念

> 把"提示词能力"改造成"项目内资产"

- Rule 决定"边界"——告诉 AI 什么能做、什么不能做
- Skill 决定"步骤"——告诉 AI 具体怎么做
- OpenSpec 决定"流程"——管理需求到归档的闭环（**L3**，`openspec/`）
- MCP 提供"上下文"——让 AI 能看设计稿、接口文档、页面效果（**L2+**，`.cursor/mcp.json`）

**一体化提示**：上述能力对应仓库里 **不同路径**，只有组合起来才是完整方案——仅有 `.agents` 没有 MCP 则接口/设计稿上下文弱；仅有编码规范没有 **L3 / `openspec/`** 则 **`/opsx:*` 与提案产物无从落地**。详见仓库 README「一体化能力与关键路径」。

## 第二部分：四层结构（20 分钟）

### `.agents/rules/` — 约束层

按模块拆分的声明式规范，告诉 AI 边界在哪。

关键示例：
- 项目结构规范：禁止在 `src/` 下随意新建非标准目录
- API 规范：`getXxxList / createXxx / updateXxx / deleteXxx` 统一命名
- 样式规范：禁止硬编码颜色，必须使用主题 CSS 变量

### `.agents/skills/` — 操作层

过程式指令，包含步骤、示例和检查清单。

关键示例：
- `create-component`：教 AI 在正确目录创建正确结构的组件
- `create-proposal`：前置分析需求条件后委托 `/opsx:propose` 生成提案（OpenSpec 增强层）

### `openspec/` — 流程层

管理需求 → 提案 → 实现 → 归档的完整闭环。

### `.cursor/mcp.json` — 上下文层

让 AI 接入外部能力：设计稿（Figma）、接口文档（ApiFox）、页面验收（Playwright）。

### 关键路径速查（目录 → 职责 → 典型文件）

| 路径 / 配置 | 职责 | 典型文件或产物 |
|-------------|------|----------------|
| `.agents/rules/` | 约束层 | `02-编码规范.md`、`05-API规范.md`、`03-项目结构.md` 等 |
| `.agents/skills/` | 操作层 | `create-component/`、`create-proposal/`、`SKILL.md` |
| `.cursor/`、`.claude/` 等 | IDE 适配 | 指向 `.agents` 的链接；**L3** 下还有 OpenSpec 生成的 command/skill |
| `.cursor/mcp.json` | 上下文层 | ApiFox、Figma、Playwright 等 MCP 条目 |
| `openspec/`（L3） | 流程层 | `config.yaml`（桥接 ai-spec-auto）、`changes/`、`specs/` |

## 第三部分：现场演示（30 分钟）

> **环境要求**：下列演示依赖 **L3**（已执行 `init --level L3`，存在 `openspec/` 与 OpenSpec CLI）。若试点仅为 L2，可改为演示「创建组件 + MCP 查接口」；OpenSpec 流程需升级 L3 后再演示。

### 最小闭环演示

1. 选一个小需求："新增用户列表页筛选栏"
2. 使用 `/opsx:propose` 创建提案
3. AI 按 rules + skills 编写 proposal / tasks / specs（产物在 `openspec/changes/` 等）
4. 人工审批后，使用 `/opsx:apply` 执行实现
5. 验收后使用 `/opsx:archive` 归档

### 观察点

- AI 是否把组件放在了正确目录
- API 是否遵循了命名规范
- 样式是否使用了主题变量

## 第四部分：如何改造成自己的项目（20 分钟）

### Profile 机制

```bash
# 推荐：在目标项目根目录使用默认完整安装
npx @engineered/ai-spec-auto@latest init --profile react
npx @engineered/ai-spec-auto@latest init --profile vue

# 仅在兼容旧安装模型时才显式传 --level
npx @engineered/ai-spec-auto@latest init --profile vue --level L2

# 或：克隆规范库后
bash install.sh init /path/to/project --profile react
bash install.sh init /path/to/project --profile vue
```

### 8 个必须回答的决策点

1. **目录分层**：`components/views` 还是 `modules/pages`？
2. **UI 体系**：Antd、Element Plus、Naive UI、自研？
3. **样式方案**：SCSS Modules、UnoCSS、Tailwind？
4. **数据访问**：`api/`、`services/`、`http/`？
5. **状态管理**：Zustand、Pinia、Redux？
6. **路由约定**：文件路由、手写路由？
7. **测试门禁**：单测、E2E、覆盖率要求？
8. **文档习惯**：JSDoc、ADR、API 文档？

### 改造顺序

1. 先改 Rule 标题与模块边界
2. 再改"非协商约束"（目录禁令、命名规范等）
3. 把高频操作步骤抽成 Skill
4. 最后接工具配置（IDE 适配、MCP、OpenSpec）

## 第五部分：推广机制（15 分钟）

### 推荐三阶段推广

| 阶段 | 目标 | 时长 |
|------|------|------|
| 试点 | 1 个团队、1 个项目验证 | 2 周 |
| 扩展 | 2-3 个项目，区分通用/项目级规范 | 1-2 月 |
| 平台化 | 团队模板、统一培训、验收指标 | 持续 |

### 角色分工

- **规范 owner**：维护 `.agents/rules/` 的稳定性
- **技能 owner**：维护高频技能的准确度与示例
- **流程 owner**：维护 OpenSpec 流程、命令、归档与培训
- **试点开发者**：反馈哪些规则太空、哪些技能不实用

### 常见阻力与应对

| 阻力 | 应对 |
|------|------|
| "写规则太麻烦" | 规则不是额外成本，而是把反复口头解释的成本一次性沉淀 |
| "AI 已经会写代码了" | AI 会写"通用代码"，Skill 是让它写"团队认可的代码" |
| "OpenSpec 太重" | 只在新功能、跨模块变更时走 `/opsx:*`；bug fix 可跳过；默认完整安装已经包含 OpenSpec，不需要先理解 L1/L2/L3 |

## 第六部分：Q&A + 行动计划（15 分钟）

### 第一轮试点检查表

- [ ] 确定试点项目与负责人（前端 Vue 或 React 仓库）
- [ ] 选择 Profile 并运行安装（推荐 `npx @engineered/ai-spec-auto@latest init`）
- [ ] 填写 01-项目概述 和 03-项目结构（若自定义规则缺失，补确认 04/05/06/07/09 是否已按项目生成）
- [ ] 跑通一个组件创建场景
- [ ] 接通至少一个 MCP（Figma/ApiFox/Playwright）
- [ ] **（完整闭环）** 确认默认安装已带上 OpenSpec：`openspec/config.yaml` 存在，能完成一次 `/opsx:propose` → `/opsx:apply` 最小路径（参见 [openspec-guide.md](openspec-guide.md)）
- [ ] 两周后复盘，调整 rules/skills

### 90 分钟工作坊方法

1. 前 20 分钟：列出团队最痛的 10 个 AI 输出问题
2. 中间 30 分钟：把问题归类到规则模块
3. 后 20 分钟：选出最有价值的 3 个 skill
4. 最后 20 分钟：定义第一轮试点范围
