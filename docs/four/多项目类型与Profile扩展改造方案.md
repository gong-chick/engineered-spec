# 多项目类型与 Profile 扩展改造方案

> 适用对象：`ai-spec-auto` 维护者、技术评审、规范资产维护者

这份文档用于回答五个问题：

1. 当前仓库为什么难以直接支持非前端项目。
2. 为什么不建议让用户显式学习 `project_type + profile` 两层概念。
3. 在不推倒现有 `profile` 机制的前提下，如何扩展到后端与 Node 工具仓。
4. `common` 中哪些内容已经被前端默认假设污染，应该如何拆分。
5. 这次改造应该按什么顺序落地，才能控制复杂度和回归风险。

## 1. 背景

`ai-spec-auto` 当前是围绕前端项目建立起来的规范驱动开发工具。

现有主路径默认假设：

- 安装对象通常存在 `package.json`
- `profile` 仅有 `vue` 和 `react`
- `common rules / common skills` 中默认带有页面、组件、路由、样式、UI 验收等 Web 前端语义
- 运行时的实现角色写死为 `frontend-implementer`

但当前已经出现两个明确的扩展目标：

- `openclaw-task-orchestrator`
  - 更接近 Node.js 编排 / worker / contract 工具仓
- `asset-cube`
  - 更接近 Spring Boot + Maven 的多模块后端仓库

这说明当前“前端默认世界观”已经不足以覆盖后续接入目标。

## 2. 当前问题定位

### 2.1 用户概念层面

如果直接把安装流程改成先选 `project_type`、再选 `profile`，会带来两个问题：

- 用户需要额外理解一个新概念，学习成本上升
- `project_type` 与 `profile` 容易形成重复选择，交互显得啰嗦

对大多数使用者来说，他们真正想回答的问题只有一个：

> “这个项目属于哪种技术栈 / Profile？”

因此，`project_type` 适合作为**内部元数据**，不适合作为 V1 的主要用户入口。

### 2.2 目录与资产层面

当前仓库的安装和同步链路，本质上是：

- `common`
- `profile`

也就是由 `profiles.json` 提供 `rules_dir / skills_dir / configs_dir`，再由安装流程把 `common + 当前 profile` 合并到目标项目中。

这条路径本身是可扩展的，但前提是：

- `common` 必须足够中性
- `profile` 必须能承载不同类型项目的差异化资产

目前真正的问题不是“没有第二层目录”，而是“`common` 已经塞了太多前端特有规则和技能”。

### 2.3 `common rules` 已被前端默认假设污染

当前 `common` 中至少存在以下明显前端化内容：

- `02-编码规范.md`
  - 出现 `.vue`、组件 Props、路由/页面目录等表述
- `05-API规范.md`
  - 写死 `src/api`、`src/api/types`、`requestConfig`、`@koi-design/vix-tools`
- `08-通用约束.md`
  - 出现 `bundle size`、`pnpm`、CSS Modules、Skeleton、主题变量等前端约束
- `11-测试规范.md`
  - 写死 `Vitest`、`@vue/test-utils`、`@testing-library/react`、`data-testid`
- `13-代码格式化与检查.md`
  - 默认包含 ESLint + Prettier + Stylelint、Vue/React 小节、`.vue` 处理规则
- `14-审计汇报规范.md`
  - 示例直接使用 `src/views/login/index.vue`、`src/router/index.ts`、`npm install vue-router`

这些内容对于 Vue/React 项目是合理的，但放在 `common` 后会导致：

- Java / Node 工具仓接入时读取到错误默认约束
- `project-init` 和后续技能在非前端项目中产生不适配的规则与文档
- 维护者误以为“扩 profile 只需要新增目录”，忽略了 `common` 的语义污染

### 2.4 `common skills` 也带有明显前端语义

当前 `common skills` 中，至少有以下几类并不真正“通用”：

- 实际为前端安装假设的技能
  - `install-ai-spec-auto`
  - `project-init`
- 实际为 Web/UI 领域技能
  - `design-analysis`
  - `route-permission-map`
  - `ui-verification`
  - `web-design-guidelines`

这些技能继续放在 `common` 下，会使“common = 所有项目都适用”的认知越来越不成立。

