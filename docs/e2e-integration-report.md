# 三项目端到端联调报告

## 1. 联调范围

本轮验证以下链路：

1. `br-ai-spec init` -> `skill-q-platform` Manifest Recommend -> 写入 `.ai-spec` / `.agents` -> Install Record 上报 -> `engineered-spec-visual` Project State 上报。
2. `br-ai-spec sync` -> Manifest Export -> Asset Content -> Agent Profile Export -> 本地全局缓存 -> `check` / `guard assets`。
3. `br-ai-spec spec-start` -> 创建 run -> Visual Run Event 上报。
4. `br-ai-spec spec-continue --execute --dry-run` -> Executor Adapter dry-run prepare -> Visual Run Event / History 上报 -> Hub Runtime Feedback 上报。

## 2. 三项目路径

| 项目 | 路径 | 本轮处理 |
| --- | --- | --- |
| br-ai-spec | `/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec` | 新增 E2E 测试、补齐 sync 离线缓存降级、补齐 runtime-feedback 和 history 稳定上报 |
| skill-q-platform | `/Users/lizhenwei/workspace/vueworkspace/bairong/skill-q-platform` | 未修改代码，执行 Hub Contract 测试 |
| engineered-spec-visual | `/Users/lizhenwei/workspace/vueworkspace/bairong/engineered-spec-visual` | 未修改代码，执行 Collector API 测试 |

## 3. 联调环境

本轮未启动真实 `http://localhost:3000` 和 `http://localhost:3001` 服务。

联调方式：

1. `br-ai-spec` 使用测试内本地 HTTP mock fixture 模拟 Hub 与 Visual，验证 CLI 真实请求、响应消费、缓存写入和隐私过滤。
2. `skill-q-platform` 执行 `tests/integration/hub-contract.test.ts`，验证真实 API route 返回结构可被 `br-ai-spec` 消费。
3. `engineered-spec-visual` 执行 `tests/integration/collector-api.test.ts`，验证 Collector API 可接收 `br-ai-spec` payload 并拒绝隐私违规 payload。

## 4. Hub API 联调结果

| API | 结果 | 说明 |
| --- | --- | --- |
| `POST /api/hub/manifests/recommend` | 通过 | `init --recommend --dry-run` 输出推荐来源：Hub |
| `GET /api/hub/manifests/:slug/export` | 通过 | `sync` 可拉取 manifest export |
| `GET /api/hub/assets/:slug/content` | 通过 | 资产正文写入 `~/.ai-spec-auto/cache/assets/<checksum>/content.md` |
| `GET /api/hub/agent-profiles/:slug/export` | 通过 | Agent Profile 写入 `~/.ai-spec-auto/cache/agent-profiles/<checksum>/content.json` |
| `POST /api/hub/install-records` | 通过 | `init --yes` 成功后上报；失败时不阻断本地 init |
| `POST /api/hub/runtime-feedback` | 通过 | `spec-continue --execute --dry-run` 后上报结构化运行反馈 |

## 5. Visual Collector API 联调结果

| API | 结果 | 说明 |
| --- | --- | --- |
| `POST /api/collector/project-state` | 通过 | `init --yes` 成功后上报项目状态 |
| `POST /api/collector/run-event` | 通过 | `spec-start` 和 `spec-continue` 上报运行事件 |
| `POST /api/collector/history` | 通过 | 执行器 dry-run 后显式上报 history 摘要 |
| `POST /api/collector/incident` | 通过 | 服务侧 Collector API 测试通过；本轮 E2E 无 incident 场景 |

## 6. init 链路结果

测试命令覆盖：

```bash
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js init <fixture> --recommend --dry-run --hub-url <mock-hub> --visual-url <mock-visual>
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js init <fixture> --recommend --yes --hub-url <mock-hub> --visual-url <mock-visual>
```

结果：

1. dry-run 请求 Hub 推荐，输出 `推荐来源：Hub`。
2. dry-run 不写入 `.ai-spec` / `.agents`。
3. dry-run 不上报 Project State。
4. `--yes` 写入 `project.json` / `policy.json` / `ai-spec.lock.json` / `registry.index.json` / `context-index.json`。
5. `--yes` 上报 Install Record 和 Project State。
6. Visual 不可用时本地 init 不失败，只输出 warning。
7. Hub 不可用且 `fallbackToLocal=true` 时降级本地推荐。
8. Hub 不可用且 `fallbackToLocal=false` 时阻断。

## 7. sync 链路结果

测试命令覆盖：

```bash
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js sync <fixture> --hub-url <mock-hub>
```

结果：

1. 成功拉取 Manifest Export。
2. 成功拉取 Asset Content。
3. 成功拉取 Agent Profile Export。
4. checksum 校验通过。
5. registry.index.json 不保存完整 content。
6. Hub 不可用但缓存完整时允许继续，并输出 `Hub 不可用，已使用本地缓存继续`。
7. Hub 不可用且缓存缺失时会报中文错误。

## 8. check / guard 结果

测试命令覆盖：

```bash
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js check <fixture>
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js guard assets <fixture>
```

结果：

1. `check` 返回错误数 0。
2. `guard assets` 返回退出码 0。
3. 未发现 registry 保存 content。
4. 未发现隐私上传配置违规。

## 9. spec-start 结果

测试命令覆盖：

```bash
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js spec-start "新增用户列表" <fixture> --dry-run --visual-url <mock-visual>
```

结果：

