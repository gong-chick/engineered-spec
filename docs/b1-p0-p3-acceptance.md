# B1.1 P0-P3 能力验收清单

执行时间：2026-05-07 13:46:31 CST

分支：`multi-repo/br-ai-spec-connectors`

基线提交：`978b7df`

## 当前 CLI 命令清单

| 命令 | 能力归属 | 验收结论 |
| --- | --- | --- |
| `init` | P0 / 安装初始化 | 已有实现，`test:runtime` 与 `verify:p*` 覆盖 |
| `update` | P0 / 安装更新 | 已有实现，`test:runtime` 覆盖 |
| `check` | P0 / 完整性检查 | 已有实现，`test:runtime` 覆盖 |
| `uninstall` | P0 / 卸载 | 已有实现，`test:runtime` 覆盖 |
| `sync` | P0 / 资产同步 | 已有实现，`test:runtime` 覆盖 |
| `scan` | P1 / 项目扫描 | 已有实现，`test:p1` 覆盖 |
| `ide` | P1 / IDE Adapter | 已有实现，`test:p1` 覆盖 |
| `manifest-export` | P1 / Manifest 输出 | 已有实现，`test:runtime` 覆盖 |
| `spec-start` / `spec-status` / `spec-continue` / `spec-list` / `spec-detail` | P0-P3 / Spec 流程 | 已有实现，`test:runtime` 与 spec 测试覆盖 |
| `repair` | P2 / Repair | 已有实现，`test:p2` 覆盖 |
| `report` | P0-P3 / Evidence | 已有实现，本轮通过 `contracts/` 标准化外部协议 |
| `runtime-state` | P0-P3 / 本地运行态 | 已有实现，`test:runtime` 覆盖 |
| `protocol-step` / `protocol-advance` / `protocol-update` / `protocol-stop` / `protocol-status` | P0-P3 / Harness Runtime | 已有实现，`test:runtime` 覆盖 |
| `visual` / `visual-bridge` | B1.2 / Visual Connector | 已有命令保留；本轮新增连接器标准化 RunEvent / EvidenceReport |
| `hub` | B1.3 / Hub Connector | 已有命令保留；本轮新增连接器标准化 AssetPackage / UsageFeedback |

## 当前测试脚本清单

| 脚本 | 结论 |
| --- | --- |
| `npm run test:registry` | 通过 |
| `npm run test:runtime` | 通过 |
| `npm run test:p1` | 通过 |
| `npm run test:p2` | 通过 |
| `npm run test:p3` | 通过 |
| `npm run test:p4` | 通过，作为历史越界主体能力回归，不新增 Visual UI |
| `npm run test:p5` | 通过，作为历史越界主体能力回归，不新增 Hub 后台 |
| `npm run verify:p1` | 通过，包含 `npm pack --dry-run` |
| `npm run verify:p2` | 通过，包含 `npm pack --dry-run` |
| `npm run verify:p3` | 通过，包含 `npm pack --dry-run` |
| `npm run verify:p4` | 通过，包含 `npm pack --dry-run` |
| `npm run verify:p5` | 通过，包含 `npm pack --dry-run` |
| `npm run lint` | 脚本不存在 / 不适用 |
| `npm test` | 脚本不存在 / 不适用 |
| `npm run build` | 脚本不存在 / 不适用 |

## 已完成能力

1. `br-spec init` / `ai-spec-auto init` 初始化链路已存在，并由运行时测试覆盖。
2. Manifest / Lock 写入、校验、导出能力已存在。
3. Cursor Adapter(光标编辑器适配器) 与 Claude Code Adapter(Claude Code 适配器) 已存在，并由 P1 测试覆盖。
4. Spec(需求规格) / Test Plan(测试计划) / DoD(完成定义) 流程已存在。
5. Hook(钩子) / Test(测试) / Repair(修复) / Evidence(证据) 能力已存在。
6. Agent Profile(智能体画像) / 权限 / 上下文边界能力已存在。
7. 安全策略、敏感信息脱敏与审计能力已存在。
8. 本地运行态目录 `~/.ai-spec-auto/` 已由 runtime 路径与 Visual 失败队列复用。
9. P0-P3 测试基线全部通过。

## 缺失或待后续收口能力

| 能力 | 当前状态 | 处理建议 |
| --- | --- | --- |
| 通用 `lint` / `test` / `build` 脚本 | `package.json` 未声明 | 本阶段不强行新增空脚本，保持真实记录 |
| B1.4 小阶段目录 | 任务包缺失 | 已按第一阶段协议冻结结论补齐仓库 `contracts/` 输出，并在任务包文档记录 |
| 线上 Visual Collector API | 不属于 br-ai-spec | 后续进入 engineered-spec-visual P4 实现 |
| 线上 Asset Hub 后台 | 不属于 br-ai-spec | 后续进入 skill-q-platform P5 实现 |

## 越界能力清单

| 路径 | 越界原因 | 本阶段处理 |
| --- | --- | --- |
| `src/visual/timeline.js` | Visual Timeline 主体能力 | 不扩展，仅作为历史回归测试 |
| `src/visual/hook-dashboard.js` | Visual Dashboard 主体能力 | 不扩展，仅作为历史回归测试 |
| `src/visual/agent-visual.js` | Agent 可视化主体能力 | 不扩展，仅作为历史回归测试 |
| `src/visual/metrics.js` | 质量指标看板主体能力 | 不扩展，仅作为历史回归测试 |
| `src/visual/risk-board.js` | 风险看板主体能力 | 不扩展，仅作为历史回归测试 |
| `src/asset/*` | Asset Hub 主体模型与生命周期能力 | 不扩展，仅作为历史回归测试 |
| `src/governance/asset-review.js` / `gray-release.js` / `rollback.js` | Hub 审核、灰度、回滚治理主体能力 | 不扩展，仅作为历史回归测试 |

## 结论

B1.1 已完成。P0-P3 执行底座能力清晰，越界主体能力已标记为历史存量并停止扩展，允许继续 B1.2 / B1.3 / B1.4。
