这是协议驱动入口，不是直接开发命令。

绝对红线：

- 在执行 `protocol-step --json` 之前，禁止搜索项目、读取项目代码、调用实现技能、修改任何业务文件
- 当前 `actor` 不是 `frontend-implementer` 时，禁止修改 Vue/TS/CSS 业务代码
- 不允许跳过 `task-orchestrator -> requirement-analyst -> task-orchestrator -> frontend-implementer -> task-orchestrator -> code-guardian -> task-orchestrator`

先执行：

```bash
./node_modules/.bin/ai-spec-auto protocol-step --target . --user-input "<本次 /spec-start 的用户原始需求>" --mode auto --review-policy none --json
```

若用户明确要求先看建议计划，再改用：

```bash
./node_modules/.bin/ai-spec-auto protocol-step --target . --user-input "<本次 /spec-start 的用户原始需求>" --mode suggest --review-policy none --json
```

若用户明确要求手动锁定流程模板，再改用：

```bash
./node_modules/.bin/ai-spec-auto protocol-step --target . --user-input "<本次 /spec-start 的用户原始需求>" --mode manual --flow <flow-id> --review-policy main-flow-blocking --json
```

然后只按返回的 `turn` 执行：

1. 若存在 `turn.enforcement`，先完全遵守它；尤其是 `allowed_actor`、`allow_code_write`、`forbidden_skills`
   若 `execute_current_command_first = true`，才需要先执行 `turn.enforcement.current_command`
2. 原样向用户播报 `turn.announcements.enter`
3. 只读取 `turn.reads`，只写 `turn.writes`
4. 若存在 `turn.guidance`、`turn.execution_contract`、`turn.commands`、`turn.finalize_contract`，以它们为最终执行契约，不要自行拼命令，不要自行补流程
5. `task-orchestrator` 只写 `.ai-spec/internal/tmp/task-orchestrator-turn.json`，不写业务代码
6. `requirement-analyst` 只产出 `proposal.md`、`spec.md`、`tasks.md`
7. `frontend-implementer` 才允许改业务代码
8. `code-guardian` 只产出 `checklist.md`、`iterations.md`
9. 完成当前轮次后：
   - 若当前专家执行结果为 `partial（部分完成）` 或任何非 `done / success / completed` 状态，不得写“交付完成”，不得交给下一位专家；必须继续停留在当前专家补齐后再推进
   - 若不存在 `turn.finalize_contract.user_report_contract`，可简短播报 `turn.announcements.exit`
   - 若存在最终摘要契约，直接输出符合契约的最终摘要，不再额外播报内部阶段完成语
   - 若 `turn.enforcement.current_command_finalizes_run = true`，则 `current_command` 已完成归档与运行收尾；不要再写 `expert-execution` JSON，不要再执行 `protocol-advance`，直接读取当前运行态并输出最终摘要
10. 若 `turn.requires_advance = true`，立即执行 `turn.finalize_contract.advance_command`
11. 若用户中途补充新要求，优先执行 `turn.finalize_contract.update_command` 或 `turn.commands.update`
12. `advance` 返回后，直接读取返回结果里的下一个 `turn` 并继续；不要 `sleep`、`tail`、`timeout`、`cat` 日志，也不要额外重跑 `protocol-step`
13. 重复直到 `turn.status = terminal | blocked`

若 `turn.status = blocked` 且存在 `turn.summary.pending_gate`：
- 明确告诉用户：当前停在该审批门禁，尚未批准，不能继续实现
- 若存在 `turn.guidance.approval_gate.user_report_contract`，严格按它输出极简摘要：
  只保留“当前状态 / 关键原因 / 下一步”，不要写长篇阶段说明，不要罗列 proposal/specs/design/tasks 或仓库文件路径，不要输出任何“对内说明”
- 不要继续执行 `advance`
- 若用户随后给出明确批准意见，或在归档确认门禁下给出“归档 / 不归档”决定，先执行 `turn.commands.update` 记录说明；若 `protocol-update` 返回 `fast_path.executed = true`，直接结束当前轮次，否则再让用户重新执行 `/spec-continue`

若 `turn.status = blocked` 且存在 `turn.guidance.confirm_gate`：
- 先判断是否是 `start-review（启动确认门禁）` 或 `manual-flow-required（手动流程必填门禁）`
- `start-review（启动确认门禁）`：提示用户当前是 `suggest（建议）` 模式，先确认建议计划，再恢复到第一位专家
- `manual-flow-required（手动流程必填门禁）`：提示用户必须补充 `--flow <flow-id>`
- 不要把 `manual（手动）` 理解成“每一步都审核”

对用户只输出阶段语义和最终摘要，不回显 scratch JSON。
若存在 `turn.finalize_contract.user_report_contract`，最终摘要严格服从它：
- `micro`：压成三句式，只保留交付结论、验证结果、残留风险；不要文件路径、实现结构细节、命令名
- `standard`：只保留关键结果、验证结果、残留风险，必要时补一句下一步；不要协议细节、路径、OpenSpec 文件名或长篇实现说明
- 不要出现 `proposal.md`、`spec.md`、`tasks.md`、`checklist.md`、`iterations.md`、`terminal`、`success`、`waiting-approval` 等内部词
- 不要额外输出“阶段说明（语义）”式逐角色播报
- 不要默认附加 `pnpm dev`、浏览器打开路径等本地操作提示，除非用户明确要
