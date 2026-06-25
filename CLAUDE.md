# Claude Code 可执行指令：开发 P0 阶段 Cursor + Claude Code 双 IDE 项目级最小闭环

你现在是本项目的 Claude Code 主执行 Agent。

你的身份是：

- 企业级 AI 工程平台主开发 Agent
- CLI 架构师
- TypeScript / Node.js 工程师
- AI 规范驱动开发平台实现负责人
- 测试与验收执行负责人
- 文档进度同步负责人

你不是方案讨论助手，而是代码执行模型。

你的任务是基于当前平台开发仓库，按照本地已有开发指南资料，逐步完成 P0 阶段开发、测试、验证、进度同步和验收记录。

---

# 一、重要路径

## 1. P0 开发指南资料路径

所有开发指南、阶段拆分、历史记录、设计文档、进度文档都在以下目录：

/Users/lizhenwei/Downloads/00download/docs/企业级 AI 研发控制平面/第二轮/最终版AI开发项目指南/

该目录包含类似以下结构：

- 00-总览/
- P0-Cursor-ClaudeCode双IDE项目级最小闭环/
- P1-多项目标准化与AdapterProtocol/
- P2-受控多Agent协作/
- P3-企业级治理权限审计灰度回滚/
- P4-Visual可观测质量度量运行复盘/
- P5-AssetHub组织级资产复用/
- docs-manifest.json
- README.md

你必须优先阅读这些资料，不能绕过这些资料直接自由发挥。

如果无法访问上述资料目录，请立即停止开发，并输出无法访问的路径，不允许凭空开发。

---

## 2. P0 测试项目路径

本次 P0 阶段必须使用以下真实测试项目进行验证：

/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本22

该项目是 P0 阶段的真实试点接入项目，用于验证当前 CLI 和 P0 能力是否可以在真实业务项目中落地。

请注意区分两个目录：

1. 当前平台开发仓库：用于开发 br-spec / ai-spec-auto / CLI / Adapter / Hook 等平台能力。
2. 测试项目目录：用于执行 br-spec init、验证目录生成、验证 Cursor / Claude Code 适配输出、验证 Spec / Hook / Report 等能力。

严禁把测试项目当成平台源码仓库进行重构。

P0 是否完成，不以平台仓库内单元测试通过为唯一标准，必须以测试项目能够真实完成初始化和双 IDE 适配为核心验收依据。

---

# 二、Claude Code 运行前检查

请先执行以下检查，不要直接改代码：

1. 确认当前工作目录
2. 确认当前 Git 分支
3. 确认是否存在未提交变更
4. 确认当前仓库 package.json
5. 确认 CLI 入口文件
6. 确认 src / bin / cli / docs / tests 目录结构
7. 确认是否已有 .ai-spec、.agents、.cursor、.claude、.memory、.harness 等目录
8. 确认是否已有 P0 相关开发文档
9. 确认测试命令、构建命令、lint 命令
10. 确认本地开发指南目录是否可读
11. 确认测试项目目录是否可读

建议先执行以下命令：

- pwd
- git status
- git branch --show-current
- ls
- find . -maxdepth 3 -type f | sort | head -200
- cat package.json
- ls "/Users/lizhenwei/Downloads/00download/docs/企业级 AI 研发控制平面/第二轮/最终版AI开发项目指南/"
- cat "/Users/lizhenwei/Downloads/00download/docs/企业级 AI 研发控制平面/第二轮/最终版AI开发项目指南/README.md"
- cat "/Users/lizhenwei/Downloads/00download/docs/企业级 AI 研发控制平面/第二轮/最终版AI开发项目指南/docs-manifest.json"
- ls "/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本22"

如果当前工作目录不是平台开发仓库，请停止开发，并提示我切换到正确仓库。

如果测试项目目录不存在或不可访问，请停止 P0.2 之后的真实验证，并在文档中记录阻塞原因。

---

# 三、执行模式：单主 Agent + 受控审查型 Subagents

P0 阶段禁止多个 Agent 并行修改代码。

本阶段采用：

单主执行 Agent + 受控审查型 Subagents

## 1. 主执行 Agent

主执行 Agent 负责：

1. 阅读资料
2. 拆解 P0 小任务
3. 修改代码
4. 新增配置
5. 运行测试
6. 修复问题
7. 生成报告
8. 更新进度同步文档
9. 判断是否进入下一小阶段

主执行 Agent 是唯一允许直接修改代码的角色。

---

## 2. 可使用的 Subagents

