# 多仓库第一阶段跨仓协议冻结与差异报告

执行时间：2026-05-07 13:28:00 CST  
目标仓库：/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec  
协议来源优先级：多仓库执行任务包 `05-跨仓库协议与样例数据/`

## 1. 协议冻结结论

第一阶段先冻结最小跨仓协议，不改业务逻辑。后续 `br-ai-spec`、`engineered-spec-visual`、`skill-q-platform` 均应以多仓任务包字段为外部契约基线，并通过兼容映射读取当前 `br-ai-spec` 已有字段。

当前任务包协议目录包含：

| 文件 | 状态 | 用途 |
| --- | --- | --- |
| `run-event.fixture.json` | 存在 | Visual Collector 接收运行事件样例 |
| `evidence-report.fixture.json` | 存在 | Visual 展示 Evidence Report 样例 |
| `asset-package.fixture.json` | 存在 | Hub 资产包样例 |
| `manifest.fixture.json` | 存在 | 安装清单样例 |
| `asset-usage-feedback.fixture.json` | 存在 | 资产使用反馈样例 |
| `协议字段说明.md` | 存在 | 字段说明 |
| `run-event.schema.json` | 缺失 | 用户要求点名文件，当前任务包未提供 |

## 2. RunEvent 差异表

| 字段 | 任务包定义 | 当前实现 | 是否兼容 | 处理建议 |
| --- | --- | --- | --- | --- |
| `eventId` | 必填 string，如 `evt_001` | `src/visual/event-gateway.js` 自动生成 `evt-1`；`event-mapper.js` 生成 `<runId>:<type>:<index>` | 部分兼容 | B1.4 统一输出格式并保留旧格式读取 |
| `runId` | 必填 string | EventGateway 可空；RunService 必有 `runId` | 部分兼容 | 上报协议强制非空，本地历史兼容空值 |
| `projectId` | 必填 string | EventGateway 可回退默认；event-mapper 从 project state 读取 | 部分兼容 | Connector 上报前补齐 |
| `eventType` | 必填 string | EventGateway 使用 `eventType`；event-mapper 使用 `type` | 部分兼容 | 对外统一为 `eventType`，兼容读取 `type` |
| `stage` | 必填 string | 已有 `stage`，但枚举限制为 P0 阶段；RunService 可能为 `initialized` 等状态 | 部分兼容 | Visual 侧未知 stage 展示为 `other` |
| `status` | `success/failure/running/skipped/unknown` | EventGateway 是 `success/failed/blocked/skipped` | 不完全兼容 | 增加 `failed -> failure`、`blocked -> failure/blocking` 映射 |
| `severity` | 可选，默认 `info` | EventGateway 必填 | 部分兼容 | 对外允许缺省，本地补默认值 |
| `message` | 可选，需脱敏 | 已脱敏 | 兼容 | 保持 |
| `timestamp` | 必填 ISO | EventGateway 使用 `timestamp`；event-mapper 使用 `occurredAt` | 部分兼容 | 对外统一 `timestamp`，兼容 `occurredAt` |
| `metadata` | 可选 object，不含源码/密钥/原始 Prompt | EventGateway 支持并调用 `redactObject` | 兼容 | 保持脱敏与可序列化校验 |

## 3. EvidenceReport 差异表

| 字段 | 任务包定义 | 当前实现 | 是否兼容 | 处理建议 |
| --- | --- | --- | --- | --- |
| `runId` | 必填 | `bin/report-command.js` 输出 | 兼容 | 保持 |
| `projectId` | 必填 | 从 `.ai-spec/config.json` 读取，可能为空 | 部分兼容 | 输出前校验并给出明确错误或默认项目 ID |
| `taskId` | 可选 | 当前等于 `runId` | 兼容 | 保持可选 |
| `specId` | 可选 | 当前等于 `runId` | 兼容 | 保持可选 |
| `changedFiles` | 可选 array，不含源码 | 当前从 executor result 读取，形态未强制统一 | 部分兼容 | B1.4 统一为 `{path, changeType, summary}`，强制相对路径 |
| `testResults` | 可选 array | 当前从 events 提取 | 兼容 | 状态枚举需统一 |
| `hookResults` | 可选 array | 当前从 events 提取 | 兼容 | 状态枚举需统一 |
| `repairResults` | 可选 array | 当前从 repair-history 读取 | 兼容 | 保持 |
| `reviewResults` | 可选 array | 当前固定空数组 | 占位 | B1.1/B1.2 明确来源或保持可选 |
| `finalStatus` | `success/failure/blocked/unknown` | 当前为 `通过/阻塞/失败/待执行` | 不兼容 | 增加对外标准枚举，中文展示放到 `message` 或 UI |

