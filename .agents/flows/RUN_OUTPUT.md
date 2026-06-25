# ai-spec-auto run 最小解析器与输出约定

本文件定义 `ai-spec-auto run` 在读取流程模板 frontmatter 后的最小输出结构。

目标不是一次把整个执行引擎定义完，而是先保证：

- CLI 可稳定输出
- OpenClaw 可稳定读取
- 后续主代理路由和状态机可以在此基础上扩展

## 1. 为什么要有这个约定

`ai-spec-auto run` 至少会经过两个阶段：

1. 读取流程模板 frontmatter，得到结构化模板信息
2. 结合任务输入，由主代理生成本次实际执行计划

如果没有统一 JSON 输出：

- CLI 只能打印文字
- OpenClaw 只能靠日志猜当前状态
- 后续很难做状态追踪、审批、恢复和审计

因此建议把输出分成两类对象：

- `flow-descriptor`
- `run-plan`

## 2. 阶段一：flow-descriptor

这是“模板解析结果”，只依赖 frontmatter，不包含本次任务的动态路由结果。

### 2.1 输出时机

在 `ai-spec-auto run` 读取到模板文件并完成 frontmatter 校验后立即生成。

### 2.2 最小 JSON 结构

```json
{
  "schema_version": 1,
  "kind": "flow-descriptor",
  "flow": {
    "id": "prd-to-delivery",
    "version": 1,
    "name": "PRD 到交付",
    "status": "active",
    "type": "flow-template",
    "owner": "task-orchestrator",
    "description": "面向新需求、设计还原和增量交付的基础协作模板。",
    "visibility": "internal",
    "domains": ["demand-design", "engineering", "testing"],
    "triggers": ["prd-input", "design-input", "new-feature", "incremental-change"],
    "required_roles": ["requirement-analyst", "frontend-implementer", "code-guardian"],
    "optional_roles": ["design-collaborator", "api-contract-specialist", "unit-test-specialist", "verification-reviewer", "performance-auditor"],
    "approval_gates": ["before-implementation", "before-archive"],
    "artifacts": [
      "openspec/changes/<change-id>/proposal.md",
      "openspec/changes/<change-id>/specs/",
      "openspec/changes/<change-id>/design.md",
      "openspec/changes/<change-id>/tasks.md",
      "code",
      "openspec/changes/<change-id>/checklist.md",
      "openspec/changes/<change-id>/iterations.md"
    ],
    "source": ".agents/flows/common/prd-to-delivery.md"
  },
  "errors": [],
  "warnings": []
}
```

### 2.3 说明

- `schema_version`
  - 表示输出契约版本，不等于 flow frontmatter 的 `version`
- `kind`
  - 当前固定为 `flow-descriptor`
- `flow.source`
  - 为解析器补充字段，不来自 frontmatter
- `errors`
  - 仅用于模板解析层错误
- `warnings`
  - 用于提示非阻断问题

## 3. 阶段二：run-plan

这是“主代理生成的执行计划”，在 `flow-descriptor` 之上增加本次任务的动态路由结果。

### 3.1 输出时机

在主代理完成：

- 模板选择
- 必选专家确认
- 可选专家激活
- 审批点生成

之后输出。

### 3.2 最小 JSON 结构

```json
{
  "schema_version": 1,
  "kind": "run-plan",
  "run_id": "run_20260326_001",
  "mode": "auto",
  "review_policy": "main-flow-blocking",
  "status": "planned",
  "task": {
    "change_id": "add-user-center",
    "input_kind": "prd-input",
    "risk_level": "medium"
  },
  "flow": {
    "id": "prd-to-delivery",
    "name": "PRD 到交付",
    "source": ".agents/flows/common/prd-to-delivery.md"
  },
  "plan": {
    "required_roles": ["requirement-analyst", "frontend-implementer", "code-guardian"],
    "activated_optional_roles": ["design-collaborator", "api-contract-specialist"],
    "skipped_optional_roles": ["unit-test-specialist", "verification-reviewer", "performance-auditor"],
    "approval_gates": ["before-implementation", "before-guardian", "before-archive"],
    "first_handoff": "requirement-analyst",
    "review_policy": "main-flow-blocking"
  },
  "artifacts": [
    "openspec/changes/add-user-center/proposal.md",
    "openspec/changes/add-user-center/specs/",
    "openspec/changes/add-user-center/design.md",
    "openspec/changes/add-user-center/tasks.md",
    "openspec/changes/add-user-center/checklist.md",
    "openspec/changes/add-user-center/iterations.md"
  ],
  "missing_inputs": [
    "API 字段说明未确认"
  ],
  "warnings": [],
  "errors": []
}
```

