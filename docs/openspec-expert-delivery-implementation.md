# 基于 OpenSpec 的专家协同式 AI 规范驱动开发平台实施版

## 1. 目的

本文是本项目后续开发的实施基线，不再停留在理念层，而是明确以下 5 个可落地产物：

1. `expert-delivery` schema 目录设计
2. `openspec/config.yaml` 最终模板
3. `.agents/registry` 字段补充建议
4. `expert-executor` 动作映射表
5. `.ai-spec` 状态机最小模型

本文同时约束一条核心原则：

> 平台必须始终保持轻量。OpenSpec 负责变更与产物，平台只补专家协同、执行契约和运行态，不重复造一个 OpenSpec。

---

## 2. 设计目标与非目标

### 2.1 设计目标

- 在目标项目中接入 OpenSpec，作为需求与交付产物底座
- 让专家在目标项目中实际完成 `proposal -> tasks -> implementation -> verification -> archive`
- 用 `rules` 约束专家行为，用 `skills` 指导专家执行步骤
- 用 `task-orchestrator` 完成任务识别、角色切换、审批与恢复
- 用最小运行态支持可回放、可恢复、可审计

### 2.2 非目标

- 不把平台做成第二个“通用 AI IDE”
- 不把所有安装、分发、注册、流程、运行态都塞进 `openspec/config.yaml`
- 不在第一阶段引入并行专家树、复杂回滚、多审批树、多租户平台
- 不为了平台完整性牺牲目标项目的可理解性

---

## 3. 四层分工

### 3.1 OpenSpec 原生层

职责：

- 管理 `openspec/changes/`、`openspec/specs/`
- 负责 slash commands / CLI 的原生生命周期
- 承载 schema、artifact 和 archive

目录：

```text
openspec/
├── config.yaml
├── schemas/
├── changes/
└── specs/
```

### 3.2 平台契约层

职责：

- 定义规则、技能、角色、流程模板、注册表
- 描述“专家应该读什么、写什么、怎么交接”

目录：

```text
.agents/
├── rules/
├── skills/
├── roles/
├── flows/
└── registry/
```

### 3.3 运行时编排层

职责：

- 记录当前运行实例
- 记录当前专家、待审批点、目标产物、事件历史
- 支持 `handoff / approve / resume / complete / fail`

目录：

```text
.ai-spec/
├── current-run.json
├── runs/
└── internal/
```

### 3.4 适配分发层

职责：

- 安装、同步、更新 OpenSpec 生成的工具文件
- 向 Cursor / Claude / OpenCode / Trae 分发适配结果

入口：

- `install.sh`
- `install.ps1`
- `bin/sync.js`

---

## 4. 轻量化原则

平台是否臃肿，关键不在目录数量，而在职责是否混乱。

必须遵守以下约束：

- `config.yaml` 只做 OpenSpec 项目配置
- 需要新 artifact 时，优先用 `custom schema`
- 注册表只存元数据，不存执行业务逻辑
- 运行态只记录事实，不替主代理推理
- 默认只跑最小主链：`requirement-analyst -> frontend-implementer -> code-guardian`

一句话：

> 第一阶段只允许“一个主流程 + 三个主专家 + 五类核心产物”。

---

## 5. 可落地产物一：expert-delivery schema

### 5.1 目标

当前项目已经把以下 4 类文档视为主链硬门禁：

- `proposal.md`
- `tasks.md`
- `checklist.md`
- `iterations.md`

其中 `checklist.md` 与 `iterations.md` 已被平台运行时当作硬约束，但仍未进入 OpenSpec 原生 schema 定义。为避免平台层与 OpenSpec 原生层错位，必须补齐自定义 schema。

### 5.2 建议目录

```text
openspec/
├── config.yaml
├── schemas/
│   └── expert-delivery/
│       ├── schema.yaml
│       └── templates/
│           ├── proposal.md
│           ├── design.md
│           ├── tasks.md
│           ├── checklist.md
│           ├── iterations.md
│           └── spec.md
├── changes/
└── specs/
```

### 5.3 设计原则

- 基于 `spec-driven` 进行 fork，不从零发明
- 只新增平台主链真正需要的 artifact
- `proposal/design/tasks/spec` 保持 OpenSpec 原生语义
- `checklist/iterations` 作为守护阶段与反馈阶段的补充 artifact
- 模板增强优先补推荐子段与填写提示，不扩 `artifact(产物)` 范围

### 5.4 artifact 责任划分

