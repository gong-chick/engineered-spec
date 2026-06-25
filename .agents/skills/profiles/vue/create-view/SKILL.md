---
name: create-view
description: 指导在 Vue 3 项目中按团队规范创建和维护页面视图，包括目录结构、路由模块配置及懒加载用法。当前端需要新增或重构页面时使用本技能。
compatibility: Requires a local Vue project workspace and the repository's page/view conventions under .agents/rules/.
---

# 创建与维护页面视图

## 目录结构

`src/views/<view-name>/`：`index.vue`（入口）+ `components/`（页面级子组件）+ `composables/`（useXxx）。目录名 `kebab-case`，通用组件提取到 `src/components/`。

---

## 创建步骤

### 1. 页面组件

```vue
<!-- src/views/user-manage/index.vue -->
<script setup lang="ts">
import UserTable from './components/user-table/index.vue'
import { useUserFilter } from './composables/useUserFilter'
const { filters, resetFilters } = useUserFilter()
</script>

<template>
  <div class="user-manage">
    <UserTable :filters="filters" @reset="resetFilters" />
  </div>
</template>

<style scoped lang="scss">
.user-manage { padding: 16px; background-color: var(--color-bg-layout); }
</style>
```

### 2. 路由模块

```ts
// src/router/modules/user-manage.ts
import type { RouteRecordRaw } from 'vue-router'

const routes: RouteRecordRaw[] = [
  {
    path: '/user-manage',
    name: 'UserManage',
    component: () => import('@/views/user-manage/index.vue'),
    meta: { title: '用户管理', requiresAuth: true, icon: 'user' },
  },
]
export default routes
```

- `() => import()` 懒加载，`name` 用 `PascalCase` 全局唯一
- `meta` 必须配置 `title`、`requiresAuth`

### 3. 注册路由

在 `src/router/index.ts` 中导入并展开模块路由。

### 4. 页面组合式函数

```ts
// src/views/user-manage/composables/useUserFilter.ts
import { reactive } from 'vue'
export function useUserFilter() {
  const filters = reactive({ keyword: '', status: '' })
  const resetFilters = () => Object.assign(filters, { keyword: '', status: '' })
  return { filters, resetFilters }
}
```

---

## 快速检查清单

- [ ] 目录 `kebab-case`，入口 `index.vue`？
- [ ] 路由在 `src/router/modules/` 下，使用懒加载？
- [ ] `meta` 配置了 `title`、`requiresAuth`？
- [ ] 页面专用逻辑抽取到 `composables/`？
