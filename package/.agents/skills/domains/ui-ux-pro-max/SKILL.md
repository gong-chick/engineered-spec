---
name: ui-ux-pro-max
description: AI 设计智能技能，提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则。当设计协作专家需要基于 Figma、标注或复杂 UI 约束做设计决策、标注提取和视觉方案收口，或用户明确要求页面更好看、漂亮、美观、有高级感、更有设计感、更有质感、更现代、更高级、优化视觉/优化 UI 时使用。
compatibility: Optional local assets may be installed at .agents/skills/domains/ui-ux-pro-max/data/ inside the target project. Without local data this package-level skill acts as a placeholder and only provides workflow guidance.
---

# UI UX Pro Max

## 使用时机

当满足以下任一情况时使用本技能：

- 需要由 `design-collaborator`(设计协作专家) 对 Figma、标注稿、高保真页面或交互稿做结构化解析
- 需要在设计稿信息不完整的情况下，辅助做出 UI 风格、配色、字体和 UX 取舍
- 需要把视觉约束、标注信息和设计歧义收口为可执行的设计结论，而不直接进入代码实现
- 用户直接表达“页面想更好看、漂亮、美观、有高级感、更有设计感、更有质感、更现代、更高级、优化视觉/优化 UI/改漂亮点”，需要先收口设计方向而不是直接进入实现

本技能不替代 `frontend-implementer`(前端实现专家)；实现阶段仍按页面、组件、路由和样式类技能推进。

## 运行模式

### 本地完整版

若目标项目存在 `data/` 目录：

- 优先读取目标项目下 `.agents/skills/domains/ui-ux-pro-max/data/`
- 使用本地完整版资源完成 UI 风格、配色、字体和 UX 决策
- 结合设计稿输入输出更细的视觉建议和设计收口结论

### 包内占位版

若当前只有本文件，没有本地 `data/` 目录：

- 将本技能视为设计协作占位入口
- 仅提供设计决策框架、使用边界和与其它技能的协作方式
- 需要细粒度设计稿拆解时，继续配合 `design-analysis`(设计稿分析)

## 核心任务

1. 识别页面风格、信息层级和关键交互
2. 提取设计稿中的标注约束、视觉重点和不明确项
3. 在缺少完整标注时，补充合理的 UI 风格、配色和字体建议
4. 把设计歧义整理成待确认问题或可执行约束，交回需求/实现链路

## 与其它技能的关系

- `design-analysis`(设计稿分析)：负责系统化拆解页面结构、区域元素和样式约束，是本技能的分析兜底
- `create-proposal`(创建提案)：当设计约束会影响范围、交互或验收口径时，需要把结论回写到 proposal/specs/design/tasks
- `ui-verification`(UI 验收)：实现完成后可用其对照设计稿和分析清单做验收

## 占位版输出要求

在未安装本地资源的情况下，至少输出：

- 页面整体风格判断
- 关键视觉约束
- 需进一步确认的设计问题
- 建议转交 `design-analysis`(设计稿分析) 补充的内容