### 2.5 运行时仍写死前端实现角色

当前运行时多处直接使用 `frontend-implementer`：

- 角色注册
- flow handoff
- auto dispatch
- superpowers hints
- protocol / runner / execution semantics 测试

因此，单纯新增 `springboot`、`node-tooling` 目录并不能真正打通非前端项目主链。

## 3. 改造目标

本次改造的目标是：

1. 保持用户心智简单：**用户只选择一个 `profile`**
2. 支持更多项目类型：前端、后端、Node 工具仓
3. 把 `project_type` 内部化，用于规则、技能和运行时路由
4. 清理 `common`，让它回到“所有项目都可共享的最小通用层”
5. 保持现有 `profile` 安装主链不被推翻
6. 通过分阶段方式推进，避免一次性重写运行时

本次改造**不追求**：

- V1 就引入复杂的 `project_type -> type dir -> profile dir` 三层目录
- V1 就自动检测 `springboot` 与 `node-tooling`
- V1 就统一重命名所有角色和流程语义

## 4. 核心设计决策

### 4.1 用户只显式选择 `profile`

V1 不新增用户可见的 `project_type` 交互。

用户只需选择：

- `vue`
- `react`
- `springboot`
- `node-tooling`

系统内部再从 `profile` 派生：

- `project_type`
- `implementation_role`
- `project-init` 应生成的规则集合
- 运行时应启用的技能 / 规则 / 审查语义

### 4.2 `project_type` 作为内部元数据存在

`project_type` 保留，但不作为主要 CLI 概念暴露给用户。

建议只在内部 registry 中使用，典型值为：

- `frontend`
- `backend`
- `tooling`

### 4.3 V1 不增加 `springboot` / `node-tooling` 自动检测

V1 的原则是：

- 继续保留现有 `vue / react` 的弱检测能力即可
- 对 `springboot`、`node-tooling` 不做自动判断
- 用户通过 `init --profile <name>` 或交互选择显式指定

原因：

- 减少 `repo-map.js` 与安装技能的改造面
- 避免错误识别导致的误安装
- 更适合当前“先做可控扩展、再做智能推断”的节奏

### 4.4 V1 保持 `common + profiles` 两层目录

V1 不新增 `types/<project_type>` 目录层。

原因：

- 当前安装主链天然就是 `common + profile`
- 直接在目录层引入 `types`，会显著放大安装、同步、校验和测试复杂度
- 在只有少量新 profile 的阶段，还不到必须抽象 `types` 的时候

V2 再根据复用情况决定是否增加：

- `.agents/rules/types/<project_type>/`
- `.agents/skills/types/<project_type>/`

### 4.5 `common` 只保留真正通用的内容

`common` 的目标应收敛为：

- 代码与文档的中性规范
- 执行与审计流程
- 依赖、安全、提交规范等语言 / 技术栈无关约束

凡是与 Web 页面、组件、路由、样式、前端请求层直接绑定的内容，都不应继续放在 `common`。

## 5. 目标 Profile 矩阵

| Profile | project_type | 典型项目 | 实现角色 | 是否需要用户显式选择 |
| --- | --- | --- | --- | --- |
| `vue` | `frontend` | Vue 3 / Vite / Pinia 项目 | `frontend-implementer` | 否，保留现有体验 |
| `react` | `frontend` | React / Next / Vite React 项目 | `frontend-implementer` | 否，保留现有体验 |
| `springboot` | `backend` | Spring Boot / Maven / 多模块后端 | `backend-implementer` | 是 |
| `node-tooling` | `tooling` | Node CLI / worker / contract / runtime 工具仓 | `tooling-implementer` | 是 |

当前目标仓库映射建议：

- `openclaw-task-orchestrator` -> `node-tooling`
- `asset-cube` -> `springboot`

## 6. Registry 设计

### 6.1 `profiles.json` 扩展字段

建议在现有基础上增加以下字段：

```json
{
  "profiles": {
    "springboot": {
      "status": "active",
      "label": "Spring Boot",
      "project_type": "backend",
      "implementation_role": "backend-implementer",
      "rules_dir": ".agents/rules/profiles/springboot",
      "skills_dir": ".agents/skills/profiles/springboot",
      "configs_dir": "configs/profiles/springboot",
      "project_init_rule_ids": [
        "layering-standard",
        "api-contract-standard",
        "persistence-standard",
        "runtime-config-standard",
        "test-standard-jvm"
      ],
      "aliases": []
    }
  }
}
```

