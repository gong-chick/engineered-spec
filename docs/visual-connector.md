# Visual Connector 说明

本模块只属于 br-ai-spec 的连接器能力，不实现 Collector API(采集器接口)服务端，也不实现 Run Timeline(运行时间线)、Dashboard(看板)、Metrics(指标)或 RiskBoard(风险看板)页面。

## 模块位置

| 文件 | 说明 |
| --- | --- |
| `src/connectors/visual/run-event.js` | 将旧运行事件映射为冻结的 RunEvent 协议，同时保留旧字段兼容 |
| `src/connectors/visual/evidence-report.js` | 将 EvidenceReport 状态统一为 `success/failure/blocked/unknown` |
| `src/connectors/visual/queue.js` | Visual 不可用时写入 `~/.ai-spec-auto/visual-queue/` |
| `src/connectors/visual/visual-connector.js` | 封装 Visual 上报、脱敏、失败队列和非阻塞结果 |
| `src/visual/visual-reporter.js` | 复用连接器处理 `run-event` 上报 |

## 数据流

1. CLI(命令行接口) / Runtime(运行时) 产生旧事件结构。
2. `normalizeRunEvent` 输出冻结协议字段：`eventId`、`runId`、`projectId`、`eventType`、`stage`、`status`、`severity`、`message`、`timestamp`、`metadata`。
3. `VisualClient` 复用现有 `PrivacyFilter` 做脱敏和隐私校验。
4. 上报成功返回 `{ ok: true }`。
5. 网络或服务端失败写入 `~/.ai-spec-auto/visual-queue/`，并返回 `{ ok: false, skipped: true, queued: true }`，不阻塞核心 CLI 执行。
6. 隐私策略失败不会写入队列，避免把敏感 Payload 落盘。

## 兼容策略

RunEvent 同时保留旧字段 `type`、`level`、`occurredAt`，避免破坏现有测试和旧 Collector。

## 测试

已覆盖：

1. `node tests/connectors/visual-connector.test.js`
2. `node tests/visual/run-event-report.test.js`
3. `node tests/visual/visual-client.test.js`
4. `npm run test:runtime`
5. `npm run test:p4`
