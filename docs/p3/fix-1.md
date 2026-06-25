# P3.8 治理状态持久化与验收口径加固终版开发指令

你现在执行【P3.8：治理状态持久化与验收口径加固】。

本阶段目标不是开发 P4，也不是做 Visual 平台，而是把 P3 的审计日志从“内存模型”升级为“最小可恢复的 NDJSON 文件持久化模型”，并修正 P3 文档验收口径。

---

## 一、当前问题

P3 主体能力已经完成，但按企业级标准仍存在以下问题：

| 问题编号 | 问题描述 | 严重程度 | 是否必须修复 |
|---|---|---|---|
| P3.8-01 | audit-log.js 标题写“审计日志持久化”，但实际只写入内存数组 | 高 | 是 |
| P3.8-02 | AuditLog 不支持 storagePath，无法指定审计日志落盘路径 | 高 | 是 |
| P3.8-03 | AuditLog 不支持 loadExisting，重启后无法恢复历史审计记录 | 高 | 是 |
| P3.8-04 | record() 不会 append 到 NDJSON 文件 | 高 | 是 |
| P3.8-05 | clear() 只清内存，不清持久化文件 | 中高 | 是 |
| P3.8-06 | 文件中存在损坏 JSON 行时没有容错策略 | 中 | 是 |
| P3.8-07 | 敏感信息虽然在内存中红脱，但没有测试证明落盘内容也已红脱 | 高 | 是 |
| P3.8-08 | tests/governance/audit-log.test.js 缺少持久化回归测试 | 高 | 是 |
| P3.8-09 | tests/p3/p3-integration.test.js 缺少 P4 数据源可用性验证 | 中高 | 是 |
| P3.8-10 | docs/p3/P3-验收结果文档.md 对“持久化”的口径偏强 | 中 | 是 |
| P3.8-11 | docs/p3 中需要记录 npm run verify:p3 的真实结果 | 中 | 是 |

---

## 二、本阶段目标

完成以下能力：

1. AuditLog 支持 storagePath。
2. AuditLog 支持 loadExisting。
3. AuditLog 支持 appendOnRecord。
4. AuditLog 支持 NDJSON 文件持久化。
5. AuditLog 支持从 NDJSON 文件恢复历史记录。
6. AuditLog 支持坏行容错，并记录 loadErrors。
7. AuditLog clear() 同时清空内存和持久化文件。
8. AuditLog export("ndjson") 输出格式与持久化文件格式一致。
9. 敏感信息落盘前必须红脱。
10. 补齐持久化测试。
11. 补齐 P3 集成测试。
12. 更新 P3 文档验收口径。
13. npm run verify:p3 必须真实通过。

---

## 三、允许修改范围

只允许修改以下文件：

1. src/governance/audit-log.js
2. tests/governance/audit-log.test.js
3. tests/p3/p3-integration.test.js
4. docs/p3/P3-任务进度同步文档.md
5. docs/p3/P3-测试记录.md
6. docs/p3/P3-验收结果文档.md
7. package.json

允许新增文件：

1. tests/p3/p3-persistence.test.js

除上述文件外，不允许修改其他文件。

---

## 四、禁止事项

严格禁止：

1. 不允许开发 P4 Event Gateway。
2. 不允许开发 Visual Dashboard。
3. 不允许开发 Run Timeline。
4. 不允许开发质量指标看板。
5. 不允许引入数据库。
6. 不允许引入大型依赖。
7. 不允许重构 RBAC。
8. 不允许重构 Asset Review Workflow。
9. 不允许重构 Gray Release。
10. 不允许重构 Rollback。
11. 不允许重构 Security Policy Engine。
12. 不允许修改 P0 / P1 / P2 逻辑。
13. 不允许删除旧测试。
14. 不允许降低测试标准。
15. 不允许伪造测试结果。
16. 不允许把审计日志默认写入业务项目仓库。
17. 不允许把密钥、原始 Prompt、敏感日志写入 Git。
18. 不允许把当前能力描述成“完整数据库级审计平台”。

---

## 五、任务 P3.8.1：改造 AuditLog 构造函数

修改文件：

src/governance/audit-log.js

### 目标

AuditLog 构造函数支持以下参数：

| 参数 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| storagePath | string | null | 审计日志 NDJSON 文件路径 |
| loadExisting | boolean | true | 初始化时是否加载历史日志 |
| appendOnRecord | boolean | true | record() 时是否追加写入文件 |
| maxEntries | number | 10000 | 内存中最多保留条目数 |