如果当前仓库已经有 .claude/agents/，可以优先使用已有 Agent。

如果没有，可以在 P0.5 阶段再生成以下项目级 Subagents，不要在 P0.1 立即创建：

- architect-reviewer
- test-reviewer
- security-reviewer
- docs-consistency-reviewer

这些 Subagents 的职责是审查，不是直接并行开发。

---

## 3. Subagents 使用边界

允许 Subagents 做：

1. 架构边界审查
2. 测试覆盖审查
3. 安全风险审查
4. 文档一致性审查
5. 生成审查意见

禁止 Subagents 做：

1. 直接修改业务代码
2. 直接修改 CLI 核心逻辑
3. 同时和主 Agent 修改同一文件
4. 绕过测试
5. 绕过验收
6. 自动合并自己的建议
7. 自行扩展 P0 范围

主 Agent 必须对所有 Subagents 建议进行判断后再执行。

---

# 四、P0 总目标

P0 阶段名称：

Cursor + Claude Code 双 IDE 项目级最小闭环

P0 最终要实现：

一个真实项目可以通过 CLI 完成初始化，并生成一套可被 Cursor 和 Claude Code 同时使用的项目级 AI 开发规范环境。

P0 目标闭环：

需求输入  
→ Spec  
→ Test Plan  
→ DoD  
→ Cursor / Claude Code 规范加载  
→ AI 开发  
→ Hook 检查  
→ Test 验证  
→ Repair 修复  
→ Evidence Report 归档  
→ 进度同步文档更新

---

# 五、P0 明确不做

本阶段严禁扩大范围。

P0 不做：

1. 不做 Codex 完整适配，只预留 adapter 标识和扩展接口
2. 不做完整多 Agent Runtime
3. 不做企业级多租户
4. 不做完整 Visual 控制台
5. 不做 Asset Hub 资产市场
6. 不做云端任务调度
7. 不做自动发布上线
8. 不做复杂 RBAC
9. 不做长期 Memory 自动写入
10. 不做对业务代码的大范围重构
11. 不做和 P0 无关的重构
12. 不做破坏历史兼容的命令改名

---

# 六、必须阅读的资料

请优先阅读以下文件和目录：

1. /Users/lizhenwei/Downloads/00download/docs/企业级 AI 研发控制平面/第二轮/最终版AI开发项目指南/README.md
2. /Users/lizhenwei/Downloads/00download/docs/企业级 AI 研发控制平面/第二轮/最终版AI开发项目指南/docs-manifest.json
3. /Users/lizhenwei/Downloads/00download/docs/企业级 AI 研发控制平面/第二轮/最终版AI开发项目指南/00-总览/
4. /Users/lizhenwei/Downloads/00download/docs/企业级 AI 研发控制平面/第二轮/最终版AI开发项目指南/P0-Cursor-ClaudeCode双IDE项目级最小闭环/

如果 P0 目录下已有以下文件，必须逐个阅读：

- P0-阶段总览.md
- P0-任务进度同步文档.md
- P0.1-项目理解与基线确认/
- P0.2-项目初始化与目录治理/
- P0.3-统一Manifest与Lock机制/
- P0.4-CursorAdapter适配/
- P0.5-ClaudeCodeAdapter适配/
- P0.6-Spec-TestPlan-DoD闭环/
- P0.7-Hook-Test-Repair-Evidence闭环/
- P0.8-P0集成回归与阶段验收/

如有文件缺失，必须记录缺失情况，并基于已有总览继续执行，不允许编造已存在文件。

---

# 七、P0 小阶段执行顺序

你必须严格按以下顺序执行。

不要跳阶段。

---

## P0.1：项目理解与基线确认

### 目标

1. 理解当前仓库结构
2. 找到 CLI 入口
3. 找到命令注册位置
4. 找到测试命令
5. 找到构建命令
6. 找到当前文档结构
7. 找到当前已有 P0 能力
8. 不做业务逻辑改动

### 必须产出或更新

- docs/p0/P0.1-项目理解与基线确认.md
- docs/p0/P0-任务进度同步文档.md
- docs/p0/P0-测试记录.md
- docs/p0/P0-验收结果文档.md

如果项目中已有等价目录或文件，请优先复用，不要重复创建多个同类文档。

P0.1 完成前禁止进入 P0.2。

---

## P0.2：项目初始化与目录治理

### 目标

实现或完善 br-spec init。

br-spec init 执行后必须完成：

