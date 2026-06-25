---
name: /opsx-apply
id: opsx-apply
category: Workflow
description: Cursor 兼容入口：按 tasks.md 执行 OpenSpec 任务实现
---

这是 Cursor 的兼容入口，语义对齐 `/opsx:apply`。

目标：
- 选定一个 OpenSpec 变更
- 读取 proposal / design / tasks 作为上下文
- 按 `execute-task` 技能默认要求实施任务
- 任务完成后更新 `tasks.md`
- 全部完成时提示 `/opsx-archive`

执行要求：

1. 先确定当前要实施的变更  
   - 若用户明确给了 change name，直接用它
   - 若上下文里只有一个活跃变更，可直接采用
   - 若存在多个候选，先用简短自然语言让用户确认，不使用旧版问答工具口吻

2. 先读取变更状态与关键产物  
   推荐先执行：
   ```bash
   npx openspec status --change "<change-name>" --json
   ```
   再读取：
   - `openspec/changes/<change-name>/proposal.md`
   - `openspec/changes/<change-name>/design.md`（若存在）
   - `openspec/changes/<change-name>/tasks.md`

3. 默认按 `execute-task` 技能执行  
   优先读取：
   - `.agents/skills/execute-task/SKILL.md`
   若仓库仍保留源结构，再看：
   - `.agents/skills/common/execute-task/SKILL.md`

4. 实施时保持当前架构要求：
   - 默认走 Superpowers 四步循环
   - 逐项完成 `tasks.md` 中未勾选任务
   - 每完成一项立即把 `- [ ]` 改成 `- [x]`
   - 若遇到阻断、需求不清或高风险偏差，暂停并说明，不要硬猜

5. 输出保持简洁：
   - 当前使用的 change name
   - 本轮完成了哪些任务
   - 剩余任务或阻断
   - 若全部完成，提示下一步 `/opsx-archive`

守卫：
- 不跳过 `proposal / design / tasks` 直接写代码
- 不回退到旧版长篇流程播报
- 不把 Cursor 连字符命令复制到其他 IDE
