# 创建专家模板包

这个模板不是只生成一个“专家介绍页”，而是一次性把专家最小可用包想清楚：

- `role`：这个专家是谁，负责什么，不负责什么，读什么，写什么，交给谁
- `rule`：这个专家必须遵守的边界、约束、禁区、止损条件
- `skill`：这个专家具体怎么做事，步骤是什么，何时触发
- `registry`：如何把它接进 `.agents/registry/*.json` 和 `.agents/roles/INDEX.md`

如果只写 `role`，专家通常会显得很薄；至少要补齐“边界 + 方法 + 接入”三层，专家才有深度。

## 一、先定义专家深度

创建专家前，先回答这 8 个问题：

- 专家解决的核心问题是什么？
- 它的职责边界到哪里结束？
- 它依赖哪些输入才能开始工作？
- 它产出哪些可交接结果？
- 它常用哪些已有 skill，哪些需要新增？
- 它必须遵守哪些已有 rule，哪些需要新增？
- 它在哪些情况下必须停止、回退、或请求人工确认？
- 它在运行时要交接给谁，还是只作为可选专家被调用？

建议把专家深度控制在以下 4 层：

### L1. 身份层

- `id`
- `name`
- `domains`
- `description`
- `triggers`

### L2. 职责层

- 负责什么
- 不负责什么
- 读取什么
- 产出什么
- 交给谁

### L3. 契约层

- `rule_ids`
- `skill_priority`
- `required_inputs`
- `required_outputs`
- `approval_gates`
- `blocked_when`
- `must_follow`

### L4. 运行层

- `openspec_actions`
- `openspec_rule_sections`
- `runtime_transition`
- `micro_skill_allowlist`
- `rule_contract_profiles`

只有到 `L3/L4`，这个专家才不只是“人设”，而是“可编排的职责契约”。

## 二、推荐生成物清单

创建一个新专家时，建议至少补这 5 类文件：

```text
.agents/roles/domains/<domain>/<expert-id>.md
.agents/skills/domains/<domain>/<skill-id>/SKILL.md      # 如确实需要新增技能
.agents/rules/domains/<domain>/<rule-file>.md            # 如确实需要新增规则
.agents/registry/roles.json
.agents/roles/INDEX.md
```

如果这个专家引入了新的方法论或治理边界，再补：

```text
.agents/registry/skills.json
.agents/registry/rules.json
```

## 三、Role 模板

文件建议：

```text
.agents/roles/domains/<domain>/<expert-id>.md
```

内容模板：

```md
---
id: <expert-id>
name: <中文专家名>
status: planned
domains:
  - <domain>
description: 负责<一句话职责>，在<触发场景>下介入，产出<关键产物>，但不负责<边界外事项>。
triggers:
  - <trigger-a>
  - <trigger-b>
preferred_skills:
  - <skill-id-a>
  - <skill-id-b>
reads:
  - context/PROJECT.md
  - .agents/rules/
  - <关键输入或产物>
writes:
  - <输出-a>
  - <输出-b>
handoff_to:
  - <next-role-id>
---

# <中文专家名>

## 角色定位

负责：

- <核心职责 1>
- <核心职责 2>
- <核心职责 3>

不负责：

- <边界外事项 1>
- <边界外事项 2>

## 介入时机

- 当 <场景 A> 出现时介入
- 当 <场景 B> 出现时介入
- 当 <场景 C> 出现时，作为可选专家被主代理调用

## 工作原则

- 先读取 <关键输入> 再开始执行
- 先对齐规则与任务边界，不直接自由发挥
- 先收敛风险，再给出执行动作
- 输出必须可交接、可验证、可追踪

## 必做步骤

1. 识别当前任务是否真的需要本专家介入
2. 读取规则、上下文、OpenSpec 产物和上游交接信息
3. 判断当前问题属于分析、治理、实现、验证还是交付
4. 选择对应技能或给出结构化建议
5. 输出结果、阻断项、残留风险和下一步建议

## 输入契约

至少需要：

- <必需输入 1>
- <必需输入 2>

可选增强输入：

- <可选输入 1>
- <可选输入 2>

## 输出契约

至少输出：

- <标准产物 1>
- <标准产物 2>

输出中必须显式包含：

- 结论
- 依据
- 阻断项
- 非阻断风险
- 建议交接对象

## 技能选择原则

- <任务类型 A> 优先调用 `<skill-id-a>`
- <任务类型 B> 优先调用 `<skill-id-b>`
- 若现有 skill 不足，先暴露缺口，不临时伪造流程

## 停止条件

遇到以下情况必须停止并请求人工确认：

- <高风险条件 1>
- <高风险条件 2>
- <依赖缺失条件 3>

## 禁止事项

- 不在输入不完整时假装已确认
- 不把建议写成已完成结论
- 不绕过规则直接推进高风险动作
- 不擅自扩 scope

## 交接

- 默认交给 `<next-role-id>`
- 若存在阻断项，则退回 `task-orchestrator` 或上游专家
```

## 四、Rule 模板

只有当现有规则无法覆盖该专家的边界时，才新建 rule。

文件建议：

```text
.agents/rules/domains/<domain>/<NN-规则名>.md
```

内容模板：

```md
# <专家相关规则名>

## 适用范围

- 适用于：<专家名>、<相关任务类型>
- 不适用于：<无关场景>

## 强制约束

- <约束 1>
- <约束 2>
- <约束 3>

## 输入要求

- 开始前必须具备 <输入条件>
- 缺失时必须 <回退动作>

## 输出要求

- 输出必须包含 <结构化字段>
- 结论必须可追溯到 <依据来源>

## 阻断条件

- 出现 <风险条件> 时不得继续推进
- 进入 <审批场景> 时必须等待人工确认

## 禁止事项

- 禁止 <错误行为 1>
- 禁止 <错误行为 2>
```

