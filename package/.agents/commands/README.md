# IDE Command Templates

这里存放项目级 `IDE（开发工具）` 命令模板的源定义。

目录约定：

- `common/`
  - 所有 `IDE（开发工具）` 共用的命令模板主源
- `cursor/`
  - 仅在 `Cursor（开发工具）` 需要差异化覆盖时才放文件
  - 例如 `/opsx-propose`、`/opsx-apply` 这类连字符兼容入口
- `claude/`
  - 仅在 `Claude（开发工具）` 需要差异化覆盖时才放文件
- `codex/`
  - 仅在 `Codex（代码代理）` 需要显式项目级命令契约时放文件
  - 当前首期与 `common/` 保持同名模板，后续若 `Codex` 需要差异化引导，再在这里覆盖
- `qoder/`
  - 仅在 `Qoder（开发工具）` 需要差异化覆盖时才放文件
  - 当前与 `common/` 保持同名模板，后续若需要差异化引导，再在这里覆盖
- `opencode/`、`trae/`
  - 同上，仅在需要差异化时创建目录

这些文件在源仓库中统一维护于 `.agents/commands/`。

安装到目标项目时：

- 先把 `common/*.md` 复制到对应 `IDE（开发工具）` 的 `commands/` 目录
- 如果存在 `cursor/*.md`、`claude/*.md` 或 `codex/*.md`，再用同名文件覆盖

这样可以保持：

- 命令模板主源只有一份
- 目标项目仍然保留 `IDE（开发工具）` 原生消费结构
