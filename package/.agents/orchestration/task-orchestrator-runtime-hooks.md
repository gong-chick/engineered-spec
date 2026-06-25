---
id: task-orchestrator-runtime-hooks
name: 主代理运行态钩子规范
status: active
owner: task-orchestrator
description: 定义 task-orchestrator 在首轮规划、审批阻断、审批放行、专家交接、恢复、完成、失败、取消时应如何把最小 scratch 交给宿主 Runner 或回退桥接层消费。
---

# 主代理运行态钩子规范

> **Profile 驱动说明（V1）**：本规范中的示例以 `frontend-implementer` 作为实现角色。实际运行时，应从 `.ai-spec/manifest.json` 读取 `profile`，再从 `.agents/registry/profiles.json` 查询 `implementation_role`，动态决定交接的实现角色（`frontend-implementer` / `backend-implementer` / `tooling-implementer`）。

## 1. 目的

这份规范不直接替代真正的运行器代码，它解决的是：

> 当 `task-orchestrator（任务主代理）` 真的开始驱动一条任务链时，每个关键节点应优先把哪类最小 scratch 交给宿主 `Runner（运行器）` 消费；如果 `Runner` 不可用，再回退到哪条 `adapter/runtime-state` 命令。

也就是说，它是：

- 自动执行链的调用约定
- 未来 Runner（运行器）或 IDE（开发工具）插件的接线图

## 2. 最小钩子映射

### 2.1 首轮计划生成后

当主代理已经拿到：

- `run-plan（运行计划）`
- 首轮 `task-anchor（任务锚点）`

推荐优先方式：

```text
由宿主层调用内部 Runner：
task-orchestrator-runner.advanceRunner({ target })
```

其中默认输入应来自：

- `./.ai-spec/internal/tmp/task-orchestrator-turn.json`

如果当前环境尚未接 `Runner（运行器）`，且当前主代理已经直接产出了结构化 bootstrap JSON，可回退为：

```bash
ai-spec-auto task-orchestrator-adapter apply --payload ./.ai-spec/internal/tmp/task-orchestrator-bootstrap.json
```

如果当前环境尚未接抽取层和适配层，再回退为：

```bash
ai-spec-auto runtime-state bootstrap --payload ./.ai-spec/internal/tmp/task-orchestrator-bootstrap.json
```

### 2.2 进入审批等待或被阻断

如果当前节点不能继续，需要卡在审批点或阻断点：

```bash
ai-spec-auto task-orchestrator-adapter apply --payload ./.ai-spec/internal/tmp/current-runtime-action.json
```

如果只是一般阻断，没有审批点：

```bash
ai-spec-auto runtime-state gate-blocked --status blocked --message "缺少设计稿，无法继续"
```

### 2.3 审批通过

优先由宿主 `Runner（运行器）` 或内部工具消费结构化动作载荷；未接时回退为：

```bash
ai-spec-auto runtime-state approve \
  --gate before-implementation \
  --to-role frontend-implementer
```

### 2.4 专家交接

优先由宿主 `Runner（运行器）` 或内部工具消费结构化动作载荷；未接时回退为：

```bash
ai-spec-auto runtime-state handoff \
  --to-role frontend-implementer \
  --next-role code-guardian \
  --task-anchor ./.ai-spec/internal/tmp/frontend-implementer-anchor.json \
  --status running
```

当前阶段若已接内部桥接层，则在状态更新成功后，会自动清理旧的：

- `.ai-spec/internal/current-dispatch.json`
- `.ai-spec/internal/current-execution.json`
- `.ai-spec/internal/current-runtime-action.json`

随后应由 `task-orchestrator（任务主代理）` 根据新的 `run-state（运行状态）` 明确重新产出下一轮：

- `expert-dispatch（专家派发载荷）`
- `expert-execution（专家执行载荷）`

如果已经接 `Runner（运行器）`，则推荐下一轮统一走：

```text
task-orchestrator-runner.advanceRunner({ target })
```

### 2.4.1 单轮专家执行结束后

