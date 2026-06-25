---
id: prd-to-delivery
version: 1
name: PRD 到交付
status: active
type: flow-template
owner: task-orchestrator
description: 面向新需求、设计还原和增量交付的基础协作模板。主代理基于该模板动态选择必选专家和可选专家。
triggers:
  - prd-input
  - design-input
  - new-feature
  - incremental-change
required_roles:
  - requirement-analyst
  - frontend-implementer
  - code-guardian
optional_roles:
  - design-collaborator
  - api-contract-specialist
  - unit-test-specialist
  - verification-reviewer
  - performance-auditor
approval_gates: []
artifacts:
  - openspec/changes/<change-id>/proposal.md
  - openspec/changes/<change-id>/specs/
  - openspec/changes/<change-id>/design.md
  - openspec/changes/<change-id>/tasks.md
  - code
  - openspec/changes/<change-id>/checklist.md
  - openspec/changes/<change-id>/iterations.md
visibility: internal
domains:
  - demand-design
  - engineering
  - testing
---

# prd-to-delivery

## 模板定位

这不是“写死所有步骤的固定流程”，而是一条基础协作模板。

它定义：

- 本类任务最少需要哪些专家
- 哪些专家可以按条件插入
- 哪些节点必须人工确认
- 本次交付至少要沉淀哪些产物

真正运行时，由 `task-orchestrator` 基于输入任务动态生成本次执行计划。

## 模板目标

把一个输入需求转成可验证、可回溯的交付结果。

它既适用于：

- PRD 驱动的新功能开发
- 设计稿驱动的页面还原
- 有明确范围的增量改造

## 不适用场景

以下场景不建议直接套用本模板：

- 纯文档补写且不涉及实现
- 纯流水线配置或部署变更
- 纯线上问题排查
- 无需求边界且缺少任何上下文的探索性任务

这些场景应由 `task-orchestrator` 选择其它模板，或退回人工确认。

## 基础骨架

本模板的默认骨架如下：

1. `requirement-analyst`
2. `frontend-implementer`
3. `code-guardian`

这 3 个角色是本模板的必选角色，不应被主代理直接跳过。

## 可选专家插入规则

主代理可根据任务特征插入下列专家：

| 条件 | 建议插入专家 | 作用 |
| --- | --- | --- |
| 有设计稿、复杂交互或设计还原要求 | `design-collaborator` | 在实现前补充设计约束和 UI 风险 |
| 涉及接口契约、字段调整、Mock 设计 | `api-contract-specialist` | 在实现前对接口边界做补充 |
| 改动存在较高回归风险或需补关键测试 | `unit-test-specialist` | 在实现中或实现后补充测试策略 |
| 需要对交付结果做更强验证 | `verification-reviewer` | 在守护阶段补强验收结论 |
| 存在明显性能风险或关键指标目标 | `performance-auditor` | 在交付前补充性能审计意见 |

## 审批点

本模板默认不内建阻塞审批点，主流程会自动推进。

当运行时显式启用 `review_policy = main-flow-blocking（主流程阻塞审核）` 时，才会按顺序注入以下审批点：

1. `before-implementation`
说明：
需求边界、关键假设或方案取舍未确认时，不能直接进入实现。

2. `before-guardian`
说明：
实现结果需要先经过人工确认，再进入 `code-guardian（规范守护专家）` 守护审查。

3. `before-archive`
说明：
存在阻断项、验证结论不清晰或残留风险较高时，不能直接判定交付完成。

## 主要产物

至少要沉淀以下产物：

- `openspec/changes/<change-id>/proposal.md`
- `openspec/changes/<change-id>/specs/`
- `openspec/changes/<change-id>/design.md`
- `openspec/changes/<change-id>/tasks.md`
- 与本次变更相关的代码实现
- `openspec/changes/<change-id>/checklist.md`
- `openspec/changes/<change-id>/iterations.md`

## 完成标准

当满足以下条件时，模板执行才可视为完成：

- 需求边界已被收敛为 `proposal.md`
- 增量规范已落在 `specs/`，且允许按 domain 拆分多份 spec
- 技术方案已沉淀为 `design.md`
- 实施任务已被拆解为 `tasks.md`
- 代码实现与任务范围一致
- 交付前检查已完成并形成 `checklist.md`
- 本轮问题和经验已记录到 `iterations.md`

## 说明

当前阶段这仍然是最小 MVP 模板。

后续新增专家时，不需要推翻这条模板，只需要：

- 保持基础骨架稳定
- 扩充可选专家条件
- 扩充审批点和产物约束

## 运行档位

同一条 `prd-to-delivery` 模板支持两种运行档位，但都保留相同的三专家骨架：

### micro

适用于：

- Mock 页面
- 单页面或单组件
- 简单 Bug 修复
- 无复杂业务联动、无真实接口契约的轻量任务

约束：

- 仍然必须经过 `requirement-analyst -> frontend-implementer -> code-guardian`
- `proposal/specs/design/tasks/checklist/iterations` 仍需真实落盘
- 但产物采用短版 compact 规格
- 机械交接优先由宿主层自动推进
- 默认不保留运行历史文件

### standard

适用于：

- 真实业务页面或模块
- 多状态联动
- 涉及真实接口或复杂业务规则
- 需要完整审查和更强验收证据的交付

约束：

- 默认自动推进；需要人工审核时显式切换到 `main-flow-blocking（主流程阻塞审核）`
- 使用完整 OpenSpec 产物
- 允许更完整的设计、任务和审查说明
