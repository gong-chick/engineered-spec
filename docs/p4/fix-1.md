# P4.8 可观测可靠性与风险语义加固开发指令

你现在执行【P4.8：可观测可靠性与风险语义加固】。

本阶段只修复 P4 阶段的非阻塞加固问题，不开发 P5，不开发 Asset Hub，不开发资产市场，不做 UI 页面。

---

## 一、阶段目标

完成以下 4 件事：

1. 增强 `EventGateway` 的错误可见性。
2. 增强 `EventGateway` 的文件清理能力。
3. 统一 `RiskBoard` 的 `severity` 与 `riskLevel` 语义。
4. 补充测试与文档，确保 `npm run verify:p4` 全量通过。

---

## 二、允许修改范围

只允许修改以下文件：

1. `src/visual/event-gateway.js`
2. `src/visual/risk-board.js`
3. `tests/visual/event-gateway.test.js`
4. `tests/visual/risk-board.test.js`
5. `tests/p4/p4-integration.test.js`
6. `docs/p4/P4-任务进度同步文档.md`
7. `docs/p4/P4-测试记录.md`
8. `docs/p4/P4-验收结果文档.md`

一般不需要修改 `package.json`。

如果新增测试文件，只允许新增：

1. `tests/p4/p4-reliability.test.js`

如果新增该文件，必须同步加入 `package.json` 的 `test:p4`。

---

## 三、禁止事项

严格禁止：

1. 不允许开发 P5。
2. 不允许开发 Asset Hub。
3. 不允许开发资产市场。
4. 不允许开发 UI 页面。
5. 不允许引入数据库。
6. 不允许引入大型依赖。
7. 不允许修改 P0 / P1 / P2 / P3 逻辑。
8. 不允许修改 `AuditLog`。
9. 不允许修改 Agent Runtime。
10. 不允许修改 Asset Package。
11. 不允许删除旧测试。
12. 不允许降低测试标准。
13. 不允许伪造测试结果。
14. 不允许把敏感信息、密钥、原始 Prompt 写入持久化文件。
15. 不允许把 P4 描述成完整生产级监控平台。

---

## 四、任务 1：增强 EventGateway 错误可见性

修改文件：

- `src/visual/event-gateway.js`

### 1. 新增内部字段

在构造函数中新增：

- `this._loadErrors = []`
- `this._writeErrors = []`
- `this._throwOnWriteError = options.throwOnWriteError === true`

### 2. 新增方法

新增：

- `getLoadErrors()`
- `getWriteErrors()`

要求：

1. 返回数组副本。
2. 不允许返回内部数组引用。
3. `loadErrors` 至少包含：
   - `type`
   - `message`
   - `timestamp`
   - `lineNumber`
   - `line`
4. `writeErrors` 至少包含：
   - `type`
   - `message`
   - `timestamp`

### 3. 行为要求

1. `_loadFromFile()` 遇到坏行时，不允许静默跳过，必须记录到 `_loadErrors`。
2. `_appendToFile()` 写入失败时，不允许静默吞掉，必须记录到 `_writeErrors`。
3. 默认 `throwOnWriteError = false`，写入失败不抛错，但必须记录错误。
4. 当 `throwOnWriteError = true` 时，写入失败必须抛出异常。
5. 写入失败不能影响内存事件查询。
6. 不允许把未脱敏内容写入文件。

---

## 五、任务 2：增强 EventGateway clear()

修改文件：

- `src/visual/event-gateway.js`

### 1. 改造 clear 方法

将原来的 `clear()` 改造为：

- `clear(options = {})`

支持：

- `gateway.clear()`
- `gateway.clear({ clearFile: true })`

### 2. 行为要求

1. `clear()` 默认只清内存，保持兼容。
2. `clear({ clearFile: true })` 同时清空内存和持久化文件。
3. 清空文件时不删除文件，只写空字符串。
4. 清空文件失败时记录到 `_writeErrors`。
5. 如果 `throwOnWriteError = true`，清空文件失败时必须抛出异常。
6. 清空后事件 ID 重新从 1 开始。

---

