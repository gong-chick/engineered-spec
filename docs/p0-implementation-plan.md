# br-ai-spec P0 实施计划

## 目标

按第二阶段文档要求，先补齐 `br-ai-spec` 作为本地工程执行引擎的 P0 底座。P0 不追求远程自动开发闭环，也不做 Asset Factory(资产工厂)，只建立后续可验收的本地扫描、初始化、锁定、缓存、隔离、状态机、上下文和隐私上报基础。

## 非目标

- 不重构 Hub(资产中心)业务模型。
- 不开发 Visual(可视化平台)页面。
- 不接入 Coze(外部大模型)或 OpenClaw(远程调度)。
- 不改变已发布安装命令的默认行为，除非有兼容层。

## P0 第一批开发建议

第一批建议只做“最小闭环底座”，避免一次性改穿所有运行时：

1. 新增 `src/` 分层，不迁移现有 `bin/` 主链，先让新能力以模块方式被 CLI 调用。
2. 实现 `ConfigLoader(配置加载器)`，固化配置优先级和隐私强约束。
3. 实现 `scan` 命令与最小 `TechScannerEngine(技术栈扫描引擎)`，优先支持 Next.js、React、Vue、pnpm workspace。
4. 实现 `init --recommend --dry-run`，只输出 InitPlan(初始化计划)，不写文件。
5. 定义并写入 `.ai-spec/project.json`、`.ai-spec/policy.json`、`.ai-spec/workspace.json`。
6. 定义 `.ai-spec/ai-spec.lock.json`、`.agents/registry.index.json`、`.ai-spec/context-index.json`，先支持从现有 manifest(安装清单)生成。
7. 建立 `~/.ai-spec-auto/cache` 目录和 checksum(校验和)资产缓存，先覆盖 manifest/rule/skill/role/flow。
8. 将现有 `hub-lock.json` 作为兼容输入，逐步收敛到 `ai-spec.lock.json`。
9. 实现 `check` 的新校验分支，再新增 `guard assets` 命令。
10. 补齐 P0 fixture(测试样例)和 Vitest(测试框架)测试，不先接 worktree 默认启用。

## 推荐目录落点

```text
br-ai-spec/
├── src/
│   ├── cli/
│   │   ├── index.ts
│   │   └── commands/
│   ├── config/
│   ├── scanner/
│   ├── init/
│   ├── project/
│   ├── hub/
│   ├── cache/
│   ├── guard/
│   ├── context/
│   ├── state-machine/
│   ├── git/
│   ├── privacy/
│   └── shared/
└── tests/
    ├── fixtures/
    ├── unit/
    └── integration/
```

## 阶段拆分

### P0-1 配置系统

交付内容：

- `src/config/config-loader.ts`
- `src/config/defaults.ts`
- `src/config/policy-schema.ts`
- `src/config/global-config-schema.ts`
- `src/config/resolved-config.ts`
- 单元测试覆盖 CLI 参数、policy、project、workspace、Hub Manifest(清单)、Agent Profile(智能体画像)、全局配置、默认值优先级。

验收口径：

- CLI 参数最高优先级。
- `privacyPolicy.uploadSourceCode` 永远不能变成 true。
- `dirtyStrategy` 默认 `block`。
- 配置文件损坏时返回可枚举 error code(错误码)和中文修复建议。

### P0-2 技术栈扫描

交付内容：

- `src/scanner/types.ts`
- `src/scanner/engine.ts`
- `src/scanner/boundary/*`
- `src/scanner/facts/*`
- `src/scanner/detectors/nextjs-detector.ts`
- `src/scanner/detectors/react-vite-detector.ts`
- `src/scanner/detectors/vue-vite-detector.ts`
- `src/scanner/aggregator/*`
- `ai-spec-auto scan .` 与 `ai-spec-auto scan . --explain`。

第一批 detector(探测器)：

- Next.js App Router
- React + Vite
- Vue + Vite
- pnpm workspace
- package.json fallback scan(兜底扫描)

验收口径：

- scan 阶段只读，不调用写文件 API。
- 输出 `WorkspaceTopology(工作区拓扑)`。
- 每个识别结果包含 `confidence(置信度)` 与 `reasons(原因)`。
- 低于 60 置信度不得自动推荐 Manifest(安装清单)。

### P0-3 Project Init 初始化链路

交付内容：

- `src/init/init-service.ts`
- `src/init/init-plan.ts`
- `src/init/init-plan-renderer.ts`
- `src/init/init-applier.ts`
- `src/project/project-file-writer.ts`
- `src/project/workspace-file-writer.ts`
- `src/project/policy-file-writer.ts`

命令：

- `ai-spec-auto init . --recommend --dry-run`
- `ai-spec-auto init . --recommend`
- `ai-spec-auto init . --workspace`

验收口径：

- plan 阶段不写文件。
- apply 阶段必须有用户确认或 `--yes`。
- 已存在 `policy.json` 时合并，不覆盖用户字段。
- 输出写入文件列表和推荐原因。

### P0-4 锁文件与索引

交付内容：

