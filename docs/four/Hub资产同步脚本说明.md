# Hub 资产同步脚本说明

这份说明对应当前项目里的本地脚本 [scripts/hub-sync-assets.js](../../scripts/hub-sync-assets.js)。

目标只有一个：把当前仓库维护的 `skill / rule / 专家 / 场景方案` 批量同步到本地启动的 Hub 平台，减少在管理弹窗里重复上传文档的成本。

> 主从关系说明：
>
> - `skill-q-platform（Hub 平台）` 是 registry（注册表）主维护方
> - 当前仓库里的 `.agents/registry` 是 **同步结果 + 运行时消费入口**
> - `engineered-spec-visual` 只展示已同步 / 已上报的结果，不定义 registry
>
> 详见：[Hub-CLI-Visual三仓协同说明](./Hub-CLI-Visual三仓协同说明.md)

## 适用范围

脚本当前覆盖 4 类资产：

- `skill`
- `rule`
- `role`
- `scenario`

本地来源分别是：

- `skill`: [.agents/registry/skills.json](../../.agents/registry/skills.json)
- `rule`: [.agents/registry/rules.json](../../.agents/registry/rules.json)
- `role`: [.agents/registry/roles.json](../../.agents/registry/roles.json)
- `scenario`: [.agents/registry/scenario-packages.json](../../.agents/registry/scenario-packages.json)

## 脚本能力

- 支持新增和更新
- 支持 `--dry-run`
- 支持只同步指定资源
- 支持通过 `--from-scenarios` 自动展开场景关联的 `role / skill`
- `role` 解析直接复用 Hub 的 `/api/upload`
- `skill / rule` 会对比最新版本文件，只有文件变化才发新版本
- `scenario` 会自动聚合显式绑定的 role/skill/rule

脚本默认不会改主链流程或本项目 runtime，只是把本地 registry 和资产文档同步到 Hub。
也就是说：它负责“把当前项目里的同步结果回推到 Hub 做治理或对齐”，但不改变 Hub 是主数据源这一事实。

当前脚本分两条通道：

- `skill / rule`
  - 优先走开放接口
  - 本地环境允许时可以不登录
- `role / scenario`
  - 继续走 `/api/admin/*`
  - 如果 Hub 已按推荐方式放宽 `requireAdminJson`，可以直接用 `HUB_ADMIN_SECRET`
  - 否则仍然需要管理员会话

当前仓库推荐把 `skill / rule / role / scenario` 的 Hub 展示名称统一收口到本地 config：

- `scripts/hub-sync-assets.config.example.json` 提供了完整中文名称映射模板
- 实际使用时复制为 `scripts/hub-sync-assets.config.json`
- 换机器后只要补本地凭据，不需要重新整理中文显示名

## 前置条件

1. Hub 本地服务已经启动
2. Hub 地址可访问
3. 如果要同步 `role / scenario`，需要拿到 Hub 管理员鉴权方式

你当前环境里的默认地址可以直接用：

```text
http://localhost:3000/admin
```

脚本内部会自动归一化成：

```text
http://localhost:3000
```

## 认证说明

脚本分三类认证：

### 1. 管理员会话

只用于：

- 获取现有 role/scenario 列表
- 创建和更新 role/scenario
- 可选地读取 admin 分类和资源列表，给 skill/rule 做更精准 diff

可用方式：

- `--admin-email` + `--admin-password`
- `--admin-cookie`
- 或在本地私有配置里写 `hub.adminEmail / hub.adminPassword / hub.adminSessionCookie`

### 2. Agent API Key

只在一种情况必须要有：

- 现有 `skill / rule` 需要发新版本
- 并且 Hub 开启了“上传必须登录”

原因是 Hub 的 `skill / rule` 版本接口会走上传登录校验；仅有管理员 cookie 不一定够。

所以如果你发现脚本报这类错误：

```text
version update requires agent login
```

就补：

- `--agent-api-key`
- 或配置 `hub.agentApiKey`

### 3. HUB_ADMIN_SECRET

如果你不想登录，但要更新现有的 `skill / rule`，本地建议补：

- `--admin-secret`
- 或配置 `hub.adminSecret`

它主要用于：

- 现有 `skill / rule` 的作者校验绕过
- 避免作者名和 agent 归属不完全一致时被拦住

如果 Hub 已经把 `requireAdminJson` 改成接受 `HUB_ADMIN_SECRET`，那它也可以直接用于：

- `role`
- `scenario`

脚本会优先从这些地方找：

- 命令行参数
- 当前 shell 环境变量
- `scripts/hub-sync-assets.config.json`
- Hub 项目目录下的 `.env.local / .env / .env.development*`

## 配置文件

示例配置在：

- [scripts/hub-sync-assets.config.example.json](../../scripts/hub-sync-assets.config.example.json)

实际本地私有配置建议新建：

- `scripts/hub-sync-assets.config.json`

这个文件已经建议加入 `.gitignore`，避免把凭据提交进仓库。

