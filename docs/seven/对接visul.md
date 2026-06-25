# br-ai-spec 对接 Visual 可视化平台文档

> Visual 项目地址：`http://localhost:18780`
> br-ai-spec 项目：`@engineered/ai-spec-auto`
> 更新时间：2026-04-27

---

## 一、br-ai-spec 上报体系总览

br-ai-spec 有**两套独立的上报系统**，互不干扰：

| 系统 | 位置 | 职责 | 目标地址 |
|------|------|------|----------|
| **CLI 遥测** | `bin/telemetry/` | 匿名使用统计（命令调用次数、成功率、耗时） | `http://82.156.14.216:3001`（硬编码默认值） |
| **Visual 上报** | `src/visual/` | 项目级运行时数据（项目状态、运行事件、历史记录、异常事件） | **可配置**，由你指定 |

本文重点讲 **Visual 上报** 如何对接你的 `http://localhost:18780`。

---

## 二、Visual 上报架构

```
CLI 命令执行
    │
    ├── init → VisualReporter.reportProjectState()
    │            └── POST /api/collector/project-state
    │
    ├── spec-start/spec-continue → VisualReporter.reportRunEvent()
    │                                 └── POST /api/collector/run-event
    │
    ├── spec-complete → VisualReporter.reportHistory()
    │                     └── POST /api/collector/history
    │
    └── 异常发生 → VisualReporter.reportIncident()
                     └── POST /api/collector/incident
```

### 核心组件

| 模块 | 文件 | 职责 |
|------|------|------|
| `VisualReporter` | `src/visual/visual-reporter.js` | 上报总入口，统一调度 |
| `VisualClient` | `src/visual/visual-client.js` | HTTP 客户端，POST JSON 到 Visual 服务 |
| `VisualConfig` | `src/visual/visual-config.js` | 解析 Visual URL 配置（4 层优先级） |
| `EventMapper` | `src/visual/event-mapper.js` | 构造上报数据结构 |
| `PrivacyFilter` | `src/visual/privacy-filter.js` | 强制执行隐私保护，过滤敏感数据 |

---

## 三、配置 Visual 地址（3 种方式）

### 方式 1：CLI 参数（优先级最高）

```bash
# 所有支持 --visual-url 的命令
ai-spec-auto init . --recommend --yes --visual-url http://localhost:18780
ai-spec-auto ide sync . --visual-url http://localhost:18780 --yes
```

### 方式 2：policy.json 配置（推荐，持久化）

在目标项目的 `.ai-spec/policy.json` 中添加 `visual` 配置块：

```json
{
  "schemaVersion": "1.0.0",
  "execution": { "mode": "local-assisted" },
  "branchPolicy": { "dirtyStrategy": "block" },
  "privacyPolicy": {
    "uploadSourceCode": false,
    "uploadRawPrompt": false,
    "uploadRawResponse": false,
    "uploadFileContent": false,
    "allowRelativePath": true,
    "allowFailureSummary": true,
    "allowTestSummary": true
  },
  "visual": {
    "url": "http://localhost:18780",
    "enabled": true,
    "nonBlocking": true
  }
}
```

配置后，所有命令自动向 Visual 上报数据，无需每次传 `--visual-url`。

### 方式 3：环境变量

```bash
export AI_SPEC_VISUAL_URL=http://localhost:18780
```

### 配置优先级

```
CLI --visual-url  >  policy.json visual.url  >  环境变量 $AI_SPEC_VISUAL_URL
```

### 验证配置是否生效

```bash
# 执行 init 时会看到上报日志
AI_SPEC_SKIP_LAUNCHER_SYNC=1 node bin/cli.js init . --recommend --yes --visual-url http://localhost:18780
```

---

## 四、Visual 上报数据格式

### 4.1 项目状态上报（project-state）

**触发时机**：`init --recommend --yes` 完成后

**请求**：`POST /api/collector/project-state`

