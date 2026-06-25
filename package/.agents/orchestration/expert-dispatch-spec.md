---
id: expert-dispatch-spec
name: 专家派发载荷规范
status: active
owner: task-orchestrator
description: 定义当前运行态如何生成并更新当前专家执行载荷，使 run（运行编排） 能稳定衔接到专家实际执行。
---

# 专家派发载荷规范

> **Profile 驱动说明（V1）**：本规范中的示例以 `frontend-implementer` 作为实现角色。实际派发时，`expert.id` 应根据当前 profile 的 `implementation_role` 动态填入（`frontend-implementer` / `backend-implementer` / `tooling-implementer`）。
>
> **多 profile 说明**：当 manifest 使用 `profiles` 数组时（如 `["vue", "nestjs"]`），`task-orchestrator` 须先通过"路径前缀匹配"确定本次变更属于哪个子包，再取对应 profile 的 `implementation_role` 作为 `expert.id`。

## 1. 目的

这份规范解决的问题是：

> `run-state（运行状态）` 已经落盘，但系统还需要一份由 `task-orchestrator（任务主代理）` 明确产出的“当前专家可执行载荷”。

因此当前推荐形态是：

- `task-orchestrator（任务主代理）` 负责理解任务、选择角色、裁剪上下文、决定技能
- 本地工具只负责校验和落盘 `expert-dispatch（专家派发载荷）`

## 2. 推荐落盘位置

当前阶段使用两处落盘：

- `.ai-spec/internal/current-dispatch.json`
- `.ai-spec/internal/dispatches/<run-id>/<dispatch-id>.json`

其中：

- `internal/current-dispatch.json`
  - 始终表示“当前这一轮应该交给谁执行”
- `internal/dispatches/<run-id>/`
  - 记录本次运行历史上生成过哪些专家执行载荷

## 3. 最小结构

```json
{
  "schema_version": 1,
  "kind": "expert-dispatch",
  "dispatch_id": "2026-03-31T15-10-00-000Z__frontend-implementer",
  "generated_at": "2026-03-31T15:10:00.000Z",
  "run_id": "run_20260331_151000_abcd",
  "status": "running",
  "role": {
    "id": "frontend-implementer",
    "name": "前端实现专家",
    "source": ".agents/roles/common/frontend-implementer.md",
    "preferred_skills": ["execute-task", "create-component"]
  },
  "task": {
    "raw_goal": "创建一个商品组件",
    "change_id": "add-product-card"
  },
  "flow": {
    "id": "prd-to-delivery"
  },
  "execution": {
    "profile": "vue",
    "current_role": "frontend-implementer",
    "next_role": "code-guardian",
    "pending_gate": null,
    "expected_output": ["完成组件实现"],
    "skills": [
      {
        "id": "create-component",
        "installed": true,
        "path": ".agents/skills/create-component/SKILL.md"
      }
    ]
  },
  "anchor": {
    "kind": "task-anchor"
  },
  "instructions": {
    "source": ".agents/roles/common/frontend-implementer.md",
    "markdown": "# 前端实现专家 ..."
  }
}
```

## 4. 推荐接入方式

当前最稳的接入方式是：

```bash
ai-spec-auto expert-dispatch apply --payload ./.ai-spec/internal/tmp/current-dispatch.json
```

或：

```bash
cat ./.ai-spec/internal/tmp/current-dispatch.json | ai-spec-auto expert-dispatch apply --stdin
```

也就是说：

- `expert-dispatch（专家派发载荷）` 的内容由 `task-orchestrator（任务主代理）` 产出
- `bin/` 只做校验、补齐时间戳和 ID、落盘
- 对 `prd-to-delivery（需求到交付）`，`task.change_id` 必须随派发一起下发，不能丢
- `requirement-analyst（需求解析专家）` 的 `expected_output` 必须显式包含 `proposal.md` 与 `tasks.md`
- `code-guardian（规范守护者）` 的 `expected_output` 必须显式包含 `checklist.md` 与 `iterations.md`

推荐在以下动作后由 `task-orchestrator（任务主代理）` 再次产出新的当前派发：

- `bootstrap（首轮桥接）`
- `handoff（交接）`
- `approve（审批）`
- `resume（恢复）`

推荐在以下终态动作后清理当前派发：

- `complete（完成）`
- `fail（失败）`
- `cancel（取消）`

## 5. 一句话约束

> `expert-dispatch（专家派发载荷）` 应由 `task-orchestrator（任务主代理）` 产出，本地只负责校验与落盘；不要让本地脚本替代 `task-orchestrator（任务主代理）` 做角色理解、技能选择和上下文裁剪。

补充：

- 若当前流程是 `prd-to-delivery（需求到交付）` 且目标角色是 `requirement-analyst / frontend-implementer / code-guardian`，则 `task.change_id` 缺失应视为非法派发

## 6. 多 profile 下的角色选择规则

当 `.ai-spec/manifest.json` 的 `profiles` 为数组时，`task-orchestrator` 按以下逻辑确定 `expert.id`：

1. 检查本次任务涉及的文件路径列表
2. 将路径与 `manifest.packages[].path` 逐一做**前缀匹配**
3. 命中某子包 → 取该子包对应 profile 的 `implementation_role`（从 `profiles.json` 查询）
4. 多个文件跨多个子包 → 按主体变更量所在子包决定，或拆成多轮派发
5. 无法匹配任何子包（如根目录配置文件修改）→ 优先使用 `code-guardian` 角色处理，不要猜测技术栈

**示例（vue + nestjs）**：

```
packages/front/src/components/Foo.vue  → profile: vue  → implementation_role: frontend-implementer
packages/server/src/user/user.service.ts → profile: nestjs → implementation_role: backend-implementer
```

`execution.profile` 字段应填写本次实际生效的 profile（非数组，填具体值）：

```json
"execution": {
  "profile": "nestjs",
  "current_role": "backend-implementer",
  ...
}
```
