# Visual Hooks - 切面式数据推送机制

## 概述

`visual-hooks` 是 `ai-spec-auto` 与 `engineered-spec-visual` 之间的切面式数据推送层。

**设计原则**：

- **零侵入**：不修改 auto 现有协议逻辑，只在 3-5 个关键节点新增 hook 调用
- **优雅降级**：visual 服务不可用时，hook 调用自动降级，不影响主流程
- **配置驱动**：通过 `.ai-spec/visual-config.json` 控制启用与否，默认不启用
- **独立目录**：所有 visual 相关代码聚合在此目录，便于维护或移除

## 目录结构

```text
internal/visual-hooks/
├── index.js              # Hook 注册与降级入口
├── config-loader.js      # 加载 .ai-spec/visual-config.json
├── push-client.js        # HTTP/WebSocket 推送客户端
├── hooks/                # Hook 实现（未来扩展）
│   ├── on-run-start.js
│   ├── on-run-state-change.js
│   └── on-archive-complete.js
└── README.md             # 本文档
```

## 使用方式

### 1. 配置文件

在项目根目录创建 `.ai-spec/visual-config.json`：

```json
{
  "enabled": true,
  "visual_url": "http://visual-server:3000",
  "workspace_id": "my-project",
  "workspace_name": "项目显示名称",
  "push_mode": "hook",
  "push_timeout_ms": 3000,
  "retry_times": 1
}
```

**配置字段说明**：

| 字段 | 类型 | 必填 | 默认值 | 说明 |
| --- | --- | --- | --- | --- |
| `enabled` | boolean | 是 | false | 是否启用 visual 推送 |
| `visual_url` | string | 是 | - | visual 服务地址（含协议和端口） |
| `workspace_id` | string | 是 | - | 工作区唯一标识 |
| `workspace_name` | string | 否 | `workspace_id` | 工作区显示名称 |
| `push_mode` | string | 否 | "hook" | 推送模式：`hook`（实时）或 `collector`（仅批量） |
| `push_timeout_ms` | number | 否 | 3000 | 推送超时时间（毫秒） |
| `retry_times` | number | 否 | 1 | 推送失败重试次数 |

### 2. 代码集成

#### 2.1 初始化 Hooks

在 auto 项目的入口文件中初始化 hooks：

```javascript
// bin/cli.js

import { initVisualHooks } from '../internal/visual-hooks/index.js';

// 初始化 visual hooks（只执行一次）
const visualHooks = initVisualHooks();
```

#### 2.2 触发 Hook: onRunStart

在 `protocol-step` 命令入口，run 启动时触发：

```javascript
// bin/cli.js - protocol-step 命令

async function protocolStep(input) {
  const runId = generateRunId();
  const workspaceId = detectWorkspaceId();
  
  // 触发 hook：run 启动
  await visualHooks?.onRunStart?.(runId, workspaceId, input);
  
  // 继续现有逻辑
  // ...
}
```

#### 2.3 触发 Hook: onRunStateChange

在 `expert-executor` 执行完专家后，状态变更时触发：

```javascript
// internal/runner/expert-executor.js

import { getVisualHooks } from '../visual-hooks/index.js';

async function executeExpert(expertName, input) {
  // 执行专家（现有逻辑）
  const result = await runExpert(expertName, input);
  
  // 更新运行态（现有逻辑）
  const newRunState = updateCurrentRunState(result);
  
  // 触发 hook：状态变更
  const hooks = getVisualHooks();
  await hooks?.onRunStateChange?.(newRunState);
  
  return result;
}
```

#### 2.4 触发 Hook: onArchiveComplete

在 `archive-change` 完成归档后触发：

```javascript
// internal/runtime/archive-change.js

import { getVisualHooks } from '../visual-hooks/index.js';

async function archiveChange(archiveInput) {
  // 执行归档（现有逻辑）
  const archiveResult = await performArchive(archiveInput);
  
  // 触发 hook：归档完成
  const hooks = getVisualHooks();
  await hooks?.onArchiveComplete?.(archiveResult);
  
  return archiveResult;
}
```

### 3. 降级机制

**降级触发条件**：

1. 配置文件不存在或 `enabled: false`
2. `visual_url` 无效或无法访问
3. 推送超时（默认 3 秒）
4. 推送失败（网络错误、服务端错误）

**降级行为**：

- `initVisualHooks()` 返回 `null`
- hook 调用 `visualHooks?.method?.()` 直接跳过（可选链）
- 只在日志中记录警告，不抛异常
- auto 协议推进完全不受影响

**日志示例**：

```text
[visual-hooks] disabled or not configured
[visual-hooks] push failed: ECONNREFUSED
[visual-hooks] push timeout after 3000ms
[visual-hooks] push failed (attempt 1/2), retrying...
```

