---
name: theme-variables
description: 指导在 Vue 3 项目中正确使用主题 CSS 变量，避免硬编码颜色并保证暗色/浅色主题切换一致性。当前端编写或修改样式时使用本技能。
compatibility: Requires a local Vue project workspace plus the repository's style conventions and theme variable setup.
---

# 主题 CSS 变量与样式规范

## 基本原则

所有样式必须使用 **CSS 变量** 表达主题颜色，禁止硬编码。

---

## 变量定义

通过 `data-theme` 切换亮暗模式，在 `src/styles/variables.scss` 中定义：

```scss
:root, [data-theme='light'] {
  --color-primary: #1677ff;
  --color-text: #1f1f1f;
  --color-text-secondary: #666666;
  --color-bg-layout: #f5f5f5;
  --color-bg-container: #ffffff;
  --color-border: #d9d9d9;
  --color-success: #52c41a;
  --color-warning: #faad14;
  --color-error: #ff4d4f;
}

[data-theme='dark'] {
  --color-primary: #1668dc;
  --color-text: #ffffffd9;
  --color-text-secondary: #ffffff73;
  --color-bg-layout: #141414;
  --color-bg-container: #1f1f1f;
  --color-border: #424242;
  --color-success: #49aa19;
  --color-warning: #d89614;
  --color-error: #dc4446;
}
```

---

## 在组件中使用

```vue
<style scoped lang="scss">
.card {
  background-color: var(--color-bg-container);
  color: var(--color-text);
  border: 1px solid var(--color-border);
}
</style>
```

CSS Modules 中同理。

## 常用变量

`--color-primary`、`--color-text`、`--color-text-secondary`、`--color-bg-layout`、`--color-bg-container`、`--color-border`、`--color-success`、`--color-warning`、`--color-error`

**反例：** `background-color: #1677ff` ❌ → `background-color: var(--color-primary)` ✅

---

## 快速检查清单

- [ ] 所有颜色来自 `var(--color-xxx)`？
- [ ] 未硬编码任何颜色值？
- [ ] 新增变量同时在 light 和 dark 中声明？
