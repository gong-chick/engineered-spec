威哥，结论先放前面：

> **P0 主功能链路已经基本成型，但我不建议现在直接进入 P1。**
> 当前应先补一个 **P0.9「发布可用性与运行态治理修复」**，修完后再进入 P1。

原因很明确：代码层面已经覆盖了 P0 大部分目标，但我发现 **2 个阻塞问题 + 4 个非阻塞问题**。其中最关键的是：**npm 发布包可能无法运行**，以及 **Run/Repair 运行态仍写在项目 `.ai-spec/runs/` 里，和你之前确定的 `~/.ai-spec-auto/` 目录治理原则冲突**。

---

# 一、验证结论

| 验证项                        | 结论      | 是否阻塞进入 P1 |
| -------------------------- | ------- | --------: |
| CLI 命令入口                   | 基本通过    |         否 |
| `init --recommend` 初始化     | 基本通过    |         否 |
| 项目内轻量目录                    | 基本通过    |         否 |
| `~/.ai-spec-auto/` 本地运行态目录 | 部分通过    |         是 |
| Manifest 结构                | 基本通过    |         否 |
| Lock 结构                    | 部分通过    |         否 |
| Cursor Adapter             | 基本通过    |         否 |
| Claude Code Adapter        | 部分通过    |         否 |
| Spec / Test Plan / DoD     | 基本通过    |         否 |
| Hook 配置                    | 基本通过    |         否 |
| Repair 限次                  | 基本通过    |         否 |
| Evidence Report            | 基本通过    |         否 |
| npm 安装后可用性                 | **不通过** |     **是** |
| P0 测试可信度                   | 部分通过    |         否 |

你的上传汇报里显示 P0.1-P0.8 均通过，并且测试项目 `test_副本22` 已完成目录、Manifest、Lock、Hook、Spec、Evidence、幂等性和运行态不污染项目仓库等验证 。但我基于当前代码库进一步核查后，认为这个结论需要修正为：

> **P0 功能完成度约 80%-85%，但还不能作为“可正式进入 P1”的稳定基线。**

---

# 二、已经通过的部分

## 1. CLI 入口基本完整

`bin/cli.js` 已注册 P0 关键命令：

* `spec-start`
* `spec-status`
* `spec-continue`
* `spec-list`
* `spec-detail`
* `repair`
* `report`
* `init --recommend`
* `check`

这说明 P0 的命令入口层已经具备闭环形态。`spec-list/spec-detail/repair/report` 等路由均已接入主 CLI。

结论：**通过。**

---

## 2. Spec / Test Plan / DoD 闭环基本完成

`SpecWriter` 已实现：

* `.ai-spec/specs/{specId}/requirement.md`
* `spec.md`
* `test-plan.md`
* `dod.md`
* `review-checklist.md`
* `specs/index.json`

并且提供 `write/list/getStatus` 能力，符合 P0.6 的核心目标。

`spec-start` 中也已经集成 `SpecWriter`，会在创建 Run 时生成 Spec 目录和模板。

结论：**通过。**

---

## 3. Hook 配置基本完成

`HookConfigWriter` 已覆盖 7 类 Hook：

* `pre-task`
* `pre-edit`
* `post-edit`
* `pre-test`
* `post-test`
* `repair-hook`
* `archive-hook`

并包含 `maxRepairAttempts: 2`，符合 P0.7 的核心目标。

结论：**通过。**

---

## 4. Repair 限次机制基本完成

`repair-command.js` 中定义了 `MAX_REPAIR_ATTEMPTS = 2`，并且会读取 `.harness/hooks.config.json` 里的 `maxRepairAttempts`，超过次数后会写入 blocked 记录并返回失败状态。

结论：**通过。**

---

## 5. Evidence Report 基本完成

`report-command.js` 已支持：

* 加载 Run
* 读取事件
* 读取修复历史
* 汇总 changedFiles
* 汇总 hookResults
* 汇总 testResults
* 汇总 repairResults
* 输出 JSON 和 Markdown 两种格式

输出路径为 `reports/ai-spec/{runId}/evidence-report.json` 和 `summary.md`。

结论：**通过。**

---

## 6. 项目初始化链路已集成关键模块

`InitApplier` 已集成：

* `ConfigWriter`
* `LocalStateWriter`
* `HookConfigWriter`
* `ManifestWriter`
* `LockFileWriter`
* `CursorAdapter`
* `ClaudeAdapter`
* `IdePointerInjector`