| Artifact | 主要负责角色 | 作用 |
|---|---|---|
| `proposal.md` | `requirement-analyst` | 收敛目标、范围、假设、风险 |
| `design.md` | `requirement-analyst` / 可选专家 | 技术方案与结构落点 |
| `tasks.md` | `requirement-analyst` | 可执行任务清单 |
| `spec.md` | `requirement-analyst` | 增量需求与验收场景 |
| `checklist.md` | `code-guardian` | 交付前检查与放行结论 |
| `iterations.md` | `code-guardian` | 问题、修正动作、残留风险 |

### 5.5 模板增强约定

- `proposal.md` 保留 `目标 / 范围 / 非目标 / 默认假设 / 风险与待确认项`，并补 `业务目标`、`工程目标`、`变更对象与入口`、`设计链接`、`组件复用约束` 等推荐子段
- `design.md` 保留 `方案概览 / 仓库对齐 / 关键决策 / 数据与接口变更 / 验证说明`，并补仓库落点、信息结构、状态管理、组件复用、关键验收路径等提示
- `tasks.md` 从纯勾选清单升级为“执行总原则 + 子任务结构”，每个子任务都要求 `目标 / 输入 / 输出 / 验证点 / 依赖或前置条件`
- `checklist.md` 在 `通过项 / 未通过项 / 阻断项 / 是否建议继续推进` 之外，补本地验证、浏览器验证、范围一致性和组件复用检查摘要
- `iterations.md` 保持四段结构，但额外要求记录问题来源、已完成动作、风险说明和交接提醒

### 5.6 第一阶段不做的事

- 不增加太多领域 artifact
- 不把 telemetry / eval / metrics 直接做成 schema artifact
- 不把 `runtime-state` 混入 OpenSpec schema

---

## 6. 可落地产物二：openspec/config.yaml 最终模板

### 6.1 设计原则

- 只使用 OpenSpec 原生支持的项目配置语义
- 只放 `schema`、`context`、`rules`
- 不把平台注册表、路径解析、IDE 分发策略写入其中

### 6.2 推荐模板

```yaml
schema: expert-delivery

context: |
  本项目接入 ai-spec-auto 专家协同平台。
  约束与执行入口如下：
  - rules: .agents/rules/
  - skills: .agents/skills/
  - roles: .agents/roles/
  - flows: .agents/flows/
  - runtime: .ai-spec/

  开发时优先遵循：
  1. 项目代码中的既有目录、路由、接口、样式、测试约定
  2. context/PROJECT.md 中的项目背景与仓库事实
  3. .agents/rules/ 中的团队规范
  4. .agents/skills/ 中的执行技能

rules:
  proposal:
    - "先收敛目标、范围、非目标项、默认假设和风险，再进入实现。"
    - "可从项目规则和代码推断的内容，优先写入 assumptions，不重复标记为缺失输入。"
    - "涉及页面、路由、接口、状态、样式时，必须对齐项目既有落点。"
    - "proposal.md 需要写清业务目标、工程目标、组件复用策略、设计链接和变更入口。"
  design:
    - "技术方案必须对齐项目目录、路由、API、状态、样式和测试约定。"
    - "新增能力优先复用现有结构，不因单次变更引入无关重构。"
    - "design.md 需要补齐信息结构、状态管理、组件复用策略和验收路径。"
  tasks:
    - "任务必须可执行、可验证、可交接。"
    - "实现阶段不得静默扩 scope。"
    - "涉及 UI 时必须明确验收方式；涉及接口时必须明确封装方式。"
    - "tasks.md 中每个子任务都必须写明目标、输入、输出、验证点和依赖或前置条件。"
  checklist:
    - "必须明确通过项、未通过项、阻断项和是否建议放行。"
    - "检查结论必须基于 proposal/specs/design/tasks、项目规则和实现证据。"
    - "checklist.md 需要沉淀本地验证、浏览器验证、范围一致性和组件复用检查摘要。"
  iterations:
    - "必须记录问题、修正动作、残留风险和下轮提醒。"
    - "iterations.md 需要记录问题来源、修正动作、残留风险和下轮提醒。"
```

### 6.3 不建议写入 config.yaml 的内容

- `paths`
- `registries`
- `context_packs`
- `adapters`
- 复杂归档脚本
- 运行态状态机字段

这些属于平台层，不属于 OpenSpec 原生配置。

---

## 7. 可落地产物三：.agents/registry 字段补充建议

现状下 `.agents/registry/*.json` 已经承担“静态路由注册表”职责，这个方向应保留。

### 7.1 roles.json

建议补充：

- `rule_ids`
- `skill_priority`
- `micro_skill_allowlist`
- `rule_contract_profiles`
- `openspec_actions`
- `openspec_rule_sections`
- `required_inputs`
- `required_outputs`
- `approval_gates`
- `runtime_transition`

