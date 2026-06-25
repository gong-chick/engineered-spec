---
id: task-orchestrator-adapter-payload
name: 主代理自动执行适配载荷规范
status: active
owner: task-orchestrator
description: 定义 task-orchestrator 输出给自动执行适配层消费的最小 payload 结构；该适配层仅作为宿主 Runner 不可用时的回退桥接。
---

# 主代理自动执行适配载荷规范

## 1. 目的

这份规范解决的是一个具体问题：

> `task-orchestrator（任务主代理）` 已经产出了结构化结果，但运行环境不想手工拼 `runtime-state（运行状态）` 命令。

当宿主 `Runner（运行器）` 不可用时，需要一个稳定的回退适配入口：

```bash
ai-spec-auto task-orchestrator-adapter apply --payload <file>
```

由适配层自动识别当前属于：

- `bootstrap（首轮桥接）`
- `handoff（专家交接）`
- `gate-blocked（阻断）`
- `approve（审批）`
- `resume（恢复）`
- `complete（完成）`
- `fail（失败）`
- `cancel（取消）`
- `status（状态）`

## 2. 支持的两类 payload

### 2.1 首轮桥接 payload

直接复用：

- [task-orchestrator-bootstrap-payload.md](../roles/common/task-orchestrator-bootstrap-payload.md)

也就是说，这类输入本身就可直接交给适配器：

```bash
ai-spec-auto task-orchestrator-adapter apply --payload ./.ai-spec/internal/tmp/task-orchestrator-bootstrap.json
```

### 2.2 运行态动作 payload

最小结构：

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-runtime-action",
  "action": "handoff"
}
```

其中 `action` 允许：

- `handoff`
- `gate-blocked`
- `approve`
- `resume`
- `complete`
- `fail`
- `cancel`
- `status`

并在关键动作成功后，为下一轮 `task-orchestrator（任务主代理）` 产出新的 `expert-dispatch（专家派发载荷）`、为当前专家产出新的 `expert-execution（专家执行载荷）` 清出干净状态。

## 3. 推荐字段

适配器会读取这些字段并映射到 `runtime-state（运行状态）`：

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-runtime-action",
  "action": "handoff",
  "run_id": "run_20260331_101010_abcd",
  "to_role": "frontend-implementer",
  "next_role": "code-guardian",
  "from_role": "requirement-analyst",
  "status": "running",
  "pending_gate": null,
  "clear_pending_gate": true,
  "message": "handoff to frontend-implementer",
  "task_anchor": {
    "schema_version": 1,
    "kind": "task-anchor"
  }
}
```

说明：

- `run_id` 可选；缺省时读取 `.ai-spec/current-run.json`
- `task_anchor` 推荐直接内联，不要求单独落文件
- `status`、`message`、`gate` 按动作类型按需提供

## 4. 示例

### 4.1 阻断

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-runtime-action",
  "action": "gate-blocked",
  "gate": "before-implementation",
  "status": "waiting-approval",
  "message": "等待实现前审批"
}
```

### 4.2 交接

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-runtime-action",
  "action": "handoff",
  "to_role": "frontend-implementer",
  "next_role": "code-guardian",
  "status": "running",
  "task_anchor": {
    "schema_version": 1,
    "kind": "task-anchor",
    "stage": {
      "current_role": "frontend-implementer",
      "next_role": "code-guardian"
    }
  }
}
```

### 4.3 完成

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-runtime-action",
  "action": "complete",
  "message": "规范检查通过，任务完成"
}
```

## 5. 一句话约束

> 主代理若要进入自动执行链，应优先输出最小结构化 scratch 交给宿主 `Runner（运行器）` 消费；若 `Runner` 不可用，再回退为 adapter payload，由 `ai-spec-auto task-orchestrator-adapter apply` 统一翻译为 `runtime-state（运行状态）` 更新，而不是在对话里手写命令。 
