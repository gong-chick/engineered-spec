# 文档索引

这份索引用于把安装、上手、OpenSpec、培训和设计记录分开，避免 README 继续膨胀成大而全手册。

## 当前主入口

如果你只选择一个起点，优先从第四阶段文档入口开始。

- [第四阶段文档入口](four/README.md)
- [开发最佳实践指南](four/开发最佳实践指南.md)
- [需求示例：从发起到归档](four/需求示例-从发起到归档.md)
- [架构设计与治理说明](four/架构设计与治理说明.md)
- [多项目类型与 Profile 扩展改造方案](four/多项目类型与Profile扩展改造方案.md)
- [项目介绍与运行机制说明](four/项目介绍与运行机制说明.md)
- [Hub 资产同步脚本说明](four/Hub资产同步脚本说明.md)
- [Skill 官方标准与创建规范](four/Skill官方标准与创建规范.md)
- [Skill 官方审计基线](four/Skill官方审计基线.md)

## 入门

- [5 分钟快速上手](quick-start.md)
- [安装指南](install-guide.md)
- [最小 `manifest.json` 示例](manifest-最小示例.md)

## 协议与流程

- [OpenSpec / 协议流说明](openspec-guide.md)
- [小需求与补丁修正指南](four/小需求与补丁修正指南.md)
- [Hub 资产同步脚本说明](four/Hub资产同步脚本说明.md)
- [Skill 官方标准与创建规范](four/Skill官方标准与创建规范.md)
- [Skill 官方审计基线](four/Skill官方审计基线.md)
- [协议与专家增强记录](paser_three/协议与专家增强记录.md)
- [主流程专家优化记录](paser_three/主流程专家优化记录.md)

## 推广与培训

- [培训大纲](training-outline.md)

## 项目理解

- [第四阶段文档入口](four/README.md)
- [开发最佳实践指南](four/开发最佳实践指南.md)
- [架构设计与治理说明](four/架构设计与治理说明.md)
- [项目介绍与运行机制说明](four/项目介绍与运行机制说明.md)
- [第五阶段专题入口](five/README.md)
- [入口体验优化方案](five/入口体验优化方案.md)
- [入口最佳实践指南](five/入口最佳实践指南.md)
- [最小示例运行说明](paser_three/最小示例运行说明.md)
- [开发人员规范化开发实践-流程图版](paser_three/开发人员规范化开发实践-流程图版.md)

## 历史阶段资料

- [paser_three 入口](paser_three/README.md)

## 当前文档分层

- `README.md`
  - 产品是什么
  - 推荐安装命令
  - registry 前置要求
  - 高频命令入口
- `docs/quick-start.md`
  - 5 分钟落地一套最小完整流程
- `docs/install-guide.md`
  - 参数、兼容、Monorepo、自定义规则、排错
- `docs/manifest-最小示例.md`
  - `init --manifest` / `sync --manifest` 可直接复制使用的最小清单示例
- `docs/openspec-guide.md`
  - OpenSpec(规范产物框架) 与协议流
- `docs/four/小需求与补丁修正指南.md`
  - 小需求如何在 quick-fix(轻量快修) / patch(当前变更补丁) / archive-fix(归档前修正) / followup-patch(归档后补丁) / full-change(完整变更) 之间分流
- `docs/four/README.md`
  - 第四阶段主入口
  - 按受众分层的阅读路径
- `docs/four/Hub资产同步脚本说明.md`
  - 本地脚本如何同步 skill(技能) / rule(规则) / role(角色) / scenario(场景) 到 Hub
  - 认证、分类、domain(领域) 映射与场景覆盖策略
- `docs/four/Skill官方标准与创建规范.md`
  - skill 按官方规范创建、校验、补 compatibility、补 evals 的统一标准
- `docs/four/Skill官方审计基线.md`
  - 当前 29 个 skill 的基线审计结果与后续治理顺序
- `docs/four/开发最佳实践指南.md`
  - 面向普通开发者的上手与实践说明
- `docs/four/需求示例-从发起到归档.md`
  - 一条真实需求从发起、迭代到归档的完整示例
- `docs/four/项目介绍与运行机制说明.md`
  - 当前项目总览、双流程分层、运行机制与治理价值说明
- `docs/four/架构设计与治理说明.md`
  - 面向维护者与评审的架构、治理和排障说明
- `docs/four/多项目类型与Profile扩展改造方案.md`
  - 面向维护者的多项目类型扩展方案，覆盖 profile 扩展、common 去前端化、安装与运行时分阶段改造建议
- `docs/five/README.md`
  - 第五阶段专题入口
- `docs/five/入口体验优化方案.md`
  - 当前项目入口体验问题与优化方案
- `docs/five/入口最佳实践指南.md`
  - 面向开发者、维护者与项目负责人的入口使用最佳实践

如果你只是第一次接入，先看：

1. [README](../README.md)
2. [第四阶段文档入口](four/README.md)
3. [开发最佳实践指南](four/开发最佳实践指南.md)
4. [5 分钟快速上手](quick-start.md)
5. [安装指南](install-guide.md)
