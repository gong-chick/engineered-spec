# ai-spec-auto run（运行）输入输出契约

本文档定义 `run（运行编排）` 的最小实现契约。

目标是让这套运行时能力未来能同时服务：

- IDE（开发工具）本地触发
- OpenClaw（远程入口）
- 可选的 CLI（命令行工具）适配器
- 后续插件页面触发

这份契约重点回答 5 个问题：

1. `run（运行）` 和 `sync（同步）` 的边界是什么
2. 当前仓库里 `run（运行）` 到底做到哪一步了
3. `run（运行）` 接收什么输入
4. `run（运行）` 最小应该输出什么结构化结果
5. 后续应该先实现到什么程度，而不是一开始就做成完整状态机

## 1. 当前真实状态

先说明当前事实，避免把规划说成已经实现：

### 1.1 已经有的内容

- 流程模板 frontmatter（元数据）解析约定
  - [.agents/flows/FRONTMATTER.md](../../.agents/flows/FRONTMATTER.md)
- `run（运行）` 的最小解析器和输出草案
  - [.agents/flows/RUN_OUTPUT.md](../../.agents/flows/RUN_OUTPUT.md)
- `task-orchestrator（任务主代理）` 角色骨架
  - [.agents/roles/common/task-orchestrator.md](../../.agents/roles/common/task-orchestrator.md)
- `prd-to-delivery（需求到交付）` 流程模板骨架
  - [.agents/flows/common/prd-to-delivery.md](../../.agents/flows/common/prd-to-delivery.md)

### 1.2 还没有的内容

