---
name: dependency-impact-graph
description: 分析 monorepo、多包仓库或单仓模块间的依赖关系，判断“改一个包、目录或文件会影响谁”，并给出回归测试范围与潜在消费者提醒。当用户说“改了这个包会影响谁”“依赖影响分析”“回归测试范围”时使用。
compatibility: Requires a local repository workspace with dependency manifests, package/module boundaries, and source files available for static inspection.
---

# 依赖影响分析

## 使用时机

当你需要：

- 判断某个包、目录、文件改动的下游影响
- 评估回归测试范围
- 梳理 monorepo / workspace 的依赖关系

## 核心原则

- 先识别仓库结构，再建依赖图
- 优先用依赖声明，其次用代码引用补边
- 输出以“直接影响 / 间接影响 / 建议测试范围”为主
- 不自动安装依赖、不自动改代码

## 步骤 1：识别结构

优先检查：

- Node：`package.json`、`pnpm-workspace.yaml`、`lerna.json`
- Rust：`Cargo.toml`
- Go：`go.mod`

若不是多包仓库，也可以退化为“单包内模块/目录影响分析”。

## 步骤 2：建立依赖图

依赖来源按优先级：

1. 声明依赖
2. 代码 import / require / 相对路径引用

图的语义：

- `A -> B` 表示 A 依赖 B
- 当 B 被修改时，需要沿“谁依赖它”的方向做反向传播

## 步骤 3：输出影响范围

至少输出：

- 变更目标
- 直接依赖方
- 间接依赖方
- 建议回归测试范围
- 潜在 API / SDK / 服务消费者

## 输出模板

```md
## 依赖影响分析

**变更目标**：`packages/shared-utils`

### 受影响下游
- 直接：`packages/web-app`、`packages/admin-app`
- 间接：`packages/e2e-suite`

### 建议回归测试范围
- 必测：`packages/shared-utils`
- 建议：`packages/web-app`、`packages/admin-app`

### 消费者提醒
- 内部消费者：
- 外部发布面（若存在）：
```

## 注意事项

- 单包仓库下要明确写“当前为单包分析”
- 尽量区分运行时依赖与仅类型依赖
- 若项目已有测试命令约定，可附命令示例，但不写死某个工具
