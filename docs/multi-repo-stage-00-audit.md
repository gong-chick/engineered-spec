# 多仓库第一阶段 br-ai-spec 现状审计报告

执行时间：2026-05-07 13:28:00 CST  
执行分支：multi-repo/br-ai-spec-connectors  
审计基线提交：c931126  
目标仓库：/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec

## 1. 审计结论

当前 `br-ai-spec` 已经把原始 P0-P5 大量能力落入同一仓库。P0-P3 的本地 CLI、运行态、IDE Adapter、Manifest / Lock、Spec / Test Plan / DoD、Hook / Test / Repair / Evidence、受控 Agent、权限与安全策略具备可执行测试基线。

但 P4/P5 主体能力也已经以本地模块形式进入 `br-ai-spec`，包括 `src/visual` 下的 Timeline / Dashboard / Metrics / RiskBoard，以及 `src/asset`、`src/governance` 下的 Asset Hub 模型、资产 CRUD、审核、灰度、回滚、质量反馈等。这些模块不等于 Visual 页面或 Hub 后台，但职责上已经超过“Connector(连接器)”边界，后续应停止在本仓继续扩展主体能力，只保留连接器、协议、Fixture(样例数据)与兼容测试。

## 2. 当前完成能力清单

| 能力 | 当前证据 | 审计结论 |
| --- | --- | --- |
| CLI 入口 | `bin/cli.js`、`package.json` bin `ai-spec-auto` | 已完成 |
| init / sync / update / uninstall 安装链路 | `bin/install-workflow.js`、`bin/sync.js`、`tests/runtime/sync.test.js` | 已完成 |
| Manifest / Lock | `src/project/manifest-writer.js`、`src/project/lock-file-writer.js`、`bin/manifest-export.js` | 已完成，但与多仓协议字段有差异 |
| Cursor Adapter | `src/ide/adapters/cursor-adapter.js`、`.agents/commands/cursor`、`tests/ide/cursor-adapter.test.js` | 已完成 |
| Claude Code Adapter | `src/ide/adapters/claude-adapter.js`、`.agents/commands/claude`、`tests/ide/claude-adapter.test.js` | 已完成 |
| Codex Adapter 预留 | `src/ide/adapters/codex-adapter.js`、`.agents/commands/codex` | 已有入口，属于扩展能力 |
| Spec / Test Plan / DoD | `src/spec/spec-writer.js`、`bin/spec-command.js`、`.agents/commands/*/spec-*` | 已完成 |
| Hook / Test / Repair / Evidence | `bin/report-command.js`、`bin/repair-command.js`、`src/run`、`tests/runtime/*` | 已完成 |
| 受控 Agent 协作 | `src/agent/*`、`internal/ai-protocol-workflow.js`、`tests/agent/*`、`tests/p2/p2-integration.test.js` | 已完成 |
| 安全策略 / 审计 / 回滚 | `src/governance/*`、`tests/governance/*` | 已完成，但部分能力应迁往 Hub 主体 |
| Visual Connector | `bin/visual-bridge.js`、`bin/visual-command.js`、`internal/visual-hooks/*`、`src/visual/visual-client.js` | 部分完成，后续应只补连接器协议 |
| Hub Connector | `bin/hub-command.js`、`internal/hub-client.js`、`src/hub/runtime-feedback-reporter.js`、`tests/runtime/hub-*.test.js` | 部分完成，后续应只补搜索、安装、反馈连接器 |
| 跨仓 Fixture 基线 | 主任务包 `05-跨仓库协议与样例数据/*.fixture.json` | 任务包已提供，但仓库内未冻结成正式协议文档 |

## 3. 当前缺失能力清单

| 缺失项 | 影响 | 建议落点 |
| --- | --- | --- |
| `run-event.schema.json` 文件缺失 | 用户要求点名该文件，但主任务包目录当前只有 `run-event.fixture.json` | 多仓任务包或后续 B1.4 输出 |
| 仓库内跨仓协议冻结文档缺失 | Visual / Hub 后续实现缺少本仓实际字段差异说明 | `docs/multi-repo-protocol-freeze.md` |
| RunEvent 字段未统一 | 当前 `RunService`、`src/visual/event-mapper.js`、`src/visual/event-gateway.js` 字段形态不同 | B1.2 / B1.4 |
| EvidenceReport 与任务包协议不完全一致 | `finalStatus` 当前可能是中文值，且额外包含 requirement/events/incidents | B1.4 |
| AssetPackage 与任务包协议不完全一致 | 当前使用 `generatedFiles`，任务包使用 `files`；当前缺少 `name/compatibility/metadata` | B1.3 / B1.4 |
| Asset Usage Feedback 字段未统一 | 当前 Hub Runtime Feedback 使用 `assetsUsed/result/issues`，任务包 Fixture 使用 `assetId/assetType/metrics` | B1.3 / 四仓联调 |
| `lint`、`test`、`build` 通用脚本缺失 | 任务包默认命令无法直接执行 | B1.1 可补充脚本或文档说明 |
| 依赖管理器锁文件缺失 | 未发现 `pnpm-lock.yaml`、`package-lock.json`、`yarn.lock` | 待确认是否为纯脚本包策略 |

## 4. 越界能力清单

