---
name: project-init
description: 自动分析当前项目的技术栈、目录结构与实现约定，生成 01-项目概述.md、03-项目结构.md、context/PROJECT.md，并按当前 profile 补生成对应的能力规则。当需要初始化项目规范、生成项目概述、填写项目信息或根据项目生成自定义规则时使用本技能。
compatibility: 要求当前工作区存在 .agents/rules/ 目录（通过 ai-spec-auto init 安装），以及 .ai-spec/manifest.json 中记录的 profile。前端项目还需要 package.json；后端项目需要 pom.xml / build.gradle；Node 工具仓需要 package.json + tsconfig.json。
metadata:
  version: "2.2.0"
---

# 项目规范初始化

## 触发条件

当用户输入以下类似指令时，调用此技能：

- "初始化项目规范"
- "初始化项目"
- "初始化当前项目"
- "初始化当前项目规范"
- "生成项目概述"
- "填写 01 和 03"
- "分析项目技术栈"
- "生成项目结构文档"
- "根据项目生成自定义规则"
- "生成项目规则"
- "project-init"
- "project init"

## 环境依赖

- 依赖本仓库的 `.agents/rules/` 目录结构和可写的 `context/`
- 若存在 `openspec/`，会同步写入 `openspec/project.md`
- 若可用，可先运行 `scripts/inspect-project.js` 输出项目事实摘要，再补读关键文件

## 注意事项

- 只要判定需要补生成 profile 对应的能力规则，就不能只写 `01/03`
- 不能根据猜测编造业务背景，缺失信息只能写已确认事实
- 自定义规则必须基于项目实际代码、目录和依赖归纳，严禁照搬通用模板
- `openspec/` 不存在时，只跳过 `openspec/project.md`，不要强制创建 OpenSpec

## 执行核对清单

- [ ] `01-项目概述.md` 已生成或刷新
- [ ] `03-项目结构.md` 已生成或刷新
- [ ] `context/PROJECT.md` 已生成或刷新
- [ ] 待生成/待刷新规则已全部落盘

## 前置要求

1. 当前工作区已通过 `ai-spec-auto init` 安装，存在 `.agents/rules/` 目录。
2. 存在 `.ai-spec/manifest.json`，其中包含 `profile` 字段，用于确定当前项目类型。
3. 若 `context/` 目录不存在，可由本技能创建。
4. 规则生成范围由两类信号共同决定：
   - `.agents/rules/` 中规则文件是否缺失
   - `.ai-spec/manifest.json` 中 `local_preferences.project_init.custom_rules` 是否声明了需要按项目自定义生成或刷新的规则

## Profile 驱动的规则生成

### 读取 profiles

1. 读取 `.ai-spec/manifest.json`
2. 支持两种格式，统一处理为 profile 列表：
   - `"profile": "vue"` → 列表为 `["vue"]`
   - `"profiles": ["vue", "nestjs"]` → 列表为 `["vue", "nestjs"]`
3. 从 `.agents/registry/profiles.json` 中查询每个 profile 的 `project_init_rule_ids`，合并为本次应生成的规则集合

### 各 profile 的默认能力规则集合

| Profile | 应生成的能力规则 |
|---------|----------------|
| `vue` | 04-组件规范、05-API规范、06-路由规范、07-状态管理、09-样式规范、11-测试规范、13-代码格式化 |
| `react` | 04-组件规范、05-API规范、06-路由规范、07-状态管理、09-样式规范、11-测试规范、13-代码格式化 |
| `springboot` | 04-分层规范、05-接口与契约规范、06-数据访问规范、07-配置与运行时规范、09-异常与日志规范、11-测试规范、13-代码格式化 |
| `nestjs` | 04-模块结构规范、05-接口与契约规范、06-数据访问规范、07-配置与运行时规范、09-异常与日志规范、11-测试规范、13-代码格式化 |
| `node-tooling` | 04-CLI与模块规范、05-Contract与Schema规范、06-运行时文件规范、07-日志与错误处理规范、09-脚本与入口规范、11-测试规范、13-代码格式化 |

实际使用的规则集合以 `profiles.json` 中的 `project_init_rule_ids` 为准。

不同 profile 的同序号规则因文件名不同（如 `04-组件规范.md` vs `04-模块结构规范.md`）天然不冲突，直接共存于同一目录。

## 固定产物

本技能的固定目标是：

- 始终生成或刷新（写入 `.agents/rules/`）：
  - `01-项目概述.md`
  - `03-项目结构.md`
  - `context/PROJECT.md`
