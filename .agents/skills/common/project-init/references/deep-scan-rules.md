# 待生成规则的深度扫描

## 目标

只对 `待生成列表 + 待刷新列表` 对应的能力域做深度扫描，避免全量重扫仓库。

## 若待生成 `04-组件规范`

- 扫描 `src/components/`、`src/views/*/components/`、`src/pages/*/components/`
- 随机读取 2-3 个组件文件，确认：
  - Vue：`<script setup>` / `lang="ts"` / `defineProps` / `defineEmits`
  - React：函数组件 / Props 接口 / JSX/TSX
- 归纳：
  - 组件目录组织方式
  - 页面专属组件与通用组件的边界
  - 组件库使用方式

## 若待生成 `05-API规范`

- 扫描 `src/api/`、`src/services/`、`src/request/`
- 读取 2-3 个接口文件或请求封装文件
- 归纳：
  - 请求库与统一封装入口
  - 命名模式
  - 类型落点
  - 错误处理模式

## 若待生成 `06-路由规范`

- 扫描 `src/router/`、`src/routes/` 或文件路由目录
- 读取现有路由配置
- 归纳：
  - 路由入口与模块拆分
  - 懒加载写法
  - `meta` 使用情况
  - 导航守卫
  - 页面目录与路由的映射关系

## 若待生成 `07-状态管理`

- 扫描 `src/store/`、`src/stores/`
- 从 `package.json` 与现有代码确认状态库
- 读取 2-3 个 store 文件
- 归纳：
  - 编写方式
  - 命名约定
  - 模块拆分方式
  - 是否使用持久化

## 若待生成 `09-样式规范`

- 统计样式文件后缀分布
- 检测 Vue SFC 的 `<style scoped>` / `module` / 无限定
- 检测是否存在 `src/styles/` 或全局样式入口
- 归纳：
  - CSS 变量
  - 主题 token
  - 组件库主题覆盖
  - Tailwind / Less / Sass 的实际使用规则
- 检测：
  - 硬编码颜色
  - 主题变量使用倾向

## 约束

- 只扫描本轮需要生成或刷新的规则
- 所有归纳必须基于样本文件，而不是目录名猜测
