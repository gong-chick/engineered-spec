# ai-spec-auto  规范驱动开发 — 培训 PPT 讲稿提纲

> 总时长：约 120 分钟 | 建议听众：前端开发团队全员
> 本文档为 PPT 制作与讲师备课使用，每页标注标题、要点、讲师备注和时间。

---

## Part 1：为什么需要规范驱动开发（15 分钟）

---

### 第 1 页 | 封面

**标题**：规范驱动开发 — 让 AI 写出团队认可的代码

**要点**：
- ai-spec-auto  v2.0 团队培训
- 副标题：从"能跑的代码"到"团队认可的代码"

**讲师备注**：
简单自我介绍后，用一句话引入主题："今天我们聊聊如何让 AI 不再'自由发挥'，而是遵循我们的团队规范写代码。"

**时间**：1 分钟

---

### 第 2 页 | 现状痛点：AI 编码的典型问题

**标题**：AI 写的代码，好用但不好管

**要点**：
- 目录随意：AI 在 src/ 下创建 helpers/、services/ 等非标准目录
- 命名混乱：同一项目出现 fetchUser、getUserApi、loadUserData 三种风格
- 样式硬编码：直接写 `color: #333` 而非主题变量
- 规范失忆：换一个对话窗口，之前的约定就丢了
- 提示词属人：只有少数人写得出高质量提示词

**讲师备注**：
可以展示几张真实截图：AI 生成的代码中出现的目录混乱、命名不一致等问题。请团队成员举手——"遇到过这些问题的请举手"，制造互动感。

**时间**：3 分钟

---

### 第 3 页 | 数据说话：没有规范时的代价

**标题**：这些问题的代价

**要点**：
- AI 代码接受行比：约 30%（大量代码需要人工修改后才能用）
- Code Review 反复修改：同一类问题平均被指出 3+ 次
- 新人上手：需要 1-2 周学习"不成文的规矩"
- 沟通成本：每次 AI 生成代码后都要口头纠正规范

**讲师备注**：
这些数据来自团队实际观察（可替换为本团队的真实数据）。重点强调：不是 AI 不好，是我们没有告诉它规矩。

**时间**：2 分钟

---

### 第 4 页 | 核心理念

**标题**：把"提示词能力"改造成"项目内资产"

**要点**：
- 传统方式：口头约定 → 个人记忆 → 反复提醒 → 仍然犯错
- 规范驱动：规范文件 → AI 自动读取 → 每次都遵循 → 持续沉淀
- Rule 决定"边界"——什么能做、什么不能做
- Skill 决定"步骤"——具体怎么做
- 规范不再是"额外的文档"，而是"AI 的工作指令"

**讲师备注**：
这是全场最关键的一张。用类比："如果 AI 是新来的实习生，Rule 就是公司的规章制度，Skill 就是老员工带教的操作手册。没有这些，实习生只能靠猜。"

**时间**：3 分钟

---

### 第 5 页 | 目标：规范驱动后的预期效果

**标题**：接入规范后，我们期望看到的变化

**要点**：
- AI 代码接受行比：从 ~30% 提升到 ~70%+
- 代码采纳率：从 ~40% 提升到 ~80%+
- Code Review 规范类修改减少 60%+
- 新人上手时间从 1-2 周缩短到 2-3 天
- 团队代码风格一致性显著提升

**讲师备注**：
明确告诉大家这不是空想——后续会用实际 Demo 演示效果。这些数字是"预期目标"，试点后会用真实数据验证。

**时间**：2 分钟

---

### 第 6 页 | ai-spec-auto  是什么

**标题**：ai-spec-auto  — AI Coding 团队规范库

**要点**：
- 一套结构化的规范 + 技能文件，让 AI IDE 自动遵循团队规范
- 支持 Cursor / Claude Code / OpenCode / Trae
- 支持 Vue 3 和 React 双技术栈
- 三级安装（L1 最小体验 / L2 规范+MCP 无 OpenSpec / **L3 默认主推** 含需求治理）
- 一键安装，5 分钟上手

