# Hub-CLI-Visual 三仓协同说明

本文统一说明三个仓库的职责边界、主从关系、同步路径与排障方法：

- `skill-q-platform`：Hub 平台，维护 registry（注册表）主数据与导出
- `br-ai-spec`：CLI / 运行时消费层，负责把 Hub 资产同步到项目并参与运行编排
- `engineered-spec-visual`：可视化展示与治理层，负责汇总和展示已同步 / 已上报的运行结果

## 1. 三仓角色定位

### 1.1 skill-q-platform（Hub 平台）

Hub 是**主数据源**，负责：

- 维护技能、规则、专家角色、场景方案
- 保存 `registryId`、`manifestId`、`slug`
- 维护 `source / sourceByProfile`
- 生成安装清单 `manifest`
- 作为后续 registry snapshot 的稳定导出入口

一句话：**Hub 决定“资产是什么、叫什么、如何被安装”。**

### 1.2 br-ai-spec（CLI / 执行端）

CLI 是**消费执行层**，负责：

- 读取 Hub 导出的 manifest / registry snapshot
- 同步到本地 `.agents/registry`
- 在项目内安装 rules / skills / roles / flows
- 在运行时读取 `.agents/registry` 做任务编排、门禁和角色切换
- 产出 `.ai-spec` 和 `openspec` 运行事实

一句话：**CLI 决定“这些资产如何进入项目并参与运行”。**

### 1.3 engineered-spec-visual（可视化端）

Visual 是**展示治理层**，负责：

- ingest（接收）CLI/Collector/Hook 上报的数据
- 汇总 `RegistryItem / RunState / RunEvent / ChangeDocument / SpecAsset`
- 展示工作台、门禁审批、治理驾驶舱
- 告诉用户当前工作区运行的是哪套 registry，来源是什么

一句话：**Visual 决定“运行结果如何被看见、被治理”。**

## 2. 主从关系与优先级

默认主从关系如下：

1. `skill-q-platform` 导出的 registry / manifest
2. `br-ai-spec` 同步后写入目标项目的 `.agents/registry`
3. `engineered-spec-visual` 数据库中的 `RegistryItem`
4. `engineered-spec-visual` 的本地文件 fallback（仅无数据库结果时使用）

可以简化为：

```text
Hub 导出 > 项目本地同步结果 > Visual fallback
```

### 2.1 为什么 Visual 不能做主数据源

Visual 的职责是展示和治理，不负责定义规则与专家：

- 它能读 `.agents/registry`
- 它能展示数据库里的 `RegistryItem`
- 但它不应该决定 `rule_ids_by_profile` 或 `skill_priority_by_profile`

否则会出现“展示层反向定义运行规则”的职责漂移。

## 3. 字段契约

三仓协同时，下面这些字段应保持稳定：

| 字段 | 作用 |
| --- | --- |
| `registryId` | Hub 侧资产稳定标识 |
| `manifestId` | manifest 对外安装标识 |
| `slug` | Hub 资源 URL / 页面稳定标识 |
| `source` | common（通用）资产来源路径 |
| `sourceByProfile` | 按 profile（技术栈）区分的来源路径 |
| `rule_ids` | 角色的通用规则依赖 |
| `rule_ids_by_profile` | 角色的 profile 专属规则依赖 |
| `skill_priority` | 角色的通用技能优先级 |
| `skill_priority_by_profile` | 角色的 profile 专属技能优先级 |

### 3.1 推荐消费规则

CLI 在构造运行时契约时应按以下方式读取：

- `通用字段 + profile 字段` 合并
- profile 字段用于补充或收窄到当前技术栈
- 若项目本地显式 override（覆盖）角色定义，则以本地 override 为准

## 4. 数据流

### 4.1 安装流

```text
Hub 维护角色/规则/技能/场景
-> 导出 manifest / registry snapshot
-> br-ai-spec sync / install
-> 目标项目写入 .agents / .ai-spec / openspec
```

### 4.2 运行流

```text
br-ai-spec 读取 .agents/registry
-> task-orchestrator / protocol workflow 决定角色、门禁、下一步
-> 运行结果落到 .ai-spec/current-run.json / history / openspec
```

### 4.3 展示流

```text
Collector / Hook / Receipt -> engineered-spec-visual ingest
-> RawIngestEvent / RegistryItem / RunState / SpecAsset
-> /w/[slug] 工作台 与 /admin 治理页
```

## 5. 常见故障

### 5.1 CLI 运行期读不到 profile 规则

典型表现：

- `task-orchestrator-runner` 断言缺少 `05-API规范.md`
- `role_rule_contract.source_rules` 只有通用规则，没有 profile 规则

排查顺序：

1. 检查 Hub 导出的 `roles.json` 是否含 `rule_ids_by_profile`
2. 检查 Hub 导出的 `rules.json` 是否含 `sourceByProfile`
3. 检查目标项目 `.agents/registry` 是否同步到最新
4. 检查 `br-ai-spec` 是否正确合并 `rule_ids + rule_ids_by_profile`

### 5.2 Visual 看到的是 fallback，不是同步结果

典型表现：

- 工作台 / 治理页显示 `registry_source = local-fallback`
- 数据库里没有对应的 `RegistryItem`

排查顺序：

1. 检查 Collector / Hook 是否真的上报了 `registry-json`
2. 检查 `RawIngestEvent.sourceType = registry-json` 是否入库
3. 检查 `RegistryItem` 是否投影成功
4. 若无数据库结果，Visual 才会回退读本地 `.agents/registry`

### 5.3 Hub 与 CLI 的 registry 版本不一致

典型表现：

- Hub 后台看到的规则已经更新
- 本地 `.agents/registry` 还是旧版本
- Visual 页面显示 `hub-sync`，但版本号落后

排查顺序：

1. 重新导出或重新同步 manifest / registry
2. 检查 `sync` 是否真正更新 `.agents/registry`
3. 检查 Visual ingest 的 `registry-json` 是否使用了新文件内容

## 6. 推荐操作顺序

推荐的稳定流程如下：

1. 在 `skill-q-platform` 维护 / 发布 registry 主数据
2. 用 `br-ai-spec` 把 manifest / registry 同步到目标项目
3. 在目标项目中执行真实 run
4. 用 `engineered-spec-visual` 查看工作台、门禁和治理结果

一句话：

> 先在 Hub 定义，再由 CLI 落地，最后由 Visual 展示。

## 7. 相关文档

- [Hub资产同步脚本说明](./Hub资产同步脚本说明.md)
- [Manifest安装清单规范](../paser_two/Manifest安装清单规范.md)
- [需求说明-visual补充](../five/需求说明-visual补充.md)
- Visual 仓文档：[与 br-ai-spec 协作与技术栈](../../../engineered-spec-visual/docs/与%20br-ai-spec%20协作与技术栈.md)
- Hub 仓文档：`skill-q-platform/docs/api.md`、`skill-q-platform/docs/user-guide.md`
