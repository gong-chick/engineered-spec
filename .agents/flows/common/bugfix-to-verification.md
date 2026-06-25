---
id: bugfix-to-verification
version: 1
name: 缺陷修复到验证
status: active
type: flow-template
owner: task-orchestrator
description: 面向全新、低风险、小范围 bug 修复或样式/文案/小交互调整的轻量协作模板。默认不进入 OpenSpec change 目录，而是在 .ai-spec/history/<run-id>/ 下保留最小留痕。
triggers:
  - bugfix-routing
  - small-change
  - style-adjustment
required_roles:
  - frontend-implementer
  - code-guardian
optional_roles:
  - unit-test-specialist
  - verification-reviewer
  - performance-auditor
approval_gates: []
artifacts:
  - code
  - .ai-spec/history/<run-id>/bugfix.md
  - .ai-spec/history/<run-id>/implementation-notes.md
  - .ai-spec/history/<run-id>/checklist.md
  - .ai-spec/history/<run-id>/iterations.md
visibility: internal
domains:
  - engineering
  - testing
---

# bugfix-to-verification

## 模板定位

这条模板服务于“小而明确”的修复型需求，不替代 `prd-to-delivery`，也不把小修正偷偷升级成完整需求流程。

它适用于：

- 单页面、单组件、单模块的 bug 修复
- 样式微调、文案调整、小交互修正
- 风险等级低、无需长期 OpenSpec 规范沉淀的修正

## 不适用场景

以下情况应升级回 `prd-to-delivery`：

- 新增真实 API、路由或全局状态
- 影响需求范围、验收边界或方案决策
- 涉及权限、支付、风控、合规等高风险逻辑
- 需要长期归档、评审或显式 spec 留痕

## 基础骨架

本模板固定骨架为：

1. `frontend-implementer`
2. `code-guardian`

默认不进入 `requirement-analyst`，也不经过 `archive-change`。

## 可选专家插入规则

| 条件 | 建议插入专家 | 作用 |
| --- | --- | --- |
| 修复涉及复杂逻辑、store、明显回归风险 | `unit-test-specialist` | 补关键测试策略 |
| 需要更强验收证据或复核 | `verification-reviewer` | 补强验证结论 |
| 修复指向性能问题 | `performance-auditor` | 给出性能风险判断 |

## 主要产物

至少要沉淀以下内容：

- 与本次修复相关的代码实现
- `.ai-spec/history/<run-id>/bugfix.md`
- `.ai-spec/history/<run-id>/implementation-notes.md`
- `.ai-spec/history/<run-id>/checklist.md`
- `.ai-spec/history/<run-id>/iterations.md`

## 完成标准

当满足以下条件时，本模板可视为完成：

- 修复范围仍然限定在低风险小需求边界内
- `bugfix.md` 说明了问题、影响范围、复现和限制
- `implementation-notes.md` 说明了修复动作、验证结果和残留风险
- `checklist.md` 给出通过 / 未通过 / 阻断项 / 证据 / 是否放行
- `iterations.md` 记录问题、修正动作、残留风险和后续提醒

## 说明

这条模板的目标是“更轻”，不是“更随意”。

一旦守护阶段发现范围已经越出小修正边界，应立即阻断并升级到 `prd-to-delivery`。
