---
id: change-to-architecture-review
version: 1
name: 变更到架构评审
status: active
type: flow-template
owner: task-orchestrator
description: 面向跨模块改动、依赖调整和结构性演进的架构评审模板。用于在实现前或实现中期补一轮边界与影响分析。
triggers:
  - architecture-review
  - module-boundary-design
  - dependency-audit
required_roles:
  - architecture-advisor
  - dependency-governor
optional_roles:
  - requirement-analyst
  - code-guardian
approval_gates: []
artifacts:
  - architecture-notes
  - module-boundary-suggestions
  - dependency-audit-notes
  - upgrade-plan
visibility: internal
domains:
  - engineering
  - governance
---

# change-to-architecture-review

## 模板定位

这条模板服务于“改动已经超出单点实现，需要先看结构和影响面”的场景。

它重点处理：

- 模块边界是否清楚
- 依赖引入或升级是否值得
- 结构性改动会影响谁
- 后续实现应如何拆分和回滚

## 适用场景

- 涉及多个模块或多个包的改动
- 需要新增、升级或替换关键依赖
- 目录边界、职责拆分或架构走向存在争议

## 不适用场景

- 纯样式或文案微调
- 已经明确是低风险小修正
- 仅需执行既定 tasks，不再涉及结构判断

## 基础骨架

本模板的默认骨架如下：

1. `architecture-advisor`
2. `dependency-governor`

## 可选专家插入规则

| 条件 | 建议插入专家 | 作用 |
| --- | --- | --- |
| 需求边界仍需再收敛 | `requirement-analyst` | 补需求和实现范围约束 |
| 需要形成阻断项与放行结论 | `code-guardian` | 输出规范一致性检查 |

## 主要产物

至少要沉淀以下内容：

- `architecture-notes`
- `module-boundary-suggestions`
- `dependency-audit-notes`
- `upgrade-plan`

## 完成标准

当满足以下条件时，本模板可视为完成：

- 结构性风险已经被识别并记录
- 依赖引入、升级或移除的影响面已经清楚
- 后续实现拆分、验证路径和回滚关注点已经明确

## 说明

这条模板关注“先把结构问题看清”，不是替代最终实现。
