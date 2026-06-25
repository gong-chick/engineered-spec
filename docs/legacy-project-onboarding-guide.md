# 老项目接入 ai-spec-auto 完整指南

## 概述

老项目(已有代码库)接入 ai-spec-auto 时,**不能直接开始开发**,需要先对项目进行梳理和记录,让 AI 了解项目现状。

本指南详细说明如何处理老项目的梳理记录工作。

---

## 一、为什么老项目需要梳理?

### 问题场景

```
老项目特点:
- ✅ 已有大量代码
- ✅ 已有目录结构
- ✅ 已有技术栈约定
- ✅ 已有业务逻辑
- ❌ 但没有文档记录
- ❌ AI 不了解项目背景
- ❌ 新需求容易偏离既有约定
```

### 不梳理的后果

```text
用户: 在老项目中新增用户管理功能

AI (不了解项目):
- ❌ 创建了新的目录结构(与既有不一致)
- ❌ 使用了不同的组件库(与既有不统一)
- ❌ 接口封装方式不同(维护困难)
- ❌ 路由落点错误(应该放 /user 却放了 /admin)
```

### 梳理后的效果

```text
AI (已了解项目):
- ✅ 复用既有目录结构
- ✅ 使用项目既有的组件库
- ✅ 按既有方式封装接口
- ✅ 路由落点正确
- ✅ 命名风格一致
```

---

## 二、老项目接入流程

### 完整流程

```
第 1 步: 安装 ai-spec-auto
  ↓
第 2 步: 运行 project-init 技能(项目梳理)
  ↓
第 3 步: 验证生成的文件
  ↓
第 4 步: 补充缺失信息(可选)
  ↓
第 5 步: 开始正常开发
```

---

## 三、第 1 步: 安装 ai-spec-auto

### 3.1 执行安装

```bash
# 进入老项目根目录
cd /path/to/your/legacy-project

# 安装 ai-spec-auto
npx @engineered/ai-spec-auto@latest init . --profile vue -y

# 或者交互式安装(可以选择 profile)
npx @engineered/ai-spec-auto@latest init .
```

### 3.2 安装后生成的目录

```
your-legacy-project/
├── .agents/                    # 规范源(新)
│   ├── rules/                  # 项目规则
│   ├── skills/                 # 执行技能
│   ├── commands/               # 命令模板
│   └── registry/               # Profile 注册表
├── .ai-spec/                   # 运行态数据(新)
│   ├── manifest.json           # 安装清单
│   └── lock.json               # 版本锁定
├── .cursor/                    # IDE 适配(新)
├── .claude/                    # IDE 适配(新)
├── .qoder/                     # IDE 适配(新)
├── openspec/                   # OpenSpec 流程(新)
└── [原有项目文件]              # 不动!
```

**重要**: 安装过程**不会修改任何业务代码**!

---

## 四、第 2 步: 运行 project-init 技能(核心!)

### 4.1 触发项目初始化

在 IDE(Qoder/Cursor/Claude)中执行:

```text
用户: 初始化项目规范

或者:
用户: 分析当前项目技术栈

或者:
用户: project-init
```

### 4.2 AI 自动执行的工作

#### **工作 1: 扫描项目事实**

AI 会读取:
- `package.json` - 依赖、脚本、技术栈
- 目录结构 - 源码组织方式
- 现有代码 - 命名风格、组件用法、接口封装
- 配置文件 - vite.config.ts, tsconfig.json 等

```bash
# 底层会执行(如果有这个脚本):
node scripts/inspect-project.js

# 输出项目事实摘要
```

#### **工作 2: 生成项目概述**

生成 `.agents/rules/01-项目概述.md`:

```markdown
# 项目概述

## 项目定位
商城后台管理系统,支持商品管理、订单管理、用户管理

## 技术栈
- **框架**: Vue 3.3 + TypeScript 5.0
- **构建**: Vite 4.4
- **UI 库**: Element Plus 2.3
- **状态**: Pinia 2.1
- **路由**: Vue Router 4.2
- **HTTP**: Axios 1.4
- **工具库**: dayjs, lodash-es

## 目录结构
```
src/
├── api/              # 接口封装
├── components/       # 全局组件
├── views/            # 页面视图
├── router/           # 路由配置
├── stores/           # Pinia 状态
└── utils/            # 工具函数
```

## 核心约定
- 组件使用 `<script setup>` 语法
- 接口统一在 `src/api/` 封装
- 路由按模块拆分,放在 `src/router/modules/`
- 全局组件放在 `src/components/`,使用 App 前缀
```

#### **工作 3: 生成项目结构文档**

