---
name: create-component
description: 指导在 Vue 3 项目中按团队规范创建和拆分 SFC 组件，包括目录结构、文件命名、样式与主题变量使用。当前端需要新增或重构组件时使用本技能。
compatibility: Requires a local Vue project workspace and the repository's component/style conventions under .agents/rules/.
---

# 创建与拆分 Vue 组件

## 组件放在哪里？

- **通用组件**（跨页面复用）：`src/components/<component-name>/index.vue + types.ts + style.module.scss`
- **页面级组件**（只在单页使用）：`src/views/<page>/components/<component-name>/`
- 目录名 `kebab-case`，组件引用名 `PascalCase`

---

## 创建步骤

### 1. 定义类型（types.ts）

```ts
// src/components/user-avatar/types.ts
export interface UserAvatarProps {
  src: string
  size?: number
}
export interface UserAvatarEmits {
  (e: 'click', event: MouseEvent): void
}
```

### 2. 编写 SFC（index.vue）

```vue
<!-- src/components/user-avatar/index.vue -->
<script setup lang="ts">
import type { UserAvatarProps, UserAvatarEmits } from './types'
import styles from './style.module.scss'

withDefaults(defineProps<UserAvatarProps>(), { size: 40 })
defineEmits<UserAvatarEmits>()
</script>

<template>
  <img :class="styles.avatar" :src="src" :width="size" :height="size" @click="$emit('click', $event)" />
</template>
```

### 3. 样式（style.module.scss）

```scss
.avatar {
  border-radius: 50%;
  object-fit: cover;
  border: 1px solid var(--color-border);        // 必须使用主题变量
  background-color: var(--color-bg-container);   // 禁止硬编码颜色
}
```

---

## 核心规则

- 必须使用 `<script setup lang="ts">`，通过 `defineProps` / `defineEmits` / `defineSlots` 声明接口
- 样式使用 CSS Modules（`style.module.scss`）或 `<style scoped>`，颜色必须用主题变量
- 单个 `.vue` 文件不超过 **400 行**，超过时拆分子组件
- 一个组件聚焦单一职责

---

## 快速检查清单

- [ ] 组件放在了正确位置（通用 vs 页面级）？
- [ ] 使用了 `<script setup lang="ts">` + defineProps/defineEmits？
- [ ] 样式使用 CSS Modules 或 scoped，颜色用主题变量？
- [ ] 文件不超过 400 行？