## 4. 字段说明

### 4.1 顶层字段

| 字段 | 说明 |
| --- | --- |
| `schema_version` | 输出契约版本，当前固定为 `1` |
| `kind` | `flow-descriptor` 或 `run-plan` |
| `run_id` | 仅 `run-plan` 需要，表示一次运行实例 ID |
| `mode` | 主代理运行模式：`auto / suggest / manual` |
| `review_policy` | 当前审核策略：`none / main-flow-blocking` |
| `status` | 当前运行状态，如 `planned / waiting-confirm / waiting-approval / running / blocked` |

### 4.2 `task`

用于表达本次运行所面向的任务上下文。

当前最小字段建议：

- `change_id`
- `input_kind`
- `risk_level`

### 4.3 `plan`

这是 `run-plan` 最关键的部分。

| 字段 | 说明 |
| --- | --- |
| `required_roles` | 本模板本次必须参与的专家 |
| `activated_optional_roles` | 主代理动态激活的可选专家 |
| `skipped_optional_roles` | 本次未激活的可选专家 |
| `approval_gates` | 本次实际保留的审批点 |
| `first_handoff` | 第一位要被启动的专家 |
| `review_policy` | 本次计划对应的审核策略，便于运行时恢复默认门禁 |

## 5. 最小实现建议

当前阶段不要试图让 `ai-spec-auto run` 一次做完整状态机。

建议分两步实现：

### Step 1

支持：

- 读取流程模板
- 输出 `flow-descriptor`
- 校验流程元数据是否完整

### Step 2

支持：

- 主代理根据输入生成 `run-plan`
- 输出 `first_handoff`
- 输出 `approval_gates`
- 输出 `review_policy`
- 输出 `missing_inputs`

## 6. 错误处理约定

### 6.1 模板解析错误

若 frontmatter 无法解析，返回：

```json
{
  "schema_version": 1,
  "kind": "flow-descriptor",
  "flow": null,
  "errors": ["missing required field: required_roles"],
  "warnings": []
}
```

### 6.2 路由错误

若模板能解析，但主代理无法生成可执行计划，返回：

```json
{
  "schema_version": 1,
  "kind": "run-plan",
  "status": "blocked",
  "errors": ["missing business goal", "input scope is ambiguous"],
  "warnings": []
}
```

## 7. 推荐输出方式

为了兼容 CLI、本地脚本和 OpenClaw，建议：

- 标准输出打印 `run-plan` JSON
- 人类可读说明走标准错误输出或额外 `--pretty` 模式

这样可以保证：

- 机器人读 JSON
- 人看可读文本

两者互不干扰。

## 8. 当前建议

当前阶段，`ai-spec-auto run` 最重要的不是“真的把所有专家跑完”，而是先做到这三件事：

1. 读模板
2. 产出结构化执行计划
3. 明确第一跳交接给谁

只要这三件事稳定了，后面接 OpenClaw、审批、恢复、审计都会顺很多。

补充当前默认语义：

- `suggest（建议）` 模式下，`run-plan（运行计划）` 落盘后通常会进入 `waiting-confirm（等待确认）`
- `manual（手动）` 模式下，必须显式指定 `flow（流程模板）`
- `prd-to-delivery（需求到交付流程）` 在 `review_policy = main-flow-blocking（主流程阻塞审核）` 下，会把 `before-guardian（守护前门禁）` 注入到实际 `approval_gates（审批点）` 中
