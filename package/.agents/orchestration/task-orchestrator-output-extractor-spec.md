---
id: task-orchestrator-output-extractor-spec
name: 主代理输出抽取规范
status: active
owner: task-orchestrator
description: 定义如何从 task-orchestrator 的自然语言或 Markdown 回复中抽取结构化 JSON 载荷，供自动执行链消费。
---

# 主代理输出抽取规范

## 1. 目的

这份规范解决的是：

> `task-orchestrator（任务主代理）` 需要继续输出人能读懂的解释，但系统仍然要自动拿到结构化 `JSON（结构化数据）` 去执行。

因此新增一层最小抽取器：

```bash
ai-spec-auto task-orchestrator-extractor extract --payload <file>
ai-spec-auto task-orchestrator-extractor apply --payload <file>
```

## 2. 当前最小能力

当前抽取器只做两件事：

1. 从整段文本里找到第一个合法 `JSON（结构化数据）` 候选
2. 确认它是系统支持的 payload（载荷） 类型

支持来源：

- 纯 JSON（结构化数据） 回复
- Markdown（标记文本） 中的 ```json 代码块```

## 3. 支持的 payload（载荷） 类型

- `task-orchestrator-bootstrap（主代理首轮桥接载荷）`
- `task-orchestrator-runtime-action（主代理运行动作载荷）`
- `task-orchestrator-runtime-event（主代理运行事件载荷）`

## 4. 推荐回复方式

推荐主代理使用“解释 + JSON 代码块”的混合回复：

````md
我已经完成任务分析，建议先进入 requirement-analyst（需求解析专家）。

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-bootstrap",
  "run_plan": {
    "schema_version": 1,
    "kind": "run-plan"
  },
  "task_anchor": {
    "schema_version": 1,
    "kind": "task-anchor"
  }
}
```
````

## 5. 推荐调用链

### 5.1 只抽取，不执行

```bash
ai-spec-auto task-orchestrator-extractor extract --payload ./.ai-spec/internal/tmp/task-orchestrator-reply.md
```

### 5.2 抽取后直接执行

```bash
ai-spec-auto task-orchestrator-extractor apply --payload ./.ai-spec/internal/tmp/task-orchestrator-reply.md
```

## 6. 当前阶段边界

当前抽取器：

- 只取第一个合法 payload（载荷）
- 不做复杂语义理解
- 不从散落文本里猜字段

也就是说，当前策略是：

> 允许自然语言存在，但系统动作必须落在显式 JSON 代码块里。

## 7. 一句话约束

> 若主代理希望“既保留可读回复，又进入自动执行链”，应在回复中输出显式 JSON 代码块，再由 `task-orchestrator-extractor（主代理输出抽取器）` 抽取并交给适配层执行。
