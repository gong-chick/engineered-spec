这是项目规范初始化入口。目标不是只生成 `01/03`，而是按当前项目的 profiles 补齐本次应写的全部规范文件。

先读取并严格遵守：

- `.agents/skills/common/project-init/SKILL.md`

执行要求：

1. 读取 `.ai-spec/manifest.json` 中的 `profile`（字符串）或 `profiles`（数组），统一为 profile 列表。
2. 从 `.agents/registry/profiles.json` 查询各 profile 的 `project_init_rule_ids`，合并为本次应生成的规则集合。
3. 固定写入（统一写入 `.agents/rules/`）：
   - `01-项目概述.md`
   - `03-项目结构.md`
   - `context/PROJECT.md`
4. 若项目存在 `openspec/`，同步 `openspec/project.md`。
5. 若 `.agents/rules/` 下缺失规则集合中任意文件，必须在本次一并补生成。

绝对红线：

- 不能只写 `01/03 + PROJECT` 就结束
- 不能把缺失的能力规则只写进摘要或建议，不落盘
- 对已存在的能力规则不覆盖
- 内容必须基于当前仓库实际代码、目录和依赖，不能照搬通用模板

把用户触发本命令视为明确授权：信息足够时直接完成写入；只有在项目事实明显不足、无法判断时，才先给出简短确认摘要。