## 六、任务 3：统一 RiskBoard 风险语义

修改文件：

- `src/visual/risk-board.js`

### 1. 当前问题

事件 `severity` 使用：

| severity |
|---|
| `info` |
| `warn` |
| `error` |
| `blocking` |

风险等级 `riskLevel` 使用：

| riskLevel |
|---|
| `low` |
| `medium` |
| `high` |
| `critical` |

当前两套语义不完全一致，可能导致 `topRisks` 排序不稳定。

### 2. 新增函数

新增：

- `mapSeverityToRiskLevel(severity)`
- `getRiskLevelRank(riskLevel)`

### 3. severity 到 riskLevel 映射规则

| severity | riskLevel |
|---|---|
| `info` | `low` |
| `warn` | `medium` |
| `error` | `high` |
| `blocking` | `critical` |
| `low` | `low` |
| `medium` | `medium` |
| `high` | `high` |
| `critical` | `critical` |
| 其他 | `low` |

### 4. 风险等级排序规则

| riskLevel | rank |
|---|---:|
| `low` | 0 |
| `medium` | 1 |
| `high` | 2 |
| `critical` | 3 |

### 5. 改造要求

1. `RiskBoard` 内部统一使用 `riskLevel`。
2. `topRisks` 按 `critical > high > medium > low` 排序。
3. 可以保留原始 `severity` 字段，但必须补充或统一 `riskLevel` 字段。
4. 不允许破坏已有 `getRiskSummary()` 输出结构。
5. 新增函数需要导出，方便测试和后续 P5 资产评分复用。

---

## 七、任务 4：补充 EventGateway 测试

修改文件：

- `tests/visual/event-gateway.test.js`

至少新增以下测试用例：

1. `EventGateway 应记录坏行 loadErrors`
2. `EventGateway getLoadErrors 应返回副本`
3. `EventGateway 写入失败时应记录 writeErrors`
4. `EventGateway getWriteErrors 应返回副本`
5. `EventGateway throwOnWriteError=true 时写入失败应抛错`
6. `EventGateway clear 默认只清内存不清文件`
7. `EventGateway clear({ clearFile: true }) 应清空文件`
8. `EventGateway 写入失败不应影响内存查询`
9. `EventGateway 文件坏行不应影响正常事件恢复`

测试要求：

1. 使用临时目录。
2. 不写入项目仓库。
3. 测试结束后清理临时目录。
4. 不删除旧测试。
5. 所有断言说明和输出使用中文。

---

## 八、任务 5：补充 RiskBoard 测试

修改文件：

- `tests/visual/risk-board.test.js`

至少新增以下测试用例：

1. `info 应映射为 low`
2. `warn 应映射为 medium`
3. `error 应映射为 high`
4. `blocking 应映射为 critical`
5. `low / medium / high / critical 应保持原语义`
6. `未知 severity 应降级为 low`
7. `getRiskLevelRank 应返回稳定排序权重`
8. `topRisks 应按 critical / high / medium / low 排序`
9. `getRiskSummary 应返回统一 riskLevel`

---

## 九、任务 6：补充 P4 集成测试

修改文件：

- `tests/p4/p4-integration.test.js`

新增用例：

- `TC16：EventGateway 错误可见性与 RiskBoard 风险语义一致性`

验证内容：

1. `EventGateway` 读取包含坏行的 NDJSON 文件。
2. `getLoadErrors()` 能获取坏行错误。
3. `EventGateway` 写入失败时能记录 `writeErrors`。
4. `RiskBoard` 能把 `blocking` 映射为 `critical`。
5. `RiskBoard topRisks` 排序稳定。
6. 正常事件不受坏行影响，仍可被 P4 模块消费。

---

## 十、任务 7：更新 P4 文档

修改文件：

1. `docs/p4/P4-任务进度同步文档.md`
2. `docs/p4/P4-测试记录.md`
3. `docs/p4/P4-验收结果文档.md`

### 1. 进度文档新增

新增小阶段：

- `P4.8 可观测可靠性与风险语义加固`

记录内容：