**讲师备注**：
概括性介绍，为后续详细拆解做铺垫。

**时间**：2 分钟

---

## Part 2：ai-spec-auto  架构总览（15 分钟）

---

### 第 7 页 | 四层架构全景

**标题**：四层协同架构

**要点（配架构图）**：
- 约束层（.agents/rules/）：13 条声明式规范 — 定义边界
- 操作层（.agents/skills/）：16+ 过程式技能 — 定义步骤
- 自动化层（configs/）：ESLint + Prettier + Stylelint；**可选** husky + commitlint（init 时选安装提交校验才有）
- 流程层（openspec/）：需求治理闭环 — propose → apply → archive

**讲师备注**：
用一张 mermaid 图或 PPT 图示展示四层关系。类比建筑：规范是建筑法规，技能是施工手册，自动化是质检员，OpenSpec 是项目经理。

**时间**：3 分钟

---

### 第 8 页 | Rules — 声明式规范

**标题**：Rules：告诉 AI "什么能做、什么不能做"

**要点**：
- 每条规范是一个独立 Markdown 文件
- 按需加载（alwaysApply: false），不会每次对话都注入
- 包含正例/反例代码示例
- NON-NEGOTIABLE 标记 = 强制约束，不可违反
- 示例：API 函数必须用 `getXxxListApi` 命名，禁止 `fetchXxx`

**讲师备注**：
展示一个具体的 Rule 文件内容（如 05-API规范.md），让大家感受"规范是什么样的"。

**时间**：2 分钟

---

### 第 9 页 | Skills — 过程式技能

**标题**：Skills：告诉 AI "具体怎么做"

**要点**：
- 步骤化的操作指令（类似 SOP）
- 包含：触发条件 → 执行步骤 → 代码示例 → 检查清单
- 引用对应的 Rules 作为约束依据
- 示例：create-component 技能会按规范在正确目录创建正确结构的组件

**讲师备注**：
展示 create-component 技能的步骤流程。强调 Rule 和 Skill 的区别：Rule 说"不准用 any"，Skill 说"创建组件时先定义 types.ts，再写 index.vue，样式用 style.module.scss"。

**时间**：2 分钟

---

### 第 10 页 | Rules vs Skills 对比

**标题**：Rules 和 Skills 的分工

**要点**：

| 维度 | Rules | Skills |
|------|-------|--------|
| 性质 | 声明式（是什么） | 过程式（怎么做） |
| 内容 | 约束、禁令、规范 | 步骤、示例、检查清单 |
| 类比 | 法律法规 | 操作手册 |
| 触发 | AI 按场景自动引用 | AI 识别到匹配意图时读取 |
| 示例 | "API 必须用 getXxxApi 命名" | "创建 API 时先在 types/ 定义类型，再写请求函数" |

**讲师备注**：
两者缺一不可。只有 Rule 没有 Skill，AI 知道规矩但不知道怎么做；只有 Skill 没有 Rule，AI 知道步骤但不知道边界。

**时间**：2 分钟

---

### 第 11 页 | 自动化工具链

**标题**：Configs：提交前的最后一道防线

**要点**：
- Prettier：统一格式（分号、引号、缩进）
- ESLint：代码质量检查
- Stylelint：样式规范检查
- commitlint：提交信息格式校验
- husky + lint-staged（可选）：init 选择安装提交校验后才有；只检查暂存文件，pre-commit 自动触发
- 提交信息格式：`feat(user): 新增用户列表`

**讲师备注**：
强调这层是"兜底"——即使 AI 偶尔遗漏规范，提交时工具链会拦截。

**时间**：2 分钟

---

### 第 12 页 | Profile 与安装层级

**标题**：按团队需求灵活选择

**要点**：
- Profile 选择：Vue（Pinia + Element Plus）或 React（Zustand + Ant Design）
- 安装时 common + profile 自动合并为扁平目录
- L1：最小体验（仅 .agents）
- L2：规范 + IDE + MCP（**不含** OpenSpec，需显式 `--level L2`）
- L3：**安装器默认**；完整版（+ OpenSpec 需求治理），团队主推