字段含义建议：

- `project_type`
  - 内部分类，不作为用户第一入口
- `implementation_role`
  - 当前 profile 在主流程中的实现角色
- `project_init_rule_ids`
  - 该 profile 在 `project-init` 中可按项目事实生成 / 刷新的规则集合

### 6.2 `rules.json` 改造方向

规则层建议拆成两类：

- 通用规则 ID
  - 所有 profile 共享
- profile / domain 专属规则 ID
  - 按实现类型决定是否启用

建议保留的通用规则：

- `coding-standard`
- `generic-constraints`
- `doc-standard`
- `superpowers-standard`
- `audit-report-standard`

建议从“当前 common 但实际前端化”的规则中拆出的方向如下：

| 当前规则 ID | 当前状态 | 改造建议 |
| --- | --- | --- |
| `api-standard` | 当前在 `common`，明显前端化 | 改为按 profile 指向不同规则源，或拆成新的 profile-specific rule ids |
| `test-standard` | 当前在 `common`，明显前端化 | 拆为 `test-standard-web` / `test-standard-jvm` / `test-standard-node` |
| `format-check-standard` | 当前在 `common`，前端工具链偏重 | 拆为 `format-check-standard-web` / `format-check-standard-jvm` / `format-check-standard-node` |
| `component-standard` | 仅前端有意义 | 保持为前端专属规则 |
| `route-standard` | 仅前端有意义 | 保持为前端专属规则 |
| `store-standard` | 仅前端有意义 | 保持为前端专属规则 |
| `style-standard` | 仅前端有意义 | 保持为前端专属规则 |

后端新增规则 ID 建议：

- `layering-standard`
- `api-contract-standard`
- `persistence-standard`
- `runtime-config-standard`
- `exception-standard`

Node 工具仓新增规则 ID 建议：

- `cli-standard`
- `contract-standard`
- `runtime-files-standard`
- `logging-standard`
- `script-entry-standard`

### 6.3 `roles.json` 需要支持按 profile 选择规则与技能

当前 `roles.json` 的主要问题不是结构不能扩展，而是：

- `rule_ids` 是静态的
- `skill_priority` 是静态的
- `runtime_transition` 的目标角色在语义上仍偏前端

建议新增以下能力：

- `rule_ids_by_profile`
- `skill_priority_by_profile`
- `micro_skill_allowlist_by_profile`

示例：

```json
{
  "roles": {
    "code-guardian": {
      "rule_ids": ["coding-standard", "doc-standard", "audit-report-standard"],
      "rule_ids_by_profile": {
        "vue": ["route-standard", "style-standard", "test-standard-web"],
        "react": ["route-standard", "style-standard", "test-standard-web"],
        "springboot": ["api-contract-standard", "persistence-standard", "test-standard-jvm"],
        "node-tooling": ["contract-standard", "runtime-files-standard", "test-standard-node"]
      }
    }
  }
}
```

这样可以避免把所有实现差异都硬塞进 profile 目录拷贝逻辑里。

## 7. 目录结构建议

### 7.1 V1 目标目录

