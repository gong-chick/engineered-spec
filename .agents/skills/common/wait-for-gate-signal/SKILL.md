---
name: wait-for-gate-signal
description: Use when runtime-state.status is "waiting-approval" and visual-bridge is enabled — poll `.ai-spec/gate-signal.json` every 3s for up to 60s, auto-continue on approval/resume, stop on rejection, default-continue on timeout. Keeps the same conversation; never opens a new session.
---

# Visual 门禁信号等待（切面 skill，所有 profile 通用）

> 与 `.agents/rules/common/15-visual-gate-wait.md` 等价，但以 Claude Code
> skill 形式暴露，便于 Claude 端通过技能目录发现并调用。两者逻辑必须保持一致，
> 如需调整参数，优先改规则文件，本 skill 同步更新。

## 触发条件

仅在同时满足以下两条时才应调用本 skill：

1. `.ai-spec/current-run.json` 中 `status === "waiting-approval"` 且 `pending_gate` 非空
2. `.ai-spec/visual-bridge.json` 存在且 `enabled !== false`

否则按项目原有"人工审核"流程处理。

## 执行步骤

### Step 1 — 读取当前门禁上下文

```text
state := readJSON(".ai-spec/current-run.json")
currentRunId := state.run_id
currentGate  := state.pending_gate
waitStartedAt := Date.now()
```

若读取失败，退出 skill 并请求用户人工确认。

### Step 2 — 轮询信号文件（3s × 最多 20 次）

每 3 秒：

1. 在对话中输出一行可见进度：`[T+{i*3}s] 等待 Visual 审批（run=<id> gate=<gate>）...`
2. 尝试读 `.ai-spec/gate-signal.json`（不存在/损坏 → 本轮视为无信号，跳到下一轮）
3. 对解析到的 signal 做**全部**以下校验：
   - `signal.schema_version === 1`
   - `signal.run_id === currentRunId`
   - `signal.gate === currentGate`
   - `signal.ts_ms > waitStartedAt`（防陈旧信号误触发）
4. 校验通过后按 `signal.decision` 分流：
   - `approved` 或 `resumed` → 退出循环，立即执行 `/spec-continue`
   - `rejected` → 退出循环，在对话中汇报 `signal.reason`，**不** 继续推进

### Step 3 — 超时默认放行

20 轮（约 60 秒）仍未命中任何信号：
- 在对话中明确说明："60 秒内未收到 Visual 审批决定，按默认策略自动放行"
- 执行 `/spec-continue`

## 行为约束

- **必须在原对话里完成**（本 skill 不会新开会话）
- **不得**读到任意 gate-signal 就直接继续；必须完成 4 项校验
- **不得**省略 60 秒超时判定
- **不得**在等待期间主动询问用户（循环本身就是等待机制；用户随时可打断）

## 异常兜底

| 情况 | 动作 |
|---|---|
| `current-run.json` 读失败 | 退出 skill，请求用户人工确认 |
| `gate-signal.json` JSON 损坏 | 本轮视为无信号，继续下一轮 |
| 循环中意外异常 | 捕获 + 记录 + 继续下一轮；连续 3 次异常 → 按超时路径放行 |
| 用户主动发送新消息 | 视为人工接管，立即终止循环 |

## 排障

- 确认 `.ai-spec/visual-bridge.json` 的 `enabled`、`server_url`、`workspace_id` 正确
- 确认 `cli.js visual watch` 守护正在运行（负责把 Visual 侧 outbox 应用为本地 gate-signal）
- 手动写测试信号：
  ```bash
  node -e "require('/path/to/br-ai-spec/internal/visual-hooks/gate-signal').writeGateSignal({
    targetDir: process.cwd(),
    runId: '<当前 run_id>',
    gate: '<当前 gate>',
    decision: 'approved',
    actorId: 'manual-test'
  })"
  ```
  写入后 3 秒内 AI 应命中并 `/spec-continue`。
