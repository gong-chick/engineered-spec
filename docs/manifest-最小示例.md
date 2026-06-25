# 最小 `manifest.json` 示例

这份文档只回答一个问题：如果你想用 `init --manifest` 或 `sync --manifest`，一份最小可用的 `manifest.json` 应该怎么写。

## 1. 最小可用示例

下面这份示例可以直接作为起点：

```json
{
  "schema_version": 1,
  "manifest_type": "hub-install",
  "name": "frontend-basic-demo",
  "profile": "vue",
  "ides": ["cursor"],
  "roles": [
    "task-orchestrator",
    "frontend-implementer",
    "code-guardian"
  ],
  "skills": [
    "create-proposal",
    "design-analysis",
    "execute-task"
  ],
  "rules": [
    "coding-standard",
    "api-standard",
    "route-standard",
    "style-standard",
    "generic-constraints",
    "test-standard"
  ],
  "entry_role": "task-orchestrator"
}
```

建议把它保存为项目根目录下的 `manifest.json`，然后执行：

```bash
npx @engineered/ai-spec-auto@latest init . --manifest ./manifest.json
```

如果项目之前已经接过一次，也可以执行：

```bash
npx @engineered/ai-spec-auto@latest sync . --manifest ./manifest.json
```

## 2. 字段说明

- `schema_version`
  当前建议固定写 `1`。
- `manifest_type`
  当前安装清单建议使用 `hub-install`。
- `name`
  清单名称，便于区分不同项目或不同场景方案。
- `profile`
  技术栈，当前常用值是 `vue` 或 `react`。这是必填项。
- `ides`
  要同步哪些 IDE 资产。常见值有 `cursor`、`claude`。
- `roles`
  要安装哪些专家。字段名历史上沿用了 `roles`，但语义上可以理解为“专家集合”。
- `skills`
  要安装哪些技能。
- `rules`
  要安装哪些规则。
- `entry_role`
  默认入口专家。通常写成 `task-orchestrator`。

## 3. 哪些字段可以先不写

下面这些字段不是最小可用示例的必需项，后续需要时再补：

- `description`
- `version`
- `scenario_packages`
- `tags`
- `constraints`
- `notes`
- `sources`
- `local_preferences`

如果是 Hub 平台导出的清单，通常会比这个示例更完整，这是正常情况。

## 4. 两种常见用法

### 4.1 第一次接入项目

用 `init --manifest`：

```bash
npx @engineered/ai-spec-auto@latest init . --manifest ./manifest.json
```

适合：

- 项目第一次接入
- 希望同时补齐本地 CLI、OpenSpec、IDE 适配
- 希望把 manifest 作为首次安装来源

### 4.2 后续按清单刷新

用 `sync --manifest`：

```bash
npx @engineered/ai-spec-auto@latest sync . --manifest ./manifest.json
```

适合：

- 项目已经接过一次
- 现在只是想按新清单刷新专家、技能、规则和流程模板
- 想把同一份清单复用到多个项目

## 5. 本地文件与远程 URL

除了本地 `manifest.json`，也可以直接传 Hub 导出的远程地址：

```bash
npx @engineered/ai-spec-auto@latest init . --manifest https://hub.example.com/manifests/project-abc.json
```

```bash
npx @engineered/ai-spec-auto@latest sync . --manifest https://hub.example.com/manifests/project-abc.json
```

如果是本地 `manifest.json`，但其中引用的资产并不都在当前 npm 包内，可以加上：

```bash
npx @engineered/ai-spec-auto@latest sync . --manifest ./manifest.json --hub-origin http://172.16.185.63:3000
```

## 6. 常见错误

### 1）只写了 `profile`，没写专家/技能/规则

这在语法上可能成立，但通常没有实际使用价值。  
如果你希望接起来后能直接跑完整流程，至少要给出一组基础专家、技能和规则。

### 2）`entry_role` 不在 `roles` 里

这是不合法的。  
`entry_role` 必须包含在 `roles` 列表里。

### 3）`profile` 写了不支持的值

当前常用值是：

- `vue`
- `react`

如果写成未支持的技术栈，CLI 会直接报错。

### 4）本地 manifest 里有资产 ID，但当前包找不到

这种情况可以：

- 检查 ID 是否写错
- 或补一个 `--hub-origin`，允许 CLI 从 Hub 补齐缺失资产

## 7. 相关文档

- [安装指南](install-guide.md)
- [5 分钟快速上手](quick-start.md)
- [Hub 资产同步脚本说明](four/Hub资产同步脚本说明.md)