## 4. AssetPackage 差异表

| 字段 | 任务包定义 | 当前实现 | 是否兼容 | 处理建议 |
| --- | --- | --- | --- | --- |
| `assetId` | 必填 | 已有 | 兼容 | 保持 |
| `assetType` | `rule/skill/agentProfile/workflow/hook/command` | 当前还包含 `memory/config/adapter/other`，缺少 `workflow` | 部分兼容 | 对外按任务包枚举，内部保留扩展值 |
| `name` | 必填 | `src/asset/asset-package.js` 缺失，registry 有 `name` | 不完全兼容 | Hub 导出时补 `name` |
| `version` | 必填 semver | 已有 | 兼容 | 保持 semver 校验 |
| `source` | 必填，如 `skill-q-platform` | 当前枚举为 `local/hub/template` | 部分兼容 | 允许 `skill-q-platform` 映射到 `hub` |
| `checksum` | 必填 sha256 | 已有但未统一 `sha256:` 前缀 | 部分兼容 | B1.4 统一为 `sha256:<hash>` |
| `compatibility` | 可选 object | 当前缺失 | 不兼容 | 新增可选字段，旧版本忽略 |
| `files` | 必填 array | 当前使用 `generatedFiles` | 不兼容 | 兼容读取 `generatedFiles`，对外输出 `files` |
| `metadata` | 可选 object | 当前 registry 支持 `metadata` 并脱敏 | 兼容 | 保持 |

## 5. Manifest 差异表

| 字段 | 任务包定义 | 当前实现 | 是否兼容 | 处理建议 |
| --- | --- | --- | --- | --- |
| `version` | 必填 | 已有 | 兼容 | 保持 |
| `rules` | 可选 array | 已有 | 兼容 | 保持 |
| `skills` | 可选 array | 已有 | 兼容 | 保持 |
| `agentProfiles` | 可选 array | 已有 | 兼容 | 保持 |
| `commands` | 可选 array | 已有 | 兼容 | 保持 |
| `hooks` | 可选 array | 已有 | 兼容 | 保持 |
| `adapters` | 必填 object，示例为 boolean | 当前为 `{enabled, outputDir}` 对象 | 部分兼容 | 对外 Fixture 可保留 boolean 简写，导出时支持对象详情 |
| `checksum` | 可选 | 已有 | 兼容 | 统一 sha256 表达 |
| `generatedAt` | 必填 ISO | 已有 | 兼容 | 保持 |
| `projectId/profile/profiles/manifestSlug` | 任务包未列 | 当前已有 | 兼容扩展 | 作为内部扩展字段保留 |

## 6. AssetUsageFeedback 差异表

| 字段 | 任务包定义 | 当前实现 | 是否兼容 | 处理建议 |
| --- | --- | --- | --- | --- |
| `feedbackId` | 必填 | 当前 RuntimeFeedbackReporter 未生成 | 不兼容 | B1.3 生成稳定反馈 ID |
| `runId` | 必填 | 已有 | 兼容 | 保持 |
| `projectId` | 必填 | 已有但可能为空 | 部分兼容 | 上报前补齐 |
| `assetId` | 必填 | 当前使用 `assetsUsed[]` | 不兼容 | 按资产拆分反馈或增加 batch 协议 |
| `assetType` | 必填 | 当前未包含 | 不兼容 | 从 hub-lock 资产补齐 |
| `status` | 必填 | 当前在 `result.status` | 部分兼容 | 映射到顶层 |
| `metrics` | object | 当前是 `result/issues/assetsUsed` | 不完全兼容 | 统一输出 adopted/hookBlocked/testPassed 等指标 |
| `timestamp` | 必填 ISO | 当前未固定 | 不兼容 | 上报时补齐 |

## 7. 冻结建议

1. Visual 后续以 `RunEvent`、`EvidenceReport`、`ProjectState`、`History`、`Incident` 五类输入为主。
2. Hub 后续以 `AssetPackage`、`Manifest`、`Lock`、`AssetUsageFeedback` 四类输入为主。
3. 任务包缺失的 `run-event.schema.json` 不应在第一阶段臆造为已存在；建议 B1.4 根据本差异报告生成 JSON Schema(模式文件) 和 Fixture(样例数据)。
4. 所有跨仓输出不得包含原始 Prompt、完整源码、密钥、敏感日志和绝对路径；`changedFiles` 只能包含相对路径与摘要。

