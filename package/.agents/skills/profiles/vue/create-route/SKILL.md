---
name: create-route
description: 指导在 Vue 3 项目中按团队规范创建和维护页面路由，包括路由模块配置、页面落点、懒加载与 meta 约束。当前端需要新增或调整页面路由时使用本技能。
compatibility: Requires a local Vue project workspace and the repository's route/page conventions under .agents/rules/.
---

# 创建与维护 Vue 路由

## 重要提示

开始前必须先对齐这些规则：

- `.agents/rules/03-项目结构.md`：页面、路由、mock、store 的目录落点
- `.agents/rules/06-路由规范.md`：路由模块、懒加载、meta、唯一命名
- `.agents/rules/05-API规范.md`：若页面会接真实接口，接口落点必须同步考虑

如果当前仓库还没有 `src/router/index.ts` 或 `src/router/modules/`，先按 proposal/specs/design/tasks 判断：

- 是补路由骨架
- 还是保持占位入口，不强行新增半套路由

不要在没有路由入口的情况下，擅自发明另一套散落式路由结构。

## 目标

把页面路由稳定落到当前 Vue 项目的既有规范中：

- 页面目录：`src/views/<page>/index.vue`
- 路由模块：`src/router/modules/<module>.ts`
- 路由入口：`src/router/index.ts`

## 创建步骤

### 1. 明确页面与路由落点

先确认：

- 页面目录名使用 `kebab-case`
- 路由模块文件名使用 `kebab-case`
- 路由 `name` 使用 `PascalCase`，且全局唯一

示例：

```text
src/views/user-list/index.vue
src/router/modules/user-list.ts
```

### 2. 创建或补全路由模块

```ts
// src/router/modules/user-list.ts
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/user-list',
    name: 'UserList',
    component: () => import('@/views/user-list/index.vue'),
    meta: {
      title: '用户列表',
      requiresAuth: true,
    },
  },
]

export default routes
```

硬约束：

- 页面级路由必须使用 `() => import()` 懒加载
- `meta.title`、`meta.requiresAuth` 要按项目约定补齐
- 禁止在模块里静态导入页面组件

### 3. 在路由入口注册模块

```ts
// src/router/index.ts
import userListRoutes from './modules/user-list'

const routes = [
  ...userListRoutes,
]
```

硬约束：

- 路由只在统一入口注册
- 禁止在页面组件、布局组件或其他目录里重复维护路由

### 4. 对齐页面与交互边界

如果当前页面只是：

- 占位页
- mock 页
- 演示版

则路由 meta、按钮文案和页面提示里要显式体现，不要伪装成生产可用页面。

## 适配策略

### 已有完整路由骨架

优先：

- 复用现有 `src/router/index.ts`
- 复用现有 `src/router/modules/`
- 保持现有模块风格、导出形式和 meta 结构

### 尚无完整路由骨架

优先：

- 在 proposal/specs/design/tasks 中写清“补路由骨架”是本次范围的一部分
- 保持最小实现，不顺手扩展守卫、权限体系、菜单体系

不要：

- 在 `App.vue` 里临时堆一套伪路由，再同时新建 `src/router/`
- 创建和现有项目风格冲突的第二套路由组织方式

## 快速检查清单

- [ ] 页面落在 `src/views/<page>/index.vue`
- [ ] 路由模块落在 `src/router/modules/<module>.ts`
- [ ] 页面级路由使用动态导入懒加载
- [ ] 路由 `name` 全局唯一，`path` 与 proposal/specs/design/tasks 一致
- [ ] `meta.title`、`meta.requiresAuth` 已补齐
- [ ] 未在组件或页面内部重复维护路由
- [ ] 若为 mock/演示页，已在页面或 proposal 中明确边界

## 与其他技能的配合

- 页面结构优先交给 `create-view`
- 页面专用组件拆分交给 `create-component`
- 页面真实接口交给 `create-api`
- 样式与主题约束交给 `theme-variables`

`create-route` 只解决“路由落点、路由模块和入口注册”，不要把它扩成页面实现总入口。
