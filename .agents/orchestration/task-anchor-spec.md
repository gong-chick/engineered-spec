---
id: task-anchor-spec
name: 任务锚点规范
status: active
owner: task-orchestrator
description: 定义 run（运行编排） 中 task-anchor（任务锚点） 的最小结构、注入时机和交接规则，供主代理和下游专家长期复用。
---

# task-anchor（任务锚点）注入规范

## 1. 文档目的

本文档定义 `run（运行编排）` 中 `task-anchor（任务锚点）` 的最小结构、注入时机和交接规则。

这份规范要解决的问题是：

- 多专家协同时，原始任务意图不能越传越偏
- 专家之间不应依赖长对话历史来理解任务
- `task-orchestrator（任务主代理）` 每次交接都应重新注入核心目标和关键约束

一句话：

> `task-anchor（任务锚点）` 是每轮专家执行前都要重新注入的“任务原点”。

## 2. 什么是 `task-anchor（任务锚点）`

`task-anchor（任务锚点）` 不是完整上下文，也不是运行状态全文。

它更像一份最小执行锚点，只回答 5 个问题：

1. 原始任务目标是什么
2. 当前处于哪一阶段
3. 本轮专家是谁
4. 本轮必须遵守哪些约束
5. 本轮应该产出什么

所以：

- `run-plan（运行计划）` 解决“整次任务怎么跑”
- `run-state（运行状态）` 解决“当前跑到哪里了”
- `task-anchor（任务锚点）` 解决“这位专家这一轮该盯住什么”

## 3. 最小结构

当前阶段建议最小 `task-anchor（任务锚点）` 结构如下：

```json
{
  "schema_version": 1,
  "kind": "task-anchor",
  "run_id": "run_20260330_001",
  "task": {
    "raw_goal": "创建一个商品组件",
    "change_id": "add-product-card",
    "input_kind": "natural-language"
  },
  "stage": {
    "flow_id": "prd-to-delivery",
    "current_role": "requirement-analyst",
    "next_role": "frontend-implementer"
  },
  "constraints": {
    "rules": ["component-standard", "style-standard"],
    "must_not": ["不要跳过规则检查", "不要超出当前需求范围"]
  },
  "artifacts": {
    "proposal": "openspec/changes/add-product-card/proposal.md",
    "tasks": "openspec/changes/add-product-card/tasks.md"
  },
  "expected_output": [
    "补齐 proposal（提案）",
    "输出 tasks（任务清单）",
    "列出缺失输入"
  ]
}
```

## 4. 推荐 Markdown（标记语言）格式

如果当前阶段由 `IDE（开发工具） AI（智能体）` 直接消费，也可以使用下面这种更便于阅读的格式：

```md
## task-anchor（任务锚点）
- 原始目标：创建一个商品组件
- 变更 ID：add-product-card
- 当前流程模板：prd-to-delivery（需求到交付）
- 当前专家：requirement-analyst（需求解析专家）
- 下一位专家：frontend-implementer（前端实现专家）

## 本轮约束
- 必须遵守：组件规范、样式规范
- 不得越界：不要扩展到无关页面
- 当前可用产物：proposal.md、tasks.md

## 本轮目标
- 产出 proposal（提案）和 tasks（任务清单）
- 如果信息不足，先列缺口，不直接进入实现
```

## 5. 注入时机

当前阶段建议在以下 4 个节点注入：

### 5.1 主代理首轮生成 `run-plan（运行计划）` 后

当 `task-orchestrator（任务主代理）` 首次识别任务并输出 `run-plan（运行计划）` 后，应立即生成一份对应的 `task-anchor（任务锚点）`。

### 5.2 每次交给下一位专家前

只要发生角色切换，就应重新注入一份新的 `task-anchor（任务锚点）`。

例如：

```text
task-orchestrator（任务主代理）
  -> requirement-analyst（需求解析专家）
  -> frontend-implementer（前端实现专家）
  -> code-guardian（规范守护者）
```

每一跳都应有自己的锚点，而不是复用同一份长上下文。

### 5.3 审批通过或恢复执行后

如果任务经过：

- `approve（审批）`
- `resume（恢复）`

则重新进入执行前，也应重新注入锚点，避免上下文漂移。

### 5.4 状态明显变化后

当以下内容发生明显变化时，建议刷新锚点：

- 当前专家变化
- 审批点变化
- 当前阶段产物变化
- 缺失输入被补齐

## 6. 不同专家的注入差异

`task-anchor（任务锚点）` 不是对所有专家都一模一样。

### 6.1 `requirement-analyst（需求解析专家）`

重点注入：

- 原始目标
- 当前需求边界
- 缺失输入
- 需要沉淀的 `proposal（提案） / tasks（任务清单）`

### 6.2 `frontend-implementer（前端实现专家）`

重点注入：

- 当前任务范围
- 相关 `tasks（任务清单）`
- 项目规则
- 代码目录和目标位置
- 本轮需要修改的产物

### 6.3 `code-guardian（规范守护者）`

重点注入：

- 当前代码变更范围
- 规则列表
- 当前验收目标
- `checklist（检查清单）` 与残留风险

因此：

> `task-anchor（任务锚点）` 的骨架固定，但具体注入内容允许按专家做裁剪。

## 7. 与其它对象的关系

### 7.1 与 `run-plan（运行计划）`

- `run-plan（运行计划）` 是全局计划
- `task-anchor（任务锚点）` 是当前专家的本轮执行锚点

### 7.2 与 `run-state（运行状态）`

- `run-state（运行状态）` 是全局运行状态快照
- `task-anchor（任务锚点）` 是给当前专家看的最小执行摘要

### 7.3 与 `OpenSpec（规范产物）`

- `OpenSpec（规范产物）` 是长期沉淀的黑板
- `task-anchor（任务锚点）` 是本轮从黑板里裁剪出来的最小执行片段

## 8. 当前阶段的最小要求

当前阶段不要求把 `task-anchor（任务锚点）` 做成单独文件。

最小可行做法是：

1. 在主代理交接时显式输出 `task-anchor（任务锚点）`
2. 先把字段结构和交接协议定稳
3. 允许后续再决定是否落到 `.ai-spec/anchors/`

也就是说，当前阶段重点是：

- 先统一格式
- 先统一注入时机
- 先统一不同专家拿到的最小信息结构

## 9. 一句话结论

> `task-anchor（任务锚点）` 的作用不是增加上下文，而是压缩上下文。它让每位专家在每一轮执行前，都重新回到“原始目标 + 当前阶段 + 本轮约束 + 本轮输出”的最小闭环里。
