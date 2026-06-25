---
name: install-ai-spec-auto
description: 当用户要求给当前项目接入 ai-spec-auto(安装工具)、自动执行 init(初始化安装) 命令、安装规则/技能/OpenSpec(需求规范流程) 或完成首次安装时，使用本技能自动检查前置条件、推断 profile(技术栈) 与安装目标，并在当前项目执行安装和自检。
compatibility: 需要当前工作区可执行 Node.js(运行时) 与 npm(包管理工具) 或 pnpm(包管理工具)，并且能够访问 @ex 内网 registry(包仓库)。前端项目通常包含 package.json；NestJS/Node 后端项目包含 package.json + @nestjs/core；Spring Boot 后端项目包含 pom.xml 或 build.gradle；Node 工具仓通常包含 package.json + tsconfig.json。同一仓库存在多个技术栈子包时（如 Vue + NestJS），在根目录执行一次安装，写入多 profile manifest。
metadata:
  version: "1.2.0"
---

# ai-spec-auto 安装初始化

## 定位

本技能负责把 `ai-spec-auto(安装工具)` 安装到当前项目，并执行首次 `init(初始化安装)`。

职责边界：

- 本技能负责安装前检查、命令执行、安装后自检与结果摘要
- `project-init(项目规范初始化)` 负责安装完成后的项目规则生成，不负责首次安装
- `update(更新)`、`check(自检)`、`uninstall(卸载)` 不属于本技能主路径

## 触发条件

当用户表达以下意思时，调用本技能：

- "给当前项目安装 ai-spec-auto"
- "帮我在这个仓库执行 init"
- "帮我把这套规范接入当前项目"
- "自动初始化安装规则和技能"
- "给别人项目快速装上这套 ai 规范"
- "在当前项目执行 ai-spec-auto init"

以下场景不要触发：

- 用户明确要执行 `project-init(项目规范初始化)`
- 用户只想执行 `update(更新)`、`check(自检)` 或 `uninstall(卸载)`
- 用户想创建一个新的 `skill(技能)`
- 用户只是问安装文档位置，没有要求执行安装

## 执行原则

- 默认直接执行命令，不先输出长篇安装说明
- 尽量使用显式参数，避免用户卡在交互式选择
- 能自动推断的内容就自动推断；只有高风险歧义时才确认
- 默认启用 `--custom-rules(自定义规则)`，让 `init(初始化安装)` 自动勾选当前支持按项目自定义生成的全部规则
- 已安装项目优先提醒使用 `check(自检)` 或 `update(更新)`，除非用户明确要求重装

## 安装前核对清单

- [ ] 当前目录或目标目录是要安装的业务项目
- [ ] 本机可执行 `node(运行时)` 与 `npm(包管理工具)` 或 `pnpm(包管理工具)`
- [ ] `~/.npmrc` 已配置 `@engineered:registry=https://registry.npmjs.org/`
- [ ] 已判断当前项目是否已安装，避免误把重复安装当成首次接入

## 自动判断规则

### 1. 是否已安装

以下任一条件成立，都视为项目已经接入过：

- 存在 `.ai-spec/install-state.json`
- 存在 `.agents/`
- 存在 `openspec/`

处理方式：

- 已安装且用户没有明确要求重装：优先执行 `check(自检)`，必要时建议 `update(更新)`
- 已安装且用户明确要求重装：允许继续执行 `init(初始化安装)`，但要先说明会覆盖受管安装产物

### 2. 推断 profile(技术栈)

按下面顺序判断：

1. 已存在 `.ai-spec/manifest.json` 且包含 `profile` / `profiles` 字段 → 直接使用已记录的值
2. `package.json` 中存在 `vue`、`@vitejs/plugin-vue`、`nuxt` 等依赖 → 命中 `vue`
3. `package.json` 中存在 `react`、`next`、`@vitejs/plugin-react` 等依赖 → 命中 `react`
4. `package.json` 中存在 `@nestjs/core`、`@nestjs/common` 等依赖 → 命中 `nestjs`
5. 存在 `pom.xml` 或 `build.gradle`（且无 `package.json`）→ 命中 `springboot`（待确认）
6. 存在 `package.json` + 主要依赖为工具链相关（commander、yargs、zod 等），且无 UI/服务端框架 → 命中 `node-tooling`（待确认）
7. 命中结果处理：
   - 命中 **1 个** profile 且置信度高 → 直接使用，执行前说明推断结果
   - 命中 **多个** profile（如 `vue` + `nestjs`）→ 进入"多 profile 确认"流程（见下方）
   - 命中 **0 个** 或置信度低 → 进入"用户手动选择"流程（见下方）

#### 多 profile 确认（自动命中多个时）

展示推断结果，让用户确认或补充：

```
检测到以下技术栈：
  [x] vue      packages/front/
  [x] nestjs   packages/server/

请确认或修改，然后继续。
```

#### 用户手动选择（无法自动推断时）

展示多选提示，**允许选择多个**：

```
请选择当前项目的技术栈（可多选，空格选中，回车确认）：

  [ ] vue          Frontend / Vue
  [ ] react        Frontend / React
  [ ] nestjs       Backend / NestJS
  [ ] springboot   Backend / Spring Boot
  [ ] node-tooling Tooling / Node.js

> 选择后按回车继续
```

**不得默认勾选任何项，不得在用户未确认时擅自写入。**

### 3. 判断安装目标

- 当前目录本身就是单技术栈业务包：直接对 `.(当前目录)` 安装
- 同一仓库包含多个技术栈子包：在**根目录**安装，写多 profile manifest
- 单包仓库：直接执行 `init .`

### 4. 选择命令入口

单 profile 时，优先使用：

