# br-ai-spec 跨仓库协议

本目录冻结 br-ai-spec 输出给 engineered-spec-visual 和 skill-q-platform 的跨仓库协议。

## 输出清单

| 协议 | Schema | Fixture | 消费方 |
| --- | --- | --- | --- |
| RunEvent | `schemas/run-event.schema.json` | `fixtures/run-event.fixture.json` | engineered-spec-visual |
| EvidenceReport | `schemas/evidence-report.schema.json` | `fixtures/evidence-report.fixture.json` | engineered-spec-visual |
| AssetPackage | `schemas/asset-package.schema.json` | `fixtures/asset-package.fixture.json` | skill-q-platform / br-ai-spec |
| Manifest | `schemas/manifest.schema.json` | `fixtures/manifest.fixture.json` | br-ai-spec / skill-q-platform |
| AssetUsageFeedback | `schemas/asset-usage-feedback.schema.json` | `fixtures/asset-usage-feedback.fixture.json` | skill-q-platform |

## 差异收口

| 字段 | 任务包定义 | 当前实现 | 是否兼容 | 处理建议 |
| --- | --- | --- | --- | --- |
| RunEvent.eventType | `eventType` | 旧 Visual 上报使用 `type` | 兼容 | Connector 同时输出 `eventType` 与旧字段 `type` |
| RunEvent.timestamp | `timestamp` | 旧 Visual 上报使用 `occurredAt` | 兼容 | Connector 输出 `timestamp` 并保留 `occurredAt` |
| RunEvent.severity | `severity` | 旧 Visual 上报使用 `level` | 兼容 | Connector 输出 `severity` 并保留 `level` |
| EvidenceReport.finalStatus | `success/failure/blocked/unknown` | report 命令存在中文状态 | 兼容 | Connector 统一映射为英文枚举 |
| AssetPackage.files | `files` | Hub Export 资产可使用 `generatedFiles` 或 `installPath` | 兼容 | Connector 统一映射为 `files` |
| AssetUsageFeedback.metrics | `metrics` | 旧 runtime-feedback 使用 `result/issues/assetsUsed` | 兼容 | Connector 输出单资产反馈并保留摘要信息 |

## 隐私边界

协议 Payload 不允许包含密钥、原始 Prompt、完整源码、敏感日志和绝对路径。文件字段只能使用相对路径和摘要。
