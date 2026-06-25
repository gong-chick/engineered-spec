---
id: task-orchestrator-routing-draft
name: 主代理动态路由规则草案
status: draft
owner: task-orchestrator
description: 为任务主代理提供“先选模板、再动态加减专家”的路由规则草案，避免流程层写死，同时保持协作可审计。
---

# 主代理动态路由规则草案

## 目标

让 `task-orchestrator` 具备动态选专家能力，但不退化成“每次临场发挥”的黑盒决策。

原则是：

- 主代理负责判断
- 流程模板负责提供基础骨架
- 专家负责具体交付

因此，主代理的职责不是“无中生有发明流程”，而是：

1. 识别任务类型
2. 选择基础模板
3. 动态补充或跳过可选专家
4. 给出本次实际执行计划

## 运行模式

建议支持 3 种模式：

### 1. auto

默认模式。

主代理自动选择模板并生成本次激活专家列表，只在关键节点要求人工确认。

### 2. suggest

建议模式。

主代理先输出建议执行计划，待人工确认后再启动第一位专家。

### 3. manual

手动模式。

由使用者显式指定流程模板或专家清单，主代理只做校验和执行组织。

## 路由输入

主代理应至少读取以下信号：

- 任务输入来源：PRD、设计稿、自然语言需求、已有变更目录
- 当前变更资料是否存在：`proposal.md`、`tasks.md`
- 改动范围：页面、组件、接口、状态、样式、规则、部署
- 风险等级：低、中、高
- 交付目标：方案输出、代码实现、验证结论、上线交付

## 第一步：选择基础模板

当前阶段建议按以下规则选择：

### 规则 A：新需求或设计还原

满足任一条件时，优先选择 `prd-to-delivery`：

- 输入包含 PRD
- 输入包含设计稿
- 是新功能开发
- 是有明确范围的增量改造

### 规则 A-1：全新低风险小修正

满足任一条件时，可优先选择 `bugfix-to-verification`：

- 单页面、单组件、单模块 bug 修复
- 样式微调、文案调整、小交互修正
- 不新增真实 API、路由、全局状态
- 不改变需求边界和验收口径
- 风险等级低

说明：

- 不进入 `requirement-analyst`
- 不进入 `archive-change`
- 留痕写到 `.ai-spec/history/<run-id>/`

### 规则 B：已有设计与任务清单

若已存在完整 `proposal.md` 和 `tasks.md`，且需求边界清晰：

- 仍归属 `prd-to-delivery`
- 但可从 `frontend-implementer` 开始，而不是强制重新走需求解析

### 规则 B-1：已有 open / archived change 的小修正

若 `openspec/changes/` 中已存在可复用的变更上下文：

- 当前 open change 内的小修正 -> `patch`
- 当前 open change 内影响范围/接口/验收边界 -> `scope-delta`
- 归档前修正 -> `archive-fix`
- 已归档内容补修 -> `followup-patch`

若同时存在多个 open change 且输入没有明确说明目标 change，则必须先进入轻确认，不允许自动猜测。

### 规则 C：上下文严重不足

当以下情况成立时，不应直接启动实现：

- 业务目标不清晰
- 变更范围无法界定
- 高风险假设未确认

此时：

- 返回缺口清单
- 触发人工确认
- 暂不进入实现专家

## 交付档位判定

在选中 `prd-to-delivery` 后，主代理还必须继续判定运行档位：

### micro

满足以下信号时优先选择：

- 单页面、单组件、简单修复
- mock 数据、静态原型、无真实接口
- 风险等级低

说明：

- 不减少专家
- 只把 `proposal/specs/design/tasks/checklist/iterations` 切到短版 compact 规格

### standard

满足以下信号时优先选择：

- 多状态联动
- 真实接口或复杂业务规则
- 关键模块改造
- 风险等级中高

说明：

- 保持完整产物和完整门禁

## 第二步：决定必选专家

选中 `prd-to-delivery` 后，默认必选专家为：

1. `requirement-analyst`
2. `frontend-implementer`
3. `code-guardian`

这 3 个角色构成当前最小闭环，不建议被跳过。

例外：

- 已有完整 `proposal.md` 和 `tasks.md` 时，可跳过 `requirement-analyst` 的首轮输出，但需要在执行计划中写明“已复用现有设计产物”

## 第三步：动态插入可选专家

### 设计协作专家

满足任一条件时插入 `design-collaborator`：

- 存在设计稿
- 页面视觉和交互复杂
- 设计约束较多，容易实现偏差

建议插入位置：

- `requirement-analyst` 之后
- `frontend-implementer` 之前

### API 契约专家

满足任一条件时插入 `api-contract-specialist`：

- 新增或调整接口
- 字段命名、数据结构、Mock 存在不确定性
- 前后端契约边界模糊

建议插入位置：

- `requirement-analyst` 之后
- `frontend-implementer` 之前

### 单元测试专家

满足任一条件时插入 `unit-test-specialist`：

- 改动逻辑复杂
- 关键状态流转较多
- 回归风险高
- quick-fix 中涉及 store、工具函数或边界逻辑修复

建议插入位置：

- `frontend-implementer` 过程中或之后
- `code-guardian` 之前

### 验证评审专家

满足任一条件时插入 `verification-reviewer`：

- 交付验收标准较高
- 存在明显 UI 还原要求
- 需要更强的交付前验证结论
- quick-fix 需要补强验收证据或多人复核

建议插入位置：

- `code-guardian` 之前或之后

### 性能审计专家

满足任一条件时插入 `performance-auditor`：

- 页面复杂且性能风险高
- 任务对 LCP、CLS、INP 等有目标
- 资源加载策略是交付关注点
- quick-fix 明确命中首屏慢、列表卡顿、动画或滚动掉帧

建议插入位置：

- `frontend-implementer` 之后
- `code-guardian` 之前

## 第四步：决定审批点

### before-implementation

满足以下任一条件时必须设立：

- 范围仍不清晰
- 设计与规则冲突
- 存在明显技术 trade-off
- API 契约未确认

### before-archive

满足以下任一条件时必须设立：

- 存在阻断项
- 关键验证未完成
- 存在高风险残留问题

## 主代理的输出格式

每次路由后，主代理至少输出：

- `selected_template`
- `required_roles`
- `activated_optional_roles`
- `skipped_optional_roles`
- `approval_gates`
- `missing_inputs`
- `first_handoff`

后续如果接入 `ai-spec-auto run`，建议将本节内容映射到统一 JSON 输出：

- 结构约定见 [RUN_OUTPUT.md](../../flows/RUN_OUTPUT.md)

示例：

```yaml
selected_template: prd-to-delivery
required_roles:
  - requirement-analyst
  - frontend-implementer
  - code-guardian
activated_optional_roles:
  - design-collaborator
  - api-contract-specialist
skipped_optional_roles:
  - unit-test-specialist
approval_gates: []
missing_inputs:
  - API 字段说明未确认
first_handoff: requirement-analyst
```

若当前显式启用 `review_policy = main-flow-blocking（主流程阻塞审核）`，再把需要的 `approval_gates（审批点）` 写进去。

## 当前阶段建议

当前阶段不建议追求“完全自由编排”。

最稳的做法是：

- 保留少量基础模板
- 主代理默认自动路由
- 只对可选专家做动态增减
- 把本次实际执行计划显式输出

这样既能满足“主代理自动分析”的要求，也不会失去可控性和可审计性。