```text
.agents/
  registry/
    profiles.json
    rules.json
    skills.json
    roles.json
    flows.json

  rules/
    common/
      02-编码规范.md
      08-通用约束.md
      10-文档规范.md
      12-Superpowers执行规范.md
      14-审计汇报规范.md
    profiles/
      vue/
        01-项目概述.md
        03-项目结构.md
        04-组件规范.md
        05-API规范.md
        06-路由规范.md
        07-状态管理.md
        09-样式规范.md
        11-测试规范.md
        13-代码格式化与检查.md
      react/
        01-项目概述.md
        03-项目结构.md
        04-组件规范.md
        05-API规范.md
        06-路由规范.md
        07-状态管理.md
        09-样式规范.md
        11-测试规范.md
        13-代码格式化与检查.md
      springboot/
        01-项目概述.md
        03-项目结构.md
        04-分层规范.md
        05-接口与契约规范.md
        06-数据访问规范.md
        07-配置与运行时规范.md
        09-异常与日志规范.md
        11-测试规范.md
        13-代码格式化与检查.md
      node-tooling/
        01-项目概述.md
        03-项目结构.md
        04-CLI与模块规范.md
        05-Contract与Schema规范.md
        06-运行时文件规范.md
        07-日志与错误处理规范.md
        09-脚本与入口规范.md
        11-测试规范.md
        13-代码格式化与检查.md

  skills/
    common/
      archive-change/
      config-and-secret-scan/
      create-proposal/
      create-test/
      dependency-impact-graph/
      execute-task/
      find-skills/
      install-ai-spec-auto/
      project-init/
      skill-creator/
      skill-optimizer/
      using-superpowers/
    domains/
      web/
        design-analysis/
        route-permission-map/
        ui-verification/
        web-design-guidelines/
    profiles/
      vue/
      react/
      springboot/
      node-tooling/

configs/
  profiles/
    vue/
    react/
    springboot/
    node-tooling/
```

### 7.2 为什么 V1 不引入 `types/<project_type>`

V1 先接受少量 profile 之间的规则重复，原因如下：

- 当前目标 profile 数量不多
- 先把语义边界理顺比先抽象目录更重要
- 如果一开始就上 `types/`，需要同步修改安装、同步、校验、技能引用和测试夹具

只有在满足以下条件时，才建议进入 V2：

- 同一 `project_type` 下出现 3 个以上 profile
- `rules` 或 `skills` 中出现明显的大段重复
- 维护者已经因为 profile 复制而频繁遗漏同步

## 8. `common rules` 清理方案

### 8.1 保留在 `common` 的规则

建议继续保留在 `common` 的规则：

- `02-编码规范.md`
  - 但需要改成真正中性，不再默认 `.vue`、组件 Props、路由/页面目录
- `08-通用约束.md`
  - 保留依赖、安全、日志、调试代码、提交规范等中性部分
- `10-文档规范.md`
- `12-Superpowers执行规范.md`
- `14-审计汇报规范.md`
  - 但示例应改成中性示例，不再默认 `src/views/*.vue`

### 8.2 从 `common` 下沉的规则

建议下沉的规则如下：

| 当前文件 | 问题 | 迁移建议 |
| --- | --- | --- |
| `05-API规范.md` | 目录、SDK、错误处理均是前端默认实现 | 下沉到 `profiles/<profile>/`，或改为按 profile 映射的 rule id |
| `11-测试规范.md` | 固定 Vitest 与前端组件测试生态 | 改为 profile-specific 测试规范 |
| `13-代码格式化与检查.md` | 固定 ESLint + Prettier + Stylelint 和 Vue/React 特殊处理 | 改为 profile-specific 格式与检查规范 |

### 8.3 `02 / 08 / 14` 的中性化重点

`02-编码规范.md` 应去掉的前端默认表述：

- `.vue` 脚本类型约束
- 组件 Props 默认要求
- 路由 / 页面目录命名示例

`08-通用约束.md` 应拆出的前端内容：

- `bundle size`
- 锁定 `pnpm`
- CSS Modules / Skeleton / 主题变量 / 路由集中管理

`14-审计汇报规范.md` 应替换的内容：

- `src/views/login/index.vue`
- `src/router/index.ts`
- `npm install vue-router`

替换后的示例应覆盖：

- 通用脚本仓场景
- Node.js 工具仓场景
- Java 后端场景

## 9. `common skills` 清理方案

### 9.1 应继续保留在 `common` 的技能

这些技能的本质是流程 / 治理能力，适合继续保留：

- `archive-change`
- `config-and-secret-scan`
- `create-proposal`
- `create-test`
- `dependency-impact-graph`
- `execute-task`
- `find-skills`
- `install-ai-spec-auto`
- `project-init`
- `skill-creator`
- `skill-optimizer`
- `using-superpowers`

但其中两个必须重写为 profile 驱动：

- `install-ai-spec-auto`
- `project-init`

### 9.2 应从 `common` 移出的技能