**讲师备注**：
默认安装为 **L3**（与 `install.sh` / `npx` 一致）。仅需规范与 MCP、暂不要提案流程时选 **L2**；个人试用可用 **L1**。

**时间**：2 分钟

---

### 第 13 页 | 单源多链接

**标题**：一份规范，多 IDE 共享

**要点（配图示）**：
- `.agents/` 是唯一维护源
- `.cursor/`、`.claude/`、`.opencode/`、`.trae/` 通过软链接引用
- 修改一处，所有 IDE 同步生效
- Windows 使用 Junction 替代 symlink，无需管理员权限

**讲师备注**：
这个设计避免了"Cursor 的规范改了，Claude Code 没改"的问题。

**时间**：2 分钟

---

### 第 14 页 | MCP 集成

**标题**：MCP：让 AI 看到更多上下文

**要点**：
- ApiFox：AI 能直接读取接口文档
- Figma：AI 能分析设计稿
- Playwright：AI 能操作浏览器做 UI 验收
- Context7：AI 能检索技术文档
- 配置方式：修改 `.cursor/mcp.json` 中的占位符

**讲师备注**：
MCP 是锦上添花。没有 MCP，规范依然生效；有了 MCP，AI 能做的事更多（如自动分析 Figma 设计稿）。

**时间**：2 分钟

---

## Part 3：规范体系逐条速览（20 分钟）

---

### 第 15 页 | 规范总览

**标题**：13 条规范覆盖全开发流程

**要点**：

| 编号 | 规范 | 级别 |
|------|------|------|
| 01 | 项目概述 | Profile |
| 02 | 编码规范 | 通用 |
| 03 | 项目结构 | Profile |
| 04 | 组件规范 | Profile |
| 05 | API 规范 | 通用 |
| 06 | 路由规范 | Profile |
| 07 | 状态管理 | Profile |
| 08 | 通用约束 | 通用 |
| 09 | 样式规范 | Profile |
| 10 | 文档规范 | 通用 |
| 11 | 测试规范 | 通用 |
| 12 | Superpowers 执行规范 | 通用 |
| 13 | 代码格式化与检查 | 通用 |

**讲师备注**：
快速过一遍全景，让大家知道总共有多少规范、覆盖哪些方面。后面逐条展开。

**时间**：1 分钟

---

### 第 16 页 | 02-编码规范

**标题**：编码规范 — TypeScript + 命名

**要点**：
- 必须使用 TypeScript，禁止 any（用 unknown 代替）
- 命名规则：kebab-case（目录）、camelCase（变量）、PascalCase（组件/接口）
- 布尔值必须 is/has/can/should 前缀
- 回调 onXxx，本地处理 handleXxx

**正例/反例**：
```typescript
// ✅ isLoading、handleSubmit、UserInfo
// ❌ loading（布尔无前缀）、submit（本地函数无 handle）、userinfo（接口非 PascalCase）
```

**讲师备注**：
命名规范是团队反复争论的点。统一后 AI 自动遵守，省去每次 Review 的争论。

**时间**：2 分钟

---

### 第 17 页 | 05-API 规范

**标题**：API 规范 — 命名 + 目录 + 错误处理

**要点**：
- 目录：`src/api/<module>.ts` + `src/api/types/<module>.ts`
- 命名（NON-NEGOTIABLE）：`getXxxListApi` / `createXxxApi` / `updateXxxApi` / `deleteXxxApi`
- 统一 Api 后缀，禁止 fetch 前缀
- 错误由 requestConfig 统一处理，业务代码不重复 message.error

**讲师备注**：
展示一个完整的 API 文件示例。强调"禁止在组件中直接调用 request"这一约束。

**时间**：2 分钟

---

### 第 18 页 | 03-项目结构

**标题**：项目结构 — 标准目录（NON-NEGOTIABLE）