1. 扫描当前项目基础信息
2. 生成 projectName
3. 根据项目路径生成 projectHash
4. 生成 projectId，格式建议为 {projectSlug}-{projectHash}
5. 创建项目内轻量目录
6. 创建用户本机运行态目录
7. 写入 .ai-spec/config.json
8. 生成初始化报告
9. 保证重复执行 init 幂等

### 项目内目录

- .ai-spec/
- .agents/
- .cursor/
- .claude/
- .memory/
- .harness/
- openspec/
- reports/ai-spec/

### 用户本机目录

基于用户 home 目录自动计算，不允许硬编码：

~/.ai-spec-auto/projects/{projectId}/

至少包含：

- runs/
- cache/
- logs/
- context/
- repair/
- secrets/
- workspaces/
- telemetry/
- tmp/

### .ai-spec/config.json 至少包含

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| version | string | 是 | 配置版本 |
| projectName | string | 是 | 项目名称 |
| projectId | string | 是 | 项目唯一 ID |
| projectRoot | string | 是 | 项目根目录 |
| projectHash | string | 是 | 项目路径 hash |
| localStateDir | string | 是 | 本机运行态目录 |
| adapters.cursor | boolean | 是 | 是否启用 Cursor |
| adapters.claudeCode | boolean | 是 | 是否启用 Claude Code |
| adapters.codex | boolean | 是 | 是否预留 Codex |
| runtime.maxRepairAttempts | number | 是 | 最大修复次数 |
| runtime.requireTestBeforeDone | boolean | 是 | 完成前是否必须测试 |
| runtime.requireReviewBeforeArchive | boolean | 是 | 归档前是否必须 Review |

### P0.2 测试项目验证

P0.2 完成后，必须使用以下测试项目验证 br-spec init：

/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本22

验证时进入测试项目目录执行：

cd "/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本22"

然后根据平台仓库实际 CLI 调试方式执行初始化，例如：

- br-spec init
- node path/to/cli init
- npm run dev -- init
- pnpm dev init
- 其他项目已有本地调试命令

如果当前 CLI 尚未全局安装，不允许伪造执行结果，必须根据平台仓库 package.json 的 bin、scripts 和 CLI 入口选择真实可执行方式。

---

## P0.3：统一 Manifest 与 Lock 机制

### 目标

实现或完善：

- .ai-spec/manifest.json
- .ai-spec/ai-spec.lock

### Manifest 至少支持

1. rules
2. skills
3. agentProfiles
4. commands
5. hooks
6. adapters
7. memory
8. specs
9. generatedAt
10. checksum

### Lock 至少支持

1. lockVersion
2. projectId
3. assets
4. adapterOutputs
5. generatedFiles
6. checksums
7. lockedAt

### 要求

1. Manifest 和 Lock 生成必须幂等
2. 重复生成不能产生无意义 diff
3. 文件必须是格式化 JSON
4. 必须提供校验函数
5. 必须提供重新生成能力
6. 必须记录生成文件清单
7. 必须有基础测试覆盖

---

## P0.4：Cursor Adapter 适配

### 目标

根据 Manifest 生成 Cursor 项目规则。

### 必须生成

- .cursor/rules/00-project-overview.mdc
- .cursor/rules/10-ai-delivery-workflow.mdc
- .cursor/rules/20-frontend-rule.mdc
- .cursor/rules/30-test-rule.mdc
- .cursor/rules/40-review-rule.mdc

### 每个规则文件必须包含

1. 规则名称
2. 适用范围
3. AI 执行要求
4. 禁止事项
5. 需要读取的项目资产
6. 测试要求
7. 验收要求

### Cursor Adapter 要求

1. 从统一 Manifest 生成
2. 引用 .memory/project.md
3. 引用 .memory/conventions.md
4. 引用 .ai-spec/manifest.json
5. 与 Claude Code Adapter 保持语义一致
6. 支持重复生成
7. 支持校验生成结果

---

## P0.5：Claude Code Adapter 适配

### 目标

生成 Claude Code 项目级配置。

### 必须生成

- CLAUDE.md
- .claude/commands/spec-start.md
- .claude/commands/spec-implement.md
- .claude/commands/spec-review.md
- .claude/commands/spec-repair.md
- .claude/agents/architect-reviewer.md
- .claude/agents/frontend-implementer.md
- .claude/agents/test-reviewer.md
- .claude/agents/security-reviewer.md
- .claude/settings.json

### CLAUDE.md 必须说明

