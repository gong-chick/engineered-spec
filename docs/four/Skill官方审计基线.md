# Skill 官方审计基线

这份文档记录本仓库 skill 资产按官方标准收口时的基线结论，后续增量治理继续在这里追加。

## 当前基线

- 技能总数：29
- skill source 校验数：29
- error：0
- warning：1
- 当前 warning：
  - `project-init`：主体过长，后续适合继续下沉到 `references/` / `scripts/`

## 本轮已修复

### 1. frontmatter 硬错误

- 移除了 3 个 skill 的 top-level `version`
- `version` 统一迁入 `metadata.version`
- 修正了 `execute-task` 的嵌套 `metadata` 结构，改为官方兼容的字符串键值

### 2. 兼容性声明

以下 skill 已补 `compatibility`：

- `archive-change`
- `config-and-secret-scan`
- `create-proposal`
- `create-test`
- `dependency-impact-graph`
- `design-analysis`
- `execute-task`
- `project-init`
- `route-permission-map`
- `ui-verification`
- `using-superpowers`
- `web-design-guidelines`
- React/Vue `create-*` 与 `theme-variables`

### 3. 说明性修复

- 补强了高优先级 skill 的 description 触发表达
- 为关键 repo-dependent skill 增加了 `环境依赖` / `注意事项` / checklist
- `skill-creator` 模板已切到官方兼容骨架，并默认生成 `evals/`

### 4. 校验链路

- 新增统一 skill-spec 校验模块：`bin/skill-spec-validator.js`
- `validate-registry` 已接入 skill-spec 校验阶段
- `skill-creator/scripts/quick_validate.py` 已改为调用同源校验逻辑

## 本轮新增的审计能力

- 非官方 top-level frontmatter 字段阻断
- `metadata` 非字符串值阻断
- `compatibility` 长度与类型阻断
- `SKILL.md` 超 500 行阻断
- bundled resource 相对路径错误或缺失阻断
- repo-dependent skill 缺 `compatibility` 告警

## 下一批优先治理

### P1

- `project-init`
  - 继续拆 `references/`
  - 压低正文长度

### P2

- 为 6 个核心 common skill 完善 eval 基线与触发样本
- 根据真实使用数据继续优化 description 和 should-trigger 边界

## 执行约束

- 本文档记录 warning 和治理顺序，不替代 `validate-registry`
- 未来新增 skill 若不带 `evals/`，视为创建流程不完整
