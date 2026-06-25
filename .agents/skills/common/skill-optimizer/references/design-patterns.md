# Skill 设计模式判断

优化现有 skill 时，先判断它主要属于哪类模式：

- `Tool Wrapper`
  - 主要职责是稳定调用某个工具或脚本
- `Generator`
  - 主要职责是产出文档、代码骨架或模板
- `Reviewer`
  - 主要职责是检查、评审、给出问题项
- `Inversion`
  - 主要职责是先计划、先确认，再进入实施
- `Pipeline`
  - 主要职责是组织多个顺序步骤

判断标准：

- 如果主要价值在“发现问题”，优先按 `Reviewer`
- 如果主要价值在“先出方案再动手”，优先按 `Inversion`
- 如果主要价值在“稳定生成产物”，优先按 `Generator`

常见问题：

- 一个 skill 同时承担 Review、Plan、Implement，导致门槛模糊
- 明明是 `Reviewer`，却把大量生成模板塞进正文
- 明明是 `Pipeline`，却没有明确的停止条件和确认点