### 实现要求

1. storagePath 为空时，保持当前纯内存模式。
2. storagePath 不为空时，使用该路径作为 NDJSON 审计日志文件。
3. loadExisting !== false 时，构造函数需要自动读取 storagePath 中的历史记录。
4. appendOnRecord !== false 时，record() 需要同步 append 到 storagePath。
5. 文件写入前必须确保父目录存在。
6. 不允许使用绝对项目路径作为默认 storagePath。
7. 不允许默认写入业务项目目录。
8. 不允许破坏现有 createAuditLog(options) API。

### 推荐字段

this.storagePath = options.storagePath || null
this.loadExisting = options.loadExisting !== false
this.appendOnRecord = options.appendOnRecord !== false
this.loadErrors = []

---

## 六、任务 P3.8.2：新增 loadFromFile()

修改文件：

src/governance/audit-log.js

### 目标

新增方法：

loadFromFile()

### 实现要求

1. storagePath 为空时直接返回空数组。
2. 文件不存在时不报错，保持 entries 为空。
3. 文件存在时按行读取。
4. 空行跳过。
5. 每一行按 JSON.parse 解析为一条审计记录。
6. 解析成功的记录写入 entries。
7. 解析失败的坏行不能导致整体失败。
8. 坏行信息写入 this.loadErrors。
9. loadErrors 至少包含 lineNumber、line、message。
10. 加载后需要更新 _nextEventId，避免新 eventId 与历史 eventId 冲突。
11. 加载后仍需遵守 maxEntries，只保留最后 maxEntries 条。

### eventId 恢复规则

历史 eventId 形如：

audit-1
audit-2
audit-99

重新加载后，_nextEventId 应设置为最大编号 + 1。

无法解析编号时忽略。

---

## 七、任务 P3.8.3：新增 appendToFile(entry)

修改文件：

src/governance/audit-log.js

### 目标

新增方法：

appendToFile(entry)

### 实现要求

1. storagePath 为空时不执行文件写入。
2. appendOnRecord 为 false 时不执行文件写入。
3. 写入前确保目录存在。
4. 以 NDJSON 格式追加一行。
5. 每条记录一行 JSON。
6. 行尾必须追加换行符。
7. 文件内容必须是已经红脱后的 entry。
8. 写入失败时抛出错误，不允许静默吞掉。
9. 不允许写入未红脱的原始 metadata。

---

## 八、任务 P3.8.4：改造 record()

修改文件：

src/governance/audit-log.js

### 当前行为

record() 当前只做：

1. 校验 eventType、severity、result。
2. 创建 entry。
3. 写入 this.entries。
4. 超过 maxEntries 时裁剪。
5. 返回 entry 副本。

### 新行为

record() 必须调整为：

1. 校验参数。
2. 创建已红脱的 entry。
3. 写入内存 entries。
4. 超过 maxEntries 时裁剪内存。
5. append 到 storagePath。
6. 返回 entry 副本。

### 注意

1. appendToFile(entry) 必须使用已经红脱后的 entry。
2. append 失败可以抛错。
3. append 失败时不要伪造成功结果。
4. 不能把未红脱信息写入文件。

---

## 九、任务 P3.8.5：改造 clear()

修改文件：

src/governance/audit-log.js

### 目标

clear() 同时支持清空内存和清空持久化文件。

### 实现要求

1. 清空 this.entries。
2. 重置 this._nextEventId = 1。
3. 清空 this.loadErrors。
4. storagePath 存在时，将文件内容写为空字符串。
5. storagePath 父目录不存在时，先创建目录。
6. clear() 不删除文件，只清空文件内容。

---

## 十、任务 P3.8.6：新增 getLoadErrors()

修改文件：

src/governance/audit-log.js

### 目标

提供坏行加载错误查询能力。

### 实现要求

新增方法：

getLoadErrors()

返回：

1. loadErrors 的副本。
2. 不允许返回内部数组引用。
3. 每个错误对象至少包含：
   - lineNumber
   - line
   - message

---

## 十一、任务 P3.8.7：保证 export("ndjson") 与文件格式一致

修改文件：

src/governance/audit-log.js

### 目标

export("ndjson") 输出格式必须与持久化文件格式一致。

### 实现要求