生成 `.agents/rules/03-项目结构.md`:

```markdown
# 项目结构

## 目录说明

### src/api/
- 职责: 所有 HTTP 接口封装
- 命名: 按业务模块分文件 (user.ts, order.ts, product.ts)
- 规范: 每个函数返回 Promise,统一使用 request 实例

### src/components/
- 职责: 全局复用组件
- 命名: PascalCase,App 前缀 (AppTable, AppPagination)
- 结构: 每个组件独立目录,包含 index.vue 和 types.ts

### src/views/
- 职责: 页面级组件
- 命名: PascalCase,按路由分目录
- 落点: 
  - 用户管理: /views/user/
  - 订单管理: /views/order/
  - 商品管理: /views/product/

### src/router/modules/
- 职责: 路由模块配置
- 命名: 按业务模块分文件
- 懒加载: 所有页面使用 () => import() 懒加载
```

#### **工作 4: 生成 PROJECT.md**

生成 `context/PROJECT.md`:

```markdown
# PROJECT Context

## 项目事实
- 名称: mall-admin
- 类型: Vue 3 + TypeScript 后台管理系统
- 构建: Vite
- 包管理: pnpm

## 技术选型
- 优先使用 Composition API
- 优先使用 `<script setup>`
- 优先使用 TypeScript
- 状态管理使用 Pinia

## 既有约定
- 接口封装: src/api/ 目录,按模块分文件
- 组件命名: PascalCase,全局组件 App 前缀
- 路由落点: src/views/ 按业务分目录
- 样式方案: SCSS + CSS 变量
- 代码规范: ESLint + Prettier

## 注意事项
- 存量项目中部分老文件仍使用 Options API
- 新增功能统一使用 Composition API
- 不要修改老文件,除非明确要求重构
```

#### **工作 5: 生成能力规则**

根据 profile(vue/react/springboot 等)生成对应的能力规则:

```
.agents/rules/
├── 01-项目概述.md              ✅ 已生成
├── 03-项目结构.md              ✅ 已生成
├── 04-组件规范.md              ✅ 按项目事实生成
├── 05-API规范.md               ✅ 按项目事实生成
├── 06-路由规范.md              ✅ 按项目事实生成
├── 07-状态管理.md              ✅ 按项目事实生成
├── 09-样式规范.md              ✅ 按项目事实生成
├── 11-测试规范.md              ✅ 按项目事实生成
└── 13-代码格式化.md            ✅ 按项目事实生成
```

**关键**: 这些规则**不是照搬模板**,而是**基于项目实际代码归纳**的!

---

## 五、第 3 步: 验证生成的文件

### 5.1 检查文件是否生成

```bash
# 检查项目概述
cat .agents/rules/01-项目概述.md

# 检查项目结构
cat .agents/rules/03-项目结构.md

# 检查项目上下文
cat context/PROJECT.md

# 检查能力规则
ls -la .agents/rules/
```

### 5.2 验证内容准确性

打开生成的文件,检查:

**✅ 正确的内容**:
- 技术栈描述准确
- 目录结构与实际一致
- 既有约定真实可靠
- 没有臆造的业务信息

**❌ 需要修正的内容**:
- 技术栈描述错误(如实际用 Vue 2 写成 Vue 3)
- 目录结构不匹配
- 约定不符合实际
- 臆造了不存在的功能

### 5.3 运行检查命令

```bash
# 检查安装完整性
npx @engineered/ai-spec-auto@latest check .

# 应该输出:
# ✅ .agents/rules/ 存在
# ✅ 01-项目概述.md 存在
# ✅ 03-项目结构.md 存在
# ✅ context/PROJECT.md 存在
# ✅ ...
```

---

## 六、第 4 步: 补充缺失信息(可选)

### 6.1 手动编辑项目概述

如果 AI 生成的信息不完整或不准确,可以手动编辑:

```bash
vim .agents/rules/01-项目概述.md
```

**可以补充的内容**:
- 项目业务背景
- 核心功能模块
- 重要技术决策
- 已知技术债务
- 团队分工

### 6.2 补充项目约定

如果发现项目有特殊约定,AI 没有识别出来:

```bash
vim .agents/rules/01-项目概述.md
```

添加:

```markdown
## 项目特殊约定

### 接口封装
- 所有接口必须定义 TypeScript 类型
- 接口文件按业务模块拆分
- 统一使用 `@/utils/request` 实例

### 组件开发
- 复杂组件必须拆分 composables
- 表单统一使用 FormSchema 配置式
- 列表统一使用 ListSchema 配置式

### 权限控制
- 路由级权限使用 router.meta.permissions
- 按钮级权限使用 v-permission 指令
- 数据级权限在接口层处理
```

