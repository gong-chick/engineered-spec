---
id: task-orchestrator-run-plan-template
name: 主代理首轮运行计划模板
status: active
owner: task-orchestrator
description: 定义 task-orchestrator 在首次识别任务时必须输出的最小 run-plan 结构，用于统一 IDE、OpenClaw 和后续运行时入口的首轮响应。
---

# 主代理首轮运行计划模板

> **Profile 驱动说明（V1）**：本模板中的示例以 `frontend-implementer` 作为实现角色。实际编排时，`required_roles` 中的实现角色应根据当前项目 profile 动态决定：
> - `vue` / `react` → `frontend-implementer`
> - `springboot` → `backend-implementer`
> - `node-tooling` → `tooling-implementer`
>
> 实现角色可从 `.agents/registry/profiles.json` 中当前 profile 的 `implementation_role` 字段读取。

## 1. 目的

这份模板用于统一 `task-orchestrator（任务主代理）` 在首次接收任务时的输出格式。

适用场景：

- `IDE（开发工具） AI（智能体）` 中显式触发
- OpenClaw（远程入口）触发
- 后续插件页面点击“开始执行”

不论入口来自哪里，首轮输出都应先收敛成最小 `run-plan（运行计划）`，而不是直接写代码。

## 2. 必填字段

首轮输出至少必须覆盖下面 13 类信息：

1. `task_identification（任务识别）`
2. `change_identification（稳定变更 ID）`
3. `artifact_targets（关键产物路径）`
4. `mode（运行模式）`
5. `review_policy（审核策略）`
6. `selected_flow（选中的流程模板）`
7. `delivery_profile（交付档位）`
8. `artifact_profile（产物规格）`
9. `complexity（复杂度）`
10. `selected_roles（本次激活专家）`
11. `assumptions（默认假设）`
12. `missing_inputs（缺失输入）`
13. `next_action（下一步动作）`

## 3. 推荐 Markdown（标记语言）模板

```md
## 任务识别
- 类型：组件开发 / 页面开发 / 文档产出 / 问题修复 / 增量改造
- 当前输入：<原始任务文本>
- 风险级别：low / medium / high

## 推荐流程模板
- `selected_flow（选中的流程模板）`：<flow-id>
- 原因：<为什么选择这条模板>

## 运行模式
- `mode（运行模式）`：auto / suggest / manual

## 审核策略
- `review_policy（审核策略）`：none / main-flow-blocking

## 交付档位
- `delivery_profile（交付档位）`：micro / standard
- `artifact_profile（产物规格）`：compact / full
- `complexity（复杂度）`：low / medium / high

## 推荐专家
- 必选：<required_roles>
- 可选：<activated_optional_roles>
- 第一跳：<first_handoff>

## 默认假设
- <assumption_1>
- <assumption_2>

## 缺失输入
- <missing_input_1>
- <missing_input_2>

## 审批点
- <approval_gate_1>
- <approval_gate_2>

## 下一步
- <next_action>
```

## 4. 推荐 JSON（结构化数据）模板

```json
{
  "schema_version": 1,
  "kind": "run-plan",
  "mode": "auto",
  "review_policy": "main-flow-blocking",
  "delivery_profile": "micro",
  "artifact_profile": "compact",
  "complexity": "low",
  "status": "planned",
  "task": {
    "type": "component-development",
    "change_id": "add-product-card",
    "raw_input": "创建一个商品组件",
    "risk_level": "low",
    "complexity": "low"
  },
  "flow": {
    "id": "prd-to-delivery",
    "delivery_profile": "micro",
    "artifact_profile": "compact",
    "reason": "当前输入属于需求驱动的前端交付任务"
  },
  "plan": {
    "required_roles": ["frontend-implementer", "code-guardian"],
    "activated_optional_roles": ["requirement-analyst"],
    "first_handoff": "requirement-analyst",
    "approval_gates": [],
    "delivery_profile": "micro",
    "artifact_profile": "compact",
    "review_policy": "none"
  },
  "assumptions": [
    "默认沿用项目现有组件目录与命名规范",
    "默认沿用项目现有主题变量和表单校验模式"
  ],
  "missing_inputs": [
    "组件目录位置未明确",
    "是否有设计稿未明确"
  ],
  "artifacts": [
    "openspec/changes/add-product-card/proposal.md",
    "openspec/changes/add-product-card/tasks.md",
    "code",
    "openspec/changes/add-product-card/checklist.md",
    "openspec/changes/add-product-card/iterations.md"
  ],
  "next_action": "先按默认假设交给 requirement-analyst 收敛任务；若发现高风险冲突，再转 suggest 或 manual"
}
```

