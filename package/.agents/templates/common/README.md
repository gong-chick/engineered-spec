# 任务输入模板

这些模板是 `ai-spec-auto` 的可选增强项。

用途：

- 减少 `missing_inputs`
- 减少首轮来回沟通
- 让 `task-orchestrator` 更快判定 `delivery_profile`

原则：

- 模板是可选的，不是阻断项
- 不使用模板时，仍然可以直接 `/spec-start <自然语言需求>`
- 微型任务优先用简版模板，避免把简单需求写复杂

建议场景：

- `mock-page.md`：Mock 页面、静态原型、单页面
- `new-page.md`：真实页面开发
- `new-component.md`：独立组件开发
- `bugfix.md`：单点缺陷修复
- `create-expert-package.md`：创建专家包，连同 role、rule、skill、注册表片段一起生成
