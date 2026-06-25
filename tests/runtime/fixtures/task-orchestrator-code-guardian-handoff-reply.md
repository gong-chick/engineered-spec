最小 smoke 验证：模拟 `/spec-continue` 将流程交给 code-guardian。

```json
{
  "schema_version": 1,
  "kind": "task-orchestrator-runtime-action",
  "action": "handoff",
  "run_id": "run_20260331_160700_smoke",
  "from_role": "frontend-implementer",
  "to_role": "code-guardian",
  "status": "running",
  "clear_pending_gate": true,
  "message": "handoff to code-guardian for delivery checks",
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
      "current_role": "code-guardian",
      "next_role": null
    },
    "constraints": {
      "rules": [
        "test-standard",
        "format-check-standard"
      ],
      "must_not": [
        "不要跳过交付前检查"
      ]
    },
    "expected_output": [
      "输出 checklist",
      "输出 iterations",
      "给出交付结论"
    ]
  }
}
```
