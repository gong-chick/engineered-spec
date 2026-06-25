---
name: create-route
description: 指导在前端项目中按团队规范创建和维护路由与页面，包括路由模块配置、页面目录结构及懒加载用法。当前端需要新增或重构页面路由时使用本技能。
compatibility: Requires a local React project workspace and the repository's route/page conventions under .agents/rules/.
---

# 创建与维护路由

## 重要提示

在开始创建之前，请务必阅读以下关键规范：

**必读规范**：
- `.agents/rules/03-项目结构.md` - 目录结构要求
- `.agents/rules/06-路由规范.md` - 路由配置约束

**常见错误警告**：
- 样式文件必须使用 `.module.scss` 后缀，禁止使用 `.scss`
- 页面目录名使用 `kebab-case`，例如 `login`、`user-manage`
- 路由模块文件名使用 `kebab-case`，例如 `user-manage.ts`
- 必须在全局唯一路由入口注册，禁止多处维护同一条路由

## 常见错误

- 不要在路由模块里直接夹带页面实现逻辑
- 不要绕过唯一入口去重复注册同一条路由

---

## 目录结构概览

```text
src/
├── router/
│   ├── index.ts               # 路由入口，创建实例、注册守卫
│   └── modules/               # 按业务模块拆分路由配置
│       ├── dashboard.ts
│       └── user-manage.ts
└── pages/
    ├── dashboard/
    │   ├── index.tsx           # 页面主组件
    │   └── index.module.scss   # 样式文件（必须是 .module.scss）
    └── user-manage/
        ├── index.tsx
        ├── index.module.scss
        └── components/         # 页面专用子组件（可选）
            └── user-table/
                ├── index.tsx
                └── index.module.scss
```

---

## 步骤 1：创建页面组件

```tsx
// src/pages/user-manage/index.tsx
import React from 'react'
import styles from './index.module.scss'

const UserManagePage: React.FC = () => {
  return <div className={styles.userManage}>UserManage</div>
}

export default UserManagePage
```

**验证点**：
- [ ] 页面入口文件为 `index.tsx`
- [ ] 样式导入为 `./index.module.scss`
- [ ] 默认导出组件

---

## 步骤 2：创建路由模块配置

```tsx
// src/router/modules/user-manage.ts
import { lazy } from 'react'

const UserManage = lazy(() => import('@/pages/user-manage'))

const routes = [
  {
    path: '/user-manage',
    element: <UserManage />,
    meta: { title: '用户管理', requiresAuth: true },
  },
]

export default routes
```

**验证点**：
- [ ] 使用 `React.lazy` 懒加载页面组件
- [ ] 懒加载指向 `@/pages/<page-name>`
- [ ] 配置了 `meta.title` 和 `meta.requiresAuth`
- [ ] 不在模块中声明嵌套路由入口（如 `<Routes>`）

---

## 步骤 3：在路由入口注册

在 `src/router/index.ts` 中导入并展开模块路由：

```tsx
import userManageRoutes from './modules/user-manage'

const routes = [
  ...userManageRoutes,
  // ...其他模块
]
```

**验证点**：
- [ ] 只在 `src/router/index.ts` 唯一入口注册
- [ ] 导入路径正确 `./modules/<module-name>`

---

## 步骤 4：验证文件结构

创建完成后，检查目录结构是否符合规范：

```text
src/pages/<page-name>/
  ├─ index.tsx             ✓ 页面主组件
  └─ index.module.scss     ✓ 样式文件（必须是 .module.scss）

src/router/modules/
  └─ <module-name>.ts      ✓ 路由配置
```

---

## 页面级组件放置

如果页面需要专用组件，创建 `components/` 目录：

```text
src/pages/user-manage/
  ├─ index.tsx
  ├─ index.module.scss
  └─ components/           # 页面专用组件
      └─ user-table/
          ├─ index.tsx
          └─ index.module.scss
```

**组件放置规则**（详见 `.agents/rules/04-组件规范.md`）：
- 页面级组件（仅当前页面使用）→ `src/pages/<page>/components/`
- 通用组件（多处复用）→ `src/components/`

---

## 快速检查清单

创建完成后，逐项核对：

- [ ] 页面目录名为 `kebab-case`，位于 `src/pages/` 下
- [ ] 页面入口为 `index.tsx`，默认导出
- [ ] 样式文件为 `index.module.scss`（非 `.scss`）
- [ ] 路由模块在 `src/router/modules/<module-name>.ts`
- [ ] 使用 `React.lazy` 懒加载页面
- [ ] 路由在 `src/router/index.ts` 唯一入口注册
- [ ] 组件放置位置正确（通用 vs 页面级）

**样式还原检查**：涉及 UI 还原的样式开发，请参考 `.agents/skills/create-proposal/SKILL.md` 中的「样式还原验证检查清单」及对应页面的 `docs/样式还原/<名称>-UI分析清单.md`。
