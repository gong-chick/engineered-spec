---
name: /opsx-propose
id: opsx-propose
category: Workflow
description: Cursor 兼容入口：创建 OpenSpec 提案并生成 proposal/specs/design/tasks
---

这是 Cursor 的兼容入口，语义对齐 `/opsx:propose`。

目标：
- 创建或续用一个 OpenSpec 变更目录
- 结合 `create-proposal` 技能完成前置分析
- 生成 proposal / specs / design / tasks 等规划产物
- 最后给出简洁摘要，并提示下一步使用 `/opsx-apply`

执行要求：

1. 优先读取并遵守 `create-proposal` 技能  
   优先看：
   - `.agents/skills/create-proposal/SKILL.md`
   若仓库仍保留源结构，再看：
   - `.agents/skills/common/create-proposal/SKILL.md`

2. 若用户没有提供变更名称或需求描述不够明确，先用一两句自然语言补齐关键信息  
   不使用旧版 `AskUserQuestion` 风格，也不要机械连问。

3. 先做当前架构要求的前置分析  
   至少收敛：
   - 交付形态（页面 / 组件 / 模块 / 其它）
   - 是否有设计稿或明确 UI 描述
   - 是否接真实接口、走 mock，还是接口未就绪
   - 是否存在高风险边界或范围不清

4. 使用当前 OpenSpec 快速路径生成产物  
   推荐顺序：
   ```bash
   npx openspec list --json
   npx openspec new change "<change-name>"
   npx openspec ff "<change-name>"
   ```
   若变更已存在，则不要重复新建，直接在现有变更上继续快进生成。

5. 产物位置必须稳定落在：
   - `openspec/changes/<change-name>/proposal.md`
   - `openspec/changes/<change-name>/specs/`
   - `openspec/changes/<change-name>/design.md`
   - `openspec/changes/<change-name>/tasks.md`

6. 完成后只做简洁收口：
   - 变更名称
   - 产物路径
   - 提案范围摘要
   - 下一步：`/opsx-apply`

守卫：
- 不直接开始写业务代码
- 不回退到旧版重型 artifact loop
- 不输出长篇协议细节
- Cursor 用 `/opsx-propose`；其他 IDE 仍走 `/opsx:propose`