## 5. 最小判定规则

### 5.1 auto 模式默认行为

当运行模式是 `auto（自动）` 时，主代理应优先：

- 先读取项目规范中的明确结论
- 先读取仓库与规范上下文
- 先推断可补齐的信息
- 把推断结果写入 `assumptions（默认假设）`
- 在不引入明显高风险的前提下继续交给下一跳专家

默认配置下，`auto（自动）` 应优先搭配 `review_policy = none（无阻塞审核）`。

此时 `prd-to-delivery（需求到交付流程）` 默认不保留阻塞审批点，会自动推进。

若用户明确要求人工审核，再切换到 `review_policy = main-flow-blocking（主流程阻塞审核）`，并保留：

- `before-implementation（实现前门禁）`
- `before-guardian（守护前门禁）`
- `before-archive（归档前门禁）`

### 5.2 可以直接进入实现前置阶段

当满足以下条件时，可以继续向下游专家交接：

- 已识别任务类型
- 已选出基础 `flow（流程模板）`
- 已明确第一跳专家
- 关键阻断输入已知，或已显式列为 `missing_inputs（缺失输入）`
- 当前缺口已经被仓库推断或默认假设部分覆盖
- 项目规范中已有明确结论的信息已经被吸收到 `assumptions（默认假设）`
- 已生成稳定 `change_id（变更 ID）`
- 已明确 `openspec/changes/<change-id>/` 下的关键产物落点

### 5.3 不能直接进入实现阶段

遇到以下情况时，不应直接让 `frontend-implementer（前端实现专家）` 开始写代码：

- 任务范围完全不清晰
- 技术栈未识别
- 所属目录或页面未知
- 是否需要接口 / 状态 / 设计稿完全未知

此时必须先输出缺口清单或先交给 `requirement-analyst（需求解析专家）`。

### 5.4 必须从 auto 转 suggest / manual 的场景

满足以下任一条件时，不应继续默认自动推进：

- 认证、支付、安全、合规等高风险能力无法可靠推断
- 关键默认假设与仓库现有实现冲突
- 继续执行会显著放大返工成本
- 需要明确业务口径才能决定实现方向

补充规则：

- `suggest（建议）` 适合“先看计划再决定是否继续”的场景，首轮 `run-plan（运行计划）` 生成后应进入 `start-review（启动确认门禁）`
- `manual（手动）` 当前只允许手动指定 `flow（流程模板）`，必须显式提供 `--flow <flow-id>`

### 5.5 delivery_profile 的选择规则

- `micro（微型交付）`
  - 单页面、单组件、简单 Bug 修复、Mock 数据任务
  - 不减少专家，但 OpenSpec 产物采用短版 compact 规格
- `standard（标准交付）`
  - 多状态联动、真实接口、复杂业务规则、核心模块改造
  - 使用完整产物与完整门禁

### 5.6 micro 的产物规格

当 `delivery_profile = micro` 时：

- `proposal.md` 使用短版：目标、范围、默认假设、风险
- `tasks.md` 使用短版：3-5 条可执行任务
- `checklist.md` 使用短版：关键检查项、阻断项、是否建议通过
- `iterations.md` 使用短版：问题、修正动作、残留风险
- 不允许因为是 `micro` 而跳过专家或跳过 OpenSpec 落盘

### 5.7 page-development 任务的缺口分类

