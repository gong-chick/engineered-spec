---
name: skill-optimizer
description: 优化和重构现有 skill 的触发描述、工作流、确认门槛和资源组织方式。当用户说“优化 skill”“检查 skill 质量”“改进某个 skill”“重构技能说明”时使用。默认先审查，再出计划，确认后再改。
---

# Skill 优化器

## 定位

本技能用于优化已有 skill，不负责从零创建 skill。

分工如下：

- `skill-creator`：从无到有创建 skill
- `skill-optimizer`：审查、收口、重构现有 skill

## 工作原则

- 先审查，再计划，再修改
- 未确认前不改目标 skill
- 优先解决触发失败、确认缺失、流程不可执行的问题
- 只读取目标 skill 直接相关的 `SKILL.md / references / scripts / assets`

默认参考：

- [审查清单](references/review-checklist.md)
- [设计模式判断](references/design-patterns.md)

## 工作流

复制并跟踪这份清单：

```text
优化进度：
- [ ] 1. 确定范围
- [ ] 2. 审查现状
- [ ] 3. 输出优化计划
- [ ] 4. 用户确认
- [ ] 5. 实施与校验
```

### 1. 确定范围

- 先确认目标 skill
- 若用户只给方向，例如“只改 description”，则只做局部审查
- 若用户只说“优化这个 skill”，先给完整审查结论

### 2. 审查现状

重点检查：

- `description` 是否同时说明“做什么”和“何时用”
- SKILL.md 是否清晰、可执行、不过胖
- 是否缺少确认门槛、gotchas、模板、脚本或 references
- 是否把重型细节塞进正文而不是拆到 references
- 输出格式是否稳定，能否交给另一个 agent 执行

### 3. 输出优化计划

必须先给：

1. 审查结论
2. 分优先级的优化计划

不要直接改文件。

### 4. 用户确认

- 明确等待确认
- 若用户只同意部分变更，只实施已确认范围

### 5. 实施与校验

至少校验：

- frontmatter 合法
- `name`、目录名、触发语义一致
- `description` 能独立触发
- 主体更短、更清晰、更可执行

## 输出模板

```md
# Skill 审查结论

## 高优先级
- ...

## 中优先级
- ...

# 优化计划
1. 修改 ...
2. 新增 ...
3. 删除或下沉 ...
```

## 禁止事项

- 未确认前直接改目标 skill
- 为了“完整”把无关 reference 全部读进上下文
- 顺手扩大范围，把局部优化升级成整套重构