| 能力 | 当前文件 | 越界原因 | 处理建议 |
| --- | --- | --- | --- |
| Run Timeline 聚合展示模型 | `src/visual/timeline.js`、`tests/visual/timeline.test.js` | 属于 P4 Visual 主体展示能力，不应继续在 CLI 仓扩展 | 保留兼容测试，后续主体实现迁往 `engineered-spec-visual` |
| Hook / Test / Repair Dashboard | `src/visual/hook-dashboard.js` | 属于 P4 展示聚合能力 | 停止新增，后续由 Visual 消费事件实现 |
| Agent 协作可视化模型 | `src/visual/agent-visual.js` | 属于 P4 可视化主体 | 停止新增，保留为历史兼容或 DTO 参考 |
| Metrics / RiskBoard | `src/visual/metrics.js`、`src/visual/risk-board.js` | 属于 P4 指标与风险看板主体 | 后续迁往 `engineered-spec-visual` |
| Asset Registry / Manager / Lifecycle | `src/asset/asset-registry.js`、`src/asset/asset-manager.js`、`src/asset/asset-lifecycle.js` | 属于 P5 Asset Hub 主体模型 | 后续迁往 `skill-q-platform`，本仓仅保留安装消费端 |
| Asset Review / Gray Release / Quality | `src/governance/asset-review.js`、`src/governance/gray-release.js`、`src/asset/asset-quality.js` | 属于 Hub 治理、灰度和质量评分主体 | 后续迁往 `skill-q-platform` |
| 本地 Visual 集成脚本直接操作相邻仓库 | `scripts/setup-visual-integration.sh`、`scripts/local-verify.sh`、`scripts/test-integration.sh` | 脚本内硬编码 `engineered-spec-visual` 路径，易混淆职责 | 标记待收敛为联调脚本，不作为 br-ai-spec 主链能力 |

## 5. 协议对接清单

### Visual 需要对接的 Schema(模式定义)

| 协议 | 来源 | 用途 | 当前状态 |
| --- | --- | --- | --- |
| RunEvent | 任务包 `run-event.fixture.json` / `协议字段说明.md` | Collector API 接收运行事件 | 需在 B1.2/B1.4 统一字段 |
| EvidenceReport | 任务包 `evidence-report.fixture.json` | 展示 Hook/Test/Repair/Review 结果 | 需规范 `finalStatus` 和敏感字段 |
| ProjectState | `src/visual/event-mapper.js` | Visual 工作区状态上报 | 已有连接器 payload，任务包未单列 |
| History | `src/visual/event-mapper.js` | 运行历史与变更摘要 | 已有连接器 payload，需保持 changedFiles 只含相对路径 |
| Incident | `src/visual/event-mapper.js` | 风险和异常摘要 | 已有连接器 payload，需继续脱敏 |

### Hub 需要对接的 Schema(模式定义)

| 协议 | 来源 | 用途 | 当前状态 |
| --- | --- | --- | --- |
| AssetPackage | 任务包 `asset-package.fixture.json` / `src/asset/asset-package.js` | Hub 资产详情和安装元数据 | 字段差异较大，需兼容映射 |
| Manifest | 任务包 `manifest.fixture.json` / `.ai-spec/manifest.json` | 安装清单、IDE Adapter 生成依据 | 字段兼容但 adapters 形态不同 |
| Lock | `.ai-spec/ai-spec.lock.json` / `.agents/registry/hub-lock.json` | 锁定已安装资产版本和 checksum | 任务包未提供 fixture，需补冻结说明 |
| AssetUsageFeedback | 任务包 `asset-usage-feedback.fixture.json` / `src/hub/runtime-feedback-reporter.js` | 资产使用反馈和质量闭环 | 字段差异需 B1.3 收敛 |

## 6. 测试基线记录

| 命令 | 结果 | 说明 |
| --- | --- | --- |
| `npm run lint` | 失败 | `package.json` 缺少 `lint` 脚本 |
| `npm test` | 失败 | `package.json` 缺少 `test` 脚本 |
| `npm run build` | 失败 | `package.json` 缺少 `build` 脚本 |
| `npm run test:registry` | 通过 | registry fixture 校验通过 |
| `npm run test:runtime` | 通过 | Runtime、Visual Bridge、Hub install/report 相关测试通过 |
| `npm run test:p1` | 通过 | P1 Adapter / Scanner / Config 测试通过 |
| `npm run test:p2` | 通过 | Agent 协作与权限测试通过 |
| `npm run test:p3` | 通过 | Governance / RBAC / 安全 / 回滚测试通过 |
| `npm run test:p4` | 通过 | 当前仓库内 P4 Visual 聚合模块测试通过，但属于越界主体能力证据 |
| `npm run test:p5` | 通过 | 当前仓库内 P5 Asset 模型测试通过，但属于越界主体能力证据 |

## 7. 是否建议进入第二阶段

建议进入第二阶段，但进入前需要接受以下边界：

1. B1.1 只收口 P0-P3 和通用脚本/验收，不继续扩展 P4/P5 主体模块。
2. B1.2 只做 Visual Connector(可视化连接器)：事件上报、脱敏、失败降级、Fixture 校验，不做页面、看板或存储主体。
3. B1.3 只做 Hub Connector(资产中心连接器)：搜索、详情、安装元数据、版本、回滚、反馈上报，不做 Hub 后台模型。
4. B1.4 输出 Schema / Fixture 时必须写兼容层，不能直接覆盖当前实现。