- CLI（命令行工具）里还没有真正可执行的 `ai-spec-auto run（运行）` 子命令
- 当前 [bin/cli.js](../../bin/cli.js#L1) 仍然只是安装脚本代理，不负责 `run（运行）` 路由
- 还没有完整的 `run-result（运行结果）` 状态机实现
- 虽然已经补了 `gate-blocked（阻断） / approve（审批） / resume（恢复） / status（状态） / complete（完成） / fail（失败） / cancel（取消）` 的最小命令，但还没有继续覆盖完整的审批、恢复和结束状态机
- 当前默认的运行入口更适合定义为 `IDE（开发工具） / OpenClaw（远程入口）` 里的 `task-orchestrator（任务主代理）` 触发，而不是 CLI（命令行工具）子命令

一句话：

> 当前 `run（运行编排）` 已经有结构设计和契约草案，默认应理解为运行时能力；CLI（命令行工具）子命令只是后续可选适配器，不是当前唯一入口。

补充说明：

> 当前仓库已经提供 `ai-spec-auto runtime-state init` 作为底层写盘工具，并提供 `ai-spec-auto task-orchestrator-adapter apply` 作为主代理自动执行适配入口；如果上游是自然语言/Markdown（标记文本） 回复，则优先先经过 `ai-spec-auto task-orchestrator-extractor apply` 做结构化抽取，再由适配层统一驱动 `runtime-state bootstrap / handoff / gate-blocked / approve / resume / status / complete / fail / cancel`，把运行态稳定落盘并持续更新。

补充说明 2：

> 当前仓库已经补到 Phase B（第二步），但边界已经收回：`expert-dispatch（专家派发） / runtime-action（运行动作）` 由 `task-orchestrator（任务主代理）` 产出，`expert-execution（专家执行）` 由当前专家产出，本地 `bin/` 只负责校验、落盘和状态应用。

## 2. 运行能力定位

`run（运行编排）` 的职责不是安装资产，而是：

> 在目标项目已经具备 `rules（规则） / skills（技能） / roles（专家角色） / flows（流程模板） / context（上下文）` 的前提下，读取任务输入，选择流程模板，由 `task-orchestrator（任务主代理）` 生成结构化执行计划，并逐步驱动专家协同。

它最适合的场景是：

- 本地开发者要启动一次任务
- IDE（开发工具）里触发一次规范驱动协作
- OpenClaw（远程入口）要把远程需求转换成可执行计划
- 后续插件页面点击“开始执行”

## 3. 与 sync（同步）的职责边界

这是最关键的边界。

### 3.1 `sync（同步）` 负责什么

`ai-spec-auto sync（同步）` 负责：

- 读取 `manifest（安装清单）`
- 安装或同步资产
- 写入 `.ai-spec/manifest.json`
- 写入 `.ai-spec/lock.json`
- 写入 `.ai-spec/sources.json`

也就是：

> `sync（同步）` 解决“装什么、怎么装、装完是什么状态”。

### 3.2 `run（运行编排）` 负责什么

`run（运行编排）` 负责：

- 读取任务输入
- 读取规则、上下文、流程模板
- 让 `task-orchestrator（任务主代理）` 做任务路由
- 选出本次实际激活的专家
- 产出结构化执行计划
- 后续逐步进入专家执行、审批、恢复

也就是：

> `run（运行编排）` 解决“当前这次任务应该怎么跑”。

### 3.3 一句话区分

```text
sync（同步） = 安装与求解
run（运行） = 编排与执行
```

## 4. 推荐触发形式

当前阶段更推荐的默认入口，不是 CLI（命令行工具）命令，而是显式触发 `task-orchestrator（任务主代理）`：

```text
@task-orchestrator（任务主代理） 创建一个商品组件
```

或者：

```text
开始规范驱动开发：创建一个商品组件
```

后续如果需要 CLI（命令行工具）适配器，再支持下面这种形式：

```bash
ai-spec-auto run . \
  --flow prd-to-delivery \
  --change add-user-center \
  --input ./docs/prd.md
```

或者让主代理自动选模板：

```bash
ai-spec-auto run . \
  --change add-user-center \
  --input ./docs/prd.md \
  --mode auto
```

### 4.1 当前建议支持的最小参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `target（目标目录）` | string | 默认 `.`，主要供后续 CLI（命令行工具）适配器使用 |
| `--change（变更 ID）` | string | 本次任务对应的 `change-id（变更 ID）` |
| `--input（任务输入）` | string | PRD（产品需求文档）、设计稿说明、本地文本文件或后续 JSON 输入 |
| `--flow（流程模板）` | string | 可选；显式指定流程模板 ID |
| `--mode（运行模式）` | string | `auto / suggest / manual` |
| `--json（JSON 输出）` | boolean | 输出结构化结果，供 OpenClaw（远程入口）读取 |
| `--dry-run（试运行）` | boolean | 只产出执行计划，不真正进入执行 |
| `--pretty（友好输出）` | boolean | 输出人类可读说明 |

## 5. 输入来源优先级

当前建议优先级如下：

1. 当前对话或触发入口显式输入
2. `openspec/changes/<change-id>/` 已有内容
3. `context/PROJECT.md`
4. `.agents/rules/`
5. `.agents/flows/`

说明：

- 若显式传了 `--flow（流程模板）`，优先按指定模板解析
- 若未显式传 `--flow（流程模板）`，由 `task-orchestrator（任务主代理）` 自动选择基础模板
- 若 `openspec/changes/<change-id>/proposal.md`、`tasks.md` 已存在，可跳过部分前置分析

## 6. 内部处理阶段

当前阶段，`run（运行编排）` 最小应包含 5 个阶段：

### 6.1 读取阶段

- 读取任务输入
- 读取 `context/PROJECT.md`
- 读取 `.agents/rules/`
- 读取 `.agents/flows/`
- 检查 `openspec/changes/<change-id>/` 是否已有资料

### 6.2 模板解析阶段

- 读取流程模板 frontmatter（元数据）
- 校验模板结构
- 输出 `flow-descriptor（流程模板描述）`

### 6.3 路由阶段

由 `task-orchestrator（任务主代理）` 完成：

- 判断任务类型
- 选择基础协作模板
- 激活必选专家
- 动态决定可选专家
- 生成审批点

### 6.4 计划生成阶段

输出 `run-plan（运行计划）`，包括：

- 本次选中的模板
- 必选专家
- 激活的可选专家
- 第一位交接专家
- 缺失输入
- 审批点

### 6.5 锚点生成阶段

在首轮 `run-plan（运行计划）` 之后，主代理应继续为当前第一跳专家生成一份 `task-anchor（任务锚点）`。

它的作用是：

- 重新注入原始目标
- 指定当前阶段和当前专家
- 裁剪出本轮必须遵守的约束
- 明确本轮预期输出

当前统一规范见：

- [task-anchor-spec.md](../../.agents/orchestration/task-anchor-spec.md)

### 6.6 首轮桥接写盘阶段

如果当前触发环境允许执行本地命令，则主代理应继续：

1. 组装首轮桥接载荷
2. 优先调用 `ai-spec-auto task-orchestrator-adapter apply`
3. 立即写入 `.ai-spec/current-run.json`
4. 同步写入 `.ai-spec/runs/<run-id>.json`
5. 为下一轮载荷清出干净状态

对应规范见：

- [task-orchestrator-bootstrap-payload.md](../../.agents/orchestration/task-orchestrator-bootstrap-payload.md)

### 6.7 执行阶段

这是后续阶段，不要求第一版完整实现。

第一阶段可以先停留在：

- 生成 `run-plan（运行计划）`
- 生成首轮 `task-anchor（任务锚点）`
- 自动初始化首轮 `run-state（运行状态）`
- 专家交接时更新 `run-state（运行状态）`
- 由 `task-orchestrator（任务主代理）` 产出当前专家的 `expert-dispatch（专家派发载荷）`，本地工具只负责校验与落盘

第二阶段当前保留的最小能力是：

- 当前专家可产出 `expert-execution（专家执行载荷）`
- `task-orchestrator（任务主代理）` 可产出 `current-runtime-action（当前运行动作草案）`
- 本地工具负责把这些结构化载荷写入 `.ai-spec/`
- 由上层显式决定是否把该动作交给 `task-orchestrator-adapter（自动执行适配层）` 消费

## 7. 输出契约

当前建议 `run（运行）` 对外核心输出两类结构化对象；如果要立即初始化运行态，可再包装成首轮桥接载荷：

- `flow-descriptor（流程模板描述）`
- `run-plan（运行计划）`

并在专家真正启动前补一份：

- `task-anchor（任务锚点）`
- `expert-dispatch（专家派发载荷）`

### 7.1 `flow-descriptor（流程模板描述）`

这是“模板解析结果”，只依赖 frontmatter（元数据），不包含本次动态路由结果。

```json
{
  "schema_version": 1,
  "kind": "flow-descriptor",
  "flow": {
    "id": "prd-to-delivery",
    "version": 1,
    "name": "PRD 到交付",
    "status": "active",
    "type": "flow-template",
    "owner": "task-orchestrator",
    "description": "面向新需求、设计还原和增量交付的基础协作模板。",
    "visibility": "internal",
    "domains": ["demand-design", "engineering", "testing"],
    "triggers": ["prd-input", "design-input", "new-feature", "incremental-change"],
    "required_roles": ["requirement-analyst", "frontend-implementer", "code-guardian"],
    "optional_roles": ["design-collaborator", "api-contract-specialist"],
    "approval_gates": ["before-implementation", "before-delivery"],
    "artifacts": [
      "openspec/changes/<change-id>/proposal.md",
      "openspec/changes/<change-id>/tasks.md",
      "openspec/changes/<change-id>/checklist.md",
      "openspec/changes/<change-id>/iterations.md"
    ],
    "source": ".agents/flows/common/prd-to-delivery.md"
  },
  "errors": [],
  "warnings": []
}
```

### 7.2 `run-plan（运行计划）`

这是“主代理生成的执行计划”，是当前阶段最重要的输出对象。

当前阶段建议主代理的首轮输出统一遵循：

- [task-orchestrator-run-plan-template.md](../../.agents/orchestration/task-orchestrator-run-plan-template.md)

```json
{
  "schema_version": 1,
  "kind": "run-plan",
  "run_id": "run_20260327_001",
  "mode": "auto",
  "status": "planned",
  "task": {
    "change_id": "add-user-center",
    "input_kind": "prd-input",
    "risk_level": "medium"
  },
  "flow": {
    "id": "prd-to-delivery",
    "name": "PRD 到交付",
    "source": ".agents/flows/common/prd-to-delivery.md"
  },
  "plan": {
    "required_roles": ["requirement-analyst", "frontend-implementer", "code-guardian"],
    "activated_optional_roles": ["design-collaborator", "api-contract-specialist"],
    "skipped_optional_roles": ["unit-test-specialist"],
    "approval_gates": ["before-implementation"],
    "first_handoff": "requirement-analyst"
  },
  "artifacts": [
    "openspec/changes/add-user-center/proposal.md",
    "openspec/changes/add-user-center/tasks.md",
    "openspec/changes/add-user-center/checklist.md",
    "openspec/changes/add-user-center/iterations.md"
  ],
  "missing_inputs": ["API 字段说明未确认"],
  "warnings": [],
  "errors": []
}
```

## 8. 运行状态落盘建议

如果 `run（运行编排）` 当前默认由 skill（技能）或远程入口触发，就不能只停留在对话里。

当前阶段至少建议落盘：

```text
.ai-spec/
├── current-run.json
└── runs/
    └── <run-id>.json
```

推荐补充规范见：

- [运行状态落盘规范-03-30-14-58.md](运行状态落盘规范-03-30-14-58.md)

## 9. 字段说明

### 8.1 顶层字段

| 字段 | 说明 |
| --- | --- |
| `schema_version（结构版本）` | 当前固定为 `1` |
| `kind（结果类型）` | `flow-descriptor` 或 `run-plan` |
| `run_id（运行实例 ID）` | 本次运行实例标识 |
| `mode（运行模式）` | `auto / suggest / manual` |
| `status（状态）` | `planned / waiting-approval / running / blocked / success / failed` |

### 8.2 `task（任务上下文）`

用于表达本次运行所面向的任务输入。

当前最小字段建议：

- `change_id（变更 ID）`
- `input_kind（输入类型）`
- `risk_level（风险级别）`

### 8.3 `plan（执行计划）`

这是 `run-plan（运行计划）` 最关键的部分。

| 字段 | 说明 |
| --- | --- |
| `required_roles（必选专家）` | 本模板本次必须参与的专家 |
| `activated_optional_roles（激活的可选专家）` | 主代理动态激活的可选专家 |
| `skipped_optional_roles（跳过的可选专家）` | 本次未激活的可选专家 |
| `approval_gates（审批点）` | 本次实际保留的人工确认点 |
| `first_handoff（第一跳交接专家）` | 第一位要被启动的专家 |

## 10. 错误与状态约定

### 9.1 状态值

建议允许值：

- `planned`
- `waiting-approval`
- `running`
- `blocked`
- `success`
- `failed`

### 9.2 错误分类

建议至少区分：

- `flow-invalid（流程模板非法）`
- `flow-not-found（流程模板不存在）`
- `route-failed（路由失败）`
- `input-missing（输入缺失）`
- `execution-blocked（执行被阻断）`

## 11. 推荐输出方式

### 10.1 默认模式

- 标准输出打印人类可读摘要
- 标准错误输出打印错误详情

### 10.2 `--json（JSON 输出）` 模式

- 若存在 CLI（命令行工具）或 Runner（运行器）适配器，则标准输出只打印 `flow-descriptor（流程模板描述）` 或 `run-plan（运行计划）`
- 适合 OpenClaw（远程入口）、机器人和自动化系统读取

## 12. 最小实现建议

当前阶段不要试图让 `run（运行编排）` 一次承担完整状态机和完整远程协作。

建议分两步实现：

### Step 1

支持：

- 读取流程模板
- 校验 frontmatter（元数据）
- 输出 `flow-descriptor（流程模板描述）`
- 根据任务输入生成 `run-plan（运行计划）`

这一步的重点不是“跑完所有专家”，而是：

- 让 `IDE（开发工具） AI（智能体）` 或 OpenClaw（远程入口）能稳定触发结构化计划
- 让 OpenClaw（远程入口）能稳定读取
- 让团队能看到“主代理是如何选模板、选专家、给出第一跳”的

### Step 2

再支持：

- 审批点
- 恢复执行
- 状态查询
- 专家逐步落地执行

## 13. 与其它规范的关系

这份契约与下面几份规范配套使用：

- [Manifest安装清单规范.md](Manifest安装清单规范.md)
- [ai-spec-auto-sync输入输出契约-03-27-17-09.md](ai-spec-sync输入输出契约-03-27-17-09.md)
- [lock与sources结构规范-03-27-17-17.md](lock与sources结构规范-03-27-17-17.md)
- [运行状态落盘规范-03-30-14-58.md](运行状态落盘规范-03-30-14-58.md)
- [IDE里触发run的最小交互协议-03-30-14-04.md](IDE里触发run的最小交互协议-03-30-14-04.md)
- [.agents/flows/FRONTMATTER.md](../../.agents/flows/FRONTMATTER.md)
- [.agents/flows/RUN_OUTPUT.md](../../.agents/flows/RUN_OUTPUT.md)

这几份文档的职责边界建议统一理解为：

- `manifest（安装清单）`
  - 用户选了什么
- `sync（同步）`
  - 系统如何安装与落盘
- `lock（锁定清单） / sources（来源清单）`
  - 安装结果和来源状态
- `run-state（运行状态）`
  - 当前一次运行的状态和进度
- `run（运行编排）`
  - 当前任务如何被编排和执行

## 14. 一句话收束

> 当前 `run（运行编排）` 还没有必要先落成 CLI（命令行工具）命令，更合理的阶段性做法是把它作为运行时能力，由 `IDE（开发工具） AI（智能体）` 或 OpenClaw（远程入口）中的 `task-orchestrator（任务主代理）` 触发；后续若有需要，再补 CLI（命令行工具）适配器。
