# 15 — Visual 门禁等待规范（ai-spec-auto / 所有 profile 共用）

> 目的：当 `/spec-start` 或其他协议推进命中门禁（`status=waiting-approval`）时，
> 让 IDE 中的 AI **在原对话里主动轮询** `.ai-spec/gate-signal.json`，实现
> "Visual 页面点批准 → 原对话自动继续"的无人值守体验。
>
> 本规则为强制切面规则（优先级高于默认等待行为），但允许项目级 `.cursor/rules/overrides/*`
> 调整轮询参数。所有 IO 失败必须静默降级，绝不阻断主协议推进。

## 15.1 触发条件（必须）

同时满足以下两项时，AI **必须立即进入** "visual 门禁等待循环"，而不是挂起询问用户：

1. `.ai-spec/current-run.json` 中 `status === "waiting-approval"` 且 `pending_gate` 非空
2. `.ai-spec/visual-bridge.json` 存在且 `enabled !== false`

若 visual-bridge 未启用或不存在，视为"纯本地模式"，按原有人工确认流程处理，**不** 进入本循环。

## 15.2 循环算法（每轮 3 秒，最多 20 轮 = 60 秒）

```text
waitStartedAt := Date.now()
currentRunId  := current-run.json.run_id
currentGate   := current-run.json.pending_gate

for i in 1..20:
    sleep 3s
    在对话输出一行："[T+{i*3}s] 等待 Visual 审批（run=<runId> gate=<gate>）..."
    try:
        signal := read JSON from .ai-spec/gate-signal.json
    catch any:
        signal := null   # 文件不存在 / JSON 损坏 → 继续等

    if signal 满足以下全部条件:
        - signal.schema_version === 1
        - signal.run_id === currentRunId
        - signal.gate === currentGate
        - signal.ts_ms > waitStartedAt
    then:
        if signal.decision in ("approved", "resumed"):
            汇报"已收到 Visual 审批：<decision>，继续执行 /spec-continue"
            执行 /spec-continue
            return
        if signal.decision === "rejected":
            汇报"Visual 审批被拒绝：<signal.reason>，停止本轮推进。"
            return

# 60 秒仍无信号 → 默认自动放行
汇报"60 秒内未收到 Visual 审批决定，按默认策略自动放行，继续执行 /spec-continue"
执行 /spec-continue
```

> 陈旧信号防误触：`signal.ts_ms > waitStartedAt` 的校验能自动忽略上一轮遗留的 gate-signal.json。
> 这是本规则的关键幂等保证，不得省略。

## 15.3 AI 行为契约（必须遵守）

- **不许** 在循环期间询问用户"要不要继续"。循环本身就是等待机制。
- **不许** 读到任意 gate-signal 就直接 `/spec-continue`，必须通过 15.2 的四项校验。
- **不许** 跳过 60 秒超时（除非项目级 override 显式设置 `visualGateWait.timeoutMs`）。
- **必须** 每轮输出一行进度，保证原对话可见。
- **必须** 整个循环用户仍可随时打断（Ctrl+C / 发送新消息），打断后视为人工接管，本规则不再自动推进。

## 15.4 异常兜底

| 情况 | 处理 |
|---|---|
| `current-run.json` 读失败 | 退回人工询问（本规则不适用） |
| `gate-signal.json` JSON 损坏 | 当次视为"无信号"，继续等 |
| `.ai-spec/` 目录不存在 | 退回人工询问 |
| 循环中抛出任何异常 | 捕获后汇报错误 + 继续下一轮；连续 3 次异常 → 按超时路径默认放行 |

## 15.5 与既有资产的关系

- 本规则与 `.ai-spec/next-step.md`（由 `inbox-consumer.js` 追加写入）互为双通道：
  `next-step.md` 提供人类可读的审批历史；`gate-signal.json` 提供机器可判定的即时信号。
  **AI 推进决策以 `gate-signal.json` 为准**，`next-step.md` 仅作审计参考。
- 不改变、不覆盖、不依赖 Cursor hook / Claude Code hook 能力；仅依赖文件系统读取。
- 与 `cli.js visual watch` 守护解耦：watch 负责把 Visual 侧 outbox 应用到本地并写 gate-signal，
  AI 负责读取并决策；两者独立失败独立恢复。

## 15.6 项目级覆盖（可选）

业务仓可在 `.cursor/rules/overrides/visual-gate-wait.md` 声明以下参数覆盖默认值：

- `intervalMs`（默认 3000）
- `maxAttempts`（默认 20）
- `defaultOnTimeout`（`"continue"` | `"pause"`，默认 `"continue"`）

当 `defaultOnTimeout === "pause"` 时，超时后 AI 退回人工询问；否则按默认放行。
