---
id: change-to-release
version: 1
name: 变更到发布
status: active
type: flow-template
owner: task-orchestrator
description: 面向构建、回归验证、流水线与部署上线准备的发布型协作模板。用于把“代码已改完”继续推进到“可上线、可回滚、可复验”。
triggers:
  - release-readiness
  - ci-release
  - deployment-change
required_roles:
  - build-specialist
  - pipeline-specialist
  - deployment-specialist
optional_roles:
  - e2e-test-specialist
  - code-guardian
approval_gates: []
artifacts:
  - code
  - build-analysis
  - pipeline-plan
  - deployment-plan
  - release-checklist
visibility: internal
domains:
  - engineering
  - testing
  - delivery
---

# change-to-release

## 模板定位

这条模板服务于“实现已经基本完成，但发布链还没收口”的场景。

它不替代 `prd-to-delivery`，而是聚焦：

- 构建入口是否稳定
- 回归验证是否足够
- 流水线是否可复用
- 部署与回滚风险是否清楚

## 适用场景

- 新增或调整构建脚本、产物结构、发布流水线
- 上线链路依赖人工步骤较多，需要收口
- 需要把回归验证、部署配置和发布策略统一整理

## 不适用场景

- 纯业务需求分析
- 只涉及页面或接口实现、尚未进入发布准备
- 纯线上故障排查且不涉及发布链路调整

## 基础骨架

本模板的默认骨架如下：

1. `build-specialist`
2. `pipeline-specialist`
3. `deployment-specialist`

## 可选专家插入规则

| 条件 | 建议插入专家 | 作用 |
| --- | --- | --- |
| 需要更强的端到端回归证据 | `e2e-test-specialist` | 补关键发布前验证路径 |
| 需要统一阻断项和放行结论 | `code-guardian` | 输出发布前检查结论 |

## 主要产物

至少要沉淀以下内容：

- `build-analysis`
- `pipeline-plan`
- `deployment-plan`
- `release-checklist`

## 完成标准

当满足以下条件时，本模板可视为完成：

- 构建入口、产物和校验步骤已经清楚
- 流水线中的自动化步骤、人工步骤与失败处理路径已经收口
- 部署差异、环境依赖和回滚关注点已经明确
- 若启用验证专家，关键回归路径已有可执行证据

## 说明

这条模板关注的是“怎么稳定发布”，不是重新定义业务范围。
