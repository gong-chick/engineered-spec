最小 smoke 验证：模拟 `/spec-continue` 触发一次专家交接。

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-runtime-action",
  "action": "handoff",
  "run_id": "run_20260331_160700_smoke",
  "from_role": "requirement-analyst",
  "to_role": "frontend-implementer",
  "next_role": "code-guardian",
  "status": "running",
  "clear_pending_gate": true,
  "message": "handoff to frontend-implementer after requirement analysis",
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
      "current_role": "frontend-implementer",
      "next_role": "code-guardian"
    },
    "constraints": {
      "rules": [
        "component-standard"
      ],
      "must_not": [
        "不要跳过规则检查"
      ]
    },
    "expected_output": [
      "完成最小组件实现",
      "准备交给 code-guardian"
    ]
  }
}
```
