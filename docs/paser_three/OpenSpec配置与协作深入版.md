# OpenSpec 配置与协作深入版

## 1. 这篇文档给谁看

这篇文档主要给两类人看：

- 维护 `ai-spec-auto` 的平台开发者
- 需要设计或调整 `openspec/config.yaml`、`.agents/rules/`、`.agents/skills/` 协作方式的人

如果你只是第一次接触项目，建议先读 [团队成员 5 分钟上手](./团队成员5分钟上手.md)。

---

## 2. 先明确边界：OpenSpec 管什么，增强层管什么

推荐固定按下面分工理解：

| 层 | 负责什么 | 典型落点 |
|----|----------|----------|
| OpenSpec | 变更产物与阶段节奏 | `openspec/changes/`、`openspec/specs/` |
| `openspec/config.yaml` | OpenSpec 与团队规范的桥接 | `schema`、`context`、阶段级 `rules` |
| `.agents/rules/` | 团队硬约束 | 目录、命名、边界、禁止项 |
| `.agents/skills/` | 执行方法 | proposal 增强、组件/API/测试/UI 验收 |
| `.agents/flows/` | 专家主链与门禁 | 角色顺序、交付物要求、审批点 |
| `.ai-spec/` | 运行态事实 | 当前 run、dispatch、execution、事件历史 |

这里最容易出错的是把 `config.yaml` 写成“第二套规则系统”。这不是推荐方向。

---

## 3. `config.yaml` 最佳实践

当前仓库的推荐原则是：

- `schema` 决定产物结构
- `context` 决定项目事实和执行优先级
- `rules` 决定阶段边界
- 具体执行做法下沉到 `.agents`

推荐模板：

```yaml
schema: expert-delivery

context: |
  本项目接入 ai-spec-auto 专家协同平台：
  - rules: .agents/rules/
  - skills: .agents/skills/
  - roles: .agents/roles/
  - flows: .agents/flows/
  - runtime: .ai-spec/

  项目执行时优先遵循：
  1. 仓库现有代码中的目录、路由、接口、样式、测试约定
  2. context/PROJECT.md 中的项目背景与仓库事实
  3. .agents/rules/ 中的团队规范
  4. .agents/skills/ 中的执行技能

rules:
  proposal:
    - "先收敛目标、范围、非目标项、默认假设和风险，再进入实现。"
    - "能从项目规则和代码推断的内容，优先写入 assumptions，不重复标记为缺失输入。"
    - "涉及页面、路由、接口、状态、样式时，必须对齐项目既有落点。"
  specs:
    - "需求必须落为可测试的增量规范和场景。"
    - "涉及 UI 时，验收场景应覆盖关键布局、状态和交互。"
    - "涉及安装脚本、路径、运行态文件、归档或 IDE 适配时，必须明确 macOS / Linux / Windows 的行为差异与兼容边界。"
    - "涉及产物生成、同步或删除时，必须明确目标定位依据，优先使用显式清单、注册表或固定映射，不依赖模糊模式匹配。"
  tasks:
    - "任务必须可执行、可验证、可交接。"
    - "实现阶段不得静默扩 scope。"
    - "涉及 UI 时必须明确验收方式；涉及接口时必须明确封装方式。"
    - "保持改动最小化，聚焦于请求的变更。"
    - "涉及安装、路径、runtime、归档或 IDE 适配时，必须包含跨平台验证任务。"
  design:
    - "技术方案必须对齐项目目录、路由、API、状态、样式和测试约定。"
    - "新增能力优先复用现有结构，不因单次变更引入无关重构。"
    - "涉及路径处理时，必须使用跨平台路径能力，不硬编码路径分隔符。"
    - "优先复用现有 registry、常量和显式映射，不引入启发式检测、模糊匹配或正则猜测。"
  checklist:
    - "必须明确通过项、未通过项、阻断项和是否建议放行。"
    - "检查结论必须基于 proposal/specs/design/tasks、项目规则和实现证据。"
  iterations:
    - "必须记录问题、修正动作、残留风险和下轮提醒。"
```

---

## 4. 三个字段分别怎么设计

### 4.1 `schema`

当前推荐：

```yaml
schema: expert-delivery
```