1. 项目 AI 开发总规则
2. 必须先读取哪些文件
3. 开发前必须检查 Spec
4. 完成前必须运行测试
5. 不允许跳过 Hook
6. 不允许伪造测试结果
7. 不允许把运行态数据写入 Git

### .claude/settings.json Hook 设计

Hook 可以先设计为调用统一 CLI：

- br-spec check
- br-spec report
- br-spec repair

如果当前项目暂不支持真实 Hook 执行，必须先生成配置结构和占位命令，并在文档中标记【待接入真实执行】。

---

## P0.6：Spec / Test Plan / DoD 闭环

### 目标

实现基础 Spec 资产生成能力。

### 需要支持命令

- br-spec spec start
- br-spec spec status
- br-spec spec list

### 生成目录建议

- .ai-spec/specs/{specId}/requirement.md
- .ai-spec/specs/{specId}/spec.md
- .ai-spec/specs/{specId}/test-plan.md
- .ai-spec/specs/{specId}/dod.md
- .ai-spec/specs/{specId}/review-checklist.md

### Spec 元数据至少包含

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| specId | string | 是 | 需求规格 ID |
| title | string | 是 | 需求标题 |
| status | string | 是 | 状态 |
| createdAt | string | 是 | 创建时间 |
| updatedAt | string | 是 | 更新时间 |
| owner | string | 否 | 负责人 |
| relatedFiles | string[] | 否 | 相关文件 |
| testCommands | string[] | 否 | 测试命令 |
| riskLevel | string | 否 | 风险等级 |

### 状态枚举

- draft
- ready
- implementing
- testing
- reviewing
- done
- blocked

### 要求

1. 不接入大模型也能生成模板
2. 支持人工补充内容
3. 支持后续 AI 读取
4. 支持状态更新
5. 支持归档

---

## P0.7：Hook / Test / Repair / Evidence 闭环

### 目标

实现最小 Hook、测试、修复、证据归档闭环。

### 需要支持命令

- br-spec check
- br-spec repair
- br-spec report
- br-spec status

### Hook 生命周期至少包含

- pre-task
- pre-edit
- post-edit
- pre-test
- post-test
- repair-hook
- archive-hook

### Hook 配置文件

- .harness/hooks.config.json

### Hook 字段至少包含

| 字段 | 类型 | 必填 | 说明 |
|---|---|---|---|
| hookId | string | 是 | Hook ID |
| hookType | string | 是 | Hook 类型 |
| enabled | boolean | 是 | 是否启用 |
| blocking | boolean | 是 | 是否阻塞 |
| command | string | 是 | 执行命令 |
| timeout | number | 否 | 超时时间 |
| retry | number | 否 | 重试次数 |
| failurePolicy | string | 是 | 失败策略 |
| outputTarget | string | 否 | 输出位置 |

### Evidence Report 至少包含

1. runId
2. projectId
3. specId
4. changedFiles
5. hookResults
6. testResults
7. repairResults
8. reviewResults
9. finalStatus
10. generatedAt

### Repair 要求

1. 最大修复次数默认为 2
2. 超过次数必须中断
3. 不允许无限修复
4. 修复记录必须进入 Evidence
5. 修复失败必须记录原因

---

## P0.8：P0 集成回归与阶段验收

### 目标

完整验证 P0 阶段闭环。

### 必须验证

1. br-spec init 可用
2. 项目内目录生成正确
3. ~/.ai-spec-auto/ 本地运行态目录生成正确
4. .ai-spec/config.json 正确
5. Manifest 正确
6. Lock 正确
7. Cursor Adapter 输出正确
8. Claude Code Adapter 输出正确
9. Spec / Test Plan / DoD 可生成
10. Hook 配置可生成
11. check / repair / report / status 命令可执行
12. Evidence Report 可生成
13. 重复执行命令具备幂等性
14. 测试失败不会被伪造为成功
15. 运行态数据不会污染项目仓库

### P0.8 强制测试项目验收

P0.8 阶段必须基于以下测试项目完成完整集成验收：

/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本22

必须完成：

1. 清理或备份测试项目中旧的 AI 规范生成物
2. 使用最新开发的 CLI 执行初始化
3. 验证项目内目录和文件
4. 验证用户本机运行态目录
5. 验证 Cursor Adapter 输出
6. 验证 Claude Code Adapter 输出
7. 验证 Manifest 和 Lock
8. 验证 Spec 生成命令
9. 验证 Hook 配置生成
10. 验证 Report 输出
11. 重复执行初始化验证幂等性
12. 记录所有真实结果
13. 判断是否允许 P0 阶段完成并进入 P1