这说明 P0.2-P0.5 的主链路已经打通。

结论：**通过。**

---

## 7. 本地运行态目录初始化基本完成

`ConfigWriter` 会基于项目名和项目路径 hash 生成 `projectId`，并计算：

```text
~/.ai-spec-auto/projects/{projectId}
```

同时默认开启 Cursor 和 Claude Code，关闭 Codex，符合 P0 设计。

`LocalStateWriter` 会创建 9 个本地运行态子目录：

* `runs`
* `cache`
* `logs`
* `context`
* `repair`
* `secrets`
* `workspaces`
* `telemetry`
* `tmp`

并为 `secrets` 写入 `.gitignore`。

结论：**初始化通过，但运行态写入不完全通过。**

---

# 三、阻塞问题

## 阻塞问题 1：npm 发布包可能无法运行

这是最严重的问题。

`package.json` 的 `files` 白名单目前只包含：

```json
[
  "bin/",
  "internal/",
  "scripts/",
  ".agents/",
  "configs/",
  ".cursor/mcp.json",
  "openspec/",
  "install.sh",
  "install.ps1"
]
```

但你的 CLI 主入口大量依赖 `../src/...`，例如：

* `bin/spec-command.js` 依赖 `../src/spec/spec-writer`
* `bin/repair-command.js` 依赖 `../src/run/run-service`
* `bin/report-command.js` 依赖 `../src/run/run-service`
* `bin/check-command.js` 依赖 `../src/check/check-service`
* `bin/cli.js` 依赖大量 `bin` 与 `src` 间接模块

而 `package.json` 发布白名单没有包含 `src/`。

这会导致一个高概率问题：

> **仓库内执行没问题，但 `npm pack` / 内部 npm registry 安装后，CLI 运行时找不到 `src/...` 模块。**

这直接影响 P0 的“安装后可用性”。

### 必须修复

把 `src/` 加入 `package.json.files`：

```json
"files": [
  "bin/",
  "src/",
  "internal/",
  "scripts/",
  ".agents/",
  "configs/",
  ".cursor/mcp.json",
  "openspec/",
  "install.sh",
  "install.ps1"
]
```

并补充发布前验证命令：

```bash
npm pack --dry-run
npm pack
mkdir -p /tmp/ai-spec-auto-pack-test
cd /tmp/ai-spec-auto-pack-test
npm init -y
npm install /path/to/ex-ai-spec-auto-0.1.11.tgz
npx ai-spec-auto --version
npx ai-spec-auto init --recommend --dry-run
```

### 结论

**阻塞进入 P1。必须先修。**

---

## 阻塞问题 2：Run / Repair 运行态仍写入项目 `.ai-spec/runs/`

你之前已经明确：运行态、缓存、日志、临时上下文、修复过程应该进入：

```text
~/.ai-spec-auto/projects/{projectId}/
```

但当前代码中，`RunStore.getRunsDir()` 仍固定返回：

```js
path.join(rootDir, '.ai-spec/runs')
```

也就是说，Run 数据实际写在业务项目内。

`repair-command.js` 也把 `repair-history.json` 写在：

```js
.ai-spec/runs/{runId}/repair-history.json
```



这和 P0 目录治理目标冲突。

你的 P0 完成汇报里写到“运行态数据未污染项目仓库” ，但从代码事实看，当前至少 Run 和 Repair 仍在项目目录内产生运行态文件。

### 必须修复

建议新增一个 `LocalStateResolver` 或改造 `RunStore`：

```js
function resolveRunBaseDir(rootDir) {
  const configPath = path.join(rootDir, '.ai-spec', 'config.json');
  const config = readJson(configPath);
  if (config && config.localStateDir) {
    return path.join(config.localStateDir, 'runs');
  }
  return path.join(rootDir, '.ai-spec', 'runs'); // 兼容旧项目
}
```

然后：

* `RunStore.getRunsDir()` 改为优先读取 `config.localStateDir/runs`
* `repair-command.js` 改为优先写 `localStateDir/repair` 或 `localStateDir/runs/{runId}/repair-history.json`
* `report-command.js` 可保留 `reports/ai-spec/{runId}` 作为可提交 Evidence，但原始事件、repair-history、events.ndjson 应来自本地运行态目录
* `.ai-spec/runs` 仅作为旧版本兼容路径，不作为 P0 默认路径

### 结论

**阻塞进入 P1。必须先修。**

