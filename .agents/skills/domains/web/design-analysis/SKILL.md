---
name: design-analysis
description: 当用户提供设计稿、UI 描述或页面还原需求时，分析界面结构与交互细节，输出可执行的 UI 分析清单供开发和验收使用。
compatibility: Requires access to design artifacts and the local repository output path docs/样式还原/; may reference sibling skills and local .agents/rules.
---

# 设计稿分析

## 使用时机

当满足以下任一情况时使用本技能：

- 需要**分析设计稿**（`.pen`、Figma 链接、其它设计图或标注等），把界面结构、样式、元素梳理成可执行的前端任务
- 需要产出一份**UI 分析清单**文档，供后续开发按清单实现、或供验收时对照

不限定阶段：可在写提案前、写提案中、或单独做一次「只分析不写提案」时使用。

## 环境依赖

- 默认将分析清单落到 `docs/样式还原/`
- 若涉及复杂交互，会引用本仓库内的交互摘要模板与提案 skill

---

## 核心原则

**必须按「从上到下、从左到右、从外到里」的顺序分析，并逐条准确记录文字、图片、布局、层级四类重中之重。**详见 `rules/analysis-order.md` 和 `rules/analysis-priorities.md`。

---

## 目标产出

| 产出物 | 路径 | 用途 |
|--------|------|------|
| UI 分析清单 | `docs/样式还原/<名称>-UI分析清单.md` | 开发时按此文档精确还原；验收时作为对照基准 |

---

## 工作流程（4步）

1. **建立布局 Map**：获取设计稿结构，记录页面状态、整体尺寸、区域划分。详见 `rules/workflow-layout-map.md`
2. **区域与元素提取**：对每个区域按「从外到里」逐项提取，确保文字、图片、布局、层级四者均准确记录。详见 `rules/workflow-element-extraction.md`
3. **样式规范汇总**：汇总颜色、字体、圆角、间距、阴影等样式规范。详见 `rules/workflow-style-summary.md`
4. **复杂交互补充**：若页面含搜索、表单、弹窗、批量操作或复杂状态切换，补一段交互说明摘要。可参考 `../create-proposal/references/interaction-spec-template.md`
5. **输出 UI 分析清单文档**：将分析结果输出为文档。详见 `rules/workflow-output-checklist.md` 和 `rules/output-analysis-checklist.md`

---

## 快速参考

### Analysis Rules（分析原则与顺序）
- `rules/analysis-order.md` - 分析顺序（必守）
- `rules/analysis-priorities.md` - 文字、图片、布局、层级四类重中之重

### Workflow Rules（工作流程步骤）
- `rules/workflow-layout-map.md` - 第一步：建立布局 Map
- `rules/workflow-element-extraction.md` - 第二步：区域与元素提取
- `rules/workflow-style-summary.md` - 第三步：样式规范汇总
- `rules/workflow-output-checklist.md` - 第四步：输出文档要求

### Output Rules（输出文档模板）
- `rules/output-analysis-checklist.md` - UI 分析清单文档完整模板

### Implementation Rules（实现建议）
- `rules/implementation-guidelines.md` - 主流网页设计常识
- `rules/implementation-common-errors.md` - 常见错误模式与避免方法

### Checklist Rules（检查清单）
- `rules/checklist-common-misses.md` - 常见遗漏检查点

### Tools Rules（工具使用指南）
- `rules/tools-design-guidelines.md` - 设计稿工具使用（Pencil MCP / Figma MCP）

---

## 与其它技能的关系

- **create-proposal**：提案前置分析时，若涉及「有设计稿或 UI 描述」的页面/组件，可先或同步使用本技能产出分析清单，再委托 `/opsx:propose` 生成提案
- **复杂交互说明**：若页面包含搜索、表单、弹窗、批量操作等复杂交互，可先按 `../create-proposal/references/interaction-spec-template.md` 整理摘要，再回写到 proposal / design / tasks
- **ui-verification**：以本分析清单为基准做 UI 验收时使用；验收若发现「分析遗漏」或「描述不清」，应将结论反哺本技能
- **create-route / create-component**：开发时若涉及样式还原，应引用本分析清单中的区域与样式规范

---

## 相关规范

- `.agents/rules/09-样式规范.md` - 设计稿颜色、圆角等提取规范
- `.agents/skills/create-proposal/SKILL.md` - 提案前置分析与 OpenSpec 增强层（有设计稿时可先或同步使用本技能）
- `.agents/skills/ui-verification/SKILL.md` - UI 验收（以分析清单为基准做验收）