1. 创建 `.ai-spec/runs/<runId>/run.json`。
2. 不创建 branch / worktree。
3. 不执行真实 AI 编码。
4. 上报 `spec_started` run-event。
5. run.json 不保存 fixture 绝对路径。

## 10. spec-continue --execute --dry-run 结果

测试命令覆盖：

```bash
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js spec-continue <runId> <fixture> --execute --dry-run --executor cursor --visual-url <mock-visual> --hub-url <mock-hub>
```

结果：

1. 选择 Cursor Provider。
2. dry-run 只生成 `.cursor/tmp/<runId>/task.md`，不调用真实外部执行器。
3. run.executor 写入 `type=cursor`、`status=skipped`。
4. 上报 `executor_completed` run-event。
5. 上报 history 摘要。
6. 上报 runtime-feedback 到 Hub。
7. 未上传源码、rawPrompt、rawResponse、绝对路径。

## 11. 隐私校验结果

测试覆盖并通过：

1. Hub payload 不包含源码字段。
2. Hub payload 不包含 rawPrompt / rawResponse。
3. Hub payload 不包含绝对路径。
4. Visual payload 不包含源码字段。
5. Visual payload 不包含 rawPrompt / rawResponse。
6. Visual payload 不包含绝对路径。
7. `skill-q-platform` contract 测试确认 runtime-feedback 隐私违规会被拒绝。
8. `engineered-spec-visual` collector 测试确认 sourceCode / rawPrompt / rawResponse / absolutePath / token 等隐私违规会被拒绝。

## 12. 测试命令

```bash
node tests/e2e/hub-visual-e2e.test.js
node tests/e2e/init-sync-e2e.test.js
node tests/e2e/spec-run-report-e2e.test.js

node tests/hub/hub-client.test.js
node tests/hub/hub-init-recommend.test.js
node tests/hub/hub-sync.test.js
node tests/hub/install-record.test.js
node tests/hub/runtime-feedback.test.js

node tests/visual/visual-client.test.js
node tests/visual/privacy-filter.test.js
node tests/visual/project-state-report.test.js
node tests/visual/run-event-report.test.js
node tests/visual/history-report.test.js
node tests/visual/incident-report.test.js
node tests/visual/state-machine-visual-integration.test.js

node tests/scanner/tech-scanner.test.js
node tests/init/init-recommend.test.js
node tests/cache/checksum.test.js
node tests/cache/sync-cache.test.js
node tests/security/asset-tamper-checker.test.js
node tests/context/context-builder.test.js
node tests/context/context-planner.test.js
node tests/context/context-loader.test.js
node tests/context/context-budget.test.js
node tests/git/git-repository-detector.test.js
node tests/git/dirty-checker.test.js
node tests/git/dirty-strategy-handler.test.js
node tests/git/branch-manager.test.js
node tests/git/worktree-manager.test.js
node tests/git/multi-repo-worktree-planner.test.js
node tests/state-machine/transition-guard.test.js
node tests/state-machine/state-machine.test.js
node tests/state-machine/circuit-breaker.test.js
node tests/state-machine/escape-hatch.test.js
node tests/run/run-service.test.js
node tests/incident/incident-writer.test.js
node tests/spec/spec-start.test.js
node tests/spec/spec-status.test.js
node tests/spec/spec-continue.test.js
node tests/spec/spec-continue-executor.test.js
node tests/executor/executor-registry.test.js
node tests/executor/executor-selector.test.js
node tests/executor/executor-runner.test.js
node tests/executor/providers/codex-executor-provider.test.js
node tests/executor/providers/cursor-executor-provider.test.js
node tests/executor/providers/claude-code-executor-provider.test.js
node tests/runtime/install-workflow.test.js
node tests/runtime/protocol-workflow-registry.test.js
node --check bin/cli.js

cd /Users/lizhenwei/workspace/vueworkspace/bairong/skill-q-platform
./node_modules/.bin/vitest run tests/integration/hub-contract.test.ts

cd /Users/lizhenwei/workspace/vueworkspace/bairong/engineered-spec-visual
./node_modules/.bin/vitest run tests/integration/collector-api.test.ts
```

## 13. 未完成项

1. 未启动真实 localhost 服务做人工联调；本轮使用 mock fixture 加服务侧 contract 测试完成自动化契约验证。
2. `engineered-spec-visual` incident 上报在 E2E 中未构造真实 incident，仅通过服务侧 Collector API 和 `IncidentWriter` 既有测试覆盖。
3. Runtime Feedback 当前记录结构化结果摘要，暂未接入真实执行耗时统计。

## 14. 风险点

1. 真实服务启动后的数据库种子数据必须包含与 mock fixture 等价的 manifest / asset / agent-profile，否则 sync 可能因缺少内容或 checksum 不一致失败。
2. Visual 上报是非阻断链路，生产环境需要日志或本地 outbox 才能追踪长期失败。
3. Agent Profile 当前缓存为 JSON content，后续 ContextBuilder 如果要直接加载 agent-profile 全文，需要继续保持 cache 路径兼容。

## 15. 下一步建议

1. 使用真实 `skill-q-platform` 和 `engineered-spec-visual` 服务做一次 localhost smoke test。
2. 增加 Collector Outbox 或 retry 机制，避免 Visual 临时不可用时丢失运行态事件。
3. 进入 V1 验收前，固定一套种子 Manifest 与 checksum 作为三项目共同契约基线。
