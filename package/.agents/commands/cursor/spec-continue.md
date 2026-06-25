---
name: /spec-continue
id: spec-continue
category: Workflow
description: Cursor 兼容入口：按运行态优先执行 protocol-update 或 protocol-advance
---

这是 Cursor 的协议继续入口，不是直接开发命令。

绝对红线：

- 在执行 `protocol-advance --json` 之前，禁止直接开始读项目代码、调用实现技能或修改业务文件
- 不允许把当前轮次退化成“直接开始写页面/组件代码”
- `task-orchestrator` 必须在每次专家完成后重新出现

先判断当前这一轮用户输入：

- 若用户这轮是在表达审批/放行意图，例如 `我同意继续实现`、`同意`、`继续`、`开始`、`愿意`
- 或当前在归档确认门禁中，用户这轮是在表达归档决定，例如 `归档`、`同意归档`、`先不归档`、`暂不归档`
- 且当前运行态很可能已停在 `pending_gate`

则优先执行：

```bash
./node_modules/.bin/ai-spec-auto protocol-update --target . --user-input "<当前这条用户原话>" --json
```

不要先空跑 `protocol-advance`。

若 `protocol-update` 返回 `fast_path.executed = true`：

- 说明当前是本地 fast-path，已经直接完成“归档”或“结束运行”
- 不要再执行 `/spec-continue`
- 不要再执行 `protocol-advance`
- 直接读取返回结果里的 `turn` 或当前运行态，输出最终摘要

其它情况再执行：

```bash
./node_modules/.bin/ai-spec-auto protocol-advance --target . --json
```

然后只按返回的 `turn` 执行：

1. 若存在 `turn.enforcement`，先完全遵守它；尤其是 `allowed_actor`、`allow_code_write`、`forbidden_skills`
2. 原样向用户播报 `turn.announcements.enter`
3. 只读取 `turn.reads`，只写 `turn.writes`
4. 若存在 `turn.guidance`、`turn.execution_contract`、`turn.commands`、`turn.finalize_contract`，以它们为最终执行契约，不要自行拼命令
5. 若当前专家执行结果为 `partial（部分完成）` 或任何非 `done / success / completed` 状态，不得写“交付完成”，不得交给下一位专家；必须继续停留在当前专家补齐后再推进
6. 若 `turn.enforcement.current_command_finalizes_run = true`，不要再执行 `protocol-advance`
7. 若 `turn.requires_advance = true`，立即执行 `turn.finalize_contract.advance_command`
8. 若用户中途补充新要求，或当前这条输入本身就是审批/放行意见，或是归档确认门禁下的“归档 / 不归档”决定，优先执行 `turn.finalize_contract.update_command` 或 `turn.commands.update`
9. `advance` 返回后，直接读取返回结果里的下一个 `turn` 并继续；不要 `sleep`、`tail`、`timeout`、`cat` 日志，也不要额外重跑 `protocol-step`
10. 重复直到 `turn.status = terminal | blocked`

若 `turn.status = blocked` 且存在 `turn.summary.pending_gate`：

- 明确告诉用户：当前停在该审批门禁，尚未批准，不能继续实现
- 若存在 `turn.guidance.approval_gate.user_report_contract`，严格按它输出极简摘要，只保留“当前状态 / 关键原因 / 下一步”
- 不要继续执行 `advance`
- 若用户随后给出明确批准意见，或在归档确认门禁下给出“归档 / 不归档”决定，先执行 `turn.commands.update` 记录说明；若 `protocol-update` 返回 `fast_path.executed = true`，直接结束当前轮次，否则再让用户重新执行 `/spec-continue`

最终摘要只保留高信号结果、验证结果、残留风险，不要回显协议日志、scratch JSON 或内部文件名。
