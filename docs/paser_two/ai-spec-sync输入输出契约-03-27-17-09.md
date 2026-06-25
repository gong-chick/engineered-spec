# ai-spec-auto sync（同步）输入输出契约

本文档定义 `ai-spec-auto sync（同步）` 的最小实现契约。

目标是让这条命令未来能同时服务：

- CLI（命令行工具）
- Hub 平台
- 插件入口
- OpenClaw 远程触发

这份契约重点回答 4 个问题：

1. `sync（同步）` 接收什么输入
2. `sync（同步）` 内部最少做哪些阶段
3. `sync（同步）` 输出什么 JSON（结构化结果）
4. OpenClaw / Hub 应该依赖哪部分输出

## 1. 命令定位

`ai-spec-auto sync（同步）` 的职责不是初始化整个项目，而是：

> 根据 `manifest（安装清单）` 或显式传入的资产选择，增量同步当前项目的 AI 规范驱动能力。

它最适合的场景是：

- Hub 生成了新的 `manifest（安装清单）`
- 项目已经接入过一次
- 需要增量更新 `rules（规则） / skills（技能） / roles（专家角色）`
- 需要同步本地 `.ai-spec/manifest.json / lock.json / sources.json`

## 2. 输入契约

### 2.1 当前实现优先支持的命令形式

当前代码已先支持本地 `manifest.json` 文件：

```bash
ai-spec-auto sync . --manifest ./manifest.json
```

远程 URL（链接） 清单仍保留在契约设计中，但当前版本会明确提示“暂未支持”。

### 2.2 推荐命令形式（后续扩展）

```bash
ai-spec-auto sync . --manifest https://hub.example.com/manifests/project-abc.json
```

### 2.3 当前建议支持的最小参数

| 参数 | 类型 | 说明 |
| --- | --- | --- |
| `target（目标目录）` | string | 默认 `.` |
| `--manifest（安装清单）` | string | URL 或本地 JSON 文件路径 |
| `--profile（技术栈）` | string | 可选覆盖清单内的 `profile` |
| `--ide（IDE 预设）` | string | 可选覆盖清单内的 IDE 选择，如 `default`、`cursor` |
| `--json（JSON 输出）` | boolean | 结构化输出，供 OpenClaw / 机器人读取 |
| `--dry-run（试运行）` | boolean | 只解析和求解，不真正安装 |
| `--force（强制覆盖）` | boolean | 遇到冲突时允许覆盖可覆盖项 |

### 2.4 输入来源优先级

当前建议优先级如下：

1. CLI 显式参数
2. `--manifest（安装清单）` 内容
3. 项目已有 `.ai-spec/manifest.json`
4. CLI 默认值

说明：

- `profile（技术栈）` 和 `ides（IDE 列表）` 可被 CLI 参数覆盖
- `scenario_packages（场景方案包） / roles（专家角色） / skills（技能） / rules（规则）` 优先以 `manifest（安装清单）` 为准

## 3. 内部处理阶段

当前阶段，`sync（同步）` 最小应包含 6 个阶段：

### 3.1 读取阶段

- 读取 `--manifest（安装清单）`
- 或读取本地 `.ai-spec/manifest.json`
- 统一归一化输入结构

### 3.2 校验阶段

- 校验 JSON 是否可解析
- 校验 `schema_version（结构版本）`
- 校验 `profile（技术栈）`
- 校验 `ides（IDE 列表）`
- 校验 `roles（专家角色） / skills（技能） / rules（规则）`

### 3.3 求解阶段

根据：

- `scenario_packages（场景方案包）`
- `roles（专家角色）`
- `skills（技能）`
- `rules（规则）`

在本地推导：

- `resolved_roles（最终专家角色）`
- `resolved_skills（最终技能）`
- `resolved_rules（最终规则）`
- `resolved_domains（最终能力域）`

这里的关键约束是：

- `sync（同步）` 可以安装当前项目内置的 `flows（流程模板）` 文件，并可选记录 `installed_flows（已安装流程模板）`
- `sync（同步）` 不负责决定当前具体任务使用哪条 `flow（流程模板）`

### 3.4 安装阶段

- 拉取或读取资源
- 写入 / 链接到目标项目目录
- 记录新建、更新、跳过、冲突项

### 3.5 落盘阶段

写入或更新：

- `.ai-spec/manifest.json`
- `.ai-spec/lock.json`
- `.ai-spec/sources.json`

### 3.6 汇报阶段

输出：

- 人类可读摘要
- 机器可读 JSON 结果

## 4. 输出契约

建议 `ai-spec-auto sync（同步）` 输出两类结果：

- `sync-plan（同步计划）`
- `sync-result（同步结果）`

## 5. `sync-plan（同步计划）`

这是安装前的结构化计划，适合：

- `--dry-run（试运行）`
- OpenClaw 先看计划再决定是否执行

### 5.1 最小 JSON 结构

```json
{
  "schema_version": 1,
  "kind": "sync-plan",
  "status": "planned",
  "target": {
    "path": ".",
    "profile": "vue",
    "ides": ["cursor", "claude"]
  },
  "source": {
    "manifest": "https://hub.example.com/manifests/project-abc.json",
    "manifest_type": "hub-install"
  },
  "request": {
    "scenario_packages": ["frontend-basic"],
    "roles": ["task-orchestrator", "requirement-analyst"],
    "skills": ["create-proposal", "design-analysis"],
    "rules": ["api-standard", "route-standard"]
  },
  "resolved": {
    "domains": ["demand-design", "governance"],
    "roles": ["task-orchestrator", "requirement-analyst"],
    "skills": ["create-proposal", "design-analysis"],
    "rules": ["api-standard", "route-standard"]
  },
  "warnings": [],
  "errors": []
}
```