建议一个专家最多新增 `1` 个主 rule，避免把专家做成规则黑洞。

## 五、Skill 模板

只有当现有 skill 无法支撑该专家的执行动作时，才新建 skill。

文件建议：

```text
.agents/skills/domains/<domain>/<skill-id>/SKILL.md
```

内容模板：

```md
---
name: <skill-id>
description: 当用户提到<场景/任务类型/关键词>，或当前任务需要<具体动作>时使用。该技能负责<动作结果>，并要求输出<固定产物>。
---

# <技能名>

## 目标

帮助专家完成：

- <动作 1>
- <动作 2>
- <动作 3>

## 使用前检查

- 是否已有足够输入
- 是否存在现成 skill 可复用
- 是否触发高风险边界

## 执行步骤

1. 读取 `<role>` 交接信息与当前任务上下文
2. 校验输入完整性与规则约束
3. 输出结构化分析 / 实现 / 评审结果
4. 标注阻断项、风险和建议下一步

## 输出格式

至少包含：

- 背景
- 判断
- 依据
- 动作建议
- 风险

## 与 rule 的关系

- 本 skill 负责“怎么做”
- 对应 rule 负责“不能越过什么边界”

## 失败回退

- 输入不足时：返回缺失项清单
- 风险过高时：停止执行并请求人工确认
```

## 六、roles.json 片段模板

如果这个专家要进入注册表，建议至少补到这个深度：

```json
{
  "<expert-id>": {
    "name": "<中文专家名>",
    "status": "planned",
    "profiles": ["vue", "react"],
    "domains": ["<domain>"],
    "source": ".agents/roles/domains/<domain>/<expert-id>.md",
    "rule_ids": ["<rule-id-a>", "<rule-id-b>"],
    "skill_priority": ["<skill-id-a>", "<skill-id-b>"],
    "micro_skill_allowlist": ["<skill-id-a>"],
    "rule_contract_profiles": {
      "default": {
        "must_follow": [
          "<必须遵守 1>",
          "<必须遵守 2>"
        ],
        "blocked_when": [
          "<阻断条件 1>"
        ]
      },
      "vue": {
        "must_follow": [
          "<Vue 落点或实现约束>"
        ]
      }
    },
    "openspec_actions": ["<propose|apply|verify|archive>"],
    "openspec_rule_sections": ["<proposal|specs|design|tasks|checklist|iterations>"],
    "required_inputs": ["<输入产物 1>", "<输入产物 2>"],
    "required_outputs": ["<输出产物 1>"],
    "approval_gates": ["<gate-id>"],
    "runtime_transition": {
      "action": "<handoff|gate-blocked|complete>",
      "to_role": "<next-role-id>",
      "next_role": "<next-role-id-or-null>",
      "status": "<running|waiting-approval|success>",
      "message": "<运行态说明>"
    }
  }
}
```

如果只是候选专家，可以先简版接入；但只要准备进入实际编排，建议把上面的字段补齐。

## 七、skills.json 与 rules.json 片段模板

### `skills.json`

```json
{
  "<skill-id>": {
    "source": ".agents/skills/domains/<domain>/<skill-id>/SKILL.md",
    "domains": ["<domain>"]
  }
}
```

如果分技术栈：

```json
{
  "<skill-id>": {
    "sourceByProfile": {
      "react": ".agents/skills/profiles/react/<skill-id>/SKILL.md",
      "vue": ".agents/skills/profiles/vue/<skill-id>/SKILL.md"
    },
    "domains": ["<domain>"]
  }
}
```

### `rules.json`

```json
{
  "<rule-id>": {
    "source": ".agents/rules/domains/<domain>/<NN-规则名>.md",
    "domains": ["<domain>"]
  }
}
```

## 八、INDEX.md 片段模板

```yaml
- id: <expert-id>
  name: <中文专家名>
  status: planned
  bucket: domains
  visibility: public
  domains: [<domain>]
  source: .agents/roles/domains/<domain>/<expert-id>.md
```

## 九、专家创建检查清单

创建后自查以下问题：

- 是否明确写出“负责什么 / 不负责什么”？
- 是否写出“停止条件 / 人工确认点”？
- 是否区分了 `role`、`rule`、`skill` 的职责？
- 是否尽量复用了已有 `rule_ids` 与 `skill_priority`？
- 是否给出了 `required_inputs / required_outputs`？
- 是否考虑了 `micro` 场景和最小交付？
- 是否补了注册表和展示索引？
- 是否避免为一个专家重复造一堆只给自己用的 skill？

## 十、推荐创建顺序

建议按这个顺序建专家：

1. 先写 `role`，把职责和交接讲清楚
2. 再判断是否真的需要新增 `rule`
3. 再判断是否真的需要新增 `skill`
4. 最后补 `roles.json`、`skills.json`、`rules.json`、`INDEX.md`

## 十一、一个更像“专家”的最小标准

如果一个专家只有：

- 名称
- 描述
- 几个 skill 名字

那它更像“标签页”，还不够像专家。

一个够用的专家，至少应该有：

- 明确职责边界
- 明确输入输出
- 明确规则约束
- 明确技能路径
- 明确阻断条件
- 明确交接和运行态

这样后面无论是插件展示、主代理编排，还是团队扩展，都不会塌成一层薄配置。
