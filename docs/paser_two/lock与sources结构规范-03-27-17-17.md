# lock（锁定清单） / sources（来源清单）结构规范

本文档定义项目本地 `.ai-spec/lock.json` 和 `.ai-spec/sources.json` 的最小结构规范。

这份规范和下面两份文档配套使用：

- [Manifest安装清单规范.md](Manifest安装清单规范.md)
- [ai-spec-auto-sync输入输出契约-03-27-17-09.md](ai-spec-sync输入输出契约-03-27-17-09.md)

三者的职责边界是：

- `manifest（安装清单）`
  - 用户想装什么
- `lock（锁定清单）`
  - 系统实际装了什么
- `sources（来源清单）`
  - 这些资产从哪里来

一句话：

> `manifest（安装清单）` 是请求层，`lock（锁定清单）` 是结果层，`sources（来源清单）` 是溯源层。

## 1. 为什么要单独定义 `lock（锁定清单）` 和 `sources（来源清单）`

如果只有 `manifest（安装清单）`，会有 3 个问题：

1. 无法区分“用户请求”和“系统实际解析结果”
2. 无法稳定做 `update（更新） / rollback（回滚）`
3. 无法回答“某个技能或规则到底来自哪里”

因此当前项目至少需要这两个本地状态文件：

- `.ai-spec/lock.json`
- `.ai-spec/sources.json`

## 2. `lock（锁定清单）` 的职责

`lock（锁定清单）` 负责记录本次安装或同步的最终结果。

它应该回答：

- 本次装到了哪个项目
- 使用了什么输入清单
- 最终安装了哪些 `roles（专家角色） / skills（技能） / rules（规则） / flows（流程模板） / domains（能力域）`
- 每类资产实际装了哪个版本
- 本次安装是否成功

这里的 `domains（能力域）` 表示本地聚合后的标签结果，用于检索、统计和安装态展示，不代表仓库目录必须存在 `domains/`。

它不应该负责：

- 记录所有来源详情
- 存平台展示文案
- 承担安装请求入口

## 3. `sources（来源清单）` 的职责

`sources（来源清单）` 负责记录每项资产的来源关系。

它应该回答：

- 是从哪个 Hub、仓库、镜像或本地目录来的
- 每项资产对应的远程标识是什么
- 本地落到了哪个路径

它不应该负责：

- 记录最终启用的业务状态
- 替代 `lock（锁定清单）`

## 4. `lock（锁定清单）` 最小结构

当前阶段建议最小 `lock（锁定清单）` 结构如下：

```json
{
  "schema_version": 1,
  "lock_type": "local-install-lock",
  "generated_at": "2026-03-27T17:17:00+08:00",
  "target": {
    "path": ".",
    "profile": "vue",
    "ides": ["cursor", "claude"]
  },
  "request": {
    "scenario_packages": ["frontend-basic"],
    "roles": ["task-orchestrator", "requirement-analyst"],
    "skills": ["create-proposal", "design-analysis"],
    "rules": ["api-standard", "route-standard"]
  },
  "resolved": {
    "domains": ["demand-design", "governance"],
    "installed_flows": ["prd-to-delivery"],
    "roles": ["task-orchestrator", "requirement-analyst"],
    "skills": ["create-proposal", "design-analysis"],
    "rules": ["api-standard", "route-standard"]
  },
  "installer": {
    "command": "ai-spec-auto sync",
    "cli_version": "0.0.30"
  },
  "status": "success"
}
```

## 5. `lock（锁定清单）` 推荐扩展结构

如果后续要支撑回滚、比对和审计，建议扩展为：

```json
{
  "schema_version": 1,
  "lock_type": "local-install-lock",
  "generated_at": "2026-03-27T17:17:00+08:00",
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
    "installed_flows": ["prd-to-delivery"],
    "roles": ["task-orchestrator", "requirement-analyst"],
    "skills": ["create-proposal", "design-analysis"],
    "rules": ["api-standard", "route-standard"]
  },
  "assets": {
    "roles": [
      { "id": "task-orchestrator", "version": "1.0.0" }
    ],
    "skills": [
      { "id": "create-proposal", "version": "1.0.0" }
    ],
    "rules": [
      { "id": "api-standard", "version": "1.0.0" }
    ],
    "flows": [
      { "id": "prd-to-delivery", "version": "1.0.0" }
    ]
  },
  "installer": {
    "command": "ai-spec-auto sync",
    "cli_version": "0.0.30",
    "mode": "normal"
  },
  "integrity": {
    "manifest_hash": "sha256:xxx",
    "resolved_hash": "sha256:yyy"
  },
  "status": "success"
}
```

## 6. `lock（锁定清单）` 字段说明

### 6.1 必填字段

