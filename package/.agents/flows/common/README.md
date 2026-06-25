# 流程目录说明

本目录用于定义“专家协同流程”。

当前阶段已落地 5 条流程：

- `prd-to-delivery.md`
- `bugfix-to-verification.md`
- `change-to-release.md`
- `requirement-to-observability.md`
- `change-to-architecture-review.md`

这里的“流程”不再理解成写死所有步骤的刚性链路，而应理解成：

- 基础协作模板
- 必选专家骨架
- 可选专家插入条件
- 审批点和产物约束

当前阶段的目标不是把流程做复杂，而是先把“大需求主链”“小需求快修链”和“发布/可观测/架构评审补充链”都收口稳定，后续再按相同结构继续新增。

## Frontmatter 约定

流程模板的结构化元数据统一约定见：

- [../FRONTMATTER.md](../FRONTMATTER.md)
- [../RUN_OUTPUT.md](../RUN_OUTPUT.md)

后续 CLI、插件页面、OpenClaw 调度层都应优先解析 frontmatter，而不是依赖正文做关键路由判断。