1. export("ndjson") 每条记录一行 JSON。
2. 行与行之间使用 \n。
3. 不需要最后强制换行。
4. 持久化文件每次 append 时可以带换行。
5. 从文件读取后再次 export("ndjson")，每一行都必须可 JSON.parse。
6. export("json") 保持原能力不变。

---

## 十二、任务 P3.8.8：补充 AuditLog 持久化单测

修改文件：

tests/governance/audit-log.test.js

### 必须新增测试用例

1. AuditLog 应在提供 storagePath 时写入 NDJSON 文件
2. AuditLog 应在重新创建实例时从 NDJSON 恢复历史记录
3. AuditLog 应在 loadExisting=false 时不加载历史记录
4. AuditLog 应跳过损坏的 NDJSON 行并记录 loadErrors
5. AuditLog clear 应同时清空内存和文件
6. AuditLog 持久化文件中不应包含未红脱敏感信息
7. AuditLog export("ndjson") 格式应与持久化文件行格式一致
8. 无 storagePath 时应保持原内存模式行为
9. AuditLog 从文件恢复后 eventId 应继续递增
10. AuditLog maxEntries 应同时约束加载后的内存条数

### 测试要求

1. 使用 os.tmpdir() 创建临时目录。
2. 不允许写入项目仓库。
3. 测试结束后清理临时目录。
4. 所有断言说明和 console 输出使用中文。
5. 不允许跳过旧测试。
6. 原有测试必须继续通过。

推荐临时目录规则：

使用 fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-audit-'))

---

## 十三、任务 P3.8.9：补充 P3 集成测试

修改文件：

tests/p3/p3-integration.test.js

### 新增用例

TC14：审计日志持久化可作为 P4 初始事件数据源

### 验证内容

1. 创建带 storagePath 的 AuditLog。
2. 写入 asset_change 事件。
3. 写入 security_scan 事件。
4. 写入 rollback 事件。
5. 确认 NDJSON 文件存在。
6. 确认 NDJSON 文件中每一行都能 JSON.parse。
7. 重新创建 AuditLog，使用同一个 storagePath。
8. 确认历史记录可恢复。
9. 查询 asset_change、security_scan、rollback 都能命中。
10. metadata 中的 token、password、secret 等字段已红脱。
11. export("ndjson") 可作为 P4 Event Gateway 初始输入格式。

### 完成标准

1. tests/p3/p3-integration.test.js 测试用例数量增加。
2. node ./tests/p3/p3-integration.test.js 通过。

---

## 十四、任务 P3.8.10：可选新增专项测试

允许新增文件：

tests/p3/p3-persistence.test.js

### 新增该文件的条件

当 audit-log.test.js 和 p3-integration.test.js 已经过长，允许把持久化专项测试单独拆出。

### 该文件必须覆盖

1. AuditLog 文件持久化。
2. AuditLog 重启恢复。
3. AuditLog 坏行容错。
4. AuditLog 红脱落盘。
5. AuditLog clear 清空文件。
6. AuditLog 作为 P4 初始数据源读取。

### 修改 package.json

新增该测试文件后，必须把它加入 test:p3。

---

## 十五、任务 P3.8.11：更新 package.json

修改文件：

package.json

### 要求

1. verify:p3 必须继续包含：
   - npm run test:registry
   - npm run test:runtime
   - npm run test:p1
   - npm run test:p2
   - npm run test:p3
   - npm pack --dry-run

2. 不允许删除现有脚本。

3. 如果新增 tests/p3/p3-persistence.test.js，test:p3 必须追加：
   - node ./tests/p3/p3-persistence.test.js

4. 不允许把 verify:p3 简化为只跑 P3 测试。

---

## 十六、任务 P3.8.12：更新 P3 文档

修改文件：

1. docs/p3/P3-任务进度同步文档.md
2. docs/p3/P3-测试记录.md
3. docs/p3/P3-验收结果文档.md

### 1. 更新 P3-任务进度同步文档.md

新增小阶段：

P3.8 治理状态持久化与验收口径加固

记录内容：

1. AuditLog 支持 storagePath。
2. AuditLog 支持 NDJSON 文件持久化。
3. AuditLog 支持 loadExisting。
4. AuditLog 支持 appendOnRecord。
5. AuditLog 支持坏行容错和 loadErrors。
6. AuditLog 支持 clear 清空文件。
7. AuditLog 持久化测试已补充。
8. P3 验收口径已修正。
9. P4 可基于 NDJSON 审计日志作为初始事件数据源。

状态规则：

只有真实测试通过后，才能写“已完成”。

