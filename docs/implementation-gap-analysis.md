# br-ai-spec 第二阶段实现差距分析

## 分析范围

本文对照 `/Users/lizhenwei/Downloads/00download/docs/第二大阶段` 下 7 份 Markdown 文档，分析 `br-ai-spec` 当前代码结构、已实现能力与缺失能力。

本轮只做分析，不涉及业务代码修改。

参考文档：

- `1-AI 工程资产操作系统：指令级 PRD 与技术蓝图.md`
- `2-物理工程结构与目录树.md`
- `3-核心数据模型与数据库设计.md`
- `4-API 契约与核心接口定义.md`
- `5-超详细的功能实现路线图.md`
- `6-极度严苛的测试验证清单.md`
- `7-最终交付验收清单.md`

## 当前项目定位

`br-ai-spec` 当前定位是 `@engineered/ai-spec-auto` CLI(命令行工具)包，主能力集中在：

- 将 `.agents/rules`、`.agents/skills`、`.agents/roles`、`.agents/flows`、`.cursor`、`.claude`、`openspec` 等资产安装到目标项目。
- 提供 `init`、`update`、`check`、`sync`、`uninstall` 等安装与同步命令。
- 提供 `/project-init`、`/spec-start`、`/spec-update`、`/spec-continue`、`/spec-status` 等 IDE(集成开发环境)命令模板。
- 提供 OpenSpec(开放规范)流程、专家调度、协议运行状态、Visual(可视化平台)桥接、Hub(资产中心)安装锁与运行上报的局部能力。

第二阶段蓝图中的目标定位更大：`br-ai-spec` 应成为本地工程执行引擎，负责扫描、初始化、Manifest(安装清单)推荐、锁文件与索引、全局缓存、Git Worktree(隔离工作目录)、状态机、Context Builder(上下文构建器)、执行器适配和隐私上报。

## 当前代码结构

### 根目录

- `package.json`：npm 包入口为 `bin/cli.js`，脚本包含 registry(注册表)测试、runtime(运行时)测试、Hub(资产中心)同步脚本等。
- `bin/`：当前主要实现目录。包含安装流程、同步、协议工作流、运行时状态、专家执行、Hub 命令、Visual 桥接、telemetry(遥测)等。
- `internal/`：包含 Hub 客户端、Hub 同步选择逻辑、Visual hooks(可视化钩子)等内部模块。
- `scripts/`：包含 Hub 资产同步、安装校验、本地验证、Visual 集成脚本。
- `.agents/`：核心资产库，包含命令模板、规则、技能、专家、流程、注册表。
- `tests/`：以 Node.js 脚本测试为主，覆盖 runtime(运行时)、registry(注册表)、telemetry(遥测)、Hub 同步与 Visual hooks(可视化钩子)等。
- `docs/`：已有多阶段设计、使用、安装、治理和验证文档。

### 关键模块

- `bin/cli.js`：命令分发入口，当前安装主链识别 `init`、`update`、`check`、`uninstall`、`sync`、`help`，Hub 子命令走独立入口。
- `bin/install-workflow.js`：当前最大模块，负责 init/update/check/uninstall、交互选择、规则/技能/命令同步、monorepo(单仓多包)目标选择、OpenSpec 初始化、Superpowers(增强技能)与 Visual 桥接。
- `bin/sync.js`：根据 manifest(安装清单)或本地 `.ai-spec/manifest.json` 同步 roles(专家)、skills(技能)、rules(规则)、flows(流程)，支持 Hub supplement(补充资源)拉取、dry-run(试运行)、force(强制)等。
- `bin/protocol-workflow.js`：承载 `/spec-start` 等协议命令的状态推进、输出与 Visual 推送切面。
- `bin/runtime-state.js`、`bin/runtime-bootstrap.js`、`bin/runtime-launcher.js`：当前运行态落盘与启动支持。
- `bin/hub-command.js`、`internal/hub-client.js`：Hub 搜索、安装、差异、回滚、运行上报等。
- `internal/visual-hooks/`：运行状态推送、控制拉取、审批信号、回执推送等 Visual 集成。
- `.agents/registry/*.json`：当前本地资产索引，包含 profiles(技术画像)、roles(专家)、rules(规则)、skills(技能)、flows(流程)、scenario-packages(场景包)。

## 第二阶段目标能力对照