### 6.3 更新 PROJECT.md

```bash
vim context/PROJECT.md
```

补充:
- 历史遗留问题
- 不推荐的做法
- 需要避免的坑

---

## 七、第 5 步: 开始正常开发

### 7.1 验证 AI 是否了解项目

```text
用户: 这个项目使用什么技术栈?

AI (应该回答):
根据 01-项目概述.md,本项目使用:
- Vue 3.3 + TypeScript 5.0
- Vite 4.4 构建
- Element Plus 2.3 UI 库
- Pinia 2.1 状态管理
- ...

用户: 接口封装在哪里?

AI (应该回答):
根据 03-项目结构.md,接口统一封装在 src/api/ 目录,
按业务模块分文件,如 user.ts, order.ts 等。
```

### 7.2 开始第一个需求

```text
用户: /spec-start 新增用户角色管理功能

AI 执行:
1. 读取 01-项目概述.md (了解技术栈)
2. 读取 03-项目结构.md (了解目录结构)
3. 读取 context/PROJECT.md (了解项目背景)
4. 读取 .agents/rules/ 中的能力规则
5. 按项目既有约定产出 proposal/spec/tasks
```

**效果**:
- ✅ 接口封装在 `src/api/role.ts` (符合既有约定)
- ✅ 页面放在 `src/views/role/` (符合既有约定)
- ✅ 路由配置在 `src/router/modules/role.ts` (符合既有约定)
- ✅ 组件使用 Element Plus (与项目一致)
- ✅ 命名风格与既有代码一致

---

## 八、实际案例

### 案例 1: Vue 2 老项目

```bash
# 项目情况
- Vue 2.6 + JavaScript
- Vue CLI 4
- Element UI 2.15
- Vuex 3

# 安装
npx @engineered/ai-spec-auto@latest init . --profile vue -y

# 初始化
用户: 初始化项目规范

# AI 生成的 01-项目概述.md
## 技术栈
- 框架: Vue 2.6 + JavaScript (存量项目)
- 构建: Vue CLI 4
- UI 库: Element UI 2.15
- 状态: Vuex 3

## 注意事项
- 本项目为 JavaScript 存量项目,未使用 TypeScript
- 新增功能建议使用 Composition API + TypeScript
- 但不要修改老文件,保持兼容
```

### 案例 2: React 老项目

```bash
# 项目情况
- React 17 + JavaScript
- Create React App
- Ant Design 4
- Redux

# 安装
npx @engineered/ai-spec-auto@latest init . --profile react -y

# AI 会识别出:
- 项目使用 JavaScript 而非 TypeScript
- 使用类组件而非函数组件
- 使用 Redux 而非 Zustand/Context

# 生成的规则会考虑这些现状
```

### 案例 3: 超大型老项目

```bash
# 项目情况
- 1000+ 页面
- 混合使用 Vue 2/Vue 3
- 混合使用 JavaScript/TypeScript
- 多种 UI 库共存

# 处理策略
1. 运行 project-init,让 AI 扫描项目
2. 手动补充重要信息到 01-项目概述.md
3. 在 context/PROJECT.md 中标注:
   - 核心模块清单
   - 禁止修改的区域
   - 已知技术债务
4. 开始新需求时,AI 会尊重既有约定
```

---

## 九、常见问题

### Q1: project-init 会不会修改我的代码?

**绝对不会!**

project-init 只做**只读分析**,生成的是文档文件:
- ✅ 读取 package.json
- ✅ 读取目录结构
- ✅ 读取示例代码
- ❌ **不修改任何业务代码**
- ❌ **不重构任何文件**

### Q2: 如果 AI 识别的技术栈不准确怎么办?

**可以手动修正!**

```bash
# 编辑项目概述
vim .agents/rules/01-项目概述.md

# 修改技术栈描述
## 技术栈
- 框架: Vue 2.6 (AI 错误识别为 Vue 3,手动修正)
- ...
```

**AI 后续会使用修正后的信息**。

### Q3: 老项目没有 TypeScript,会不会有问题?

**不会!**

AI 会识别出是 JavaScript 项目,并:
- 生成对应的 JavaScript 规则
- 不强求使用 TypeScript
- 但在概述中会标注"建议使用 TS"

### Q4: 梳理过程需要多长时间?

**很快!**

- AI 扫描项目: 1-2 分钟
- 生成文档: 1-2 分钟
- 人工验证: 5-10 分钟
- **总计: 10-15 分钟**

### Q5: 可以重新运行 project-init 吗?

**可以!**