| 当前技能 | 问题 | 迁移建议 |
| --- | --- | --- |
| `design-analysis` | 实际是 Web / UI 设计分析能力 | 移到 `domains/web/` |
| `route-permission-map` | 只适用于前端路由 / 菜单 / 权限 | 移到 `domains/web/` |
| `ui-verification` | 只适用于页面还原与设计稿验收 | 移到 `domains/web/` |
| `web-design-guidelines` | 本质就是 Web UI 审查 | 移到 `domains/web/` |

这样做的收益是：

- `common` 重新代表“所有项目都适用”
- Web / UI 能力仍然保留，但不再污染后端与工具仓接入心智

## 10. `init` / 安装链路设计

### 10.1 CLI 交互设计

V1 只保留一个选择：

- `Profile`

交互上可以按类别展示，但本质仍只写入 `profile`。

推荐展示形式：

```text
选择 Profile：
1. vue            - Frontend / Vue
2. react          - Frontend / React
3. springboot     - Backend / Spring Boot
4. node-tooling   - Tooling / Node.js Tooling
```

不建议设计成：

1. 先选 `project_type`
2. 再选 `profile`

### 10.2 CLI 参数设计

继续使用：

```bash
ai-spec-auto init . --profile springboot
ai-spec-auto init . --profile node-tooling
```

V1 不新增强制性的：

- `--project-type`

如果后续为了脚本自动化要增加，也建议作为可选高级参数，而不是用户主入口。

### 10.3 `manifest.json` 落盘策略

V1 继续只落 `profile`，不强制落 `project_type`。

示例：

```json
{
  "profile": "springboot",
  "ides": ["cursor"]
}
```

原因：

- `project_type` 可以从 `profile` 推导
- 避免 manifest 出现重复信息
- 减少 `sync`、`repo-map`、测试与兼容逻辑的同步改造面

### 10.4 `install-ai-spec-auto` 技能改造

当前该技能默认会猜 `vue / react`，并把 `--profile <vue|react>` 写死进模板。

改造建议：

- 对已知前端仓可继续保留弱推断
- 对不确定仓库不再默认 `vue`
- 若未显式传入 `profile` 且无法可靠判断，应引导用户选择 profile
- 技能中的命令模板改为 `<profile>`，不再写死 `vue|react`

## 11. `project-init` 改造

### 11.1 当前问题

`project-init` 当前默认假设：

- 工作区必须是前端项目
- 固定生成 `01 / 03 / 04 / 05 / 06 / 07 / 09`

这与多 profile 目标不兼容。

### 11.2 目标设计

`project-init` 应改为：

1. 先读取 `.ai-spec/manifest.json` 中的 `profile`
2. 从 `profiles.json` 读取该 profile 的 `project_init_rule_ids`
3. 仅针对该 profile 对应的规则集合做事实采集与生成

这样可以支持：

- Vue / React 项目继续生成前端规则
- Spring Boot 项目生成后端规则
- Node 工具仓生成 CLI / contract / runtime 文件规则

### 11.3 `project-init` 的固定产物

建议固定产物继续保留：

- `01-项目概述.md`
- `03-项目结构.md`
- `context/PROJECT.md`

而“补生成哪些能力规则”则完全交给当前 `profile` 决定。

## 12. `repo-map.js` 改造

### 12.1 V1 的最小原则

V1 不要求自动检测 `springboot` 与 `node-tooling`。

因此 `repo-map.js` 的改造原则应是：

1. **优先相信已安装项目的 `.ai-spec/manifest.json.profile`**
2. 若 manifest 不存在，再保留现有 `vue / react` 弱推断
3. 对其它项目统一返回 `default` / `unknown`

这样做的意义是：

- 已安装项目总能拿到准确 profile
- 未安装的非前端仓库不会被误判
- 避免为了识别 `pom.xml`、`.mjs`、`workers/` 等信号改出一整套不稳定启发式

### 12.2 `repo-map` 输出建议

当存在 manifest 时，`framework` 建议直接使用当前 `profile`。

例如：

- `springboot`
- `node-tooling`

不要把后端和工具仓再次压缩成 `default`，否则后续运行时仍拿不到足够的上下文。

## 13. 运行时与角色体系改造

### 13.1 当前关键问题

