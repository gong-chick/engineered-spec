# Skill 官方标准与创建规范

这份文档把本仓库的 skill 创建、审计和校验规则统一到官方 Agent Skills 标准上，同时保留本项目的仓库级扩展。

## 官方基线

本仓库以以下官方文档为基线：

- [What are skills](https://agentskills.io/what-are-skills)
- [Specification](https://agentskills.io/specification)
- [Best practices](https://agentskills.io/skill-creation/best-practices)
- [Quickstart](https://agentskills.io/skill-creation/quickstart)
- [Using scripts](https://agentskills.io/skill-creation/using-scripts)
- [Optimizing descriptions](https://agentskills.io/skill-creation/optimizing-descriptions)
- [Evaluating skills](https://agentskills.io/skill-creation/evaluating-skills)
- [Adding skills support](https://agentskills.io/client-implementation/adding-skills-support)

## 一. 官方硬规则

- 每个 skill 目录必须包含 `SKILL.md`
- frontmatter 只允许：
  - `name`
  - `description`
  - `license`
  - `compatibility`
  - `metadata`
  - `allowed-tools`
- `name` 必须和目录名一致，使用小写短横线格式
- `description` 必须是触发入口，明确写“做什么 + 何时用”
- `metadata` 只能是字符串键值映射
- `compatibility` 是可选项，但一旦声明必须是简洁、真实的环境要求
- `SKILL.md` 主体尽量控制在 500 行以内
- 详细材料放到 `references/`、`scripts/`、`assets/`，不要把长说明堆进正文

## 二. 本项目强制规则

- 依赖 `.agents/rules/`、OpenSpec、Hub 同步、Browser、Vitest 等环境时，必须写 `compatibility`
- 使用本地 bundled resources 时，只能用 skill 根目录相对路径：
  - `references/...`
  - `scripts/...`
  - `assets/...`
- 多步骤 skill 必须满足二选一：
  - 有 checklist
  - 有明确 validation loop
- 容易误用、破坏性或刚性流程的 skill，必须写 `Gotchas / 注意事项 / 常见错误`
- 新建 skill 默认建立：
  - `evals/train_queries.json`
  - `evals/validation_queries.json`
  - `evals/evals.json`

## 三. 推荐最佳实践

- 正文只保留导航、判断条件和关键工作流
- 多变体 skill 把框架差异放到 `references/`
- 重复执行、需要稳定结果的逻辑优先落到 `scripts/`
- 模板、图片、示例项目、字体等输出资源放到 `assets/`
- repo-dependent skill 允许存在，但要把仓库依赖显式化，不伪装成可移植通用 skill

## 四. 创建流程

推荐顺序：

1. 确定 should-trigger / should-not-trigger 边界
2. 明确最小工作流和验证方式
3. 判断哪些内容应下沉到 `references/`、`scripts/`、`assets/`
4. 用 `skill-creator` 初始化骨架
5. 补 `evals/` 基线
6. 运行校验

默认创建入口：

- `.agents/skills/common/skill-creator/SKILL.md`
- `.agents/skills/common/skill-creator/scripts/init_skill.py`

## 五. 校验与入库

本仓库统一使用两层校验：

```bash
node ./bin/validate-registry.js --json
python3 .agents/skills/common/skill-creator/scripts/quick_validate.py <skill-dir>
```

规则：

- `validate-registry` 是总入口，未来 skill 入库、`sync`、Hub 同步都以它为准
- error 级问题会阻断
- warning 级问题进入审计基线，允许后续分批治理

## 六. 评估基线

统一约定如下：

- 触发评估：
  - `train_queries.json`
  - `validation_queries.json`
- 输出质量评估：
  - `evals.json`

要求：

- 新建 skill 必须带 `evals/`
- 不要把 validation set 的结果反向过拟合到 description
- output-quality eval 至少给出：
  - prompt
  - files
  - assertions
  - expected outcome