推荐做法：

1. 先复制示例配置
2. 只修改 `hub.adminSecret / agentApiKey / adminSessionCookie` 这类本地凭据
3. 保留示例里已经整理好的中文名称映射、默认分类和场景中文名

## 最常用命令

先看计划：

```bash
node ./scripts/hub-sync-assets.js --dry-run --config scripts/hub-sync-assets.config.json
```

全量同步：

```bash
node ./scripts/hub-sync-assets.js --config scripts/hub-sync-assets.config.json
```

只同步专家和场景方案：

```bash
node ./scripts/hub-sync-assets.js --skills none --rules none --roles all --scenarios all --config scripts/hub-sync-assets.config.json
```

只同步几个 skill：

```bash
node ./scripts/hub-sync-assets.js --skills create-api,create-route,theme-variables --rules none --roles none --scenarios none --config scripts/hub-sync-assets.config.json
```

只同步 `skill / rule`，不走管理员登录：

```bash
node ./scripts/hub-sync-assets.js \
  --skills all \
  --rules all \
  --roles none \
  --scenarios none \
  --config scripts/hub-sync-assets.config.json
```

按场景只同步关联的专家和 skill：

```bash
node ./scripts/hub-sync-assets.js \
  --from-scenarios change-to-release,requirement-to-observability,change-to-architecture-review \
  --rules none \
  --scenarios none \
  --config scripts/hub-sync-assets.config.json
```

## 同步策略

### skill

- 从 `skills.json` 读取 `source` 或 `sourceByProfile`
- 单路径 skill 会上传整个 skill 目录
- 多 profile skill 分两种情况：
  - Hub 已存在按 profile 拆分的资源时，脚本会分别同步到实际变体 slug
  - Hub 还没有拆分资源时，脚本会回退为单资源同步
- 创建时优先直连 `POST /api/skills`
- 更新时优先直连 `POST /api/skills/:slug`
- 版本对比走 `/api/skills/:slug/versions`
- 只有文件变化才发 patch version
- 变体场景下，推荐直接按实际 slug 配中文名称：
  - `create-api-vue`
  - `create-api-react`
  - `theme-variables-vue`
  - `theme-variables-react`

### rule

- 从 `rules.json` 读取 `source` 或 `sourceByProfile`
- 规则通常是 markdown 单文件
- 多 profile rule 分两种情况：
  - Hub 已存在按 profile 拆分的资源时，脚本会优先同步到实际变体 slug
  - Hub 还没有拆分资源时，脚本会回退为单资源同步
- 创建时优先直连 `POST /api/rules`
- 更新时优先直连 `POST /api/rules/:slug`
- 版本对比走 `/api/rules/:slug/versions`
- 只有文件变化才发 patch version
- 变体场景下，推荐直接按实际 slug 配中文名称：
  - `vue-project-overview`
  - `react-project-overview`
  - `vue-project-structure`
  - `react-project-structure`

### role

- 从 `roles.json` 读取 `source`
- 解析复用 Hub 的 `/api/upload?kind=role`
- 创建和更新走 `/api/admin/roles` / `/api/admin/roles/update`
- skill/rule 关联优先从 registry 元数据拿：
  - `rule_ids`
  - `skill_priority`
  - `micro_skill_allowlist`
- domain 会按以下顺序解析：
  - `resources.roles.<id>.domainIds`
  - `domainIdMap`
  - Hub `/api/upload` 自动匹配出来的 `mappedDomainIds`
- 更新后会自动补 role version 快照

### scenario

- 从 `scenario-packages.json` 读取基础链路
- 创建和更新走 `/api/admin/scenarios` / `/api/admin/scenarios/update`
- 默认把 `roles` 当成必选角色链
- `optionalRoles` 通过本地 config 覆盖
- `entryRoleSlug` 通过本地 config 指定；没配时默认取第一个角色
- `skillIds / ruleIds` 会自动聚合：
  - 场景显式声明的 skill/rule
  - 关联 role 上已经挂载的 skill/rule
- 推荐把场景 `name` 直接配置为中文展示名，避免 Hub 后台显示 slug

### from-scenarios

- 用于“只想上传某几个场景对应的专家和 skill，但不想手工列一长串参数”的场景
- 它会从 `scenario-packages.json` 读取指定场景
- 自动展开：
  - 场景显式声明的 `roles`
  - 场景显式声明的 `skills`
  - 这些 `role` 在 `roles.json` 中声明的 `skill_priority / micro_skill_allowlist / preferred_skills`
- 默认只影响 `role / skill` 的实际选择结果
- 不会自动把 `scenario` 自己也上传；如需上传场景，仍显式传 `--scenarios`
- 如果你显式传了 `--roles none` 或 `--skills none`，显式参数优先，不会被自动展开覆盖

## 场景方案建议

当前 `scenario-packages.json` 比较轻，所以推荐把下面这些内容放进本地 config 覆盖：