```text
用户: 重新初始化项目规范

AI 会:
- 重新扫描项目
- 刷新 01-项目概述.md
- 刷新 03-项目结构.md
- 刷新 context/PROJECT.md
- 刷新能力规则

⚠️ 注意: 手动编辑的内容会被覆盖!
```

**建议**: 手动补充的信息要备份,重新初始化后再贴回去。

### Q6: 多技术栈项目怎么办?

**支持多 profile!**

```bash
# 安装时指定多个 profile
npx @engineered/ai-spec-auto@latest init . --profile vue,react -y

# 或者手动编辑 manifest.json
{
  "profiles": ["vue", "react"]
}

# 然后运行 project-init
```

AI 会为每个技术栈生成对应的规则。

---

## 十、最佳实践

### ✅ 推荐做法

1. **安装后立即初始化**
   ```bash
   npx @engineered/ai-spec-auto@latest init .
   初始化项目规范
   ```

2. **仔细验证生成内容**
   - 打开每个生成的文件
   - 检查技术栈描述
   - 检查目录结构
   - 检查既有约定

3. **手动补充重要信息**
   - 业务背景
   - 核心模块清单
   - 已知技术债务
   - 禁止修改的区域

4. **定期更新**
   - 项目大改后重新运行 project-init
   - 保持文档与实际同步

### ❌ 避免做法

1. **不要跳过 project-init**
   - ❌ 直接开始开发
   - ✅ 先初始化再开发

2. **不要完全信任 AI**
   - ❌ 不验证生成内容
   - ✅ 人工检查准确性

3. **不要过度依赖**
   - ❌ 所有信息都让 AI 生成
   - ✅ 人工补充关键业务信息

4. **不要忘记更新**
   - ❌ 项目改了但不更新文档
   - ✅ 保持文档与实际同步

---

## 十一、总结

### 老项目接入核心步骤

```
1. 安装: npx @engineered/ai-spec-auto@latest init .
2. 初始化: 运行 project-init 技能
3. 验证: 检查生成的文件准确性
4. 补充: 手动编辑缺失/错误信息
5. 开发: 开始正常需求开发
```

### 生成的核心文件

| 文件 | 作用 | 重要性 |
|------|------|--------|
| `01-项目概述.md` | 技术栈、业务背景、核心约定 | ⭐⭐⭐⭐⭐ |
| `03-项目结构.md` | 目录结构、职责划分、命名规范 | ⭐⭐⭐⭐⭐ |
| `context/PROJECT.md` | 项目上下文、历史背景、注意事项 | ⭐⭐⭐⭐ |
| `04-*.md` ~ `13-*.md` | 能力规则(组件/API/路由等) | ⭐⭐⭐⭐ |

### 效果对比

| 维度 | 不梳理 | 梳理后 |
|------|--------|--------|
| AI 了解项目 | ❌ 不了解 | ✅ 全面了解 |
| 代码风格 | ❌ 不一致 | ✅ 与既有代码一致 |
| 目录结构 | ❌ 可能偏离 | ✅ 符合既有约定 |
| 技术选型 | ❌ 可能选错 | ✅ 使用项目既有技术 |
| 返工风险 | ❌ 高 | ✅ 低 |

---

## 十二、相关文档

- [project-init 技能定义](.agents/skills/common/project-init/SKILL.md)
- [01-项目概述模板](.agents/rules/profiles/vue/01-项目概述.md)
- [03-项目结构模板](.agents/rules/profiles/vue/03-项目结构.md)
- [Superpowers 与 OpenSpec 指南](docs/superpowers-and-openspec-guide.md)
- [IDE 命令模板映射机制](docs/ide-command-mapping-guide.md)

---

## 十三、快速参考卡片

```
┌─────────────────────────────────────────────────┐
│           老项目接入快速参考                      │
├─────────────────────────────────────────────────┤
│                                                 │
│  1. 安装                                        │
│     npx @engineered/ai-spec-auto@latest init .  │
│                                                 │
│  2. 初始化                                      │
│     用户: 初始化项目规范                          │
│                                                 │
│  3. 验证                                        │
│     cat .agents/rules/01-项目概述.md             │
│     cat .agents/rules/03-项目结构.md             │
│     cat context/PROJECT.md                       │
│                                                 │
│  4. 补充(可选)                                   │
│     vim .agents/rules/01-项目概述.md             │
│                                                 │
│  5. 开始开发                                     │
│     /spec-start 新功能...                        │
│                                                 │
└─────────────────────────────────────────────────┘
```

**核心要点**:
> 老项目接入必须先运行 `project-init`,让 AI 了解项目现状,再开始开发!
