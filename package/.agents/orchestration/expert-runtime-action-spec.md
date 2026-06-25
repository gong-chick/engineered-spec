---
id: expert-runtime-action-spec
name: 单轮专家运行动作产出规范
status: active
owner: task-orchestrator
description: 定义如何把 task-orchestrator（任务主代理） 产出的 task-orchestrator-runtime-action（主代理运行动作载荷）稳定落到 .ai-spec/，但不自动推进到下一轮。
---

# 单轮专家运行动作产出规范

## 1. 目的

这份规范约束的是 Phase B（第二步）：

> 当 `task-orchestrator（任务主代理）` 已经明确给出“当前专家这一轮结束后建议做什么”时，本地需要一层稳定工具把这份 `runtime-action（运行动作）` 落到 `.ai-spec/`。

这一步只负责：

- 校验 `task-orchestrator-runtime-action（主代理运行动作载荷）`
- 落盘到 `.ai-spec/internal/current-runtime-action.json`

这一步不负责：

- 自动推理该动作
- 默认不自动执行该动作
- 自动递归推进下一轮

## 2. 推荐落盘位置

- `.ai-spec/internal/current-runtime-action.json`
- `.ai-spec/internal/current-runtime-action.md`
- `.ai-spec/internal/runtime-actions/<run-id>/<action-id>.json`
- `.ai-spec/internal/runtime-actions/<run-id>/<action-id>.md`

## 3. 当前最小命令

```bash
ai-spec-auto expert-executor apply-action --payload ./.ai-spec/internal/tmp/current-runtime-action.json
```

或：

```bash
cat ./.ai-spec/internal/tmp/current-runtime-action.json | ai-spec-auto expert-executor apply-action --stdin
```

如果当前环境已经确认由 `expert-executor（专家执行器）` 负责把动作提交到运行态，可显式启用：

```bash
ai-spec-auto expert-executor apply-action --payload ./.ai-spec/internal/tmp/current-runtime-action.json --advance-runtime
```

补充约束：

- `run_id` 缺省时允许从 `.ai-spec/current-run.json` 自动补齐
- `complete` 会被视作 OpenSpec 的 `archive` 语义收尾，但运行态仍落为 `complete`

## 4. 与 Phase C（第三步） 的边界

当前这一步只做：

- 记录标准 `task-orchestrator-runtime-action（主代理运行动作载荷）`

当前这一步不做：

- 默认不自动调用 `task-orchestrator-adapter（自动执行适配层）`
- 不自动递归推进下一轮
- 不自动连跑完整专家链
- 不自动生成下一轮 `expert-dispatch（专家派发载荷）`

## 5. 一句话要求

> Phase B（第二步） 允许系统记录“下一步动作草案”，也允许在显式授权下把它提交到运行态；但动作本身仍必须由 `task-orchestrator（任务主代理）` 明确产出，不能由本地脚本代替 `task-orchestrator（任务主代理）` 推理。
