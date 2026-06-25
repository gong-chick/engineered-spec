# 流程模板 Frontmatter 解析约定

本文件定义 `.agents/flows/` 下流程模板的统一 frontmatter 结构，供后续 CLI、插件页面、OpenClaw 调度层和本地脚本共同解析。

目标不是把流程元数据做复杂，而是保证：

- 可稳定解析
- 可渐进扩展
- 不依赖正文做关键决策

与 `ai-spec-auto run` 的最小 JSON 输出约定见：

- [RUN_OUTPUT.md](RUN_OUTPUT.md)

## 1. 基本规则

### 1.1 文件格式

每个流程模板文件必须是 Markdown 文件，并在文件开头包含 YAML frontmatter：

```md
---
id: prd-to-delivery
version: 1
name: PRD 到交付
status: active
type: flow-template
owner: task-orchestrator
description: 面向新需求、设计还原和增量交付的基础协作模板。
triggers:
  - prd-input
required_roles:
  - requirement-analyst
optional_roles:
  - design-collaborator
approval_gates:
  - before-implementation
artifacts:
  - openspec/changes/<change-id>/proposal.md
---
```

### 1.2 解析范围

解析器只应将首个 `---` 与第二个 `---` 之间的 YAML 视为结构化元数据。

正文部分：

- 用于人读
- 不作为关键调度依据
- 可以辅助解释，但不能替代 frontmatter 中的关键字段

### 1.3 解析失败原则

若以下情况成立，应将该流程模板判定为不可执行：

- 缺少 frontmatter
- YAML 语法非法
- 缺少必填字段
- `id` 或角色字段格式非法

建议处理方式：

- CLI：给出明确错误并停止使用该模板
- 插件页面：隐藏或标记为异常模板
- OpenClaw 调用层：禁止直接进入执行

## 2. 字段定义

### 2.1 必填字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `id` | string | 流程模板稳定 ID，使用英文 `kebab-case` |
| `version` | number | frontmatter 结构版本，当前固定为 `1` |
| `name` | string | 流程中文展示名 |
| `status` | string | 模板状态：`active / draft / planned / deprecated` |
| `type` | string | 当前固定为 `flow-template` |
| `owner` | string | 当前负责路由该模板的主代理角色 ID，当前一般为 `task-orchestrator` |
| `description` | string | 模板简介，面向人和页面展示 |
| `triggers` | string[] | 触发该模板的任务信号 |
| `required_roles` | string[] | 必选专家列表，按默认执行骨架顺序排列 |
| `optional_roles` | string[] | 可选专家列表，按推荐插入优先级排列 |
| `approval_gates` | string[] | 审批点列表，按时间顺序排列 |
| `artifacts` | string[] | 模板执行完成后至少应产生的产物列表 |

### 2.2 可选字段

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `visibility` | string | `public / internal`，用于页面展示控制 |
| `tags` | string[] | 补充标签，如 `frontend`、`design-to-code` |
| `profiles` | string[] | 技术栈约束，如 `vue`、`react` |
| `domains` | string[] | 关联能力域，便于平台检索 |
| `notes` | string[] | 对调度器有帮助的补充说明，不作为硬校验字段 |

## 3. 字段约束

### 3.1 `id`

- 必须唯一
- 使用英文小写 `kebab-case`
- 不允许空格、中文或大写字母

示例：

- `prd-to-delivery`
- `bugfix-to-verification`

### 3.2 `status`

允许值：

- `active`
- `draft`
- `planned`
- `deprecated`

解析建议：

- `active`：可参与执行
- `draft`：仅供开发和测试，不默认执行
- `planned`：仅作为规划模板展示，不进入实际路由
- `deprecated`：保留兼容，不再推荐

### 3.3 `type`

当前固定值：

- `flow-template`

后续若有扩展，也应保持向后兼容。

### 3.4 `owner`

- 应引用已存在的主代理角色 ID
- 当前默认使用 `task-orchestrator`

### 3.5 `required_roles`

- 至少包含 1 个角色
- 角色 ID 必须可映射到 `.agents/roles/INDEX.md`
- 数组顺序表示默认基础骨架顺序

说明：

- 这不是“绝对写死的执行顺序”
- 但它代表默认协作主链

### 3.6 `optional_roles`

- 可为空数组
- 角色 ID 必须可映射到 `.agents/roles/INDEX.md`
- 数组顺序表示推荐插入优先级，不是强制执行顺序

### 3.7 `approval_gates`

- 可为空数组
- 使用英文 `kebab-case`
- 应表达“什么时候需要人确认”，而不是“专家名称”

示例：

- `before-implementation`
- `before-archive`

### 3.8 `artifacts`

- 可为空数组，但生产型模板不建议为空
- 使用相对项目根目录的路径表达
- 可包含占位符，如 `<change-id>`

## 4. 解析约定

### 4.1 解析输出对象

建议统一解析成如下结构：

```yaml
id: prd-to-delivery
version: 1
name: PRD 到交付
status: active
type: flow-template
owner: task-orchestrator
description: 面向新需求、设计还原和增量交付的基础协作模板。
triggers:
  - prd-input
required_roles:
  - requirement-analyst
optional_roles:
  - design-collaborator
approval_gates:
  - before-implementation
artifacts:
  - openspec/changes/<change-id>/proposal.md
source: .agents/flows/common/prd-to-delivery.md
```

其中：

- `source` 不是 frontmatter 原字段
- 而是解析器补充的来源路径

### 4.2 未知字段处理

为保证后续扩展能力：

- 未知字段默认保留
- 但当前解析器不应依赖未知字段
- 不因未知字段直接报错

这可以避免模板升级时老版本 CLI 立即失效。

### 4.3 空值处理

建议遵循以下规则：

- 缺少必填字段：报错
- 可选数组字段缺失：按空数组处理
- 可选字符串字段缺失：按空值处理

## 5. 执行层解释规则

解析后，各字段的含义应统一如下：

- `required_roles`
  - 表示本模板的最小协作骨架
- `optional_roles`
  - 表示主代理可按条件动态插入的专家池
- `approval_gates`
  - 表示执行过程中可能暂停并等待人工确认的节点
- `artifacts`
  - 表示本次任务完成时至少要落下的结果

重要说明：

> 流程模板只定义“骨架和边界”，真正的激活结果仍由主代理结合输入任务动态决定。

## 6. 推荐校验顺序

后续 CLI 或平台服务解析流程模板时，建议按以下顺序校验：

1. 文件是否存在
2. frontmatter 是否存在
3. YAML 是否可解析
4. 必填字段是否完整
5. `type` 是否为 `flow-template`
6. `status` 是否允许执行
7. `owner` 是否存在
8. `required_roles` / `optional_roles` 是否都能映射到角色索引

## 7. 当前建议

当前阶段不要把流程模板 frontmatter 做成大而全 schema。

最稳的做法是：

- 先固定一套小字段集合
- 先让 `prd-to-delivery` 跑通
- 后续再扩展 `profiles / domains / visibility`

这样最适合当前项目的渐进式推进路径。