当前阶段不要求专家自己递归推进下一轮；建议在当前专家完成本轮后，由 `task-orchestrator（任务主代理）` 明确生成标准 `runtime-action（运行动作）` 草案，再由宿主 `Runner（运行器）` 或内部工具落盘：

```text
task-orchestrator-runner.advanceRunner({ target })
```

其中默认输入可来自：

- `./.ai-spec/internal/tmp/current-runtime-action.json`
- 或新的 `./.ai-spec/internal/tmp/task-orchestrator-turn.json`

如果暂未接 `Runner（运行器）`，再回退为：

```bash
ai-spec-auto expert-executor apply-action --payload ./.ai-spec/internal/tmp/current-runtime-action.json --advance-runtime
```

若当前环境仍坚持旧的“两步桥接”模式，则继续使用：

```bash
ai-spec-auto expert-executor apply-action --payload ./.ai-spec/internal/tmp/current-runtime-action.json
ai-spec-auto task-orchestrator-adapter apply --payload ./.ai-spec/internal/current-runtime-action.json
```

### 2.5 恢复执行

优先由宿主 `Runner（运行器）` 或内部工具消费结构化动作载荷；未接时回退为：

```bash
ai-spec-auto runtime-state resume --to-role frontend-implementer --status running
```

### 2.6 运行完成

优先由宿主 `Runner（运行器）` 或内部工具消费结构化动作载荷；未接时回退为：

```bash
ai-spec-auto runtime-state complete
```

### 2.7 运行失败

优先由宿主 `Runner（运行器）` 或内部工具消费结构化动作载荷；未接时回退为：

```bash
ai-spec-auto runtime-state fail --error "组件规范检查未通过"
```

### 2.8 用户取消

优先由宿主 `Runner（运行器）` 或内部工具消费结构化动作载荷；未接时回退为：

```bash
ai-spec-auto runtime-state cancel --message "用户主动取消当前任务"
```

### 2.9 查询当前状态

优先由宿主 `Runner（运行器）` 或内部工具消费结构化动作载荷；未接时回退为：

```bash
ai-spec-auto runtime-state status
```

## 3. 推荐自动链顺序

```text
task-orchestrator（任务主代理）
  -> 生成 run-plan（运行计划） + task-anchor（任务锚点） / runtime-action（运行动作）
  -> 宿主 Runner（运行器）或内部桥接层
  -> bootstrap（首轮桥接）
  -> 如需等待审批：gate-blocked（阻断）
  -> 审批通过：approve（审批）
  -> 交给下一位专家：handoff（交接）
  -> 如执行中断：resume（恢复）
  -> 成功结束：complete（完成）
  -> 失败结束：fail（失败）
  -> 用户放弃：cancel（取消）
```

## 4. 当前阶段边界

当前仓库里已经有：

- 最小 `runtime-state（运行状态）` 命令
- 最小钩子映射规范
- 最小 `task-orchestrator-adapter（自动执行适配层）` 回退桥接
- 最小 `task-orchestrator-runner（运行器）` inbox（收件箱） 消费器

但还没有：

- 自动从 `AI（智能体）` 会话本身拉取输出的宿主层集成
- 自动生成所有中间 `task-anchor（任务锚点）` 文件的执行器
- 由本地脚本替代 `task-orchestrator（任务主代理）` 产出 `expert-dispatch（专家派发载荷） / runtime-action（运行动作）`
- 由本地脚本替当前专家产出 `expert-execution（专家执行载荷）`
- 由 `expert-executor（专家执行器）` 自动补下一轮 `expert-dispatch（专家派发载荷）`

所以这份规范当前的意义是：

> 先把自动执行链的调用协议定稳，再把真正的运行器接上。

## 5. 一句话要求

> `task-orchestrator（任务主代理）` 不应只负责“说下一步做什么”，还应优先输出最小结构化 scratch；其中 `expert-dispatch（专家派发载荷） / runtime-action（运行动作）` 由 `task-orchestrator（任务主代理）` 产出，`expert-execution（专家执行载荷）` 由当前专家产出，宿主 `Runner（运行器）` 优先负责消费，本地 adapter/runtime-state 只做回退桥接。