**要点**：
- Vue：16 个标准目录（api/components/composables/views/store/router...）
- 禁止在 src/ 下新建非标准目录
- 页面组件放在 `views/<page>/components/`
- Mock 策略：`src/mock/<module>.ts`，接口未完成时 UI 优先

**讲师备注**：
这是 AI 最容易违反的规范之一——没有约束时，AI 会创建 helpers/、shared/ 等目录。有了这条规范，AI 会严格遵守。

**时间**：2 分钟

---

### 第 19 页 | 04-组件规范

**标题**：组件规范 — SFC 结构 + 分层

**要点**：
- 强制 `<script setup lang="ts">`，禁止 Options API
- 目录结构：`index.vue` + `types.ts` + `style.module.scss`
- 单文件不超过 400 行
- 放置决策：多处复用 → `src/components/`；单页使用 → `views/<page>/components/`

**讲师备注**：
展示组件放置决策树。

**时间**：2 分钟

---

### 第 20 页 | 06-路由规范

**标题**：路由规范 — 懒加载 + 集中管理（NON-NEGOTIABLE）

**要点**：
- 路由集中在 `src/router/modules/`
- 页面必须使用 `() => import()` 懒加载
- meta 字段：title、requiresAuth、roles、keepAlive、hidden
- 鉴权在全局守卫处理，禁止组件级鉴权
- 路由 name 全局唯一

**讲师备注**：
展示一条完整的路由配置代码。

**时间**：2 分钟

---

### 第 21 页 | 07-状态管理

**标题**：状态管理 — Pinia Setup Store（NON-NEGOTIABLE）

**要点**：
- 必须使用 Pinia，禁止 Vuex
- Setup Store（组合式）语法
- 目录：`src/store/modules/<name>/index.ts` + `type.ts`
- 导出 `useXxxStore`
- 解构用 `storeToRefs` 保持响应性
- 单 store 不超过 200 行

**讲师备注**：
展示一个完整的 Store 文件。强调 storeToRefs 的重要性——直接解构会丢失响应性。

**时间**：2 分钟

---

### 第 22 页 | 09-样式规范

**标题**：样式规范 — 主题变量（NON-NEGOTIABLE）

**要点**：
- CSS Modules 优先（`style.module.scss`），也允许 scoped
- 必须使用主题 CSS 变量，严格禁止硬编码颜色
- 变量定义在 `src/styles/variables.scss`
- 主题切换通过 `data-theme` 属性
- 推荐变量：`--color-primary`、`--color-text-primary`、`--color-bg-container` 等

**讲师备注**：
展示正确/错误的样式代码对比。这条规范直接影响暗色模式的支持。

**时间**：2 分钟

---

### 第 23 页 | 08-通用约束 + 10-文档 + 11-测试 + 13-格式化

**标题**：其余通用规范速览

**要点**：
- **08-通用约束**：中文注释、禁止硬编码密钥、Conventional Commits、占位元素
- **10-文档规范**：JSDoc 说语义不说类型、注释解释"为什么"
- **11-测试规范**：Vitest + AAA 模式、工具函数和 Store 必须测试
- **13-格式化**：Prettier（单引号、2 空格、100 字符）+ ESLint + Stylelint；husky/commitlint 为可选提交校验

**讲师备注**：
这四条放一起快速过。如果时间充裕可以展开测试规范部分。

**时间**：2 分钟

---

### 第 24 页 | 12-Superpowers 执行规范

**标题**：Superpowers — AI 编码的三道关卡

**要点**：
- 禁止 AI 直接输出大量代码
- 三道关卡：头脑风暴 → TDD → 双重审查
- 头脑风暴结论需用户确认后才可编码
- 逐条执行 tasks.md，禁止跳过或批量完成
- 可跳过：拼写修复、Bug fix、依赖更新

**讲师备注**：
这是 ai-spec-auto  最独特的规范。它确保 AI 不是"一股脑输出代码"，而是像有经验的开发者一样"先想清楚再动手"。

**时间**：2 分钟

