# bin/telemetry

可选的匿名遥测切面（aspect），用于向 `br-ai-spec-visual` 上报 CLI 安装与使用情况。

## 设计原则

- **零侵入**：主流程 (`bin/cli.js`、`bin/install-workflow.js` 等) 不依赖本目录。删除整个 `bin/telemetry/` 目录后 CLI 仍可正常工作。
- **降级四重保护**：
  1. `bin/cli.js` 中 `require('./telemetry')` 失败 → 使用透明 wrap，不上报。
  2. `index.js` 再次 try/catch 保护，阻止任何异常冒泡。
  3. **健康探测兜底**：上报前先 `HEAD /api/health`（500ms 超时），目标不可达直接跳过本次所有上报；探测失败时间记入本地缓存，60 秒冷却窗口内的后续 CLI 调用直接跳过探测。
  4. 网络上报 fire-and-forget + `AbortController(2000ms)`，绝不阻塞 `process.exit`。
- **可选依赖**：`node-machine-id` 放在 `optionalDependencies`，缺失时用纯 Node `os` 模块 + `sha256` 兜底。
- **用户可关闭**：`AI_SPEC_TELEMETRY_DISABLED=1` 禁用；`AI_SPEC_VISUAL_URL` 未设置时不发网络请求。

## 文件

| 文件 | 作用 |
| --- | --- |
| `index.js` | 对外唯一入口，导出 `wrap(command, fn)`。 |
| `aspect.js` | 切面实现：在命令前后异步上报 started / success / failed。 |
| `reporter.js` | REST / WS 上报；AbortController + 超时 + 静默失败。 |
| `identity.js` | 生成 installationId（node-machine-id → sha256(mac+user+host) 兜底）。 |
| `collect.js` | 收集非敏感字段（hostname/platform/node/cliVersion/projectHash/profile…）。 |
| `config.js` | 读取环境变量 + 用户配置 + 仓库默认，三层合并。 |
| `defaults.json` | 仓库内默认配置（仅 `visualUrl` / `disabled`，**禁止写入 secret**）。 |
| `healthcheck.js` | 发送前探测 `HEAD /api/health`（500ms 超时，进程内缓存，失败 60s 冷却）。 |
| `safe.js` | 统一兜底工具 (safeCall, safeRequire)。 |

## 配置来源（优先级由高到低）

1. **环境变量**（临时调试、CI 注入首选）
2. **`~/.ai-spec-auto/config.json`**（用户主目录，个人本地覆盖，可存 secret）
3. **`bin/telemetry/defaults.json`**（仓库默认，跟随 npm 包发布；**仅放公开字段**）

### 可配置字段

| 字段 | 环境变量 | 用户配置 key | 仓库默认 | 说明 |
| --- | --- | --- | --- | --- |
| Visual 地址 | `AI_SPEC_VISUAL_URL` | `visualUrl` | `visualUrl` | 未设置/为空则不发请求 |
| 总开关 | `AI_SPEC_TELEMETRY_DISABLED=1` | `disabled: true` | `disabled` | 任一源为 true 即关闭 |
| 鉴权密钥 | `AI_SPEC_TELEMETRY_SECRET` | `secret` | **不支持** | 与服务端 `.env` 一致；仓库绝不写入 |
| 调试输出 | `AI_SPEC_TELEMETRY_DEBUG=1` | — | — | 仅环境变量，便于排查 |

### 用户配置示例

```jsonc
// ~/.ai-spec-auto/config.json
{
  "visualUrl": "http://127.0.0.1:3000",   // 本地联调时覆盖为本机
  "secret": "与服务端 .env 中的 AI_SPEC_TELEMETRY_SECRET 一致",
  "disabled": false
}
```

- 文件不存在或格式错误 → 静默回退到仓库默认，不影响 CLI。
- 权限建议：`chmod 600 ~/.ai-spec-auto/config.json`（含 secret 时）。

### 典型场景

| 场景 | 做法 |
| --- | --- |
| 使用线上 Visual（`82.156.14.216:3001`），无 secret | **什么都不用设**，装包即走仓库默认 |
| 使用线上 Visual + 需要 secret | 在 `~/.ai-spec-auto/config.json` 写入 `secret`，或导出 `AI_SPEC_TELEMETRY_SECRET` |
| 本地联调，想打到本机 Visual | `export AI_SPEC_VISUAL_URL=http://127.0.0.1:3000`（或写入用户配置） |
| 不想参与匿名统计 | `export AI_SPEC_TELEMETRY_DISABLED=1`（或用户配置 `disabled: true`） |
