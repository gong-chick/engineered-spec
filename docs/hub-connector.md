# Hub Connector 说明

本模块只属于 br-ai-spec 的 Hub Connector(资产中心连接器)能力，不实现 Asset Hub(资产中心)数据库模型、审核后台、发布后台、评分后台或组织级资产主数据。

## 模块位置

| 文件 | 说明 |
| --- | --- |
| `src/connectors/hub/asset-package.js` | 将 Hub 资产结构映射为冻结的 AssetPackage 协议 |
| `src/connectors/hub/asset-usage-feedback.js` | 输出 AssetUsageFeedback 协议 |
| `src/connectors/hub/hub-connector.js` | 封装资产搜索和协议映射 |
| `bin/hub-command.js` | 既有 `search/install/sync/upgrade/rollback/runtime-report` 命令，保持兼容 |

## 能力边界

1. 支持 `hub search` 搜索资产。
2. 支持 `hub install` 安装资产，并校验 checksum(校验和)。
3. 支持 `hub sync` 同步资产。
4. 支持 `hub upgrade` 升级资产。
5. 支持 `hub rollback` 基于 lock(锁文件)回滚。
6. 支持 AssetPackage 协议映射，兼容 `generatedFiles`、`files`、`installPath`。
7. 支持 AssetUsageFeedback 协议输出，供 skill-q-platform P5 消费。
8. 不缓存密钥、原始 Prompt(提示词)、完整源码或敏感日志。

## 兼容策略

现有 `bin/hub-command.js` 继续作为 CLI 入口；新增 `src/connectors/hub/` 只提供跨仓库协议映射与连接器能力，不替换现有安装流程。

## 测试

已覆盖：

1. `node tests/connectors/hub-connector.test.js`
2. `node tests/runtime/hub-install.test.js`
3. `node tests/runtime/hub-diff.test.js`
4. `node tests/runtime/hub-upgrade-rollback.test.js`
5. `node tests/runtime/hub-runtime-report.test.js`
6. `npm run test:p5`
