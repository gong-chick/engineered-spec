最小 smoke 验证：模拟 `/spec-start` 的主代理首轮回复。

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-bootstrap",
  "run_plan": {
    "schema_version": 1,
    "kind": "run-plan",
    "run_id": "run_20260331_160700_smoke",
    "status": "planned",
    "review_policy": "main-flow-blocking",
    "task": {
      "type": "component-development",
      "raw_input": "创建一个商品组件",
      "input_kind": "natural-language",
      "risk_level": "low"
    },
    "flow": {
      "id": "prd-to-delivery",
      "name": "需求到交付",
      "source": "runtime-smoke"
    },
    "artifacts": [
      "openspec/changes/runtime-smoke-demo/proposal.md",
      "openspec/changes/runtime-smoke-demo/specs/",
      "openspec/changes/runtime-smoke-demo/design.md",
      "openspec/changes/runtime-smoke-demo/tasks.md",
      "code",
      "openspec/changes/runtime-smoke-demo/checklist.md",
      "openspec/changes/runtime-smoke-demo/iterations.md"
    ],
    "plan": {
      "required_roles": [
        "requirement-analyst",
        "frontend-implementer",
        "code-guardian"
      ],
      "activated_optional_roles": [],
      "skipped_optional_roles": [],
      "first_handoff": "requirement-analyst",
      "approval_gates": []
    },
    "missing_inputs": [
      "组件目录位置未明确"
    ],
    "warnings": [],
    "errors": [],
    "next_action": "先交给 requirement-analyst 收敛任务"
  },
  "task_anchor": {
    "schema_version": 1,
    "kind": "task-anchor",
    "run_id": "run_20260331_160700_smoke",
    "task": {
      "raw_goal": "创建一个商品组件",
      "change_id": "runtime-smoke-demo",
      "input_kind": "natural-language"
    },
    "stage": {
      "flow_id": "prd-to-delivery",
      "current_role": "requirement-analyst",
      "next_role": "frontend-implementer"
    },
    "constraints": {
      "rules": [
        "component-standard"
      ],
      "must_not": [
        "不要跳过规则检查"
      ]
    },
      "artifacts": {
        "proposal": "openspec/changes/runtime-smoke-demo/proposal.md",
        "specs": "openspec/changes/runtime-smoke-demo/specs/",
        "design": "openspec/changes/runtime-smoke-demo/design.md",
        "tasks": "openspec/changes/runtime-smoke-demo/tasks.md"
      },
      "expected_output": [
        "补齐 proposal",
        "输出 specs",
        "输出 design",
        "输出 tasks",
        "列出缺失输入"
      ]
  }
}
```