---

## Part 4：技能体系与工作流（20 分钟）

---

### 第 25 页 | 技能总览

**标题**：16+ 技能覆盖全流程

**要点**：

| 类别 | 技能 | 数量 |
|------|------|------|
| 流程类 | using-superpowers、create-proposal（OpenSpec 增强层）、execute-task | 3 |
| 实现类 | create-component、create-view、create-store、create-api | 4 |
| 分析类 | design-analysis、vue-best-practices | 2 |
| 验收类 | ui-verification、web-design-guidelines | 2 |
| 测试类 | create-test | 1 |
| 工具类 | project-init、find-skills、skill-creator、theme-variables | 4 |

**讲师备注**：
技能分四大类，流程类优先级最高（会自动调度其他技能）。

**时间**：2 分钟

---

### 第 26 页 | Superpowers Loop 详解

**标题**：Superpowers 四步循环

**要点（配流程图）**：

```
Step 1: 加载上下文 + 头脑风暴
  → 读取 tasks.md，思考边界和影响
  → 输出结论，等待用户确认

Step 2: TDD 落地编码
  → RED：先写失败测试
  → GREEN：写最少代码让测试通过
  → REFACTOR：引用 Rules 重构

Step 3: 双重自我审查
  → 设计对齐（与 spec 一致？）
  → 质量门禁（异常捕获？类型严谨？）

Step 4: 状态更新
  → 标记 task 完成
  → 进入下一条 task
```

**讲师备注**：
重点讲 Step 1 的"用户确认门禁"——这确保了人始终在 loop 中，不会让 AI 失控。

**时间**：3 分钟

---

### 第 27 页 | create-proposal 工作流

**标题**：创建提案 — 前置分析 + 委托 OpenSpec

**要点**：
1. 明确需求类型（有无设计稿、有无接口、页面 or 组件）
2. 有设计稿 → 调用 design-analysis 产出 UI 分析清单
3. 规划组件结构和目录
4. 定义接口对接方案
5. 输出 proposal.md + tasks.md + spec.md

**讲师备注**：
create-proposal 是"需求入口"，它做前置分析后委托 `/opsx:propose` 生成提案，再做后置检查确保符合 ai-spec-auto  规范。

**时间**：2 分钟

---

### 第 28 页 | create-component 工作流

**标题**：创建组件 — 按规范自动生成

**要点**：
1. 判断放置位置（通用 vs 页面级）
2. 在 types.ts 定义 Props/Emits
3. 编写 SFC（`<script setup lang="ts">`）
4. 使用 style.module.scss + 主题变量
5. 通用组件在 index.ts 集中导出

**产出文件**：
```
src/components/UserCard/
  ├─ index.vue
  ├─ types.ts
  └─ style.module.scss
```

**讲师备注**：
现场展示：对 AI 说"创建一个用户卡片组件"，观察 AI 的执行过程。

**时间**：2 分钟

---

### 第 29 页 | create-view 工作流

**标题**：创建页面 — 目录 + 路由一步到位

**要点**：
1. 在 `src/views/<name>/` 创建 index.vue
2. 配置路由 `src/router/modules/<name>.ts`（懒加载）
3. 在 `src/router/index.ts` 注册
4. 复杂逻辑抽取到 `composables/`

**讲师备注**：
强调 create-view 会自动配置路由，不需要手动去改 router 文件。

**时间**：2 分钟

---

### 第 30 页 | create-api 工作流

**标题**：对接接口 — 类型先行

**要点**：
1. 在 `src/api/types/<name>.ts` 定义请求/响应类型
2. 在 `src/api/<name>.ts` 编写请求函数
3. 命名遵循 getXxxListApi / createXxxApi 规则
4. 错误处理交给 requestConfig

**讲师备注**：
展示完整的 API 类型 + 请求函数代码。

**时间**：2 分钟

---

### 第 31 页 | create-store 工作流

**标题**：创建 Store — Pinia Setup Store