```json
{
  "eventId": "project-state:proj_abc123:init-apply",
  "projectId": "proj_abc123",
  "workspaceId": "",
  "projectHash": "a1b2c3d4e5f6",
  "name": "项目名称",
  "type": "single",
  "techProfile": {
    "domain": "frontend",
    "language": ["TypeScript"],
    "framework": "Vue"
  },
  "manifest": {
    "slug": "frontend-vue-vite-standard",
    "version": "1.0.0"
  },
  "packages": [
    {
      "packageId": "root",
      "path": ".",
      "manifest": {
        "slug": "frontend-vue-vite-standard",
        "version": "1.0.0"
      }
    }
  ],
  "privacy": {
    "sourceCodeIncluded": false,
    "rawPromptIncluded": false,
    "rawResponseIncluded": false,
    "absolutePathIncluded": false
  },
  "reportedAt": "2026-04-27T08:00:00.000Z"
}
```

### 4.2 运行事件上报（run-event）

**触发时机**：`spec-start`、`spec-continue`、阶段切换

**请求**：`POST /api/collector/run-event`

```json
{
  "eventId": "run-event:run_xyz:started",
  "runId": "run_xyz",
  "projectId": "proj_abc123",
  "workspaceId": "",
  "type": "runtime_event",
  "state": "running",
  "stage": "implementation",
  "level": "info",
  "executor": "cursor",
  "manifest": {
    "slug": "frontend-vue-vite-standard",
    "version": "1.0.0"
  },
  "payload": {
    "action": "stage_started",
    "stage": "implementation"
  },
  "occurredAt": "2026-04-27T08:05:00.000Z",
  "privacy": {
    "sourceCodeIncluded": false,
    "rawPromptIncluded": false,
    "rawResponseIncluded": false,
    "absolutePathIncluded": false
  }
}
```

### 4.3 历史记录上报（history）

**触发时机**：spec 执行完成、executor 返回结果

**请求**：`POST /api/collector/history`

```json
{
  "historyId": "hist_abc",
  "runId": "run_xyz",
  "projectId": "proj_abc123",
  "title": "为首页添加用户登录状态显示",
  "summary": "完成了登录状态组件的开发和测试",
  "changedFiles": [
    "src/components/LoginStatus/index.vue",
    "src/views/HomeView.vue"
  ],
  "assetsUsed": [
    "frontend-vue-rule",
    "frontend-implementer"
  ],
  "verificationSummary": "所有测试通过，lint 检查 0 error",
  "createdAt": "2026-04-27T08:30:00.000Z",
  "privacy": { "...": false }
}
```

### 4.4 异常事件上报（incident）

**触发时机**：任何异常/错误发生

**请求**：`POST /api/collector/incident`

```json
{
  "incidentId": "inc_001",
  "runId": "run_xyz",
  "projectId": "proj_abc123",
  "type": "executor_error",
  "level": "error",
  "stage": "implementation",
  "message": "组件构建失败：类型不匹配",
  "suggestion": "检查 Props 类型定义",
  "status": "open",
  "createdAt": "2026-04-27T08:10:00.000Z",
  "privacy": { "...": false }
}
```

---

## 五、隐私保护机制（双重保障）

### 第一层：策略强制

`policy.json` 写入时，以下字段**强制设为 false**，无法通过编辑文件反转：

```javascript
const FORCED_FIELDS = [
  'uploadSourceCode',    // 禁止上传源码
  'uploadAbsolutePath',  // 禁止上传绝对路径
  'uploadUserName',      // 禁止上传用户名
  'uploadRawPrompt',     // 禁止上传原始提示词
  'uploadRawResponse',   // 禁止上传原始 AI 响应
  'uploadFileContent',   // 禁止上传文件内容
];
```

### 第二层：运行时过滤

`PrivacyFilter` 在发送 HTTP 请求前过滤数据：
- 扫描禁止字段名：`sourceCode`、`fileContent`、`rawPrompt`、`apiKey`、`password`、`secret`
- 扫描秘密模式：`api_key`、`password=`、`token:`
- 拒绝绝对路径（`/Users/...`、`C:\...`）
- 如果 `privacy` 声明中有任何 `*Included: true`，则抛出错误阻止发送

### 上报内容保证

- 不包含项目源码
- 不包含绝对路径
- 不包含密钥/token
- 不包含 AI 提示词原文和响应原文
- 只包含项目 ID（哈希）、技术栈、Manifest 标识、运行状态摘要

