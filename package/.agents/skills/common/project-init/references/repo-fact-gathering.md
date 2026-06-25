# 项目事实采集

## 目标

采集足够稳定的仓库事实，用于生成：

- `01-项目概述.md`
- `03-项目结构.md`
- `context/PROJECT.md`
- 按需自定义规则

如果本 skill 所带的 `scripts/inspect-project.js` 可用，可先跑它收集一版摘要，再人工补读关键文件。

## 1. 读取 `package.json`

至少提取：

- UI 框架：`react` / `vue` / `angular`
- 类型系统：`typescript`
- 构建工具：`vite` / `webpack` / `next` / `nuxt`
- 路由：`react-router*` / `vue-router`
- 状态管理：`zustand` / `pinia` / `redux` / `mobx`
- 组件库：`antd` / `element-plus` / `@mui/*`
- 样式方案：`tailwind` / `sass` / `less` / CSS Modules / scoped 线索
- 请求方案：`axios` / `fetch` / 自有 request 封装
- 常用工具：`ahooks` / `@vueuse/core` / `lodash*` / `dayjs`

## 2. 检查后端标记文件

若仓库同时存在后端工程标记文件，也要补读后端线索，用于完善 `01-项目概述.md` 和 `context/PROJECT.md`：

- Java / JVM：`pom.xml`、`build.gradle`、`build.gradle.kts`
- Python：`pyproject.toml`、`requirements.txt`、`setup.py`

能确认时写清：

- 是否为前后端混合仓库
- 后端技术栈大类
- 前后端目录的基本分工

## 3. 读取 `README.md` 与已有项目说明

只提取稳定背景：

- 项目定位
- 业务目标
- 核心术语
- 架构关键词
- 明确的边界或非目标

若仓库没有稳定说明，只保留已确认事实，不编造背景。

## 4. 扫描 `src/` 或等价源码目录

至少确认：

- 顶层目录列表及用途推断
- 入口文件，如 `main.ts`、`main.tsx`、`App.vue`、`App.tsx`
- 页面目录模式，如 `views/`、`pages/`
- 路由组织模式：文件路由 / 配置路由 / 当前无骨架

## 5. 判定项目类型

根据现状判断：

- SPA
- SSR / SSG
- 微前端
- 前后端混合仓库
- 组件库 / 工具库
- Monorepo

## 6. 判定 TS / JS

- 若 `package.json` 中存在 `typescript`
- 则视为 TypeScript 项目
- 否则按 JavaScript 项目处理

## 约束

- 只记录稳定事实
- 不把任务期默认假设写成项目长期事实
- 无法确认的内容必须明确标成“待补充”
