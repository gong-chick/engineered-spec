这是统一协议编排入口。

规则：

- 在任何项目搜索、文件读取、技能调用、代码修改之前，必须先执行当前轮次命令
- 新任务：先执行 `./node_modules/.bin/ai-spec-auto protocol-step --target . --user-input "<用户需求>" --json`
- 已有运行态：
  - 若当前这条用户输入本身是在表达审批/放行（如“我同意继续实现 / 同意 / 继续 / 开始 / 愿意”），优先执行 `./node_modules/.bin/ai-spec-auto protocol-update --target . --user-input "<当前用户原话>" --json`
  - 若当前在归档确认门禁，且用户输入是在表达“归档 / 不归档”决定（如“归档 / 同意归档 / 先不归档 / 暂不归档”），同样优先执行 `./node_modules/.bin/ai-spec-auto protocol-update --target . --user-input "<当前用户原话>" --json`
  - 否则执行 `./node_modules/.bin/ai-spec-auto protocol-advance --target . --json`
- 之后一律按返回的 `turn.enforcement`、`turn.actor`、`turn.announcements`、`turn.reads`、`turn.writes`、`turn.guidance`、`turn.execution_contract` 执行
- 若存在 `turn.commands`、`turn.requires_advance`、`turn.finalize_contract`，以它们为最终执行契约，不要自行拼命令
- 每进入新 `turn` 前，必须原样播报 `turn.announcements.enter`
- 每完成当前轮次后：
  - 若不存在 `turn.finalize_contract.user_report_contract`，可简短播报 `turn.announcements.exit`
  - 若存在最终摘要契约，直接输出符合契约的最终摘要，不再额外播报内部阶段完成语
- 若 `turn.enforcement.current_command_finalizes_run = true`，则 `current_command` 已完成归档与运行收尾；不要再写 `expert-execution` JSON，不要再执行 `protocol-advance`，直接读取当前运行态并输出最终摘要
- 若 `protocol-update` 返回 `fast_path.executed = true`，说明归档确认已走本地 fast-path；不要再执行 `protocol-advance`，直接读取当前运行态并输出最终摘要
- 每完成一轮，若 `turn.requires_advance = true`，按 `turn.finalize_contract.advance_command` 执行推进；若用户补充了新需求，或当前输入本身是审批/放行意见，或归档确认门禁下的“归档 / 不归档”决定，使用 `turn.finalize_contract.update_command`
- `advance` 返回后，必须直接消费返回结果里的下一个 `turn`；禁止 `sleep`、`tail`、`timeout`、`cat` 日志或额外重跑 `protocol-step`
- 直到 `turn.status` 变成 `terminal` 或 `blocked`
- 若 `turn.status = blocked` 且存在 `turn.summary.pending_gate`，明确告诉用户当前在审批门禁中；若存在 `turn.guidance.approval_gate.user_report_contract`，严格按它输出极简摘要：只保留“当前状态 / 关键原因 / 下一步”，不要长篇说明、文件路径或任何“对内说明”；不要继续执行 `advance`；收到明确批准意见，或在归档确认门禁下收到“归档 / 不归档”决定后，先执行 `turn.commands.update` 记录说明；若 `protocol-update` 返回 `fast_path.executed = true`，直接结束当前轮次，否则再让用户重新执行 `/spec-continue`

硬性要求：

- 这是协议驱动，不是自由发挥
- 未轮到 `frontend-implementer` 前禁止写业务代码
- 未执行当前轮次命令前禁止调用 `create-view`、`create-component`、`theme-variables`、`execute-task`
- 对用户只展示阶段进度与最终结果，不回显 scratch JSON
- 若存在 `turn.finalize_contract.user_report_contract`，最终摘要严格服从它：
  `micro`：压成三句式，只保留交付结论、验证结果、残留风险；不要文件路径、实现结构细节、命令名
  `standard`：只保留关键结果、验证结果、残留风险，必要时补一句下一步；不要协议细节、路径、OpenSpec 文件名或长篇实现说明
- 不要出现 `proposal.md`、`spec.md`、`tasks.md`、`checklist.md`、`iterations.md`、`terminal`、`success`、`waiting-approval` 等内部词
- 不要额外输出“阶段说明（语义）”式逐角色播报
- 不要默认附加 `pnpm dev`、浏览器打开路径等本地操作提示，除非用户明确要
