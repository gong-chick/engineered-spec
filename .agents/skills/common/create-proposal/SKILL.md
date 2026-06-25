---
name: create-proposal
description: 当用户需要为新需求、改版需求或补充方案发起 OpenSpec 提案时，在 `/opsx:propose` 前完成需求分析、上下文注入和提案后置检查。
compatibility: Requires an OpenSpec workspace, local .agents/rules constraints, and repository paths such as openspec/changes/ and docs/样式还原/.
---

# 创建提案（OpenSpec 增强层）

## 定位

本技能是 OpenSpec `/opsx:propose` 的**增强层**，不替代、不干预 OpenSpec 的产物生成。

职责划分：

| 层 | 职责 | 产物位置 |
|----|------|----------|
| **本技能** | 需求前置分析 + 上下文注入 + 后置检查 | 无独立产物（分析结论注入 OpenSpec 上下文） |
| **OpenSpec** | 生成 proposal.md / specs/ / design.md / tasks.md | `openspec/changes/<name>/` |
| **config.yaml** | 桥接 ai-spec-auto  规范到 OpenSpec rules | `openspec/config.yaml` |

## 使用时机

当需要为一个**需求**创建提案时使用。需求可能是：

- 新增/改版一个**页面**（有或没有设计稿）
- 开发一系列**功能组件**（有或没有 UI 描述）
- **有接口**或**无接口**（后端未就绪时用 mock）
- 纯逻辑、纯接口、或 UI + 接口 等组合

## 环境依赖

- 依赖本仓库的 `openspec/` 目录、`.agents/rules/` 规范和相关命令约定
- 设计稿分析与 UI 产物默认落到 `docs/样式还原/`
- 会引用兄弟 skill 与 OpenSpec 命令，不适合作为脱离仓库的通用提案模板

## 注意事项

- 本技能只做提案增强，不替代 OpenSpec 原生产物生成
- 复杂交互必须先整理交互摘要，不能把实现口径留到编码阶段临时补
- 只要进入后置检查，就必须按审计汇报规范输出结论

---

## 步骤 1：需求前置分析

在委托 OpenSpec 生成提案之前，先确认下列条件，作为传递给 OpenSpec 的上下文。

| 条件 | 选项 | 影响 |
|------|------|------|
| **是否有设计稿或 UI 要求描述** | 有 / 无 | 有 → 步骤 2 触发 design-analysis；OpenSpec 的 tasks 中应包含 UI 验收任务 |
| **是否有接口（已提供或约定）** | 有 / 无 / 未就绪 | 有 → 正常对接；无 → 可不做数据层；未就绪 → mock，见项目 Mock 数据策略 |
| **交付形态** | 新页面 / 功能组件 / 能力模块 / 其它 | 决定目录结构（routes vs components）与 OpenSpec design.md 中的技术方案 |
| **是否仅样式/还原类** | 是 / 否 | 是 → 重点在 design-analysis + 验收 |
| **是否存在复杂交互** | 有 / 无 | 有 → 先按 `references/interaction-spec-template.md` 收口搜索、表单、弹窗、批量操作等交互说明，再写 proposal/design/tasks |

---

## 步骤 2：设计稿分析（可选但推荐）

当需求**包含界面**且**有设计稿**（.pen、figma 链接、设计图、标注）或**有明确 UI 描述**时：

- **使用技能**：`.agents/skills/design-analysis/SKILL.md`
- **产出**：`docs/样式还原/<名称>-UI分析清单.md`

分析清单应在 OpenSpec 生成提案前或同步完成，以便 OpenSpec 的 specs/、design.md、tasks.md 能引用分析结果。

若页面包含搜索、表单、弹窗、批量操作、复杂状态切换等交互，先参考 `references/interaction-spec-template.md` 把交互说明整理成摘要，再写入 `proposal.md / design.md / tasks.md`，避免实现阶段自己补口径。

---

## 步骤 3：委托 OpenSpec 生成提案

将步骤 1-2 的分析结论整合为变更描述，调用 `/opsx:propose <change-name>`。

OpenSpec 会在 `openspec/changes/<change-name>/` 下生成原生产物：