---

# 四、非阻塞问题

## 问题 1：Lock 的 checksum 不是内容级防篡改

`LockFileWriter` 当前对资产的 checksum 使用的是：

```js
createChecksum(f.path)
```

也就是对文件路径做 hash，而不是对文件内容做 hash。

这意味着：

> 文件内容被改了，只要路径不变，checksum 不会变化。

如果 P0 只做结构锁定，这可以接受；但如果宣称“防篡改 hash”，目前还不够。

### 建议

P0.9 或 P1.2 修复为内容级 checksum：

```js
checksum: createChecksum(fs.readFileSync(fullPath, 'utf8'))
```

结论：**不阻塞 P1，但建议 P1 前修。**

---

## 问题 2：Claude Code Adapter 的 Hooks 只是空结构

`ClaudeAdapter` 生成的 `.claude/settings.json` 当前是：

```json
{
  "hooks": {
    "PreToolUse": [],
    "PostToolUse": [],
    "Stop": []
  },
  "permissions": {
    "allow": [],
    "deny": []
  }
}
```



这说明 P0 的 Claude Code Hook 并没有真正映射到：

```text
ai-spec-auto check
ai-spec-auto repair
ai-spec-auto report
```

现在真正的 Hook 配置是在 `.harness/hooks.config.json`，Claude Code 只是生成了 settings 骨架。

### 建议

可以接受为 P0 最小版，但 P1 前建议至少生成可用的 Claude Code Hook 示例或注释说明：

* PreToolUse：检查敏感文件写入
* PostToolUse：记录编辑摘要
* Stop：提示执行 `ai-spec-auto check`
* 修复命令不建议自动接入 Claude settings，仍由 Harness 控制

结论：**不阻塞 P1，但必须在 P1 Adapter Protocol 中明确。**

---

## 问题 3：Cursor Adapter 生成命令目录，但 Cursor 原生支持能力需要确认

`CursorAdapter` 生成：

* `.cursor/rules/*.mdc`
* `.cursor/commands/spec-start.md`
* `.cursor/commands/spec-update.md`
* `.cursor/commands/spec-status.md`

`.cursor/rules/*.mdc` 是合理的；但 `.cursor/commands` 是否作为 Cursor 原生命令入口生效，需要以当前 Cursor 版本实际行为为准。代码本身能生成文件，但“IDE 原生可调用”还需真实验证。

### 建议

P0.9 增加手工验收项：

```text
打开 Cursor → 确认 .cursor/rules 生效 → 使用 Agent 询问项目规则 → 验证它能读取 ai-spec-auto.mdc 和项目规则
```

结论：**不阻塞 P1，但需要补真实 IDE 验收记录。**

---

## 问题 4：P0 测试报告可信，但仓库测试脚本未形成 P0 专项回归

`package.json` 里有 `test:runtime`，但没有独立的：

```bash
npm run test:p0
npm run verify:p0
npm run pack:test
```



现有 `tests/runtime/spec-start-replay.test.js` 覆盖的是 protocol workflow replay 场景，不是 P0.2-P0.8 的完整验收。

你的上传完成汇报提供了 `test_副本22` 的人工/集成验收结论 ，但从工程化角度，建议把这些验收固化成自动化测试。

### 建议新增

```json
"scripts": {
  "test:p0": "node ./tests/p0/p0-init-e2e.test.js && node ./tests/p0/p0-spec-repair-report.test.js",
  "verify:p0": "npm run test:p0 && npm pack --dry-run"
}
```

结论：**不阻塞 P1，但强烈建议 P1 前补齐。**

---

# 五、P0 验收矩阵

| P0 小阶段                         | 验证结果 | 依据                                                    | 结论         |
| ------------------------------ | ---- | ----------------------------------------------------- | ---------- |
| P0.1 项目理解与基线确认                 | 通过   | 已有 package、runtime tests、CLI 基础结构                     | 可接受        |
| P0.2 项目初始化与目录治理                | 部分通过 | Config/LocalState 已实现，但 RunStore 仍写项目 `.ai-spec/runs` | 需修复        |
| P0.3 Manifest 与 Lock           | 部分通过 | Manifest 字段较完整；Lock checksum 不是内容 hash                | 可进入修复      |
| P0.4 Cursor Adapter            | 基本通过 | 生成 `.cursor/rules/*.mdc` 和命令模板                        | 需真实 IDE 验证 |
| P0.5 Claude Code Adapter       | 部分通过 | commands/agents 生成；settings hooks 为空                  | 可接受但需说明    |
| P0.6 Spec/TestPlan/DoD         | 通过   | SpecWriter 完整生成 5 类文件                                 | 可接受        |
| P0.7 Hook/Test/Repair/Evidence | 部分通过 | Hook/Repair/Report 有实现；运行态位置冲突                        | 需修复        |
| P0.8 集成回归与阶段验收                 | 部分通过 | 上传报告显示通过，但代码存在发布包和运行态冲突                               | 需补 P0.9    |

