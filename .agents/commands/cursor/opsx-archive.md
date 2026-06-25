---
name: /opsx-archive
id: opsx-archive
category: Workflow
description: Cursor 兼容入口：归档 OpenSpec 变更并合并规范
---

这是 Cursor 的兼容入口，语义对齐 `/opsx:archive`。

目标：
- 选定要归档的变更
- 优先走当前 `archive-change` 增强层
- 把增量规范合并到 `openspec/specs/`
- 把变更归档到 `openspec/changes/archive/`
- 输出简洁归档摘要

执行要求：

1. 先确定 change name  
   - 用户明确给出则直接使用
   - 若上下文中只有一个已完成或当前变更，可直接采用
   - 若存在多个候选，用自然语言让用户确认

2. 优先使用当前规范库提供的归档增强层  
   首选命令：
   ```bash
   ./node_modules/.bin/ai-spec-auto archive-change --target . --change-id "<change-name>" --complete-run --json
   ```
   除非该命令不可用，否则不要手工拼 `mkdir`、`cp`、`mv` 去归档。

3. 若确实无法使用 `ai-spec-auto archive-change`，再回到当前 OpenSpec 归档路径  
   但不要回退到旧版的重型归档说明。

4. 完成后只输出：
   - 变更名称
   - 归档路径
   - 规范合并结果
   - 是否存在未完成任务或风险提示

5. 如需审查归档策略，优先参考：
   - `.agents/skills/archive-change/SKILL.md`
   若仓库仍保留源结构，再看：
   - `.agents/skills/common/archive-change/SKILL.md`

守卫：
- 不绕开 `archive-change` 增强层直接做文件搬运
- 不输出过长的内部执行日志
- Cursor 用 `/opsx-archive`；其他 IDE 仍走 `/opsx:archive`