| 能力域 | 第二阶段要求 | 当前状态 | 说明 |
| --- | --- | --- | --- |
| CLI(命令行工具)入口 | `scan`、`init --recommend`、`sync`、`check`、`guard assets`、`spec-start`、`spec-status`、`spec-continue`、`doctor` | 部分实现 | 有 `init/update/check/sync` 和 IDE 命令模板；缺独立 `scan`、`guard assets`、`doctor`，`spec-start` 主要是模板触发协议，不是完整 CLI 状态机入口。 |
| 配置系统 | CLI 参数、run 配置、policy、project、workspace、Manifest、Agent Profile、全局配置按优先级合并 | 缺失 | 当前安装选项分散在 `install-workflow.js`、`sync.js` 与 manifest 字段中，没有统一 ConfigLoader(配置加载器)。 |
| 技术栈扫描 | Workspace/Repo/Package(工作区/仓库/包)识别，多语言 detector(探测器)，只读扫描，输出 WorkspaceTopology(工作区拓扑) | 基本缺失 | 当前有 monorepo 安装目标解析，但不是完整扫描引擎。 |
| Manifest 推荐 | 扫描结果调用 Hub 推荐 Manifest | 缺失 | `sync` 可消费 manifest，但没有 `init --recommend` 推荐链路。 |
| Project Init(项目初始化) | plan 阶段只读，apply 阶段写入 `.ai-spec/project.json`、`policy.json`、`workspace.json`、lock、context-index、registry.index | 部分实现 | 当前会安装 `.agents`、`.ai-spec` 运行态目录和 IDE 资源，但不是第二阶段要求的轻量索引模型。 |
| 锁文件与索引 | `.ai-spec/ai-spec.lock.json`、`.agents/registry.index.json`、`.ai-spec/context-index.json` | 部分实现 | 当前 Hub 安装写 `.agents/registry/hub-lock.json`，`sync.js` 提到 `.ai-spec/lock.json`；与目标文件名、schema(模式)和职责不一致。 |
| 全局缓存 | `~/.ai-spec-auto/cache/assets/<checksum>`、manifest cache、agent profile cache | 缺失 | 当前主要将资产落到目标项目，未形成按 checksum(校验和)复用的全局缓存层。 |
| 资产防篡改 | checksum 校验、标准资产不可变、guard 命令、spec-start 前检查 | 部分实现 | 有 registry 校验和 Hub lock 概念，但缺标准资产缓存 checksum 强校验与 guard assets。 |
| Git Branch / Worktree | `/spec-start` 默认创建 branch/worktree，dirty working tree(脏工作区)策略 | 缺失 | README 规划提到 worktree，但代码层未形成 WorktreeManager(隔离工作目录管理器)。 |
| 状态机核心 | initialized/planning/executing/verifying/diagnosing/recovering/human_review 等可恢复状态 | 部分实现 | 当前协议 runtime-state 支持 run 状态与 checkpoint(检查点)，但不是蓝图中的通用状态机与合法流转守卫。 |
| 熔断与 Escape Hatch(逃逸机制) | 最大重试、重复修改、token 超预算、human-review(人工审核) | 部分实现 | 有协议门禁和人工审核入口，但缺通用 CircuitBreaker(熔断器)与诊断恢复策略。 |
| Context Builder(上下文构建器) | 基于 run/stage/target 渐进式加载 Rule/Skill/Role/Flow | 部分实现 | 当前通过命令模板和专家协议加载上下文，缺 `context-index.json` 驱动的可计算上下文包。 |
| Project Overlay(项目覆盖层) | 标准资产不可修改，项目差异进入 overlay | 缺失 | 当前 `project-init` 技能可刷新项目规则，但未形成 overlay schema(模式)、校验和 checksum。 |
| History 小需求资产 | `.ai-spec/history/<patch-id>/summary.md` 等 | 部分实现 | 当前小需求与运行态已有历史概念，但与第二阶段模板和数据模型未完全对齐。 |
| 隐私过滤 | 禁止源码、绝对路径、用户名、完整 prompt/response 上报 | 部分实现 | Visual hooks 有上报能力，但缺统一 PrivacyFilter(隐私过滤器)与测试断言。 |
| Runtime Event(运行事件) | 每次状态流转生成 runtime event 并上报 Visual | 部分实现 | 已有 Visual runtime-state 推送与 hook 事件，但事件类型、字段和隐私标记未完全对齐。 |
| Executor Adapter(执行器适配) | Codex/Cursor/Claude Code 并列 Provider(提供器) | 部分实现 | 当前是多 IDE 命令模板与协议命令，不是统一 `IExecutorProvider`。 |
| IDE 指针注入 | `.codex/instructions.md`、`.cursor/rules/ai-spec-auto.mdc`、`CLAUDE.md`、`memory.md` 管理区块 | 部分实现 | 当前可写 `.cursor`、`.claude`、命令模板；Codex 指针和统一管理区块未完全按蓝图。 |
| 测试体系 | Vitest(测试框架)、fixture(测试样例)、Git/worktree 临时仓库、隐私与性能测试 | 部分实现 | 现有 Node 脚本测试覆盖安装和运行时，缺扫描、配置、worktree、隐私、性能等 P0 测试矩阵。 |