**要点**：
1. 在 `src/store/modules/<name>/type.ts` 定义类型
2. 在 `index.ts` 使用 Setup Store 写法
3. 导出 useXxxStore
4. 可选持久化（pinia-plugin-persistedstate）
5. 在 `src/store/index.ts` 集中导出

**讲师备注**：
展示完整的 Store 代码。提醒：组件中解构状态一定要用 storeToRefs。

**时间**：2 分钟

---

### 第 32 页 | design-analysis + ui-verification

**标题**：设计还原闭环

**要点**：
- **design-analysis**：分析设计稿 → 提取布局/元素/样式 → 输出 UI 分析清单
- **ui-verification**：打开浏览器 → 截图 → 与设计稿比对 → 输出问题清单 → 修复
- 形成闭环：分析 → 实现 → 验收 → 反思

**讲师备注**：
这两个技能配合 MCP（Figma + Playwright）效果最佳。即使没有 MCP，也可以手动提供设计稿截图。

**时间**：3 分钟

---

### 第 33 页 | 技能调度机制

**标题**：using-superpowers — 自动选择正确技能

**要点**：
- 每次对话开始时自动检查适用技能
- 调度优先级：流程类 > 实现类 > 验收类
- 开发者只需说自然语言，AI 自动选择技能
- 例："创建用户列表页" → 触发 create-view → 引用 04/06/09 规范

**讲师备注**：
这就是"规范驱动"的核心——开发者不需要记住 13 条规范和 16 个技能，AI 自己知道什么时候用什么。

**时间**：2 分钟

---

## Part 5：现场演示（25 分钟）

---

### 第 34 页 | 演示环境准备

**标题**：Demo 环境

**要点**：
- 一个空的 Vue 3 + Vite 项目
- 已运行 `bash install.sh init . --profile vue`（默认 L3）
- Cursor IDE 已打开
- 将演示：安装 → 初始化 → 创建组件 → 创建页面 → 对接接口

**讲师备注**：
提前准备好演示项目。如果网络不好，可以录屏备用。

**时间**：1 分钟

---

### 第 35 页 | Demo 1：安装规范库

**标题**：Demo — 5 分钟安装

**演示步骤**：
1. `git clone` 规范库
2. `bash install.sh init ./demo-project --profile vue`
3. 展示安装后的目录结构（.agents/rules/、.agents/skills/）
4. `bash install.sh check ./demo-project` 验证安装

**观察点**：
- 规范文件是否正确合并
- IDE 软链接是否创建成功
- lint 配置是否就位

**讲师备注**：
边操作边讲解每一步做了什么。如果时间紧可以用已安装好的项目直接跳过。

**时间**：5 分钟

---

### 第 36 页 | Demo 2：初始化项目规范

**标题**：Demo — 让 AI 认识你的项目

**演示步骤**：
1. 在 Cursor 中输入："初始化项目规范"
2. AI 自动分析 package.json 和 src/ 目录
3. 生成 01-项目概述.md 和 03-项目结构.md；若自定义规则缺失，还会补生成 04/05/06/07/09
4. 展示生成的内容

**观察点**：
- AI 是否正确识别了技术栈
- 目录结构描述是否准确

**讲师备注**：
这一步让 AI "认识"项目。之后的所有操作，AI 都会基于这个认知。

**时间**：3 分钟

---

### 第 37 页 | Demo 3：创建组件

**标题**：Demo — "创建一个用户卡片组件"

**演示步骤**：
1. 对 AI 说："创建一个用户卡片组件，显示头像、姓名和角色"
2. 观察 AI 的执行过程
3. 查看生成的文件：index.vue、types.ts、style.module.scss

**检查清单**：
- [ ] 组件放在 `src/components/UserCard/`
- [ ] 使用 `<script setup lang="ts">`
- [ ] Props 在 types.ts 中定义
- [ ] 样式使用 CSS Modules + 主题变量
- [ ] 无硬编码颜色

**讲师备注**：
逐项对照检查清单，展示规范是如何被 AI 自动遵循的。

**时间**：5 分钟

