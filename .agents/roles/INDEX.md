---
id: roles-display-index
name: 角色展示名索引
version: 1
description: 供插件页面读取的角色展示索引。优先解析下方的 yaml 数据块。
---

# 角色展示名索引

这份索引用于统一角色展示层数据，避免插件页面逐个扫描所有角色文件。

当前统计：

- `active` 角色：21 个
- `planned` 候选角色：13 个

插件页面建议优先解析下面的 `yaml` 数据块。

## index-data

```yaml
version: 1
domains:
  - id: orchestration
    name: 任务编排层
    order: 0
    visibility: internal
  - id: demand-design
    name: 需求设计域
    order: 1
    visibility: public
  - id: governance
    name: 规范治理域
    order: 2
    visibility: public
  - id: engineering
    name: 工程构建域
    order: 3
    visibility: public
  - id: testing
    name: 测试验证域
    order: 4
    visibility: public
  - id: delivery
    name: 发布交付域
    order: 5
    visibility: public
  - id: documentation
    name: 文档知识域
    order: 6
    visibility: public
  - id: performance
    name: 性能体验域
    order: 7
    visibility: public
  - id: observability
    name: 可观测治理域
    order: 8
    visibility: public
  - id: security-a11y
    name: 安全与可访问性域
    order: 9
    visibility: public

roles:
  - id: task-orchestrator
    name: 任务主代理
    status: active
    bucket: common
    visibility: internal
    domains: [orchestration]
    source: .agents/roles/common/task-orchestrator.md

  - id: requirement-analyst
    name: 需求解析专家
    status: active
    bucket: common
    visibility: public
    domains: [demand-design]
    source: .agents/roles/common/requirement-analyst.md

  - id: frontend-implementer
    name: 前端实现专家
    status: active
    bucket: common
    visibility: public
    domains: [engineering, delivery]
    source: .agents/roles/common/frontend-implementer.md

  - id: backend-implementer
    name: 后端实现专家
    status: active
    bucket: common
    visibility: public
    domains: [engineering, delivery]
    source: .agents/roles/common/backend-implementer.md

  - id: tooling-implementer
    name: 工具仓实现专家
    status: active
    bucket: common
    visibility: public
    domains: [engineering, delivery]
    source: .agents/roles/common/tooling-implementer.md

  - id: code-guardian
    name: 规范守护者
    status: active
    bucket: common
    visibility: public
    domains: [governance, testing]
    source: .agents/roles/common/code-guardian.md

  - id: archive-change
    name: 归档专家
    status: active
    bucket: common
    visibility: public
    domains: [delivery, documentation]
    source: .agents/roles/common/archive-change.md

  - id: design-collaborator
    name: 设计协作专家
    status: active
    bucket: domains
    visibility: public
    domains: [demand-design]
    source: .agents/roles/domains/demand-design/design-collaborator.md

  - id: api-contract-specialist
    name: API 契约专家
    status: active
    bucket: domains
    visibility: public
    domains: [demand-design]
    source: .agents/roles/domains/demand-design/api-contract-specialist.md

  - id: lint-policy-specialist
    name: Lint 规则专家
    status: planned
    bucket: domains
    visibility: public
    domains: [governance]
    source: .agents/roles/domains/governance/lint-policy-specialist.md

  - id: api-governance-specialist
    name: API 规范专家
    status: planned
    bucket: domains
    visibility: public
    domains: [governance]
    source: .agents/roles/domains/governance/api-governance-specialist.md

  - id: route-governance-specialist
    name: 路由规范专家
    status: planned
    bucket: domains
    visibility: public
    domains: [governance]
    source: .agents/roles/domains/governance/route-governance-specialist.md

  - id: build-specialist
    name: 构建专家
    status: active
    bucket: domains
    visibility: public
    domains: [engineering]
    source: .agents/roles/domains/engineering/build-specialist.md

  - id: dependency-governor
    name: 依赖治理专家
    status: active
    bucket: domains
    visibility: public
    domains: [engineering]
    source: .agents/roles/domains/engineering/dependency-governor.md

  - id: architecture-advisor
    name: 架构顾问专家
    status: active
    bucket: domains
    visibility: public
    domains: [engineering]
    source: .agents/roles/domains/engineering/architecture-advisor.md

  - id: unit-test-specialist
    name: 单元测试专家
    status: active
    bucket: domains
    visibility: public
    domains: [testing]
    source: .agents/roles/domains/testing/unit-test-specialist.md

  - id: e2e-test-specialist
    name: E2E 测试专家
    status: active
    bucket: domains
    visibility: public
    domains: [testing]
    source: .agents/roles/domains/testing/e2e-test-specialist.md

  - id: coverage-analyst
    name: 覆盖率分析专家
    status: planned
    bucket: domains
    visibility: public
    domains: [testing]
    source: .agents/roles/domains/testing/coverage-analyst.md

  - id: verification-reviewer
    name: 验证评审专家
    status: active
    bucket: domains
    visibility: public
    domains: [testing]
    source: .agents/roles/domains/testing/verification-reviewer.md

  - id: pipeline-specialist
    name: 流水线专家
    status: active
    bucket: domains
    visibility: public
    domains: [delivery]
    source: .agents/roles/domains/delivery/pipeline-specialist.md

  - id: container-specialist
    name: 容器专家
    status: planned
    bucket: domains
    visibility: public
    domains: [delivery]
    source: .agents/roles/domains/delivery/container-specialist.md

  - id: deployment-specialist
    name: 部署专家
    status: active
    bucket: domains
    visibility: public
    domains: [delivery]
    source: .agents/roles/domains/delivery/deployment-specialist.md

  - id: component-doc-specialist
    name: 组件文档专家
    status: planned
    bucket: domains
    visibility: public
    domains: [documentation]
    source: .agents/roles/domains/documentation/component-doc-specialist.md

  - id: api-doc-specialist
    name: API 文档专家
    status: planned
    bucket: domains
    visibility: public
    domains: [documentation]
    source: .agents/roles/domains/documentation/api-doc-specialist.md

  - id: technical-writing-specialist
    name: 技术文档专家
    status: planned
    bucket: domains
    visibility: public
    domains: [documentation]
    source: .agents/roles/domains/documentation/technical-writing-specialist.md

  - id: performance-auditor
    name: 性能审计专家
    status: active
    bucket: domains
    visibility: public
    domains: [performance]
    source: .agents/roles/domains/performance/performance-auditor.md

  - id: vitals-analyst
    name: 性能指标专家
    status: planned
    bucket: domains
    visibility: public
    domains: [performance]
    source: .agents/roles/domains/performance/vitals-analyst.md

  - id: asset-optimizer
    name: 资源优化专家
    status: planned
    bucket: domains
    visibility: public
    domains: [performance]
    source: .agents/roles/domains/performance/asset-optimizer.md

  - id: error-tracker
    name: 错误追踪专家
    status: active
    bucket: domains
    visibility: public
    domains: [observability]
    source: .agents/roles/domains/observability/error-tracker.md

  - id: rum-analyst
    name: RUM 分析专家
    status: active
    bucket: domains
    visibility: public
    domains: [observability]
    source: .agents/roles/domains/observability/rum-analyst.md

  - id: event-instrumentation-specialist
    name: 埋点方案专家
    status: active
    bucket: domains
    visibility: public
    domains: [observability]
    source: .agents/roles/domains/observability/event-instrumentation-specialist.md

  - id: security-reviewer
    name: 安全审查专家
    status: planned
    bucket: domains
    visibility: public
    domains: [security-a11y]
    source: .agents/roles/domains/security-a11y/security-reviewer.md

  - id: a11y-auditor
    name: 可访问性审计专家
    status: planned
    bucket: domains
    visibility: public
    domains: [security-a11y]
    source: .agents/roles/domains/security-a11y/a11y-auditor.md

  - id: aria-specialist
    name: ARIA 专家
    status: planned
    bucket: domains
    visibility: public
    domains: [security-a11y]
    source: .agents/roles/domains/security-a11y/aria-specialist.md
```

## parse-rules

- `domains` 视为展示层的一级能力域
- `roles` 视为展示层的二级专家项
- `status=active` 表示当前可安装、可展示、可被运行时路由；是否必经仍由 flow 的 `required_roles` 决定
- `status=planned` 表示当前仅为候选模板
- `visibility=internal` 可在插件页面隐藏或放到内部调试区
- `source` 指向角色源文件路径
