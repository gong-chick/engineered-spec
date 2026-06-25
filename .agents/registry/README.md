---
name: sync-registry-index
description: sync（同步）本地求解使用的最小注册表目录。用于维护场景方案、规则映射和技能能力域标签，避免把安装求解数据硬编码在执行脚本里。
---

# sync（同步）注册表目录

本目录用于承载 `ai-spec-auto sync（同步）` 的本地静态注册表。

当前阶段放 5 类数据：

- `scenario-packages.json`
  - 兼容保留的 `scenario_package（场景方案包） metadata`，用于导出追踪与展示分析
  - 不再参与 `sync（同步）` 的安装求解；未知场景包不应阻断安装
- `rules.json`
  - 定义 `rule（规则） id` 到实际文件的映射，以及它们的 `domains（能力域）`
  - `task-orchestrator` 优先通过它解析规则文件，不再在执行器中硬编码规则路径
- `skills.json`
  - 定义 `skill（技能）` 的 `domains（能力域）` 标签
  - `task-orchestrator` 优先通过它解析技能文件，不再在执行器中硬编码技能路径
- `roles.json`
  - 定义 `role（专家角色）` 的安装元数据，以及角色侧公共支持文件
  - 同时承载 `rule_ids / skill_priority / micro_skill_allowlist / rule_contract_profiles / openspec_actions / runtime_transition` 等运行时约束
- `flows.json`
  - 定义 `flow（流程模板）` 的安装元数据，以及流程侧公共支持文件

当前原则：

- 运行逻辑写在 `bin/sync.js`
- 安装求解数据沉淀在 `.agents/registry/`
- 后续新增或调整 `rules（规则） / skills（技能） / roles（专家角色） / flows（流程模板）` 时，优先改注册表，不优先改执行器
- `scenario_packages（场景方案包）` 作为 metadata，允许存在于导出快照中，但不再作为本地安装求解的强依赖

## 校验方式

为避免 `registry（注册表）` 数据文件写坏，当前项目提供了专门的校验命令：

```bash
ai-spec-auto validate-registry
ai-spec-auto validate-registry --json
```

校验范围包括：

- `rules.json`
- `skills.json`
- `roles.json`
- `flows.json`
- `scenario-packages.json`

当前会检查：

- `JSON（结构化数据）` 是否可解析
- 根字段是否存在
- `version（版本号）` 是否合法
- `source（源文件） / sourceByProfile（按技术栈源文件） / support_files（支持文件）` 是否真实存在
- `domains（能力域）` 是否为字符串数组
- `roles.json / flows.json` 对 `rules / skills / roles` 的引用是否都能在注册表中找到
- 若存在 `scenario-packages.json`，其引用关系会继续校验；若不存在，不影响主流程校验
- `roles.json.rule_contract_profiles` 的 profile key 与数组字段是否合法
- `scenario_package（场景方案包）` 引用的 `roles（专家角色） / skills（技能） / rules（规则）` 是否都能在注册表中找到

`ai-spec-auto sync（同步）` 在执行前也会先跑一次注册表校验；若校验失败，会直接中断并提示先执行 `ai-spec-auto validate-registry` 查看详情。
