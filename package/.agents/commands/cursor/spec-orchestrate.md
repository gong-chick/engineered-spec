---
name: /spec-orchestrate
id: spec-orchestrate
category: Workflow
description: Cursor 兼容入口：统一协议编排，自动选择 protocol-step、protocol-update 或 protocol-advance
---

这是 Cursor 的统一协议编排入口。

硬性要求：

- 在任何项目搜索、文件读取、技能调用、代码修改之前，必须先执行当前轮次命令
- 这是协议驱动，不是自由发挥
- 未轮到 `frontend-implementer` 前禁止写业务代码
- 未执行当前轮次命令前禁止调用 `create-view`、`create-component`、`theme-variables`、`execute-task`

执行规则：

- 新任务：先执行

```bash
./node_modules/.bin/ai-spec-auto protocol-step --target . --user-input "<用户需求>" --json
```

- 已有运行态：
  - 若当前这条用户输入本身是在表达审批/放行，优先执行

```bash
./node_modules/.bin/ai-spec-auto protocol-update --target . --user-input "<当前用户原话>" --json
```

  - 若当前在归档确认门禁，且用户输入是在表达“归档 / 不归档”决定，同样优先执行

```bash
./node_modules/.bin/ai-spec-auto protocol-update --target . --user-input "<当前用户原话>" --json
```

  - 其它情况执行

```bash
./node_modules/.bin/ai-spec-auto protocol-advance --target . --json
```

后续一律按返回的 `turn.enforcement`、`turn.actor`、`turn.announcements`、`turn.reads`、`turn.writes`、`turn.guidance`、`turn.execution_contract` 执行：

- 若存在 `turn.commands`、`turn.requires_advance`、`turn.finalize_contract`，以它们为最终执行契约，不要自行拼命令
- 每进入新 `turn` 前，必须原样播报 `turn.announcements.enter`
- 若 `turn.enforcement.current_command_finalizes_run = true`，不要再写 `expert-execution` JSON，不要再执行 `protocol-advance`
- 若 `protocol-update` 返回 `fast_path.executed = true`，不要再执行 `protocol-advance`
- `advance` 返回后，必须直接消费返回结果里的下一个 `turn`；禁止 `sleep`、`tail`、`timeout`、`cat` 日志或额外重跑 `protocol-step`
- 若 `turn.status = blocked` 且存在 `turn.summary.pending_gate`，明确告诉用户当前在审批门禁中；若存在 `turn.guidance.approval_gate.user_report_contract`，严格按它输出极简摘要；不要继续执行 `advance`

对用户只展示阶段进度与最终结果，不回显 scratch JSON，不额外输出协议细节、内部文件名或长篇阶段播报。
