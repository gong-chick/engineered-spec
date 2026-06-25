# 真实项目开发中的“增量打断 + 混合门禁 + 归档阶段修正”增强方案

## Summary
在现有 `protocol-step / protocol-advance / protocol-update`、`pending_gate`、`approve/resume`、`input_updates` 基础上，增强三件事：

1. **运行中需求变更的增量处理**
2. **专家之间的混合门禁**
3. **归档阶段发现问题时的轻量回退 / 补丁修正**

默认策略按本轮确认的偏好落地：
- 需求变更：**增量回退**
- 专家门禁：**混合门禁**
- 交互方式：**自然语言 + 命令**
- 归档前修正：**不归档，回退到修正**
- 已归档后修正：**开 follow-up patch change**
- 主代理策略：**轻量主代理**

目标是让真实项目里：
- 用户可以自然语言打断
- 不用推倒重来
- 不把归档记录改脏
- 也不把每个专家交接都做成重审批

## Key Changes

### 1. 为补充输入增加“变更影响判断”
在 `protocol-update` 的 `update-review` 阶段，主代理先判断这条新输入属于哪类：

- `patch`
  - 小修正、小补充、小范围交互/文案/样式/字段调整
  - 不回退整条链，只由当前专家或下一专家吸收
- `scope-delta`
  - 仍在同一 `change_id` 内，但影响任务、设计、接口、验收范围
  - 回退到需求专家做增量修订
- `re-scope`
  - 已超出当前 change 的边界
  - 不吞进当前 run，提示建议新建 change
- `archive-fix`
  - 当前停在 `before-archive`，用户明确表示“实现不对/不是想要的/先别归档，改成…”
  - 不进入归档，直接回退到修正链
- `followup-patch`
  - 当前 change 已归档完成，用户要对已归档结果做修正
  - 新开补丁 change，引用原归档 change

新增最小运行语义字段：
- `change_impact`
- `reconcile_strategy`
- `artifacts_to_update`
- `reopen_reason`
- `parent_change_id`（仅 follow-up patch）

### 2. 同一 change 内的增量修订规则
对于 `patch / scope-delta / archive-fix`，默认都在**同一 `change_id` 内**修，不推倒已有文件。

产物更新策略固定为：
- `proposal.md`
  - 只追加“本轮修订 / 范围调整 / 新假设”
- `tasks.md`
  - 只增删改受影响任务
- `design.md / specs/`
  - 只更新受影响章节
- `checklist.md / iterations.md`
  - 保留已有内容，追加本轮修正记录

明确禁止：
- 因为一条补充输入就重写整份 proposal/tasks/design/specs
- 清空已有 checklist/iterations 历史
- 改动未受影响的任务项和规范章节

### 3. 归档前发现问题时的默认回退路径
如果当前 run 停在 `before-archive`，用户说：
- “这个地方不对”
- “不是我想要的”
- “先别归档，改成……”
- “这个实现还得调一下”

默认识别为 `archive-fix`，处理规则如下：

- 不走归档 fast-path
- 清除 `before-archive` 的待归档决策
- 主代理只做最小判断，决定回退到哪位专家：
  - 实现/UI/交互/接口接入问题 -> `frontend-implementer`
  - 主要是检查结论、验收口径、风险补记 -> `code-guardian`
  - 影响需求边界、任务范围、设计方案 -> `requirement-analyst`
- 修正完成后，重新进入 `code-guardian`
- 再次回到 `before-archive`

默认不重新跑整条链，只回退到必要的那一跳。

### 4. 已归档后发现问题时的补丁变更策略
如果当前 change 已经归档完成，再发现实现不对，默认不修改 archive 内的旧 change，而是新开一个**补丁变更**。

默认行为：
- 新建一个 follow-up patch run
- `parent_change_id = <原 change-id>`
- 从已归档 change 读取：
  - `proposal`
  - `design`
  - `specs`
  - `checklist`
  - `iterations`
- 只围绕“修正内容”生成补丁产物

默认链路：
- `task-orchestrator`
- 如果只是实现修正且边界清晰：
  - 直接 `frontend-implementer -> code-guardian -> before-archive`
- 如果补丁会改边界/API/验收口径：
  - 插入 `requirement-analyst`

这保证：
- 原归档可追溯
- 修正有单独记录
- 不需要重跑完整大流程

### 5. 专家之间改成“混合门禁”，不是每跳重审批
把专家交接分成三层：

- `silent handoff`
  - 默认交接
  - 只播报阶段变化，不等确认
- `confirm gate`
  - 轻确认
  - 只问一句是否按当前方案继续
  - 用于方案分歧、验收口径变化、补充输入影响实现方向