| 字段 | 说明 |
| --- | --- |
| `schema_version（结构版本）` | 当前固定为 `1` |
| `lock_type（锁定清单类型）` | 当前建议固定为 `local-install-lock` |
| `generated_at（生成时间）` | 本次落盘时间 |
| `target（目标）` | 当前项目目标信息 |
| `request（请求层）` | 用户原始选择 |
| `resolved（解析层）` | 本地求解结果与安装态元数据 |
| `installer（安装器信息）` | 当前执行命令和 CLI 版本 |
| `status（状态）` | 本次安装结果状态 |

### 6.2 状态值

建议允许值：

- `success`
- `partial`
- `failed`
- `blocked`

## 7. `sources（来源清单）` 最小结构

当前阶段建议最小 `sources（来源清单）` 结构如下：

```json
{
  "schema_version": 1,
  "sources_type": "local-install-sources",
  "generated_at": "2026-03-27T17:17:00+08:00",
  "manifest": {
    "type": "hub-install",
    "source": "https://hub.example.com/manifests/project-abc.json"
  },
  "registries": [
    {
      "type": "hub",
      "name": "ai-spec-auto-hub",
      "url": "https://hub.example.com"
    }
  ],
  "assets": [
    {
      "kind": "skill",
      "id": "create-proposal",
      "source_type": "hub",
      "source_ref": "hub://skills/create-proposal@1.0.0",
      "local_path": ".agents/skills/common/create-proposal/SKILL.md"
    }
  ]
}
```

## 8. `sources（来源清单）` 推荐扩展结构

推荐在后续补充以下字段：

- `version（版本）`
- `checksum（校验摘要）`
- `downloaded_at（下载时间）`
- `mirror（镜像）`
- `owner（维护方）`

示例：

```json
{
  "kind": "rule",
  "id": "api-standard",
  "version": "1.0.0",
  "source_type": "hub",
  "source_ref": "hub://rules/api-standard@1.0.0",
  "local_path": ".agents/rules/common/05-API规范.md",
  "checksum": "sha256:zzz",
  "downloaded_at": "2026-03-27T17:17:00+08:00"
}
```

## 9. `sources（来源清单）` 字段说明

### 9.1 顶层字段

| 字段 | 说明 |
| --- | --- |
| `schema_version（结构版本）` | 当前固定为 `1` |
| `sources_type（来源清单类型）` | 当前建议固定为 `local-install-sources` |
| `generated_at（生成时间）` | 本次来源清单生成时间 |
| `manifest（清单来源）` | 本次安装所依据的清单来源 |
| `registries（注册源）` | 平台或镜像源列表 |
| `assets（资产来源映射）` | 每个资产的来源记录 |

### 9.2 `assets（资产来源映射）`

每个条目建议至少包含：

- `kind（资产类型）`
- `id（资产 ID）`
- `source_type（来源类型）`
- `source_ref（来源引用）`
- `local_path（本地路径）`

## 10. CLI 落盘约定

当前阶段，CLI 执行 `sync（同步）` 或 `init（初始化）` 后，建议：

### 10.1 总是写入

- `.ai-spec/lock.json`
- `.ai-spec/sources.json`

### 10.2 覆盖策略

- 默认覆盖为最新一次成功结果
- 若执行失败，可保留上一次成功 `lock（锁定清单）`
- 失败详情写到本次 `sync-result（同步结果）`

### 10.3 与 `manifest（安装清单）` 的关系

- `.ai-spec/manifest.json`
  - 保存目标启用意图
- `.ai-spec/lock.json`
  - 保存本次解析与安装结果
- `.ai-spec/sources.json`
  - 保存每项资产的来源映射

## 11. 与 `sync（同步）` 契约的关系

在 [ai-spec-auto-sync输入输出契约-03-27-17-09.md](ai-spec-sync输入输出契约-03-27-17-09.md) 中：

- `sync-result（同步结果）.artifacts.manifest`
  - 指向 `.ai-spec/manifest.json`
- `sync-result（同步结果）.artifacts.lock`
  - 指向 `.ai-spec/lock.json`
- `sync-result（同步结果）.artifacts.sources`
  - 指向 `.ai-spec/sources.json`

因此这份文档解决的是：

> 这些文件里到底该写什么。

## 12. 当前阶段建议

当前阶段不要把 `lock（锁定清单） / sources（来源清单）` 设计成复杂数据库。

最稳的做法是：

1. `lock（锁定清单）` 先聚焦“实际装了什么”
2. `sources（来源清单）` 先聚焦“每个资产从哪里来”
3. 两者都采用 JSON 文件落盘
4. 先服务 `sync（同步） / update（更新） / rollback（回滚）`

## 13. 一句话收束

> `lock（锁定清单）` 用来固定安装结果，`sources（来源清单）` 用来记录来源关系。只有这两份状态文件明确了，后面的同步、回滚、审计和平台追踪才会稳。