- 若项目已安装 OpenSpec（存在 `openspec/`），同步 `openspec/project.md` 中的项目概述
- 对于安装时选择了"根据项目自定义"的规则，按项目事实生成对应的能力规则文件

## 完成标准（强约束）

以下条件必须同时满足，才算本次 `project-init` 完成：

1. `01-项目概述.md` 已生成或刷新（写入 `.agents/rules/`）
2. `03-项目结构.md` 已生成或刷新（写入 `.agents/rules/`）
3. `context/PROJECT.md` 已生成或刷新
4. 若存在 `openspec/`，则 `openspec/project.md` 已同步
5. 若能力规则目录中缺失任意应有规则，则这些缺失项必须在本次执行中一并补生成
6. 若 `local_preferences.project_init.custom_rules` 中包含任意规则，则这些规则即使文件已存在，也必须在本次执行中按项目事实刷新

也就是说：

- **如果待生成列表非空，只写 `01/03 + PROJECT` 视为未完成**
- **不能在摘要里只说"后续再补能力规则"**
- **不能只分析、不落盘**
- **不能只生成其中一部分缺失规则后就结束**

## 资源导航

- `scripts/inspect-project.js`
  - 何时用：需要先快速汇总技术栈、目录、缺失规则与 OpenSpec 信号时
  - 用法：`node scripts/inspect-project.js [workspace-root]`
- `references/scope-resolution.md`
  - 何时读：确定 `待生成列表 / 待刷新列表 / 本轮写入清单` 时
- `references/repo-fact-gathering.md`
  - 何时读：采集项目标记文件、README.md、源码目录时
- `references/deep-scan-rules.md`
  - 何时读：只对本轮待生成/刷新规则做深度扫描时
- `references/output-contracts.md`
  - 何时读：写 `01/03/PROJECT/openspec/project.md` 前
- `references/custom-rule-generation.md`
  - 何时读：补生成能力规则时

## 执行步骤

### 第零步：确定 profiles 与规则生成范围

- 读取 `.ai-spec/manifest.json`，将 `profile`（字符串）或 `profiles`（数组）统一处理为 profile 列表
- 从 `.agents/registry/profiles.json` 中查询各 profile 的 `project_init_rule_ids`，合并为本次规则集合
- 按 `references/scope-resolution.md` 确定 `待生成列表`、`待刷新列表` 和 `本轮写入清单`
- 若有需要，可先运行 `node scripts/inspect-project.js` 看一版摘要
- 后续所有写入必须严格遵守这份清单

### 第一步：采集基础项目信息

- 根据 profile 类型，采集对应的项目标记文件：
  - **frontend（vue/react）**：`package.json`、`vite.config.*`、`src/` 目录
  - **backend（springboot）**：`pom.xml` / `build.gradle`、`src/main/` 目录、`application.yml`
  - **backend（nestjs）**：`package.json`（含 @nestjs/core）、`src/` 目录、`*.module.ts`、`.env*`
  - **tooling（node-tooling）**：`package.json`、`tsconfig.json`、`src/` 目录
  - **多 profile**：按以上规则分别采集各子包的标记文件，01/03/PROJECT.md 需综合描述
- 只提取稳定事实，不把任务期假设写进项目长期上下文
- 详细采集项见 `references/repo-fact-gathering.md`

### 第二步：仅对待生成/刷新规则做深度扫描

- 只对 `待生成列表 + 待刷新列表` 对应的能力域做深扫
- 每个能力域至少读取 2-3 个真实样本，再归纳规则
- 详细扫描要求见 `references/deep-scan-rules.md`

### 第三步：写入核心产物

生成或刷新（统一写入 `.agents/rules/`）：
- `01-项目概述.md`（含所有 profile 涉及的技术栈与项目定位）
- `03-项目结构.md`（覆盖整个项目目录结构）
- `context/PROJECT.md`

若存在 `openspec/`，同步 `openspec/project.md`。每个产物的写法与边界见 `references/output-contracts.md`

### 第四步：补生成或刷新能力规则

- 仅处理 `待生成列表` 与 `待刷新列表` 中的规则
- 每条规则必须基于仓库事实生成
- 规则统一写入 `.agents/rules/`，文件名含领域关键词，不同 profile 的规则因名称不同天然共存
- 详细覆盖要求见 `references/custom-rule-generation.md`

### 第五步：用户确认并一次性写入

- 真正写入前，按 `references/output-contracts.md` 的确认摘要格式向用户说明：
  - 当前 profiles 列表
  - 各技术栈说明
  - 目录结构
  - 项目定位
  - 本轮将补哪些规则
  - 是否同步 `openspec/project.md`
- 用户确认后，必须按 `本轮写入清单` 一次性完成全部写入
