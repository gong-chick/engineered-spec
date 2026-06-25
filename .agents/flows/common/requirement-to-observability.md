---
id: requirement-to-observability
version: 1
name: 需求到可观测
status: active
type: flow-template
owner: task-orchestrator
description: 面向埋点口径、错误追踪和真实用户监控设计的可观测治理模板。用于把需求边界继续沉淀成可分析、可追踪的观测方案。
triggers:
  - observability-plan
  - event-instrumentation
  - error-monitoring
required_roles:
  - requirement-analyst
  - event-instrumentation-specialist
optional_roles:
  - error-tracker
  - rum-analyst
  - code-guardian
approval_gates: []
artifacts:
  - openspec/changes/<change-id>/proposal.md
  - openspec/changes/<change-id>/design.md
  - openspec/changes/<change-id>/tasks.md
  - event-plan
  - tracking-schema-notes
  - error-triage-notes
  - rum-analysis-notes
visibility: internal
domains:
  - demand-design
  - observability
  - governance
---

# requirement-to-observability

## 模板定位

这条模板服务于“需求已经明确，但还缺可观测设计”的场景。

它重点回答：

- 要追哪些关键事件
- 事件字段和命名如何统一
- 错误追踪与归因口径如何建立
- 哪些真实用户数据值得持续关注

## 适用场景

- 新功能要补行为埋点
- 现有埋点口径不统一，需要治理
- 团队开始补错误追踪或 RUM 观察面

## 不适用场景

- 纯页面实现，没有观测需求
- 只有单点 bug 修复，不涉及追踪设计
- 没有任何需求边界，只有模糊“想看数据”

## 基础骨架

本模板的默认骨架如下：

1. `requirement-analyst`
2. `event-instrumentation-specialist`

## 可选专家插入规则

| 条件 | 建议插入专家 | 作用 |
| --- | --- | --- |
| 需要统一错误分层和归因口径 | `error-tracker` | 补高频错误与排查视角 |
| 已有真实用户监控数据，需判断真实影响 | `rum-analyst` | 补用户侧风险判断 |
| 需要形成阻断项和放行口径 | `code-guardian` | 审核观测方案是否可交付 |

## 主要产物

至少要沉淀以下内容：

- `proposal.md`
- `design.md`
- `tasks.md`
- `event-plan`
- `tracking-schema-notes`

## 完成标准

当满足以下条件时，本模板可视为完成：

- 观测目标已经和需求边界对齐
- 事件命名、触发时机和字段口径已经清楚
- 错误追踪或 RUM 观察面已有清晰建议
- 后续实现和验收可以直接消费这些观测定义

## 说明

这条模板关注“把需求变成可观测方案”，不是直接替代埋点实现。