## 6. `sync-result（同步结果）`

这是执行后的结构化结果，适合：

- CLI 最终输出
- OpenClaw 回传
- 平台记录安装结果

### 6.1 最小 JSON 结构

```json
{
  "schema_version": 1,
  "kind": "sync-result",
  "status": "success",
  "target": {
    "path": ".",
    "profile": "vue",
    "ides": ["cursor", "claude"]
  },
  "source": {
    "manifest": "https://hub.example.com/manifests/project-abc.json",
    "manifest_type": "hub-install"
  },
  "request": {
    "scenario_packages": ["frontend-basic"],
    "roles": ["task-orchestrator", "requirement-analyst"],
    "skills": ["create-proposal", "design-analysis"],
    "rules": ["api-standard", "route-standard"]
  },
  "resolved": {
    "domains": ["demand-design", "governance"],
    "roles": ["task-orchestrator", "requirement-analyst"],
    "skills": ["create-proposal", "design-analysis"],
    "rules": ["api-standard", "route-standard"]
  },
  "changes": {
    "created": [
      ".agents/roles/common/task-orchestrator.md",
      ".agents/skills/common/create-proposal/SKILL.md"
    ],
    "updated": [
      ".ai-spec/manifest.json",
      ".ai-spec/lock.json",
      ".ai-spec/sources.json"
    ],
    "skipped": [],
    "conflicts": []
  },
  "artifacts": {
    "manifest": ".ai-spec/manifest.json",
    "lock": ".ai-spec/lock.json",
    "sources": ".ai-spec/sources.json"
  },
  "warnings": [],
  "errors": []
}
```

## 7. 字段说明

### 7.1 顶层字段

| 字段 | 说明 |
| --- | --- |
| `schema_version（结构版本）` | 当前固定为 `1` |
| `kind（结果类型）` | `sync-plan` 或 `sync-result` |
| `status（状态）` | `planned / success / partial / failed / blocked` |

### 7.2 `target（目标）`

表示本次同步的目标项目上下文：

- `path（路径）`
- `profile（技术栈）`
- `ides（IDE 列表）`

### 7.3 `source（来源）`

表示本次同步的清单来源：

- `manifest（安装清单来源）`
- `manifest_type（清单类型）`

### 7.4 `request（请求层）`

表示用户在 Hub 或 CLI 中显式选择的内容。

这是“用户选了什么”。

### 7.5 `resolved（解析层）`

表示当前驱动在本地求解后的最终结果。

这是“系统最终解出了什么”。

当前阶段最重要的两个解析结果是：

- 最终安装的 `roles（专家角色） / skills（技能） / rules（规则）`
- 可选的 `domains（能力域）` 聚合标签

需要特别说明：

- `flow（流程模板）` 的选择属于 `run（运行编排）` 阶段
- `sync（同步）` 最多只负责把可用 `flow（流程模板）` 资源装进项目

### 7.6 `changes（变更结果）`

用于告诉调用方这次具体动了哪些文件：

- `created（新建）`
- `updated（更新）`
- `skipped（跳过）`
- `conflicts（冲突）`

## 8. 错误与状态约定

### 8.1 状态值

建议允许值：

- `planned`
- `success`
- `partial`
- `failed`
- `blocked`

### 8.2 错误分类

建议至少区分：

- `manifest-invalid（清单非法）`
- `asset-not-found（资产不存在）`
- `resolve-failed（求解失败）`
- `install-conflict（安装冲突）`
- `write-failed（写入失败）`

## 9. 推荐输出方式

### 9.1 默认模式

- 标准输出打印人类可读摘要
- 标准错误输出打印错误详情

### 9.2 `--json（JSON 输出）` 模式

- 标准输出只打印 `sync-plan（同步计划）` 或 `sync-result（同步结果）` JSON
- 适合 OpenClaw / 机器人 / 自动化平台读取

## 10. 与其它规范的关系

这份契约与下面两份规范配套使用：

- [Manifest安装清单规范.md](Manifest安装清单规范.md)
- [lock与sources结构规范-03-27-17-17.md](lock与sources结构规范-03-27-17-17.md)
- [ai-spec-auto-run输入输出契约-03-27-17-55.md](ai-spec-run输入输出契约-03-27-17-55.md)
- [RUN_OUTPUT.md](../../.agents/flows/RUN_OUTPUT.md)

关系是：

- `manifest（安装清单）` 解决“输入长什么样”
- `sync（同步）` 契约解决“安装过程怎么汇报”
- `run（运行）` 契约解决“专家协同执行怎么汇报”

## 11. 当前阶段建议

当前阶段不要让 `sync（同步）` 直接承担复杂编排职责。

最稳的做法是：

1. 先把 `sync（同步）` 固定成“安装与求解命令”
2. 先稳定 `request（请求层） / resolved（解析层） / changes（变更结果）`
3. 让 `run（运行）` 再去负责真正的专家协同执行

这样 `sync（同步）` 和 `run（运行）` 的边界会清楚很多。

## 12. 一句话收束

> `ai-spec-auto sync（同步）` 负责把 Hub 的选择结果转换成项目里的真实安装状态，并把这个过程结构化输出出来；它不是专家协同执行器，而是专家协同执行之前的安装与求解层。