示例：

```json
{
  "frontend-implementer": {
    "name": "前端实现专家",
    "status": "active",
    "domains": ["engineering", "delivery"],
    "source": ".agents/roles/common/frontend-implementer.md",
    "rule_ids": ["project-structure", "component-standard", "route-standard", "api-standard", "store-standard", "style-standard"],
    "skill_priority": ["create-view", "create-route", "create-api", "theme-variables", "create-component", "create-store", "execute-task"],
    "micro_skill_allowlist": ["create-view", "create-component", "create-route", "theme-variables"],
    "rule_contract_profiles": {
      "default": {
        "must_follow": ["优先复用现有目录与路由约定。"],
        "blocked_when": ["proposal/specs/design/tasks 未落盘时禁止改业务代码。"]
      },
      "vue": {
        "must_follow": ["路由统一放在 src/router/modules/。"]
      }
    },
    "openspec_actions": ["apply"],
    "openspec_rule_sections": ["tasks", "design"],
    "required_inputs": ["proposal", "tasks"],
    "approval_gates": ["before-implementation"],
    "runtime_transition": {
      "action": "handoff",
      "to_role": "code-guardian"
    }
  }
}
```

### 7.2 flows.json

建议补充：

- `default_schema`
- `artifact_profile`
- `required_roles`
- `first_handoff`
- `approval_gates`
- `core_artifacts`
- `required_artifacts`
- `handoff_policy`
- `completion_policy`

示例：

```json
{
  "prd-to-delivery": {
    "name": "PRD 到交付",
    "status": "active",
    "source": ".agents/flows/common/prd-to-delivery.md",
    "default_schema": "expert-delivery",
    "artifact_profile": "full",
    "required_roles": ["requirement-analyst", "frontend-implementer", "code-guardian"],
    "first_handoff": "requirement-analyst",
    "approval_gates": ["before-implementation", "before-archive"],
    "core_artifacts": ["proposal", "specs", "design", "tasks", "checklist", "iterations"],
    "required_artifacts": ["proposal.md", "specs", "design.md", "tasks.md", "checklist.md", "iterations.md"]
  }
}
```

### 7.3 skills.json

建议补充：

- `source`
- `sourceByProfile`
- `domains`

### 7.4 rules.json

建议补充：

- `source`
- `sourceByProfile`
- `domains`

### 7.5 原则

- registry 只保留求解所需元数据
- 不在 registry 中写执行流程
- 不在 registry 中复制 Markdown 正文
- 规则和技能文件路径优先走 `rules.json / skills.json`
- `roles.json` 只声明“这个角色需要哪些规则与技能顺序”，不复制规则内容
- `roles.json.rule_contract_profiles` 只放静态约束；依赖仓库事实的动态推导继续留在编排器代码中

---

## 8. 可落地产物四：expert-executor 动作映射表

### 8.1 定位

`expert-executor` 不是新的主代理，而是动作执行适配层。

它的职责是：

- 接收专家阶段的执行载荷
- 将其映射到 OpenSpec / IDE 动作
- 校验产物是否落盘
- 更新 `.ai-spec` 运行态

### 8.2 最小动作映射

| 角色 | OpenSpec 语义动作 | 必须产物 | 说明 |
|---|---|---|---|
| `requirement-analyst` | `propose` | `proposal.md`, `tasks.md` | 可扩展为 `explore -> propose` |
| `frontend-implementer` | `apply` | 代码变更 | 以 `tasks.md` 为执行清单 |
| `code-guardian` | `verify` | `checklist.md`, `iterations.md` | 平台主链建议启用 |
| `archive-change` | `sync -> archive` | `specs/` 合并与归档结果 | 归档前先完成规格同步 |

### 8.3 第一阶段建议

- 默认使用 `core + verify`
- `sync` 与 `archive` 保留为显式操作，不自动串联
- 不做自动多轮递归推进，仍由 `task-orchestrator` 决定下一轮
- `expert-executor` 允许通过 `--advance-runtime` 把单轮执行结果直接提交到 `.ai-spec/current-run.json`
- 即使启用了 `--advance-runtime`，也不自动补下一轮 `expert-dispatch`

### 8.4 适配策略

在不同环境下，动作适配为：

- CLI：`openspec ...`
- Cursor / Claude / OpenCode / Trae：`/opsx:*` 或 OpenSpec 生成的 skills/commands

平台不直接绑死某个 IDE，只实现“统一动作语义 -> 宿主环境具体入口”的映射。