## API 文档

### initVisualHooks()

初始化 visual hooks。

**返回值**：`VisualHooks | null`

- 成功：返回 hooks 对象
- 失败：返回 `null`（配置未启用或加载失败）

**示例**：

```javascript
import { initVisualHooks } from './internal/visual-hooks/index.js';

const hooks = initVisualHooks();

if (hooks) {
  console.log('Visual hooks enabled');
  console.log('Config:', hooks.config);
} else {
  console.log('Visual hooks disabled');
}
```

### getVisualHooks()

获取当前 hooks 实例（不触发初始化）。

**返回值**：`VisualHooks | null`

**示例**：

```javascript
import { getVisualHooks } from './internal/visual-hooks/index.js';

const hooks = getVisualHooks();
await hooks?.onRunStart?.(runId, workspaceId, input);
```

### loadVisualConfig()

加载 visual 配置文件。

**返回值**：`VisualConfig | null`

**配置加载优先级**：

1. `.ai-spec/visual-config.json`（项目级）
2. `~/.ai-spec/visual-config.json`（用户级）
3. 环境变量覆盖：
   - `AI_SPEC_VISUAL_ENABLED`
   - `AI_SPEC_VISUAL_URL`
   - `AI_SPEC_VISUAL_WORKSPACE_ID`

**示例**：

```javascript
import { loadVisualConfig } from './internal/visual-hooks/config-loader.js';

const config = loadVisualConfig();
if (config) {
  console.log('Visual URL:', config.visual_url);
}
```

### createConfigExample(targetPath)

创建配置文件示例。

**参数**：

- `targetPath` (string): 目标文件路径

**返回值**：`boolean`

**示例**：

```javascript
import { createConfigExample } from './internal/visual-hooks/config-loader.js';

// 在项目根目录创建示例配置
createConfigExample('.ai-spec/visual-config.example.json');
```

## 数据推送协议

### 推送端点

```
POST /api/internal/ingest/raw
Content-Type: application/json
X-Workspace-ID: {workspace_id}
```

### 请求体结构

```json
{
  "sourceKind": "hook-push",
  "workspaceId": "my-project",
  "rawEvents": [
    {
      "sourceKind": "hook-event",
      "sourcePath": "internal/visual-hooks",
      "eventType": "run.started",
      "eventKey": "run_abc:run.started:1234567890",
      "dedupeKey": "hash_value",
      "checksum": "sha256_hash",
      "occurredAt": "2026-04-21T10:00:00Z",
      "entityType": "run",
      "entityId": "run_abc",
      "payload": {
        "run_id": "run_abc",
        "workspace_id": "my-project",
        "input": { /* protocol-step 输入 */ },
        "started_at": "2026-04-21T10:00:00Z"
      }
    }
  ]
}
```

### 事件类型

| 事件类型 | 触发时机 | Payload 字段 |
| --- | --- | --- |
| `run.started` | protocol-step 启动 | `run_id`, `workspace_id`, `input`, `started_at` |
| `run.state_changed` | 运行态变更 | 完整的 `current-run.json` 内容 |
| `run.archived` | 归档完成 | `run_id`, `workspace_id`, 归档结果, `archived_at` |

## 故障排查

### 问题 1：hooks 未初始化

**症状**：

```text
[visual-hooks] disabled or not configured
```

**排查步骤**：

1. 检查配置文件是否存在：`ls -la .ai-spec/visual-config.json`
2. 检查 `enabled` 字段是否为 `true`
3. 检查 `visual_url` 和 `workspace_id` 是否正确

### 问题 2：推送超时

**症状**：

```text
[visual-hooks] push timeout after 3000ms
```

**排查步骤**：

1. 检查 visual 服务是否运行：`curl http://visual-url:3000/api/health`
2. 检查网络连通性：`ping visual-server`
3. 增加 `push_timeout_ms` 配置（如改为 5000）

### 问题 3：推送失败

**症状**：

```text
[visual-hooks] push failed: ECONNREFUSED
[visual-hooks] push failed: 500 Internal Server Error
```

**排查步骤**：

1. 检查 visual 服务日志：`docker-compose logs visual`
2. 检查 visual 数据库连接是否正常
3. 尝试手动推送测试：
   ```bash
   curl -X POST http://visual-url:3000/api/internal/ingest/raw \
     -H "Content-Type: application/json" \
     -H "X-Workspace-ID: test" \
     -d '{"sourceKind":"test","workspaceId":"test","rawEvents":[]}'
   ```

### 问题 4：hooks 不触发

**症状**：

配置正确但 visual 控制台没有数据