原因是当前主链不只需要 OpenSpec 的基础产物，还需要：

- `checklist.md`
- `iterations.md`
- 专家交付语义的扩展空间

推荐原则：

- 结构类要求放在 schema
- 不要把执行流程塞进 schema

### 4.2 `context`

`context` 是给 OpenSpec 的项目级背景说明，不是给人看的长文。

推荐写法：

- 先写当前项目接入了哪些增强层
- 再写执行优先级
- 优先强调“先遵循仓库现有事实”

不推荐写法：

- 大段教学
- 重复粘贴 rules 正文
- 重复粘贴 role 正文
- 直接写成一个完整 SOP

### 4.3 `rules`

`rules` 的作用，是在 OpenSpec 生成不同阶段产物时给出最小边界，而不是替代 skill。

推荐写法：

- `proposal` 约束目标、范围、假设、风险
- `specs` 约束场景和可测试性
- `tasks` 约束粒度、验收和边界
- `design` 约束技术方案与现有项目结构对齐
- `checklist / iterations` 约束交付检查结果

不推荐写法：

- 把技能名罗列成大清单
- 把每个动作都写成脚本
- 复制整套团队规范到 `rules`

---

## 5. `config.yaml` 和 `.agents` 怎么配合

建议固定按下面路径运行：

1. `config.yaml` 先告诉 OpenSpec 这个仓库有哪些增强层
2. OpenSpec 在 `proposal/design/tasks/specs` 阶段先吸收 `rules`
3. 进入实现阶段后，再由 `.agents/rules/` 与 `.agents/skills/` 接管细节
4. `task-orchestrator` 按 `.agents/flows/` 和 `.agents/registry/` 决定交接和门禁
5. `.ai-spec` 记录当前运行态与事件历史

一句话：

> `config.yaml` 负责让 OpenSpec 不脱离团队规范，`.agents` 负责让专家真正按规范执行。

---

## 6. 推荐的设计判断标准

如果你在调整配置时拿不准，可以用下面 5 个问题快速判断：

1. 这条信息是“项目事实”还是“执行步骤”？
   项目事实更适合放 `context`。
2. 这条信息是“阶段边界”还是“具体做法”？
   阶段边界更适合放 `rules`。
3. 这条信息是否已经在 `.agents/rules/` 存在？
   已存在就不要在 `config.yaml` 再重复一份。
4. 这条约束是否需要跟随产物类型生效？
   需要的话更适合放对应阶段的 `rules`。
5. 这条能力是否是“如何做”？
   “如何做”更适合放 skill。

---

## 7. 常见反模式

### 反模式一：`config.yaml` 过载

表现：

- `context` 写成几百行
- `rules` 写成完整作业流程
- 每个技能都在 `rules` 里点名一遍

问题：

- OpenSpec 上下文噪音过大
- 和 `.agents` 双重维护
- 调整时容易不一致

### 反模式二：规则和技能混放

表现：

- 把“必须怎么做”和“推荐如何做”混在一起

问题：

- AI 无法分辨硬约束与方法建议
- 阶段边界不清晰

### 反模式三：脱离仓库事实

表现：

- `config.yaml` 里写的目录、路由、接口习惯，与真实项目不一致

问题：

- 生成的 proposal/design/tasks 会偏离真实仓库

---

## 8. 对团队培训的推荐口径

如果你要给团队解释这套设计，建议直接用下面三句话：

1. OpenSpec 是变更产物和流程节奏层
2. `config.yaml` 是 OpenSpec 与团队规范的桥接层
3. `.agents` 才是团队执行规范的主维护源

这三句话足够统一大多数人的认知。

---

## 9. 推荐阅读顺序

建议按受众区分：

- 团队成员先读 [团队成员 5 分钟上手](./团队成员5分钟上手.md)
- 想理解全链路的人再读 [项目介绍与运行机制说明](../four/项目介绍与运行机制说明.md)
- 需要维护配置和规范体系的人再读这篇

---

## 10. 下一步建议

如果后续要把这套内容放进 works 插件，推荐拆成三个入口：

1. 快速上手
2. 项目全景
3. 配置与协作深入版

这样新人不会一上来就被实现细节淹没，维护者也能直接进入深水区。