---

## 9. 可落地产物五：.ai-spec 状态机最小模型

### 9.1 目标

运行态只解决 5 件事：

- 当前跑到哪一步
- 当前由哪个专家负责
- 当前卡在哪个审批点
- 哪些产物已经落盘
- 历史事件如何回放

### 9.2 最小结构

```json
{
  "run_id": "run_20260408_001",
  "flow_id": "prd-to-delivery",
  "schema": "expert-delivery",
  "status": "running",
  "current_role": "frontend-implementer",
  "pending_gate": null,
  "task": {
    "change_id": "add-user-center"
  },
  "artifacts": {
    "proposal": "openspec/changes/add-user-center/proposal.md",
    "tasks": "openspec/changes/add-user-center/tasks.md",
    "checklist": "openspec/changes/add-user-center/checklist.md",
    "iterations": "openspec/changes/add-user-center/iterations.md"
  },
  "events": [],
  "timestamps": {
    "created_at": "2026-04-08T10:00:00+08:00",
    "updated_at": "2026-04-08T10:15:00+08:00"
  }
}
```

### 9.3 最小状态集合

- `draft`
- `running`
- `waiting-approval`
- `blocked`
- `success`
- `failed`
- `cancelled`

### 9.4 最小事件集合

- `role-handoff`
- `gate-blocked`
- `gate-cleared`
- `run-completed`
- `run-failed`
- `run-cancelled`

### 9.5 第一阶段不做的事

- 不做并行子流
- 不做多审批树
- 不做自动回滚
- 不做复杂的运行时依赖图

---

## 10. config.yaml、rules、skills、experts 的配合方式

### 10.1 config.yaml

告诉 OpenSpec：

- 当前项目默认 schema 是什么
- 当前项目应该带入什么基础上下文
- 每类 artifact 在生成时要遵守什么高层规则

### 10.2 rules

告诉专家：

- 哪些是不可违反的工程边界
- 页面、路由、API、样式、测试应如何落位

### 10.3 skills

告诉专家：

- 在某一类任务下该如何执行
- 步骤顺序是什么
- 要输出什么、检查什么

### 10.4 experts

真正执行业务动作：

- 需求专家产出 proposal/specs/design/tasks
- 实现专家修改代码
- 守护专家产出 checklist/iterations

### 10.5 task-orchestrator

统筹全链路：

- 识别任务
- 生成 `change_id`
- 选择流程模板
- 交接专家
- 更新运行态
- 控制审批与恢复

---

## 11. 推荐开发顺序

为了保持平台轻量，开发顺序必须固定。

### Phase 1：补齐 OpenSpec 原生层

1. 新增 `openspec/schemas/expert-delivery/`
2. 把 `checklist`、`iterations` 纳入 schema
3. 收缩 `openspec/config.yaml.template`

完成标准：

- `proposal/specs/design/tasks/checklist/iterations` 都成为正式 schema artifact

### Phase 2：补齐动作执行适配层

1. 为 `expert-executor` 增加统一动作语义
2. 实现 `propose / apply / verify / archive` 映射
3. 打通产物校验与 `.ai-spec` 更新

完成标准：

- 不再只是“记录动作”，而是能执行动作并校验产物

### Phase 3：补齐平台注册表元数据

1. 补 `roles.json`
2. 补 `flows.json`
3. 补 `skills.json`
4. 补 `rules.json`

完成标准：

- `task-orchestrator` 可以主要依赖 registry 做求解

### Phase 4：补齐最小文档与验证

1. 更新 `docs/openspec-guide.md`
2. 补一条从需求到归档的 demo 流程
3. 为 schema / executor / runtime-state 增加最小测试

---

## 12. 实施自检清单

- [ ] `config.yaml` 只保留 OpenSpec 原生配置职责
- [ ] `expert-delivery` schema 已建立
- [ ] `checklist.md / iterations.md` 已成为正式 schema artifact
- [ ] `expert-executor` 能执行动作而不是只记录动作
- [ ] `.ai-spec` 只保存最小运行态，不承担推理职责
- [ ] 默认主链仅包含三位主专家
- [ ] 未引入与目标项目无关的平台复杂度

---

## 13. 结论

本平台的最佳实践不是“把所有概念都塞进一个配置文件”，而是：

- 让 OpenSpec 专注于变更与交付
- 让专家专注于执行
- 让规则和技能专注于约束与方法
- 让 `task-orchestrator` 专注于编排
- 让 `.ai-spec` 专注于状态

只要坚持这条分层原则，平台就能继续演进，而不会偏离最初“轻量、可复用、能落地”的目标。