**排查步骤**：

1. 检查 hook 调用是否存在：搜索代码中的 `visualHooks?.on`
2. 检查日志中是否有 `[visual-hooks] on...Pushed` 输出
3. 启用调试日志：`export DEBUG=visual-hooks:*`

## 环境变量

支持以下环境变量覆盖配置：

| 环境变量 | 说明 | 示例 |
| --- | --- | --- |
| `AI_SPEC_VISUAL_ENABLED` | 启用/禁用 | `true` / `false` |
| `AI_SPEC_VISUAL_URL` | Visual 服务地址 | `http://visual-server:3000` |
| `AI_SPEC_VISUAL_WORKSPACE_ID` | 工作区 ID | `my-project` |
| `AI_SPEC_VISUAL_PUSH_TIMEOUT_MS` | 推送超时（毫秒） | `5000` |

**使用示例**：

```bash
# 临时禁用 visual hooks
AI_SPEC_VISUAL_ENABLED=false npx ai-spec-auto protocol-step

# 使用不同的 visual 服务
AI_SPEC_VISUAL_URL=http://visual-test:3000 npx ai-spec-auto protocol-step
```

## 测试

### 单元测试

```bash
# 运行 visual-hooks 单元测试
npm test -- internal/visual-hooks
```

### 集成测试

```bash
# 1. 启动 visual 服务
cd /path/to/engineered-spec-visual
docker-compose up -d

# 2. 配置 auto 项目
cd /path/to/test-project
cat > .ai-spec/visual-config.json <<EOF
{
  "enabled": true,
  "visual_url": "http://localhost:3000",
  "workspace_id": "test-project"
}
EOF

# 3. 执行协议命令
npx ai-spec-auto protocol-step

# 4. 验证推送
curl http://localhost:3000/api/workspaces
```

## 维护指南

### 新增 Hook

如果需要新增 hook（如 `onRunPaused`），步骤如下：

1. 在 `index.js` 的 `initVisualHooks()` 中添加新 hook 方法
2. 在对应的触发点调用 `hooks?.onRunPaused?.()`
3. 更新本文档的"事件类型"表格
4. 添加单元测试

### 移除 Hooks

如果需要完全移除 visual hooks：

1. 删除 `internal/visual-hooks/` 目录
2. 移除代码中的 hook 调用（搜索 `visualHooks`）
3. 移除配置文件 `.ai-spec/visual-config.json`

## Gate Signal（审批 → IDE 原对话自动继续）

`gate-signal.js` 是切面能力：当 `inbox-consumer.js` 成功应用 `approve_gate` /
`reject_gate` / `resume_run` 后，会额外写一份 `.ai-spec/gate-signal.json`，
供 IDE 中的 AI（Cursor / Claude Code）通过规则/技能轮询，实现 Visual 页面点
批准后原对话自动继续。

当 `reject_gate` 携带 `payload.decision = "request_changes"` 时，会按“要求补充后重审”
处理：

- 保持 `current-run.json.status = waiting-approval`
- 保持 `pending_gate` 不清空
- 事件类型写为 `gate-request-changes`
- `.ai-spec/gate-signal.json` 写 `decision = "request_changes"`
- `.ai-spec/next-step.md` 追加“补齐资产后重新提交审批”的提示

**契约（`schema_version: 1`）**：

```json
{
  "schema_version": 1,
  "run_id": "run_2026xxxx",
  "gate": "before-implementation",
  "decision": "approved | rejected | resumed | request_changes",
  "reason": "可选",
  "actor_id": "可选",
  "ts_ms": 1714000000000,
  "ts_iso": "2026-04-23T..."
}
```

**AI 读侧判定**：`signal.run_id === currentRunId && signal.gate === currentGate
&& signal.ts_ms > waitStartedAt`，四项校验全部通过才视为命中；其余情况忽略。

**解耦保证**：

- 所有 IO 失败静默写 `.ai-spec/logs/gate-signal.log`，**绝不**影响 `inbox-consumer`
  返回的 `applied | rejected | conflict` 结果。
- 原子写（`.tmp` → rename），避免读侧读到半写文件。
- 对应 IDE 侧规则/技能：
  - `.agents/rules/common/15-visual-gate-wait.md`
  - `.agents/skills/common/wait-for-gate-signal/SKILL.md`

## 相关文档

- [需求说明-visual补充.md](../../docs/five/需求说明-visual补充.md) - Visual 完整需求说明
- [快速部署指南](../../../engineered-spec-visual/docs/快速部署指南.md) - Visual 服务部署
- [架构设计与治理说明](../../docs/four/架构设计与治理说明.md) - 整体架构

## 许可证

UNLICENSED