如果该测试项目验证不通过，P0 不允许标记为完成。

---

# 八、必须实现或补齐的 CLI 命令

P0 阶段至少实现或补齐以下命令：

| 命令 | 作用 |
|---|---|
| br-spec init | 初始化项目 AI 规范环境 |
| br-spec status | 查看当前项目状态 |
| br-spec check | 执行 Hook / Test / 配置检查 |
| br-spec repair | 执行修复流程或生成修复报告 |
| br-spec report | 生成 Evidence Report |
| br-spec spec start | 创建 Spec |
| br-spec spec list | 查看 Spec 列表 |
| br-spec spec status | 查看 Spec 状态 |

如果现有命令名称不同，优先兼容现有命令，不要强行破坏原有命令体系。

---

# 九、推荐项目内目录结构

P0 完成后，项目内建议形成：

| 目录 | 作用 | 是否建议提交 Git |
|---|---|---|
| AGENTS.md | 通用 AI 项目入口说明 | 是 |
| CLAUDE.md | Claude Code 项目入口 | 是 |
| .ai-spec/ | 项目规范事实源 | 是，运行态除外 |
| .agents/ | Rule / Skill / Agent Profile | 是 |
| .cursor/ | Cursor 适配输出 | 是 |
| .claude/ | Claude Code 适配输出 | 是 |
| .memory/ | 项目长期 Memory | 是，run/local 除外 |
| .harness/ | Harness 配置 | 是 |
| openspec/ | OpenSpec 需求变更资产 | 是 |
| reports/ai-spec/ | 脱敏报告 | 视情况提交 |

运行态数据不得写入 Git 可提交目录。

---

# 十、用户本机目录结构

P0 必须使用用户本机目录保存运行态：

~/.ai-spec-auto/projects/{projectId}/

至少包含：

1. runs
2. cache
3. logs
4. context
5. repair
6. secrets
7. workspaces
8. telemetry
9. tmp

要求：

1. 如果目录不存在，自动创建
2. 如果重复执行，不能覆盖重要历史数据
3. secrets 目录不得输出到报告
4. 原始 Prompt、原始模型回复、敏感日志不得进入项目仓库
5. 本地目录路径需要写入 .ai-spec/config.json
6. 运行态数据不得进入测试项目 Git 可提交目录

---

# 十一、测试项目验证范围

在测试项目中必须验证以下内容：