---

## 六、Visual 服务需实现的 API

如果你要在 `http://localhost:18780` 接收 br-ai-spec 的上报数据，需实现以下接口：

### 6.1 健康检查

```
GET /api/health
Response: 200 OK
Body: { "status": "ok" }
```

### 6.2 采集器接口

```
POST /api/collector/project-state
Content-Type: application/json
Body: 见 4.1 节
Response: { "success": true, "data": { "id": "..." } }

POST /api/collector/run-event
Content-Type: application/json
Body: 见 4.2 节
Response: { "success": true, "data": { "id": "..." } }

POST /api/collector/history
Content-Type: application/json
Body: 见 4.3 节
Response: { "success": true, "data": { "id": "..." } }

POST /api/collector/incident
Content-Type: application/json
Body: 见 4.4 节
Response: { "success": true, "data": { "id": "..." } }
```

---

## 七、关闭遥测/上报

### 关闭 CLI 遥测

```bash
export AI_SPEC_TELEMETRY_DISABLED=1
```

或在 `~/.ai-spec-auto/config.json` 中：

```json
{
  "disabled": true
}
```

### 关闭 Visual 上报

在 `policy.json` 中：

```json
{
  "visual": {
    "enabled": false
  }
}
```

或不配置 `visual.url`。

---

## 八、完整对接操作步骤

### 步骤 1：确保 Visual 服务运行

```bash
# 确认 Visual 服务可访问
curl http://localhost:18780/api/health
```

### 步骤 2：初始化项目并配置 Visual

```bash
cd /path/to/your-project

# 初始化（本地模式）
AI_SPEC_SKIP_LAUNCHER_SYNC=1 \
  /path/to/br-ai-spec/bin/cli.js init . \
  --recommend --yes \
  --visual-url http://localhost:18780
```

### 步骤 3：编辑 policy.json 持久化配置

编辑 `.ai-spec/policy.json`，确保：

```json
{
  "visual": {
    "url": "http://localhost:18780",
    "enabled": true,
    "nonBlocking": true
  }
}
```

### 步骤 4：验证上报

```bash
# 执行 init 后查看输出，确认无 "跳过" 警告
# 如果看到 "已跳过运行态上报" 警告，说明 Visual URL 未配置或不可达
```

### 步骤 5：在有 Visual 配置的项目中执行开发流程

```bash
# 启动需求
ai-spec-auto spec-start . --requirement "功能描述"

# 查看状态
ai-spec-auto spec-status .

# 继续执行
ai-spec-auto spec-continue .
```

---

## 九、当前限制与 TODO

### 当前上报时机

| 命令/阶段 | 上报内容 | 状态 |
|-----------|----------|------|
| `init --recommend --yes` | project-state | 已实现 |
| `spec-start` | run-event | 部分实现（state-machine 层） |
| `spec-continue` | run-event | 部分实现 |
| executor 完成 | history | 已实现（stage-runner） |
| 异常错误 | incident | 已实现（incident-writer） |
| `ide sync` | 无直接上报 | 待实现 |
| `ide doctor` | 无直接上报 | 待实现 |

### 上报依赖

- `VisualReporter` 在 `InitApplier` 中调用 `reportProjectState`
- `RuntimeFeedbackReporter`（Hub 通道）在 `StageRunner` 中调用
- 上报是**非阻塞**的（`nonBlocking: true`），失败不影响主流程

---

## 十、调试与排查

### 查看上报日志

```bash
# 开启调试模式
AI_SPEC_TELEMETRY_DEBUG=1 ai-spec-auto init . --recommend --yes --visual-url http://localhost:18780
```

### 常见问题

| 问题 | 原因 | 解决 |
|------|------|------|
| "已跳过运行态上报" | Visual URL 未配置 | 设置 `--visual-url` 或编辑 `policy.json` |
| "VISUAL_URL_MISSING" | VisualClient 无法解析 URL | 检查 policy.json 中 `visual.url` 是否正确 |
| POST 超时 | Visual 服务未启动 | 确保 `http://localhost:18780` 可访问 |