```
openspec/changes/<change-name>/
├── .openspec.yaml      # 变更元数据
├── proposal.md         # 变更概述（why + what + impact）
├── specs/              # Delta specs（新增/修改/删除的需求）
│   └── <domain>/
│       └── spec.md
├── design.md           # 技术设计（方案选型、组件拆分、数据结构）
└── tasks.md            # 实施任务清单
```

**上下文注入**：OpenSpec 通过 `openspec/config.yaml` 中的 `context` 和 `rules` 字段自动读取 ai-spec-auto  的规范约束（路由、组件、API、样式等），无需本技能额外干预。

**传递给 OpenSpec 的信息**（作为 propose 描述的一部分）：
- 步骤 1 确认的条件（交付形态、接口情况、设计稿情况）
- 步骤 2 产出的 UI 分析清单路径（如有）
- 涉及 UI 时：组件放置位置建议（依据 `.agents/rules/04-组件规范.md`）
- 涉及接口时：接口结构建议（依据 `.agents/rules/05-API规范.md`）
- 接口未就绪时：标注 mock 策略

---

## 步骤 4：后置检查与增强

OpenSpec 生成提案后，检查以下项目并按需补充：

### 4.1 design.md 检查
- 技术方案是否遵循 `.agents/rules/` 中的架构约束
- 涉及页面时，是否参考了 `.agents/rules/06-路由规范.md`
- 涉及组件时，是否参考了 `.agents/rules/04-组件规范.md`
- 样式方案是否使用主题变量（`.agents/rules/09-样式规范.md`）

### 4.2 tasks.md 检查
- 涉及 UI 且有设计稿时，末尾是否包含 UI 还原验收任务（引用 `.agents/skills/ui-verification/SKILL.md`）
- 涉及接口时，是否包含接口封装任务（引用 `.agents/rules/05-API规范.md`）
- 图标/图片未定时，是否标注占位元素（`.agents/rules/08-通用约束.md`）
- 有 UI 分析清单时，开发任务是否引用 `docs/样式还原/<名称>-UI分析清单.md`
- 存在复杂交互时，是否把搜索、表单、弹窗、批量操作和异常状态写成明确任务项，而不是只留一句“完善交互”

### 4.3 specs/ 检查
- 每个 capability 的验收场景是否可测试
- 有设计稿时，是否引用 UI 分析清单作为验收参考

### 4.4 执行交接与审计（提案阶段）

- 提案确认后进入执行阶段时，遵循 `.agents/rules/12-Superpowers执行规范.md`，按 `.agents/skills/execute-task/SKILL.md` 的四步循环逐条执行 `openspec/changes/<change-name>/tasks.md`，或通过 IDE/OpenSpec 的 apply 命令进入同一执行链路。
- **本步骤 4 后置检查完成、向用户交付分析摘要与检查结果时**，须遵守 `.agents/rules/14-审计汇报规范.md`（适用范围含「完成 create-proposal 后置检查」）。执行阶段的审计要求见 **4.5** 中与方案一、方案二的衔接说明。

### 4.5 输出模板：下一步（必选）

OpenSpec 生成提案且本步骤 4 检查完毕后，**必须**以独立小节 **「下一步」** 输出以下内容（将 `<change-name>` 替换为实际变更目录名，如 `add-simple-input`）。

#### 4.5.1 如何写对 apply 命令（IDE 启发式）

无法从仓库自动检测 IDE；按本轮对话线索选用主推命令，**无法判断时并列整张对照表**：

| 情况 | 主推命令 |
|------|----------|
| 用户已使用 `/opsx-propose`、`/opsx-apply` 等**连字符**命令 | `/opsx-apply <change-name>`（Cursor / Windsurf / Copilot IDE 等） |
| 用户使用 `/opsx:propose`、`/opsx:apply` 等**冒号**命令 | `/opsx:apply <change-name>`（Claude Code） |
| **无法判断** | 并列给出：Claude Code → `/opsx:apply <change-name>`；Cursor / Windsurf / Copilot IDE → `/opsx-apply <change-name>`；Trae → `/openspec-apply <change-name>`（与 `docs/openspec-guide.md` §7.4 一致） |