1. `EventGateway` 支持 `loadErrors`。
2. `EventGateway` 支持 `writeErrors`。
3. `EventGateway` 支持 `throwOnWriteError`。
4. `EventGateway` 支持 `clear({ clearFile: true })`。
5. `RiskBoard` 统一 `severity` 到 `riskLevel` 映射。
6. `RiskBoard topRisks` 排序修复。
7. `npm run verify:p4` 全量通过。

### 2. 测试记录新增

记录以下命令的真实执行结果：

- `node ./tests/visual/event-gateway.test.js`
- `node ./tests/visual/risk-board.test.js`
- `node ./tests/p4/p4-integration.test.js`
- `npm run test:p4`
- `npm run verify:p4`

没有真实执行，不允许写“通过”。

### 3. 验收文档补充

补充说明：

1. P4.8 之前：`EventGateway` 有基础 NDJSON 能力，但错误可见性不足。
2. P4.8 之后：`EventGateway` 支持加载错误、写入错误、严格写入策略和可选文件清理。
3. P4.8 之前：`RiskBoard` 的 `severity` 与 `riskLevel` 语义不完全一致。
4. P4.8 之后：统一 `severity -> riskLevel` 映射，风险排序稳定。
5. 当前 P4 仍不是完整生产级 APM / Sentry / BI 平台。
6. 当前满足 P5 资产质量评分和反馈闭环的数据可靠性要求。

---

## 十一、必须执行的测试命令

完成修改后，按顺序执行：

1. `node ./tests/visual/event-gateway.test.js`
2. `node ./tests/visual/risk-board.test.js`
3. `node ./tests/p4/p4-integration.test.js`
4. `npm run test:p4`
5. `npm run verify:p4`

如果新增了 `tests/p4/p4-reliability.test.js`，还必须执行：

1. `node ./tests/p4/p4-reliability.test.js`

---

## 十二、验收标准

### 1. 功能验收

1. `EventGateway` 可记录加载错误。
2. `EventGateway` 可记录写入错误。
3. `EventGateway` 可查询 `getLoadErrors()`。
4. `EventGateway` 可查询 `getWriteErrors()`。
5. `EventGateway` 支持 `throwOnWriteError`。
6. `EventGateway clear()` 默认只清内存。
7. `EventGateway clear({ clearFile: true })` 可清空持久化文件。
8. `EventGateway` 坏行不影响正常事件恢复。
9. `RiskBoard` 支持 `mapSeverityToRiskLevel()`。
10. `RiskBoard` 支持 `getRiskLevelRank()`。
11. `RiskBoard topRisks` 排序稳定。
12. `RiskBoard` 输出风险语义一致。

### 2. 测试验收

1. `node ./tests/visual/event-gateway.test.js` 通过。
2. `node ./tests/visual/risk-board.test.js` 通过。
3. `node ./tests/p4/p4-integration.test.js` 通过。
4. `npm run test:p4` 通过。
5. `npm run verify:p4` 通过。
6. P0 / P1 / P2 / P3 回归不被破坏。

### 3. 文档验收

1. P4.8 已写入任务进度同步文档。
2. P4.8 测试结果已写入测试记录。
3. P4.8 结论已写入验收结果文档。
4. 文档不得宣称 P4 是完整生产级监控平台。
5. 文档必须明确 P4.8 是为 P5 资产质量评分和反馈闭环加固数据可靠性。

---

## 十三、最终输出要求

完成后输出：

1. 修改文件清单。
2. 每个文件的修改摘要。
3. `EventGateway` 新增参数和方法说明。
4. `RiskBoard` 风险语义映射说明。
5. 新增测试用例清单。
6. 实际执行的测试命令。
7. 每条测试命令的真实结果。
8. 文档更新摘要。
9. 是否存在遗留问题。
10. 是否建议进入 P5。

最终结论必须使用：

- `P4.8：已完成 / 未完成`
- `P4 可观测可靠性基线：通过 / 未通过`
- `是否允许进入 P5：允许 / 不允许`

如果 `npm run verify:p4` 没有真实通过，不允许输出“允许进入 P5”。