当前运行时把实现专家写死成 `frontend-implementer`，导致：

- flow handoff 无法自然切到后端或工具仓实现角色
- superpowers hints 只对前端实现有默认语义
- auto dispatch 的 expected outputs 也带着前端假设

### 13.2 V1 角色策略

V1 不强行把所有角色重命名成完全通用的抽象名，而是增加 profile 对应的实现角色：

- `frontend-implementer`
- `backend-implementer`
- `tooling-implementer`

并在 `profiles.json` 中通过 `implementation_role` 指定。

这样可以以最小改动覆盖当前目标，而不是立即进行更大规模的角色重命名。

### 13.3 运行时需要读取 `implementation_role`

以下模块建议改为读取当前 profile 的 `implementation_role`，而不是直接写死：

- `execution-semantics`
- `task-orchestrator-runner`
- `runtime-state`
- `superpowers`
- `expert-executor`
- 相关 fixtures 与测试

### 13.4 `code-guardian` 保持共用，但规则按 profile 注入

建议：

- `requirement-analyst` 保持共用
- `code-guardian` 保持共用
- `archive-change` 保持共用

它们通过 `rule_ids_by_profile / skill_priority_by_profile` 获得不同项目类型的审查依据。

## 14. 实施阶段建议

### Phase 1：清理 `common` 语义边界

目标：

- 先把 `common` 从“默认前端层”收敛成“真正通用层”

范围：

- 中性化 `02 / 08 / 14`
- 迁出或重定位 `05 / 11 / 13`
- 把 Web/UI 技能从 `common` 迁到 `domains/web`

验收标准：

- 非前端项目不再从 `common` 读取到明显错误的页面 / 组件 / 路由 / 样式约束

### Phase 2：扩展 `profiles.json` 与目录骨架

目标：

- 新增 `springboot` 与 `node-tooling`
- 补齐对应的 `rules / skills / configs` 目录

范围：

- `profiles.json`
- `rules.json`
- `skills.json`
- profile 目录骨架

验收标准：

- `init --profile springboot`
- `init --profile node-tooling`

在安装层面可以正常完成资产分发。

### Phase 3：改造 `install-ai-spec-auto` 与 `project-init`

目标：

- 让安装与规则生成真正按当前 profile 运作

范围：

- `install-ai-spec-auto` 技能
- `project-init` 技能
- 安装 / 自定义规则选择逻辑

验收标准：

- Vue / React 项目仍保持现有体验
- Spring Boot / Node 工具仓能生成对应规则，而不是错误套用前端模板

### Phase 4：打通运行时角色与协议链

目标：

- 让非前端 profile 可以真正走通主流程

范围：

- `execution-semantics`
- `task-orchestrator-runner`
- `superpowers`
- `runtime-state`
- `roles.json`
- 测试夹具与运行时测试

验收标准：

- `springboot` 项目能 handoff 到 `backend-implementer`
- `node-tooling` 项目能 handoff 到 `tooling-implementer`

## 15. 风险与控制

### 15.1 最大风险

最大的风险不是新增 profile 目录本身，而是：

- 误以为“改 install 就够了”
- 忽略 `common` 语义污染
- 忽略运行时 role / flow 写死前端实现角色

### 15.2 控制原则

建议严格按阶段推进：

1. 先清 `common`
2. 再补 profile 骨架
3. 再改安装与 `project-init`
4. 最后打通运行时

不要一开始同时动：

- 目录层级
- registry 结构
- 安装链
- 运行时角色
- 测试夹具

否则回归成本会明显放大。

## 16. 最终结论

本次扩展最稳的路线不是“让用户先学 `project_type` 再选 `profile`”，而是：

> 用户只选择 `profile`，系统内部再从 `profile` 派生 `project_type`、规则集合、技能集合和实现角色。

对应的改造原则是：

- 保持 `common + profiles` 两层目录，不急着引入 `types`
- 先把 `common` 去前端化
- 让 `install`、`project-init`、运行时都真正按 `profile` 驱动
- 将 `springboot` 与 `node-tooling` 作为明确的新增 profile 接入

如果后续同类 profile 继续增多，再考虑把 `project_type` 显式提升为目录抽象层，而不是现在就提前设计过深。