---

### 第 38 页 | Demo 4：创建页面 + 路由

**标题**：Demo — "新增用户管理页"

**演示步骤**：
1. 对 AI 说："新增一个用户管理列表页"
2. 观察 AI 创建的文件和路由配置
3. 验证路由是否使用懒加载

**检查清单**：
- [ ] 页面在 `src/views/user-manage/index.vue`
- [ ] 路由在 `src/router/modules/user-manage.ts`
- [ ] 使用 `() => import()` 懒加载
- [ ] meta 包含 title 和 requiresAuth

**讲师备注**：
展示完整的路由配置代码。

**时间**：5 分钟

---

### 第 39 页 | Demo 5：对接接口

**标题**：Demo — "对接用户列表接口"

**演示步骤**：
1. 对 AI 说："对接用户列表接口，POST /api/user/page"
2. 观察 AI 创建的类型和请求函数

**检查清单**：
- [ ] 类型在 `src/api/types/user.ts`
- [ ] 请求在 `src/api/user.ts`
- [ ] 命名为 `getUserListApi`
- [ ] 无重复错误处理

**讲师备注**：
展示类型定义和请求函数代码，强调"Api 后缀"和"禁止 fetch 前缀"。

**时间**：5 分钟

---

### 第 40 页 | Demo 总结

**标题**：Demo 回顾 — 规范自动生效

**要点**：
- 整个演示过程中，开发者只说了自然语言
- AI 自动选择了正确的技能
- 所有产出代码都遵循了团队规范
- 无需手动检查目录、命名、样式——规范已内化

**讲师备注**：
回到第 5 页的"预期效果"，对照一下——刚才的演示中，AI 代码采纳率接近 100%，因为每一行都遵循了规范。

**时间**：1 分钟

---

## Part 6：团队落地与推广（15 分钟）

---

### 第 41 页 | 8 个决策点

**标题**：接入前必须回答的 8 个问题

**要点**：
1. 目录分层：components/views 还是 modules/pages？
2. UI 体系：Element Plus、Antd、Naive UI、自研？
3. 样式方案：SCSS Modules、UnoCSS、Tailwind？
4. 数据访问：api/、services/、http/？
5. 状态管理：Pinia、Zustand、Redux？
6. 路由约定：文件路由、手写路由？
7. 测试门禁：单测、E2E、覆盖率要求？
8. 文档习惯：JSDoc、ADR、API 文档？

**讲师备注**：
这些问题不需要当场全部回答，但接入前必须对齐。ai-spec-auto  默认提供了一套答案（Vue: views + Element Plus + SCSS Modules + api/ + Pinia + 手写路由），团队可以根据实际调整。

**时间**：3 分钟

---

### 第 42 页 | 改造顺序

**标题**：如何把 ai-spec-auto  改造成你的规范

**要点**：
1. **先改 Rule 标题与模块边界**（调整规范编号和范围）
2. **再改 NON-NEGOTIABLE 约束**（目录禁令、命名规范等）
3. **把高频操作抽成 Skill**（团队特有的工作流）
4. **最后接工具配置**（IDE 适配、MCP、OpenSpec）

**讲师备注**：
从 Rule 开始改，因为 Skill 引用 Rule；从约束开始改，因为约束影响最大。

**时间**：2 分钟

---

### 第 43 页 | 三阶段推广

**标题**：推荐推广路径

**要点**：

| 阶段 | 目标 | 时长 | 关键动作 |
|------|------|------|----------|
| 试点 | 1 个团队、1 个项目验证 | 2 周 | 安装、跑通核心场景、收集反馈 |
| 扩展 | 2-3 个项目 | 1-2 月 | 提炼通用规范、定制项目规则 |
| 平台化 | 全团队模板 | 持续 | 治理机制、定期更新、验收指标 |

**讲师备注**：
不要急着全团队推广。先在一个项目上验证效果，用数据说话。

**时间**：3 分钟

---

### 第 44 页 | 角色分工

**标题**：谁来维护规范？

