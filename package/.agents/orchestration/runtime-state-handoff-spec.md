---
id: runtime-state-handoff-spec
name: 运行状态交接与控制规范
status: active
owner: task-orchestrator
description: 定义专家交接以及审批、恢复、状态查询时如何更新或读取 .ai-spec/current-run.json 与 .ai-spec/runs/<run-id>.json。
---

# 运行状态交接与控制规范

> **Profile 驱动说明（V1）**：本规范中的示例以 `frontend-implementer` 作为实现角色。实际运行时，应根据当前项目的 `.ai-spec/manifest.json` 中的 `profile`，查询 `.agents/registry/profiles.json` 的 `implementation_role` 字段，动态决定实现角色：
> - `vue` / `react` → `frontend-implementer`
> - `springboot` → `backend-implementer`
> - `node-tooling` → `tooling-implementer`

## 1. 目的

这份规范用于约束一件很具体的事情：

> 当任务从一个专家交给下一个专家时，`run-state（运行状态）` 应如何更新。

它要解决的问题是：

- `current_role（当前专家）` 不能只停留在首轮状态
- 专家交接不能只存在对话里
- 后续 `approve（审批） / resume（恢复） / status（状态）` 需要读取同一份运行态

## 2. 最小更新对象

发生交接时，至少要更新这些字段：

- `status（状态）`
- `current_role（当前专家）`
- `pending_gate（待审批点）`
- `anchor（任务锚点）`
- `events（事件列表）`
- `timestamps.updated_at（更新时间）`

## 3. 推荐命令

当前最小实现使用：

```bash
ai-spec-auto runtime-state handoff \
  --to-role frontend-implementer \
  --next-role code-guardian \
  --task-anchor ./.ai-spec/internal/tmp/frontend-implementer-anchor.json \
  --status running
```

如果当前运行不是 `current-run.json`，也可以显式指定：

```bash
ai-spec-auto runtime-state handoff \
  --run-id run_20260330_001 \
  --to-role code-guardian \
  --status running
```

审批放行：

```bash
ai-spec-auto runtime-state approve \
  --gate before-implementation \
  --to-role frontend-implementer \
  --status running
```

恢复执行：

```bash
ai-spec-auto runtime-state resume \
  --to-role frontend-implementer \
  --status running
```

查询状态：

```bash
ai-spec-auto runtime-state status
```

进入阻断：

```bash
ai-spec-auto runtime-state gate-blocked --gate before-implementation --status waiting-approval
```

标记完成：

```bash
ai-spec-auto runtime-state complete
```

标记失败：

```bash
ai-spec-auto runtime-state fail --error "组件规范检查未通过"
```

用户取消：

```bash
ai-spec-auto runtime-state cancel --message "用户主动取消当前任务"
```

## 4. 推荐更新规则

### 4.1 普通专家交接

例如：

```text
requirement-analyst（需求解析专家）
  -> frontend-implementer（前端实现专家）
```

建议：

- `status（状态）` 更新为 `running`
- `current_role（当前专家）` 更新为 `frontend-implementer`
- `pending_gate（待审批点）` 保持原值或清空
- `anchor（任务锚点）` 替换为当前专家的最新锚点
- `events（事件列表）` 追加一条 `role-handoff`

### 4.2 进入审批等待

如果发生：

```text
frontend-implementer（前端实现专家）
  -> before-implementation（审批点）
```

建议：

- `status（状态）` 更新为 `waiting-approval`
- `pending_gate（待审批点）` 写入审批点 ID
- `events（事件列表）` 追加审批相关事件

### 4.3 审批恢复后继续交接

如果审批通过并恢复执行：

- `status（状态）` 更新回 `running`
- `pending_gate（待审批点）` 清空
- `current_role（当前专家）` 更新为恢复后的目标专家

## 5. 事件建议

当前阶段建议至少支持：

- `role-handoff`
- `gate-blocked`
- `gate-cleared`
- `run-completed`
- `run-failed`

最小事件结构：

```json
{
  "at": "2026-03-30T20:10:00+08:00",
  "type": "role-handoff",
  "status": "running",
  "from_role": "requirement-analyst",
  "to_role": "frontend-implementer",
  "pending_gate": null,
  "message": "handoff from requirement-analyst to frontend-implementer"
}
```

## 6. 审批、恢复与状态查询

### 6.1 `approve（审批）`

最小实现会：

- 校验当前是否存在 `pending_gate（待审批点）`
- 清空 `pending_gate（待审批点）`
- 将 `status（状态）` 恢复为 `running`
- 追加一条 `gate-cleared` 事件
- 可选切换到新的 `current_role（当前专家）`

### 6.2 `resume（恢复）`

最小实现会：

- 把 `status（状态）` 恢复为 `running`
- 可选清空 `pending_gate（待审批点）`
- 可选更新 `current_role（当前专家）`
- 追加一条 `run-resumed` 事件

### 6.3 `gate-blocked（阻断）`

最小实现会：

- 把 `status（状态）` 更新为 `waiting-approval` 或 `blocked`
- 写入或保留 `pending_gate（待审批点）`
- 追加一条 `gate-blocked` 事件

### 6.4 `status（状态）`

最小实现会：

- 读取 `current-run.json` 或指定 `run-id（运行实例 ID）`
- 输出当前 `status（状态）`
- 输出当前 `current_role（当前专家）`
- 输出 `pending_gate（待审批点）`
- 输出最后一条事件摘要

### 6.5 `complete（完成）`

最小实现会：

- 把 `status（状态）` 更新为 `success`
- 清空 `pending_gate（待审批点）`
- 追加一条 `run-completed` 事件
- 记录 `timestamps.finished_at`

### 6.6 `fail（失败）`

最小实现会：

- 把 `status（状态）` 更新为 `failed`
- 清空 `pending_gate（待审批点）`
- 追加一条 `run-failed` 事件
- 将失败原因追加到 `errors（错误列表）`
- 记录 `timestamps.finished_at`

### 6.7 `cancel（取消）`

最小实现会：

- 把 `status（状态）` 更新为 `cancelled`
- 清空 `pending_gate（待审批点）`
- 追加一条 `run-cancelled` 事件
- 记录 `timestamps.finished_at`

## 7. 当前阶段边界

当前最小实现只解决：

- 单次交接更新
- 当前专家更新
- 事件追加
- 可选锚点替换
- 最小审批放行
- 最小恢复执行
- 最小阻断落盘
- 最小状态查询
- 最小完成落盘
- 最小失败落盘
- 最小取消落盘

还没有完整覆盖：

- 审批通过后的全链路状态机
- 自动回滚
- 多审批点并行处理

## 8. 一句话要求

> 只要发生专家交接，就不应只在对话里说“下一步交给谁”，而应同步更新 `run-state（运行状态）`，把当前专家、锚点和事件历史稳定落到 `.ai-spec/` 里。