### 2. 更新 P3-测试记录.md

新增 P3.8 测试记录。

必须记录以下命令：

1. node ./tests/governance/audit-log.test.js
2. node ./tests/p3/p3-integration.test.js
3. node ./tests/p3/p3-persistence.test.js
4. npm run test:p3
5. npm run verify:p3

没有新增 tests/p3/p3-persistence.test.js 时，在记录中说明“未新增，持久化测试已合并到 audit-log.test.js 和 p3-integration.test.js”。

测试结果必须是真实执行结果。

### 3. 更新 P3-验收结果文档.md

修正 P3.3 口径：

将“审计日志持久化”明确为：

审计日志内存模型 + NDJSON 最小文件持久化

必须增加说明：

1. P3.8 之前是内存审计日志 + 导出能力。
2. P3.8 之后支持最小文件持久化。
3. 当前不是数据库级审计系统。
4. 当前不是完整企业审计平台。
5. 当前满足 P4 Visual 可观测的初始事件数据源要求。
6. npm run verify:p3 已真实执行并通过后，才允许进入 P4。

---

## 十七、必须执行的测试命令

完成修改后，必须按顺序执行：

1. node ./tests/governance/audit-log.test.js
2. node ./tests/p3/p3-integration.test.js
3. npm run test:p3
4. npm run verify:p3

新增 tests/p3/p3-persistence.test.js 时，还必须执行：

node ./tests/p3/p3-persistence.test.js

所有真实测试结果必须写入：

1. docs/p3/P3-测试记录.md
2. docs/p3/P3-任务进度同步文档.md
3. docs/p3/P3-验收结果文档.md

---

## 十八、验收标准

### 功能验收

1. createAuditLog() 不传 storagePath 时，保持内存模式。
2. createAuditLog({ storagePath }) 可以写入 NDJSON 文件。
3. createAuditLog({ storagePath, loadExisting: true }) 可以恢复历史日志。
4. createAuditLog({ storagePath, loadExisting: false }) 不加载历史日志。
5. record() 会把已红脱 entry append 到文件。
6. clear() 会清空内存和文件。
7. getLoadErrors() 可以返回坏行加载错误。
8. export("ndjson") 格式和持久化文件格式一致。
9. maxEntries 对加载后的 entries 仍然生效。
10. eventId 从文件恢复后继续递增。

### 安全验收

1. password 不得明文落盘。
2. token 不得明文落盘。
3. secret 不得明文落盘。
4. api_key 不得明文落盘。
5. private_key 不得明文落盘。
6. access_key 不得明文落盘。
7. 原始 Prompt 不得写入审计文件。
8. 审计文件默认不得写入项目仓库。

### 测试验收

1. node ./tests/governance/audit-log.test.js 通过。
2. node ./tests/p3/p3-integration.test.js 通过。
3. npm run test:p3 通过。
4. npm run verify:p3 通过。
5. P0 / P1 / P2 回归不被破坏。

### 文档验收

1. P3.8 已写入任务进度同步文档。
2. P3.8 测试结果已写入测试记录。
3. P3.8 结论已写入验收结果文档。
4. verify:p3 真实执行结果已记录。
5. 文档不得宣称已经完成数据库级审计平台。
6. 文档必须明确“允许进入 P4”的依据是 P3.8 和 verify:p3 通过。

---

## 十九、最终输出要求

完成后请输出：

1. 修改文件清单。
2. 每个文件的修改摘要。
3. AuditLog 新增参数说明。
4. AuditLog 新增方法说明。
5. 新增测试用例清单。
6. 实际执行的测试命令。
7. 每条测试命令的真实结果。
8. 文档更新摘要。
9. 是否存在遗留问题。
10. 是否建议进入 P4。

最终结论必须使用以下格式：

P3.8：已完成 / 未完成

P3 企业级治理基线：通过 / 未通过

是否允许进入 P4：允许 / 不允许

如果 npm run verify:p3 没有真实通过，不允许输出“允许进入 P4”。

---

## 二十、特别强调

P3.8 只做企业治理基线加固。

不要提前做 P4。

不要为了赶进度跳过测试。

不要为了测试通过删除测试。

不要把“内存 + 导出”继续包装成“持久化”。

本阶段真正完成的标准只有一个：

AuditLog 具备最小 NDJSON 文件持久化、重启恢复、坏行容错、敏感信息红脱落盘、verify:p3 全量通过。

完成后才允许正式进入 P4。