**要点**：

| 角色 | 职责 |
|------|------|
| 规范 Owner | 维护 .agents/rules/ 的稳定性 |
| 技能 Owner | 维护高频技能的准确度 |
| 流程 Owner | 维护 OpenSpec 流程与培训 |
| 试点开发者 | 反馈不实用的规则和技能 |

**讲师备注**：
建议前期由 1-2 人兼任规范和技能 Owner。随着规模扩大再拆分。

**时间**：2 分钟

---

### 第 45 页 | 常见阻力与应对

**标题**：预期的阻力

**要点**：

| 阻力 | 应对 |
|------|------|
| "写规则太麻烦" | 一次性沉淀 vs 反复口头解释 |
| "AI 已经会写代码了" | "通用代码" vs "团队认可的代码" |
| "OpenSpec 太重" | 新功能用，bug fix 跳过 |
| "规范太多记不住" | 开发者说自然语言，AI 自己记规范 |
| "影响开发速度" | 减少返工 = 实际加速 |

**讲师备注**：
每条阻力都用一句话回应。关键信息：规范不是约束开发者，是约束 AI。

**时间**：3 分钟

---

### 第 46 页 | 更新与维护

**标题**：规范是活的，需要持续演进

**要点**：
- 定期运行 `install.sh update` 同步最新通用规范
- 项目特有规则（01/03）不会被覆盖
- 新增自定义规范：在 `.agents/rules/` 下创建 `14-xxx.md`
- 新增自定义技能：在 `.agents/skills/` 下创建目录和 SKILL.md
- 建议每月复盘一次规范有效性

**讲师备注**：
规范不是写完就不动了。每次 Code Review 中发现的反复问题，都应该沉淀为新规范。

**时间**：2 分钟

---

## Part 7：Q&A + 行动计划（10 分钟）

---

### 第 47 页 | 试点检查表

**标题**：第一轮试点 — 行动检查表

**要点**：
- [ ] 确定试点项目与负责人
- [ ] 选择 Profile 并运行安装
- [ ] 填写 01-项目概述 和 03-项目结构
- [ ] 跑通"创建组件"场景
- [ ] 跑通"创建页面 + 路由"场景
- [ ] 跑通"对接接口"场景
- [ ] 接通至少一个 MCP（Figma / ApiFox / Playwright）
- [ ] 两周后复盘，调整 rules/skills

**讲师备注**：
这个检查表可以直接作为试点期间的跟踪文档。

**时间**：2 分钟

---

### 第 48 页 | 90 分钟工作坊方法

**标题**：如何带团队做规范改造工作坊

**要点**：
- 前 20 分钟：列出团队最痛的 10 个 AI 输出问题
- 中间 30 分钟：把问题归类到规范模块（对照 13 条规范）
- 后 20 分钟：选出最有价值的 3 个 Skill
- 最后 20 分钟：定义第一轮试点范围

**讲师备注**：
建议在培训后的 1 周内组织一次工作坊。把团队的实际痛点转化为具体的规范改造任务。

**时间**：2 分钟

---

### 第 49 页 | 资源链接

**标题**：学习资源

**要点**：
- 规范库：`git clone http://git.100credit.cn/zhenwei.li/ai-spec-auto .git`
- 快速上手：`docs/quick-start.md`
- 安装指南：`docs/install-guide.md`
- 培训手册：`docs/规范驱动开发团队内部培训手册.md`
- 测试验证：`docs/测试验证规范库文档.md`

**讲师备注**：
提供完整的学习路径，鼓励大家课后自行阅读培训手册。

**时间**：1 分钟

---

### 第 50 页 | 结束页

**标题**：从"能跑的代码"到"团队认可的代码"

**要点**：
- 规范驱动 = 让 AI 遵循团队规矩
- 一次沉淀 → 持续受益
- 开始试点，用数据说话

**讲师备注**：
感谢大家参与，开放 Q&A 环节。预留 5 分钟回答问题。

**时间**：5 分钟（含 Q&A）