---

# 六、是否可以开始 P1？

## 我的判断：暂不建议直接开始 P1

更准确地说：

> **P0 业务功能基本完成，但 P0 工程基线还没有完全稳定。建议先做 P0.9，修完后再进入 P1。**

---

# 七、建议新增 P0.9：发布可用性与运行态治理修复

## P0.9 目标

1. 确保 npm pack / 内部 npm 安装后 CLI 可运行。
2. 确保 Run / Repair 原始运行态默认写入 `~/.ai-spec-auto/`。
3. 确保项目内只保留规范资产和可提交 Evidence。
4. 补齐 `verify:p0` 回归命令。
5. 补充真实 IDE 验收记录。

## P0.9 任务清单

| 任务                | 修改范围                              | 完成标准                            |
| ----------------- | --------------------------------- | ------------------------------- |
| 修复 package files  | `package.json`                    | `npm pack --dry-run` 包含 `src/`  |
| 改造 RunStore       | `src/run/run-store.js`            | run 默认写入 `localStateDir/runs`   |
| 改造 repair-history | `bin/repair-command.js`           | repair-history 默认写入本地运行态        |
| 改造 report 读取路径    | `bin/report-command.js`           | 可从本地运行态读取 events/repair         |
| 保留兼容路径            | RunStore / Repair / Report        | 旧 `.ai-spec/runs` 项目仍可读取        |
| 内容级 checksum      | `src/project/lock-file-writer.js` | checksum 基于文件内容                 |
| 补 P0 自动化测试        | `tests/p0/*`                      | 覆盖 init/spec/repair/report/pack |
| 补验证命令             | `package.json`                    | 新增 `test:p0`、`verify:p0`        |
| 补 IDE 验收记录        | `docs/p0/*`                       | Cursor / Claude Code 手工验证记录完整   |

## P0.9 推荐验收命令

```bash
npm run test:p0
npm run verify:p0
npm pack --dry-run
npm pack
```

安装包验证：

```bash
mkdir -p /tmp/ai-spec-p0-pack-test
cd /tmp/ai-spec-p0-pack-test
npm init -y
npm install /path/to/ex-ai-spec-auto-0.1.11.tgz
npx ai-spec-auto --version
npx ai-spec-auto init --recommend --dry-run
npx ai-spec-auto check .
```

目录治理验证：

```bash
find . -path "*/.ai-spec/runs/*" -print
find ~/.ai-spec-auto/projects -maxdepth 3 -type d
```

期望：

```text
项目内不应默认产生 .ai-spec/runs 原始运行态
用户目录应产生 ~/.ai-spec-auto/projects/{projectId}/runs
```

---

# 八、最终决策建议

## 当前状态

```text
P0：功能基本完成
P0 工程基线：未完全通过
是否进入 P1：暂不建议
建议动作：先补 P0.9
```

## 可对外汇报口径

> P0 的核心能力已经完成，已打通 Cursor + Claude Code 双 IDE 初始化、Spec 生成、Hook 配置、Repair 限次和 Evidence Report 生成。但在进入 P1 多项目标准化之前，需要补一个 P0.9 工程化验收修复，重点解决 npm 发布包可用性和运行态目录治理，确保第一阶段能力不仅在源码仓库可运行，也能通过安装包稳定复用。

## 我的最终判断

**不建议现在直接开始 P1。**

建议先完成：

1. `package.json.files` 增加 `src/`
2. `RunStore` 改为优先写入 `~/.ai-spec-auto/projects/{projectId}/runs`
3. `repair-history` 改为优先写入本地运行态
4. `report` 支持从本地运行态读取事件与修复历史
5. `LockFileWriter` 改为内容级 checksum
6. 新增 `test:p0` / `verify:p0`
7. 补 Cursor / Claude Code 真实 IDE 验收记录

完成这些后，**P0 就可以判定为正式通过，并进入 P1。**