对于 `page-development（页面开发）`：

- 技术栈：优先从 `package.json`、`01-项目概述.md` 推断；可推断时写入 `assumptions（默认假设）`
- 页面目录与路由落点：优先从 `03-项目结构.md`、`06-路由规范.md` 推断；可推断时写入 `assumptions（默认假设）`
- 样式承载方式：优先从 `09-样式规范.md` 推断；可推断时写入 `assumptions（默认假设）`
- 认证方式与字段校验：优先从现有代码和 `05-API规范.md` 推断；若仓库无现成认证实现，`auto` 模式下默认可假设为“账号密码登录 + 基础前端校验”
- 只有“设计稿原稿、品牌主色实际值、后端真实认证协议、必须遵循的业务字段规则”这类无法从规范和代码推断的内容，才应进入 `missing_inputs（缺失输入）`

### 5.8 prd-to-delivery 的强制产物门禁

对于 `prd-to-delivery（需求到交付）`：

- 首轮 `run-plan（运行计划）` 必须确定稳定 `change_id（变更 ID）`
- 首轮 `run-plan（运行计划）` 必须显式带出 `proposal/specs/design/tasks/checklist/iterations` 的目标路径
- 未存在 `proposal.md`、`specs/`、`design.md` 与 `tasks.md` 时，不得交给 `frontend-implementer（前端实现专家）`
- 未存在 `checklist.md` 与 `iterations.md` 时，不得进入 `complete（完成）`

## 6. 示例

### 输入

```text
@task-orchestrator（任务主代理） 创建一个商品组件
```

### 输出

```md
## 任务识别
- 类型：组件开发
- 当前输入：创建一个商品组件
- 风险级别：low

## 推荐流程模板
- `selected_flow（选中的流程模板）`：prd-to-delivery
- 原因：当前输入属于需求驱动的前端交付任务，且缺少实现细节，适合先走最小规划再进入实现

## 运行模式
- `mode（运行模式）`：auto

## 交付档位
- `delivery_profile（交付档位）`：micro
- `artifact_profile（产物规格）`：compact
- `complexity（复杂度）`：low

## 推荐专家
- 必选：frontend-implementer（前端实现专家）、code-guardian（规范守护者）
- 可选：requirement-analyst（需求解析专家）
- 第一跳：requirement-analyst（需求解析专家）

## 默认假设
- 默认沿用项目现有前端技术栈与目录规范
- 默认沿用项目现有主题变量和基础校验方式

## 缺失输入
- 组件使用的是 Vue（前端框架）还是 React（前端框架）
- 组件准备放在哪个页面或目录
- 是否有设计稿或参考样式

## 审批点
- 暂无

## 下一步
- 先按默认假设进入 requirement-analyst（需求解析专家）；若需求收敛阶段发现高风险冲突，再转 suggest 或 manual
```

## 7. 一句话约束

> `task-orchestrator（任务主代理）` 的首轮输出必须先形成结构化 `run-plan（运行计划）`；在 `auto（自动）` 模式下，应先做仓库推断并记录 `assumptions（默认假设）`，不默认回问用户，只有高风险关键分歧才转 `suggest（建议）` 或 `manual（手动）`。

## 8. 与首轮桥接载荷的关系

如果当前运行环境支持宿主层推进，则在生成 `run-plan（运行计划）` 后，应继续：

1. 生成首轮 `task-anchor（任务锚点）`
2. 优先产出 `task-orchestrator-turn.json` 交给宿主 `Runner（运行器）`
3. 若宿主 `Runner` 不可用，再回退到 `task-orchestrator-bootstrap（主代理首轮桥接载荷）`
4. 回退时调用：

```bash
ai-spec-auto runtime-state bootstrap --payload ./.ai-spec/internal/tmp/task-orchestrator-bootstrap.json
```

对应规范见：

- [task-anchor-spec.md](../roles/common/task-anchor-spec.md)
- [task-orchestrator-bootstrap-payload.md](../roles/common/task-orchestrator-bootstrap-payload.md)
