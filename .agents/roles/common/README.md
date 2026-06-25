# 角色目录说明

本目录只存放当前阶段真正启用的 MVP 专家角色。

插件页面如果需要统一读取角色展示信息，优先读取上层索引文件：

- `../INDEX.md`

当前保留 5 个已启用的主流程角色：

- `task-orchestrator.md`
- `requirement-analyst.md`
- `frontend-implementer.md`
- `code-guardian.md`
- `archive-change.md`

另外保留 1 份与主代理配套的路由策略草案：

- `task-orchestrator-routing.md`

与主代理运行协议、载荷规范、桥接说明相关的文件，已经统一迁到：

- `../../orchestration/`

其中 4 个是默认执行主链，`archive-change` 负责归档收尾：

```text
任务输入
  -> task-orchestrator
  -> requirement-analyst
  -> frontend-implementer
  -> code-guardian
  -> before-archive
  -> archive-change（批准后）
```

## 角色文件编写原则

- 文件名使用英文 `kebab-case`，作为稳定 ID
- 文件正文标题和展示名使用中文
- 角色文件负责“职责、边界、交接、产物”
- `skills` 负责“具体怎么做”
- `flows` 负责“按什么顺序做”
- `task-orchestrator` 负责路由和调度，不直接承担具体交付实现
- `task-orchestrator-routing.md` 负责沉淀动态选专家规则，不作为独立角色参与执行
- 主代理内部协议、payload、runtime hooks 一律不再放进 `roles/common/`

## 建议的 frontmatter 字段

```yaml
id:
name:
status:
domains:
description:
triggers:
preferred_skills:
reads:
writes:
handoff_to:
```

## 目录扩展方式

- 当前启用角色继续放在 `common/`
- 规划中的能力域目录放在 `../domains/`
- `domains/` 中也允许保留 `active` 的 optional 专家；是否必经由 flow 决定
- 当某个规划专家真正进入 MVP，再从能力域目录迁入或补充到 `common/`
- 主代理配套协议文档统一放到 `../../orchestration/`

这样可以同时保证：

- 当前可运行角色足够轻
- 未来能力域结构已经就位
- 插件页面后续可以按能力域做展示
- 角色职责与主代理协议不再混放