另附一句：若使用 **OpenSpec CLI** 本地 `openspec apply`，与上述 apply 流程语义一致，不替代各 IDE 中的斜杠命令。

#### 4.5.2 方案一：Superpowers + execute-task（推荐）

向用户提供**可复制**的提示语（可整段粘贴到新会话）：

> 请使用 execute-task 技能，以 `openspec/changes/<change-name>/tasks.md` 为准，从第一条未勾选 `- [ ]` 开始，按 Superpowers 四步（头脑风暴 → TDD → 双重审查 → 状态更新）逐条执行；必要时先执行 `/opsx-apply <change-name>`（Cursor 等）或 `/opsx:apply <change-name>`（Claude Code）。执行须遵守 `.agents/rules/12-Superpowers执行规范.md` 与 `.agents/rules/14-审计汇报规范.md`（第四步状态更新含审计报告）。

技能路径：`.cursor/skills/common/execute-task/SKILL.md` 或 `.agents/skills/common/execute-task/SKILL.md`。

#### 4.5.3 方案二：仅按 tasks.md 清单

适合小改动或用户明确要求「快扫清单」、不强制每步输出四步标题时，提供**可复制**提示语：

> 请直接按 `openspec/changes/<change-name>/tasks.md` 顺序逐项实现，每完成一项将对应 `- [ ]` 改为 `- [x]`，并保证与 `design.md`、`specs/` 一致。**凡产生代码变更**，仍须按 `.agents/rules/14-审计汇报规范.md` 输出审计报告，不得因未走 execute-task 四步而省略。

#### 4.5.4 可选说明

若用户只需子集（例如仅改导出、仅改单文件），可提示其用一句话收窄范围，并仍指向同一 `tasks.md` 或具体条目。

#### 4.5.5 审计汇报（跨阶段小结）

在「下一步」小节末尾用一两句汇总：**提案阶段**后置检查交付已适用 `14-审计汇报规范.md`；**执行阶段**每条任务或批量实现后的审计要求不变，与方案一、方案二中的引用一致。

---

## 样式还原验证检查清单（供 create-route / create-component 引用）

当开发涉及 **UI 还原**（有设计稿或分析清单）时，可对照以下检查项自检；更完整项见 `docs/样式还原/<名称>-UI分析清单.md` 中的「验证检查清单」。

**布局**：区域位置、尺寸、间距是否与分析清单/设计稿一致；对齐方式（如 flex-start vs center）是否正确。  
**样式**：颜色、字体、字号、字重、圆角、边框、阴影、效果（如 backdrop-filter）是否一致。  
**元素**：是否缺少区块、图标、占位图；占位尺寸与比例是否正确。  
**交互**：默认/hover/active 等状态是否还原（若有设计）。

create-route、create-component 等技能中「涉及 UI 还原时」可引用：`.agents/skills/create-proposal/SKILL.md` 中的「样式还原验证检查清单」及对应页面的 `docs/样式还原/<名称>-UI分析清单.md`。

---

## 相关规范与技能

- `.agents/rules/03-项目结构.md` - 目录结构、Mock 数据策略
- `.agents/rules/04-组件规范.md` - 组件放置决策
- `.agents/rules/05-API规范.md` - 接口封装
- `.agents/rules/06-路由规范.md` - 路由结构
- `.agents/rules/08-通用约束.md` - 占位元素等
- `.agents/rules/09-样式规范.md` - 设计稿颜色提取、主题变量
- `.agents/rules/12-Superpowers执行规范.md` - 执行原则
- `.agents/rules/14-审计汇报规范.md` - 后置检查交付与执行任务后的审计报告
- `.agents/skills/execute-task/SKILL.md` - Superpowers 四步循环执行
- `.agents/skills/design-analysis/SKILL.md` - 设计稿分析（有设计稿时使用，产出 UI 分析清单）
- `.agents/skills/ui-verification/SKILL.md` - UI 验收（实现后需验收时使用）
- `references/interaction-spec-template.md` - 搜索、表单、弹窗、批量操作等复杂交互的摘要模板
- `openspec/config.yaml` - OpenSpec 配置（含 ai-spec-auto  上下文注入）