- `src/project/lock-file.ts`
- `src/project/registry-index.ts`
- `src/project/context-index.ts`
- 从 manifest(安装清单)生成 lock/index/context-index 的转换器。

目标文件：

- `.ai-spec/ai-spec.lock.json`
- `.agents/registry.index.json`
- `.ai-spec/context-index.json`

兼容策略：

- 读取现有 `.agents/registry/hub-lock.json`。
- 写新 lock 时保留老文件，不删除、不强迁移。
- Visual(可视化平台)在过渡期可同时消费新旧文件。

### P0-5 全局缓存与 Hub Sync

交付内容：

- `src/cache/cache-paths.ts`
- `src/cache/asset-cache.ts`
- `src/cache/manifest-cache.ts`
- `src/cache/agent-profile-cache.ts`
- `src/hub/hub-client.ts`
- 对现有 `bin/sync.js` 增加 cache adapter(缓存适配器)。

验收口径：

- 同 checksum(校验和)资产复用缓存。
- cache 命中不请求 Hub。
- checksum 不匹配时阻断。
- Hub 断网但 cache 存在时允许离线使用。

### P0-6 资产防篡改

交付内容：

- `src/guard/asset-integrity-checker.ts`
- `src/guard/check-command.ts`
- `src/guard/guard-command.ts`
- `ai-spec-auto guard assets`

验收口径：

- 标准资产 checksum 不一致 fatal(致命错误)。
- registry.index 与 lock 不一致 error(错误)。
- overlay checksum 变化但 lock 未更新时 warning(警告)或 error(错误)，策略由 policy 控制。
- `spec-start` 前可调用完整性检查。

### P0-7 Git Branch / Worktree 隔离

交付内容：

- `src/git/worktree-manager.ts`
- `src/git/dirty-working-tree.ts`
- `src/git/branch-policy.ts`
- 先提供 opt-in(显式启用)参数，后续再改默认。

验收口径：

- 默认 dirtyStrategy(脏工作区策略) 为 `block`。
- branch/worktree 已存在不得覆盖。
- detached HEAD(游离头指针) 阻断。
- 多仓部分失败可回滚已创建 worktree。

### P0-8 状态机与熔断

交付内容：

- `src/state-machine/types.ts`
- `src/state-machine/state-machine.ts`
- `src/state-machine/transition-guard.ts`
- `src/state-machine/circuit-breaker.ts`
- `src/state-machine/run-event-publisher.ts`

验收口径：

- 非法状态流转被拦截。
- 每次流转生成 runtime event(运行事件)。
- 重复失败、重复修改、token 预算、执行超时进入 diagnosing/recovering/human_review/suspended。

### P0-9 Context Builder 渐进式上下文

交付内容：

- `src/context/context-builder.ts`
- `src/context/context-planner.ts`
- `src/context/context-loader.ts`
- `src/context/context-budget.ts`
- `src/context/source-redactor.ts`

验收口径：

- planning/implementation/verification/review/diagnosing 阶段加载不同资产。
- 不一次性读取全部 Rule/Skill/Role/Flow。
- 输出 ContextBundle(上下文包)并记录 token 预算估算。

### P0-10 隐私过滤与运行上报

交付内容：

- `src/privacy/privacy-filter.ts`
- `src/privacy/runtime-event-redactor.ts`
- Visual 上报客户端统一走过滤器。

验收口径：

- 源码、绝对路径、用户名、完整 prompt、完整 response 均不进入上报 payload(负载)。
- 测试断言 `sourceCodeIncluded=false`、`rawPromptIncluded=false`、`rawResponseIncluded=false`、`absolutePathIncluded=false`。

## 测试计划

第一批 fixture(测试样例)：

- `tests/fixtures/react-vite`
- `tests/fixtures/nextjs-app-router`
- `tests/fixtures/vue-vite`
- `tests/fixtures/monorepo-pnpm`
- `tests/fixtures/dirty-git-repo`
- `tests/fixtures/tampered-assets`
- `tests/fixtures/malformed-config`

测试命令建议：

- `npm run test:runtime` 保持旧链路回归。
- 新增 `npm run test:p0` 跑 Vitest(测试框架)。
- 新增 `npm run test:fixtures` 跑真实临时目录集成测试。

## 与其他项目依赖顺序

1. `skill-q-platform` 先补 `Manifest Export API(清单导出接口)`、推荐接口和 Agent Profile Export(智能体画像导出)最小契约。
2. `br-ai-spec` 接入推荐、导出、缓存、lock、registry.index。
3. `engineered-spec-visual` 基于 `br-ai-spec` 输出的 run event(运行事件)、lock、context-index 展示运行态。

## 主要风险

1. 现有 `bin/install-workflow.js` 体量大，直接切 TypeScript 分层可能破坏旧安装链路。
2. 目标项目中已有 `.agents` 完整资产，切轻量索引会涉及迁移策略。
3. `sync` 已有 manifest 消费逻辑，新增全局缓存时要避免重复下载和路径不兼容。
4. Worktree 默认启用会影响用户当前操作习惯，建议先 opt-in(显式启用)。
5. 隐私过滤必须先于更丰富的 Visual 上报落地。