- `approval gate`
  - 重审批
  - 继续用于：
    - `before-implementation`
    - `before-archive`
    - 高风险/越界场景

默认 gate policy：
- `requirement-analyst -> frontend-implementer`
  - 正常情况 `silent`
  - 方案变化或 scope-delta 时 `confirm`
- `frontend-implementer -> code-guardian`
  - 默认 `silent`
- `code-guardian -> archive-change`
  - 维持 `approval`

必要时允许按 flow/role pair 配置，但默认不做“每跳都审批”。

### 6. 自然语言优先的用户交互规则
用户不用背太多命令，默认用自然语言表达：

- 运行中补需求
  - “这个筛选改成状态 Tab”
  - “先不要真实接口，改成 mock”
- 归档前修正
  - “先别归档，这个交互不对，改成……”
- 审批/放行
  - “同意继续实现”
  - “同意归档”
  - “先不归档”
- 已归档后修正
  - “上个订单列表变更还要补个修正，开个补丁”

系统规则：
- 这类输入优先走 `protocol-update`
- `/spec-continue` 只作为“继续推进”的稳定兜底命令
- 不要求用户显式区分“补充需求 / 审批 / 归档决定 / 修正归档结果”

### 7. 轻量主代理规则
不允许完全绕过主代理，但允许主代理变成最小判断器。

主代理在这类场景里只做：
- 识别 `change_impact`
- 决定 `reconcile_strategy`
- 决定回退到哪位专家
- 记录运行态与增量修订范围
- 在已归档场景下决定是否开 follow-up patch

主代理明确不做：
- 每次补充输入都重跑完整规划
- 重新生成整套产物
- 把小修正升级成全量重排

### 8. 增加一份持续维护的增强记录文档
新增一份内部记录文档，作为后续增强和新增专家的决策底稿。

建议文档：
- `docs/paser_three/协议与专家增强记录.md`

本次至少记录：
- 增量补充需求的处理策略
- 归档前修正与归档后补丁策略
- 混合门禁策略
- 轻量主代理原则
- 哪些场景必须回需求专家，哪些可以直回实现/守护

这份文档作为后续“增强专家 / 增加专家类型”的基线说明。

## Public Interface Changes
对外接口保持现有命令不变，只增强语义：

- `protocol-update`
  - 从“记录用户补充输入”升级为“记录 + 影响判断 + 增量回退决策”
- 新增运行语义字段
  - `change_impact`
  - `reconcile_strategy`
  - `artifacts_to_update`
  - `reopen_reason`
  - `parent_change_id`
- 可选新增轻门禁状态
  - `waiting-confirm`
- flow 层可扩展
  - `handoff_gates` 或 `handoff_gate_policy`
- 用户入口不变
  - 继续支持自然语言
  - 继续支持 `/spec-continue`

## Test Plan
1. **运行中小修正**
- 实现阶段补一句“筛选改成状态 Tab”
- 判定为 `patch`
- 不回退整条链
- 仅增量修改受影响产物

2. **运行中范围增量变化**
- 补一句“加详情联动，但还在同一页面范围”
- 判定为 `scope-delta`
- 回退到需求专家做 delta 修订
- 不整份重写 proposal/tasks/design/specs

3. **归档前修正**
- 当前停在 `before-archive`
- 用户说“先别归档，这个实现不对，改成……”
- 判定为 `archive-fix`
- 清除归档待决
- 回到正确专家修正
- 修完再回 `before-archive`

4. **归档前仅决定不归档**
- 用户说“先不归档”
- 继续保留现有 fast-path
- 直接结束 run，不回退专家

5. **已归档后补丁修正**
- 原 change 已归档
- 用户说“上个订单列表变更要修一个交互问题”
- 新建 follow-up patch change
- 引用原归档 change
- 默认走轻量链，不重跑完整流程

6. **轻确认门禁**
- 需求或设计分歧时进入 `waiting-confirm`
- 用户一句确认即可继续
- 不升级成重审批

7. **高风险门禁不回退**
- `before-implementation`、`before-archive` 继续有效
- 不因本轮增强削弱现有高风险拦截

8. **文档记录**
- 增强记录文档同步更新
- 能复盘为什么采用“增量回退 + 混合门禁 + 归档后补丁”

## Assumptions
- 当前 `before-implementation / before-archive` 两个重门禁继续保留。
- 归档前发现问题，默认在**同一 change** 内修正；已归档后发现问题，默认开**新 patch change**。
- 主代理保留，但收成“轻量主代理”，不再对小修正做全量重排。
- 用户默认通过自然语言补充需求、表达审批、决定归档与修正方向；命令仅作为稳定兜底。