```bash
npx @engineered/ai-spec-auto@latest init . --profile <profile> --custom-rules
```

其中 `<profile>` 为 `vue`、`react`、`nestjs`、`springboot` 或 `node-tooling`。

多 profile 时，传入逗号分隔的 profiles：

```bash
npx @engineered/ai-spec-auto@latest init . --profiles vue,nestjs --custom-rules
```

仅在"当前工作区就是 `ai-spec-auto(安装工具)` 源码仓库，且用户明确要走本地源码调试安装"时，才改用：

```bash
node ./bin/cli.js init <target> --profile <profile> --custom-rules
```

### 5. 自定义规则选择策略

本技能默认把 `--custom-rules(自定义规则)` 作为首次安装命令的一部分。

原因：

- 底层 `install-workflow(安装主链)` 已支持在非交互模式下把全部可自定义规则自动选中
- 这样安装完成后，`project-init(项目规范初始化)` 会按项目事实补齐和刷新这些规则，而不是沿用固定模板
- 这符合"自动初始化安装"的目标，不需要用户再手动进入交互界面逐条勾选

各 profile 支持自动全选的规则集由 `profiles.json` 中的 `project_init_rule_ids` 字段决定。

如果用户明确要求"沿用标准模板，不要自定义规则"，才改用 `--standard-rules(标准规则)`，不要同时传两者。

## 标准工作流

Progress:
- [ ] 1. 读取项目标记文件（`package.json` / `pom.xml` / `build.gradle`）、目录结构、`.npmrc`
- [ ] 2. 判断是否已安装、是否多 profile 场景、确定或推断 `profile(技术栈)`
- [ ] 3. 组装并实际执行 `init(初始化安装)` 命令
- [ ] 4. 安装完成后执行 `check(自检)` 或核对关键安装产物
- [ ] 5. 输出简短安装摘要，并提示下一步执行 `project-init(项目规范初始化)`

## 详细步骤

### 第一步：环境与仓库检查

至少检查以下事实：

- 项目标记文件是否存在（`package.json` / `pom.xml` / `build.gradle`）
- `node -v`、`npm -v` 是否可用
- `~/.npmrc` 是否包含 `@engineered:registry=https://registry.npmjs.org/`
- 是否已存在 `.ai-spec/install-state.json`、`.agents/`、`openspec/`

如果发现 `registry(包仓库)` 配置缺失：

- 明确告诉用户当前阻塞点
- 给出准确修复命令
- 不要假装已经安装成功

### 第二步：构造非交互命令

默认应显式传入 `--profile(技术栈)`，避免安装过程进入交互式选择。
默认还应显式传入 `--custom-rules(自定义规则)`，让所有支持按项目自定义的规则自动全选。

单 profile 安装命令：

```bash
npx @engineered/ai-spec-auto@latest init . --profile <profile> --custom-rules
```

多 profile（同一仓库含多技术栈子包）安装命令：

```bash
npx @engineered/ai-spec-auto@latest init . --profiles vue,nestjs --custom-rules
```

如用户提供 `manifest(安装清单)`，命令改为：

```bash
npx @engineered/ai-spec-auto@latest init . --profile <profile> --custom-rules --manifest <file-or-url>
```

### 第三步：执行安装

- 真正执行命令，不要只把命令贴给用户
- 执行前用一句话说明：安装目标、推断出的 `profile(技术栈)` 或多 profile 列表
- 若项目已安装且用户没有明确要求重装，不要强行再跑 `init(初始化安装)`

### 第四步：安装后验证

优先执行：

```bash
npx @engineered/ai-spec-auto@latest check .
```

如果当前环境不适合再次走 `npx(包执行命令)`，至少核对：

- `.agents/`
- `.ai-spec/install-state.json`
- `openspec/`（完整安装时）
- `.cursor/`、`.claude/` 等 `IDE(开发工具)` 入口目录

### 第五步：结果摘要

结果摘要至少包含：

- 安装目标目录
- 实际执行的命令
- 判定出的 `profile(技术栈)` 或多 profile 列表
- 是否首次安装 / 已安装改走 `check(自检)`
- 验证结果
- 下一步建议：`project-init(项目规范初始化)` 或"初始化项目规范"

## Gotchas(易错点)

- 不要把 `project-init(项目规范初始化)` 当成首次安装命令
- 不要忘记追加 `--custom-rules(自定义规则)`，否则非交互模式会回退到标准规则
- **无法推断 profile 时，不得默认为 `vue`**，必须展示多选提示让用户明确选择
- 兜底提示必须是**多选**，不能是单选数字列表——用户可能同时需要 vue + nestjs
- 同一仓库含多技术栈子包时，**在根目录安装**，写多 profile manifest；不要分别进入子包目录各自安装一套 `.agents/`
- NestJS 项目依据 `@nestjs/core` 依赖识别，**不要把它归为 `node-tooling`**
- 不要漏掉 `@ex:registry(内网包仓库)` 检查，否则 `npx(包执行命令)` 很可能失败
- 不要只输出命令，不实际执行
- 已安装项目如果只需要检查状态，优先走 `check(自检)`，不要机械重复 `init(初始化安装)`
- Spring Boot 项目不一定存在 `package.json`，不要因为缺少 `package.json` 就直接报错或跳过

## 验证标准

1. 已成功执行 `init(初始化安装)` 或在已安装场景下正确改走 `check(自检)`
2. 用户能从摘要里看到安装目标、命令、技术栈和验证结果
3. 输出明确区分"安装完成"与"下一步执行 `project-init(项目规范初始化)`"

## 资源导航

- [README.md](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/README.md)
- [docs/install-guide.md](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/docs/install-guide.md)
- [bin/install-workflow.js](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/install-workflow.js)