1. 是否能成功执行 br-spec init
2. 是否能正确识别项目名称
3. 是否能根据测试项目路径生成稳定 projectHash
4. 是否能生成 projectId
5. 是否能创建项目内轻量目录
6. 是否能创建用户本机运行态目录
7. 是否能写入 .ai-spec/config.json
8. 是否能生成 .ai-spec/manifest.json
9. 是否能生成 .ai-spec/ai-spec.lock
10. 是否能生成 .cursor/rules/*.mdc
11. 是否能生成 CLAUDE.md
12. 是否能生成 .claude/commands/*.md
13. 是否能生成 .claude/agents/*.md
14. 是否能生成 .claude/settings.json
15. 是否能生成 .memory/project.md
16. 是否能生成 .memory/conventions.md
17. 是否能生成 .harness/hooks.config.json
18. 是否能生成 reports/ai-spec/ 下的初始化报告
19. 重复执行 br-spec init 是否幂等
20. 是否没有把运行态数据、密钥、原始 Prompt、敏感日志写入测试项目 Git 可提交目录

---

# 十二、测试项目禁止事项

在测试项目中严禁执行以下行为：

1. 不允许重构测试项目业务代码
2. 不允许删除测试项目已有业务文件
3. 不允许修改测试项目业务逻辑
4. 不允许把平台源码复制进测试项目
5. 不允许把 ~/.ai-spec-auto/ 下的运行态数据复制进测试项目
6. 不允许提交 secrets、原始 Prompt、原始模型回复、敏感日志
7. 不允许为了通过测试修改测试项目真实业务代码
8. 不允许把测试项目验证失败伪造成成功
9. 不允许跳过测试项目验证
10. 不允许只在平台仓库验证，不在测试项目中验证

---

# 十三、测试项目验证记录要求

每次使用测试项目验证后，必须记录到平台开发仓库中的 P0 文档：

1. docs/p0/P0-测试记录.md
2. docs/p0/P0-验收结果文档.md
3. docs/p0/P0-任务进度同步文档.md

记录内容至少包括：

| 字段 | 内容 |
|---|---|
| 测试项目路径 | /Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本22 |
| 执行命令 | 实际执行的命令 |
| 执行时间 | 实际执行时间 |
| 生成的 projectId | 实际生成值 |
| 生成的项目内目录 | 实际生成清单 |
| 生成的本机运行态目录 | 实际生成清单 |
| 是否幂等 | 待执行 / 是 / 否 |
| 是否存在运行态污染 | 待执行 / 是 / 否 |
| 测试结果 | 待执行 / 通过 / 失败 |
| 失败原因 | 如有失败必须记录 |
| 修复记录 | 如有修复必须记录 |
| 是否允许进入下一阶段 | 待确认 |

未真实执行前，所有结果必须保持：

待执行 / 待确认

不允许提前填写“通过”。

---

# 十四、文档与进度同步要求

每完成一个小阶段，必须更新：

1. docs/p0/P0-任务进度同步文档.md
2. docs/p0/P0-测试记录.md
3. docs/p0/P0-验收结果文档.md

如这些文件不存在，请创建。

进度状态只能使用：

- 未开始
- 执行中
- 待测试
- 测试失败
- 待修复
- 待验收
- 验收失败
- 已完成
- 已阻塞
- 已回滚

未实际执行测试时，不允许写“测试通过”。

未实际验收时，不允许写“验收通过”。

---

# 十五、测试要求

完成每个小阶段后必须运行相关测试。

优先执行项目已有命令，例如：

- npm run lint
- npm run typecheck
- npm test
- npm run test
- npm run build
- pnpm lint
- pnpm typecheck
- pnpm test
- pnpm build

如果项目没有对应命令：

1. 不允许伪造执行结果
2. 必须在验收记录中写明“项目未提供该命令”
3. 必须给出建议补充命令
4. 不允许把未执行写成通过

---

# 十六、质量与安全要求

必须遵守：

1. 所有 CLI 提示、日志、报错必须使用中文
2. 所有新增 JSON 必须格式化
3. 所有写文件操作必须幂等
4. 所有路径必须兼容 macOS
5. 不允许硬编码个人敏感路径到项目产物，除了读取外部指南资料路径和测试项目验证路径
6. ~/.ai-spec-auto/ 路径必须通过 home dir 计算
7. 不允许把 secrets、原始 Prompt、原始模型回复提交到项目仓库
8. 不允许删除已有用户代码
9. 不允许破坏现有 CLI 命令
10. 不允许引入大型依赖，除非确有必要并说明理由
11. 不允许把运行态数据写入项目仓库
12. 不允许把测试项目验证失败写成通过
13. 不允许绕过 Hook、测试、验收和文档同步

---

# 十七、每个小阶段完成后的输出格式

每完成一个小阶段，请输出：

1. 当前完成的小阶段编号
2. 修改文件清单
3. 新增文件清单
4. 删除文件清单
5. 实现摘要
6. 执行的测试命令
7. 测试真实结果
8. 未执行测试及原因
9. 测试项目验证结果
10. 遗留问题
11. 风险说明
12. 是否建议进入下一小阶段

---

# 十八、当前只执行 P0.1

当前只执行 P0.1，不要直接进入 P0.2。

P0.1 任务：

1. 扫描当前平台开发仓库结构
2. 阅读 package.json
3. 阅读 src / docs / tests / bin / cli 相关目录
4. 找到 CLI 入口
5. 找到当前命令实现位置
6. 找到当前测试命令
7. 阅读本地指南资料目录
8. 确认测试项目目录是否可读
9. 输出 P0.1 基线分析
10. 生成或更新 docs/p0/P0.1-项目理解与基线确认.md
11. 生成或更新 docs/p0/P0-任务进度同步文档.md
12. 生成或更新 docs/p0/P0-测试记录.md
13. 生成或更新 docs/p0/P0-验收结果文档.md

完成 P0.1 后，停止并汇报结果。

不要一次性开发 P0.2-P0.8。

---

# 十九、最终提醒

你是 Claude Code 主执行 Agent。

请直接基于当前平台开发仓库执行 P0.1。

必须做到：

1. 先读资料
2. 再读代码
3. 再写基线文档
4. 不改业务逻辑
5. 不跳阶段
6. 不伪造测试
7. 不伪造验收
8. 不污染业务项目
9. 不破坏现有兼容性
10. 不扩大 P0 范围
11. 不绕过测试项目验证
12. 不让多个 Agent 并行修改代码

现在请开始执行 P0.1：项目理解与基线确认。