## 已实现能力

1. 资产安装与更新链路：`init/update/check/uninstall` 可将 `.agents`、IDE 命令、OpenSpec 资源落到目标项目。
2. Manifest(安装清单)消费链路：`sync --manifest` 支持本地或 URL 清单，并解析 roles/skills/rules/flows。
3. Hub(资产中心)命令雏形：支持 search/install/diff/sync/rollback/runtime-report 等用户侧操作。
4. Hub lock(资产锁)雏形：安装成功后会写入 `.agents/registry/hub-lock.json`，为 Visual 展示和运行上报提供基础。
5. 多 IDE 命令模板：Cursor、Claude Code、Codex 方向均已有 `/spec-start`、`/spec-update`、`/spec-continue` 等模板或共用模板。
6. OpenSpec(开放规范)流程集成：具备 `opsx-propose/apply/archive/explore` 等命令模板。
7. 专家/技能/规则/流程资产库：`.agents` 已包含多 profile(技术画像)、多专家、多规则、多技能与场景包。
8. 协议运行时与专家调度：存在 `protocol-workflow`、`expert-dispatch`、`expert-executor`、`task-orchestrator` 等运行链路。
9. Visual(可视化平台)桥接：可推送 runtime-state(运行状态)、接收 gate(门禁)信号、处理 inbox(收件箱)与 receipt(回执)。
10. Telemetry(遥测)与安装统计雏形：`bin/telemetry` 与 Visual installation report(安装上报)已有配合基础。

## 缺失能力 Top 20

1. 独立 `scan` 命令与只读 TechScannerEngine(技术栈扫描引擎)。
2. Workspace / Repo / Package(工作区/仓库/包) 三层拓扑模型。
3. React/Vue/Next.js/Spring Boot/Spring MVC/Spring Cloud/Python/Go 多 detector(探测器)。
4. `init --recommend` 调用 Hub 推荐 Manifest(安装清单)。
5. 统一 ConfigLoader(配置加载器)与配置优先级解析。
6. `.ai-spec/project.json`、`.ai-spec/workspace.json`、`.ai-spec/policy.json` 的 schema(模式)和写入器。
7. `.ai-spec/ai-spec.lock.json` 与现有 hub-lock/lock 的统一迁移。
8. `.agents/registry.index.json` 轻量索引，不保存完整资产正文。
9. `.ai-spec/context-index.json` 渐进式上下文索引。
10. `~/.ai-spec-auto` 全局缓存和 checksum(校验和)复用。
11. `check` / `guard assets` 的标准资产防篡改强校验。
12. Project Overlay(项目覆盖层)生成、校验与 lock 关联。
13. Git branch(分支)与 worktree(隔离工作目录)默认隔离。
14. dirty working tree(脏工作区)策略：block、wip-commit、patch-snapshot、ignore。
15. 通用状态机核心和非法状态流转拦截。
16. CircuitBreaker(熔断器)：重复失败、token 预算、重复修改、执行超时。
17. Context Builder(上下文构建器)按 stage(阶段)选择资产。
18. PrivacyFilter(隐私过滤器)与上报前脱敏。
19. `IExecutorProvider` 执行器适配层与 ExecutorSelector(执行器选择器)。
20. P0 fixture(测试样例)与 Vitest(测试框架)测试矩阵。

## 与其他两个项目的依赖

`br-ai-spec` 的 P0 依赖 `skill-q-platform` 至少提供稳定 Manifest Export(清单导出)能力；`init --recommend` 依赖 Hub 推荐接口。`engineered-spec-visual` 只能在 `br-ai-spec` 稳定输出 WorkspaceTopology(工作区拓扑)、RunEvent(运行事件)、History(历史记录)、Incident(事故记录)后完整展示治理面板。

## 风险点

1. 现有 CLI(命令行工具)是 JavaScript 单文件/大文件风格，第二阶段文档按 TypeScript 分层目录设计；直接大改会影响已发布包与用户安装路径。
2. 当前把公共资产正文落到目标项目，第二阶段要求“项目内只保存轻量索引，正文进全局缓存”，迁移需要兼容旧项目。
3. 当前 `hub-lock.json`、`.ai-spec/lock.json`、目标 `.ai-spec/ai-spec.lock.json` 命名与 schema(模式)不统一，容易造成 Visual、Hub、CLI 三方口径不一致。
4. Worktree(隔离工作目录)默认启用会改变用户操作路径，必须提供清晰 fallback(回退)和 dirty 策略。
5. 隐私过滤目前不是统一底层能力，继续扩展上报会放大泄露风险。
6. P0 缺口集中在基础设施层，若先做 P2 执行器或 P3 Asset Factory(资产工厂)，会出现上层功能无法验收。