- `name`
- `description`
- `longDescription`
- `entryRoleSlug`
- `optionalRoles`
- `recommendedIdes`
- `supportedProfiles`
- `tags`
- `isFeatured`

当前示例配置已经内置了 8 个场景的中文名称：

- `前端基础交付场景`
- `设计到代码交付场景`
- `质量治理场景`
- `企业文档需求沉淀场景`
- `缺陷修复到验证场景`
- `变更到发布场景`
- `需求到可观测场景`
- `变更到架构评审场景`

也就是说：

- registry 继续维护“安装组合”
- config 负责补 Hub 场景页需要的展示和交互字段

这样不会污染当前仓库已有 registry 结构，也不会影响主链流程。

## category 和 domain 的处理

### category

`skill / rule` 创建时必须有 category。

脚本会按这个顺序找：

1. `resources.skills|rules.<id>.categorySlug`
2. `categoryMap.skill|rule.<id>`
3. `categoryMap.skill|rule.domain:<domain>`
4. `defaults.skillCategorySlug / defaults.ruleCategorySlug`
5. 如果当前拿到了 admin 分类且该资源类型只有一个分类，就直接用那个

如果还是找不到，脚本会跳过创建并报 warning。

当前项目的推荐默认值已经收口到示例配置：

- `defaults.skillCategorySlug = dev-tools`
- `defaults.ruleCategorySlug = rule-sets`

### domain

`role / scenario` 的 domainId 优先级：

1. 资源级覆盖
2. `domainIdMap`
3. role 上传解析得到的 `mappedDomainIds`
4. scenario 回退到已选 role 的 domainLinks

## 不影响现有流程的边界

这套脚本只负责 Hub 资产同步，不会：

- 改 `.agents/flows/*`
- 改 runtime flow 选择
- 改主链 `requirement-analyst -> frontend-implementer -> code-guardian -> archive-change`
- 改命令语义

它只是把当前仓库里已经确定的资产，通过 Hub API 同步过去。

## 推荐执行顺序

如果你第一次接入，建议按这个顺序：

1. 先填 `scripts/hub-sync-assets.config.json`
2. 跑一次 `--dry-run`
3. 先同步 `rule / skill`
4. 确认 Hub 里已有真实 skill/rule 资源后，再同步 `role`
5. 最后同步 `scenario`

原因很直接：

- role 依赖 skill/rule 的 Hub 真实 ID
- scenario 依赖 role 的 Hub 真实 ID

## 中文名称映射建议

如果你希望 Hub 后台统一显示中文，不要只配基础 slug，建议直接在 config 里按最终资源 slug 维护名称。

建议最少覆盖这 4 组：

- `resources.skills`
  - 基础 skill 用 registry id
  - profile 拆分 skill 用真实 slug，例如 `create-api-vue`
- `resources.rules`
  - 基础 rule 用 registry id
  - profile 拆分 rule 用真实 slug，例如 `vue-project-overview`
- `resources.roles`
  - 主链和增强专家都直接配置中文名
- `resources.scenarios`
  - 场景 `name` 和 `description` 都配置中文

当前仓库的 [scripts/hub-sync-assets.config.example.json](../../scripts/hub-sync-assets.config.example.json) 已经包含一套可直接复用的中文名称映射。常见映射示例：

- skill
  - `using-superpowers` -> `技能调度核心规范`
  - `create-api-vue` -> `Vue 接口创建与维护`
  - `create-api-react` -> `React 接口创建与维护`
- rule
  - `api-standard` -> `API 规范`
  - `vue-project-overview` -> `Vue 项目概述`
  - `react-project-overview` -> `React 项目概述`
- role
  - `task-orchestrator` -> `任务主代理`
  - `code-guardian` -> `规范守护者`
- scenario
  - `bugfix-to-verification` -> `缺陷修复到验证场景`

## 已知限制

- `skill / rule` 在无管理员模式下，会优先走直连接口；如果资源已存在，更新通常仍建议补 `adminSecret` 或 `agentApiKey`
- 如果 Hub 开启上传登录，已有 `skill / rule` 发版本必须提供 agent API key
- `scenario-packages.json` 本身没有描述类字段，所以更推荐通过 config 补全场景展示信息
- profile 拆分资源是否按变体同步，取决于 Hub 里是否已经存在同一 `registryId/manifestId` 的拆分资源
- 脚本目前是本地运行工具，不会自动监听文件变化

## 相关文件

- [scripts/hub-sync-assets.js](../../scripts/hub-sync-assets.js)
- [scripts/hub-sync-assets.config.example.json](../../scripts/hub-sync-assets.config.example.json)
- [.agents/registry/skills.json](../../.agents/registry/skills.json)
- [.agents/registry/rules.json](../../.agents/registry/rules.json)
- [.agents/registry/roles.json](../../.agents/registry/roles.json)
- [.agents/registry/scenario-packages.json](../../.agents/registry/scenario-packages.json)
