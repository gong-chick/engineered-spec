---
id: expert-executor-spec
name: 单轮专家执行器规范
status: active
owner: task-orchestrator
description: 定义如何消费 current-dispatch（当前专家派发载荷），为当前专家生成单轮执行载荷，不自动递归推进下一轮。
---

# 单轮专家执行器规范

## 1. 目的

这份规范解决的问题是：

> 当前系统已经有 `run-state（运行状态）` 和 `expert-dispatch（专家派发载荷）`，但还需要一份由“当前专家”明确产出的“本轮执行输入”。

因此当前阶段的最小实现是：

- 当前专家负责产出 `expert-execution（专家执行载荷）`
- 本地工具默认负责校验和落盘
- 当显式启用 `--advance-runtime` 时，本地工具还会把本轮执行稳定映射到运行态更新
- Phase A（第一步） 只到执行载荷
- Phase B（第二步） 可额外落盘 `runtime-action（运行动作）` 草案
- 不自动递归跑完整链

## 2. 当前支持角色

Phase A（第一步） 当前只要求支持 3 个角色：

- `requirement-analyst（需求解析专家）`
- `frontend-implementer（前端实现专家）`
- `code-guardian（规范守护者）`

## 3. 推荐落盘位置

- `.ai-spec/internal/current-execution.json`
- `.ai-spec/internal/current-execution.md`
- `.ai-spec/internal/executions/<run-id>/<execution-id>.json`
- `.ai-spec/internal/executions/<run-id>/<execution-id>.md`

## 4. 推荐接入方式

当前最稳的接入方式是：

```bash
ai-spec-auto expert-executor apply --payload ./.ai-spec/internal/tmp/current-execution.json
```

或：

```bash
cat ./.ai-spec/internal/tmp/current-execution.json | ai-spec-auto expert-executor apply --stdin
```

如果当前环境希望把执行语义和运行态直接接通，可显式启用：

```bash
ai-spec-auto expert-executor apply --payload ./.ai-spec/internal/tmp/current-execution.json --advance-runtime
```

此时工具会：

- 识别 `requirement-analyst -> propose`
- 识别 `frontend-implementer -> apply`
- 识别 `code-guardian -> verify`
- 优先读取 `.agents/registry/roles.json` 中的动作与交接约定，代码内置映射只作保底
- 校验对应 OpenSpec 产物
- 在确定的流转场景下生成并应用最小 `runtime-action（运行动作）`

Phase B（第二步） 仍支持继续落盘 `runtime-action（运行动作）` 草案：

```bash
ai-spec-auto expert-executor apply-action --payload ./.ai-spec/internal/tmp/current-runtime-action.json
```

如需直接提交到运行态：

```bash
ai-spec-auto expert-executor apply-action --payload ./.ai-spec/internal/tmp/current-runtime-action.json --advance-runtime
```

## 5. 一句话约束

> `expert-executor（专家执行器）` 不应替当前专家做技能选择、执行推理和下一步动作判断；它可以在显式授权下推进最小运行态，但仍不负责自动生成下一轮 `expert-dispatch（专家派发载荷）`。
