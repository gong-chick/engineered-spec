# Superpowers 与 OpenSpec 运用指南

## 概述

本项目同时使用 **OpenSpec** 和 **Superpowers** 两套机制,它们各司其职,协同工作:

- **OpenSpec**: 负责**需求治理**(从需求到任务的完整流程)
- **Superpowers**: 负责**代码实现**(任务执行的质量控制)

简单说:
> OpenSpec 管"做什么",Superpowers 管"怎么做"

---

## 一、OpenSpec 运用

### 1.1 什么是 OpenSpec?

OpenSpec 是一个**需求驱动开发协议**,它将需求交付流程标准化:

```
用户需求 → 提案(proposal) → 需求规格(spec) → 任务(tasks) → 实现 → 验收
```

### 1.2 核心目录结构

```
openspec/
├── config.yaml                    # 项目配置(安装时生成)
└── schemas/expert-delivery/       # 专家交付模式
    ├── schema.yaml                # 模式定义
    └── templates/                 # 交付物模板
        ├── proposal.md            # 需求提案
        ├── spec.md                # 需求规格
        ├── tasks.md               # 任务清单
        ├── design.md              # 技术方案
        ├── checklist.md           # 验收清单
        └── iterations.md          # 迭代记录

.ai-spec/                          # 运行态数据(安装后生成)
├── manifest.json                  # 安装清单
├── lock.json                      # 版本锁定
├── runtime-state.json             # 当前运行状态
└── changes/                       # 需求变更目录
    └── [change-id]/
        ├── proposal.md
        ├── spec.md
        ├── tasks.md
        └── ...
```

### 1.3 工作流程

#### **阶段 1: 需求启动** (`/spec-start`)

```text
用户: /spec-start 创建一个订单列表页面,支持分页、筛选、状态切换

AI 执行:
  protocol-step --user-input "创建订单列表页面..." --mode auto
```

**产出**:
1. `task-orchestrator` 分析需求,确定流程
2. `requirement-analyst` 产出:
   - `proposal.md` - 需求提案(目标、范围、假设)
   - `spec.md` - 需求规格(可测试的场景)
   - `tasks.md` - 任务清单(可执行的步骤)

**示例输出**:
```markdown
# proposal.md
## 业务目标
实现订单列表页面,支持运营人员查看和管理订单

## 工程目标
- 创建 OrderList 组件
- 接入订单列表 API
- 实现分页、筛选、状态切换功能

## 组件复用
- 复用 AppTable 全局组件
- 复用 AppPagination 分页组件
- 复用 order-api 接口封装
```

#### **阶段 2: 需求更新** (`/spec-update`)

```text
用户: /spec-update 把筛选区改成状态 Tab,先不要高级筛选

AI 执行:
  protocol-update --user-input "筛选区改成状态 Tab..."
```

**作用**: 增量修改需求,不走完整流程

#### **阶段 3: 任务执行** (`/opsx:apply` 或 `execute-task`)

当 `tasks.md` 生成后,进入实现阶段,触发 **Superpowers**。

---

## 二、Superpowers 运用

### 2.1 什么是 Superpowers?

Superpowers 是一个**代码执行质量控制机制**,确保每条任务的实现都经过:
1. 思考(头脑风暴)
2. 测试驱动(TDD)
3. 审查(双重审查)
4. 审计(结构化汇报)

### 2.2 核心文件

```
.agents/rules/common/
├── 12-Superpowers执行规范.md      # 强制执行规范
└── 14-审计汇报规范.md             # 审计报告格式

.agents/skills/common/execute-task/
└── SKILL.md                       # 四步循环技能定义
```

### 2.3 四道关卡(Superpowers Loop)

#### **关卡 1: 头脑风暴**

```markdown
### 第一步:头脑风暴

**任务**: 创建 OrderList 组件

**思路**: 
在 src/views/order/OrderList.vue 创建组件,使用 AppTable 封装,
接入 orderApi.getOrderList 接口,实现分页和筛选。

**边界**:
- 需处理接口异常,显示错误提示
- 需处理空数据状态
- 需处理 loading 状态防重复请求
- 分页参数需与后端对齐(page/pageSize)

→ 我的思路是否正确?是否可以开始编写测试和代码?
```

**关键**: 必须获得用户确认后才能进入下一步!

#### **关卡 2: TDD 编码**

```markdown
### 第二步:TDD 编码

**RED** - 编写失败的测试:
- 测试 OrderList 组件渲染
- 测试分页参数传递
- 测试筛选功能

**GREEN** - 实现最小代码使测试通过:
- 创建 OrderList.vue
- 引入 AppTable 组件
- 实现 data/tableData 状态
- 实现 methods/fetchData 方法

**REFACTOR** - 重构优化:
- 提取分页逻辑到 composables/usePagination
- 按 .agents/rules/ 规范调整代码风格
- 优化组件结构
```

#### **关卡 3: 双重审查**

```markdown
### 第三步:双重审查

| 维度 | 检查项 | 结论 |
|------|--------|------|
| 架构对齐 | 是否对齐 proposal.md 设计 | ✅ 符合 |
| 架构对齐 | 是否复用指定组件 | ✅ 已复用 AppTable |
| 健壮性 | 异常处理是否完整 | ✅ 已处理 |
| 健壮性 | 边界条件是否覆盖 | ✅ 空数据/loading/错误 |
| 规范合规 | 命名是否符合规范 | ✅ 符合 |
| 规范合规 | 类型是否严谨 | ✅ TypeScript 完整 |
```

#### **关卡 4: 审计汇报**

```markdown
### 第四步:状态更新

**任务完成**: - [x] 创建 OrderList 组件

**读取记录**:
- ✅ src/components/AppTable/index.vue
- ✅ src/api/order.ts
- ✅ .agents/rules/common/05-组件规范.md

**操作记录**:
- ✅ 创建 src/views/order/OrderList.vue
- ✅ 修改 src/router/modules/order.ts 添加路由
- ✅ 创建 src/composables/usePagination.ts

**规范对齐**:
- ✅ 组件命名: OrderList (PascalCase)
- ✅ 目录结构: views/order/ (按模块)
- ✅ API 封装: 使用 request 统一处理
- ✅ 类型定义: 使用 TypeScript interface

**偏差说明**:
无偏差

**审计报告**:
- 改动文件: 3 个新增, 1 个修改
- 测试覆盖: 单元测试通过
- 规范检查: 无违反
```

---

## 三、协同工作流程

### 3.1 完整流程示例

```
用户: /spec-start 创建订单列表页面
  ↓
[OpenSpec 流程]
  ↓
protocol-step 执行
  ↓
requirement-analyst 产出:
  - proposal.md (需求提案)
  - spec.md (需求规格)
  - tasks.md (任务清单)
  ↓
tasks.md 包含:
  - [ ] 创建 OrderList 组件
  - [ ] 接入订单列表 API
  - [ ] 实现分页功能
  - [ ] 实现筛选功能
  - [ ] 实现状态切换
  ↓
[Superpowers 流程启动]
  ↓
execute-task 技能自动处理第一条任务:
  ↓
### 第一步:头脑风暴 (关卡 1)
  ↓ 用户确认
### 第二步:TDD 编码 (关卡 2)
  ↓
### 第三步:双重审查 (关卡 3)
  ↓
### 第四步:状态更新 (关卡 4)
  ↓
tasks.md 更新: - [x] 创建 OrderList 组件
  ↓
继续下一条任务...
  ↓
所有任务完成
  ↓
code-guardian 产出:
  - checklist.md (验收清单)
  - iterations.md (迭代记录)
  ↓
用户: /spec-status 查看状态
  ↓
显示: 交付完成 ✅
```

### 3.2 关键角色

OpenSpec 定义了多个专家角色:

| 角色 | 职责 | 产出 |
|------|------|------|
| `task-orchestrator` | 任务编排 | 流程控制 |
| `requirement-analyst` | 需求分析 | proposal/spec/tasks |
| `frontend-implementer` | 前端实现 | 业务代码 |
| `code-guardian` | 代码守门 | checklist/iterations |

**重要规则**:
- ❌ `requirement-analyst` 不能写业务代码
- ❌ `frontend-implementer` 不能写 proposal
- ✅ 只有 `frontend-implementer` 能修改 Vue/TS/CSS
- ✅ 每个角色只能读写自己负责的文件

### 3.3 门禁机制

```
需求提案 → 人工审核门禁 → 任务执行 → 代码审查 → 归档
                ↑
         可选: main-flow-blocking
```

默认使用 `none`(无阻塞审核),用户可以要求:
```
/spec-start --review-policy main-flow-blocking
```

这样在 proposal 产出后会暂停,等待用户审核。

---

## 四、实际运用场景

### 场景 1: 新功能开发

```text
1. /spec-start 创建用户管理模块
2. AI 产出 proposal/spec/tasks
3. Superpowers 逐条执行 tasks
4. /spec-status 查看进度
5. 完成后归档
```

### 场景 2: 需求变更

```text
1. /spec-update 增加用户角色权限
2. AI 增量更新 spec/tasks
3. 新增的 task 走 Superpowers 流程
4. 已完成的 task 不受影响
```

### 场景 3: Bug 修复

```text
1. /spec-start 修复订单金额显示错误
2. proposal 标记为 bugfix
3. tasks 只有 1-2 条
4. Superpowers 快速执行
5. 可以跳过审核门禁(低风险)
```

### 场景 4: 小优化(不走 OpenSpec)

```text
如果只是修改注释、拼写错误:
- 不需要 /spec-start
- 不需要 Superpowers
- 直接修改即可

触发条件见 12-Superpowers执行规范.md "何时可以跳过"
```

---

## 五、配置文件详解

### 5.1 openspec/config.yaml

```yaml
schema: expert-delivery           # 使用专家交付模式

context: |
  本项目接入 ai-spec-auto 专家协同平台:
  - rules: .agents/rules/         # 团队规范
  - skills: .agents/skills/       # 执行技能
  - roles: .agents/roles/         # 专家角色
  - flows: .agents/flows/         # 流程定义
  - runtime: .ai-spec/            # 运行态数据

rules:
  proposal:
    - "先收敛目标、范围、非目标项"
    - "优先复用现有组件和接口"
  specs:
    - "需求必须落为可测试的增量规范"
    - "涉及 UI 时覆盖关键交互"
  tasks:
    - "任务必须可执行、可验证"
    - "每个子任务写明目标和验收"
  design:
    - "技术方案对齐项目既有结构"
    - "优先复用,不引入无关重构"
```

### 5.2 12-Superpowers执行规范.md

核心约束:
1. **禁止直出代码** - 必须经过四道关卡
2. **逐条执行** - 按 tasks.md 顺序,不跳过
3. **用户确认门禁** - 头脑风暴后必须确认
4. **审计可追溯** - 输出结构化审计报告
5. **输出可见性** - 每步必须有标题和输出

何时可以跳过:
- 修复拼写、注释、格式
- 恢复已有 spec 描述的行为(Bug fix)
- 非破坏性依赖版本更新

---

## 六、与其他技能的关系

### 6.1 依赖关系

```
branch-code-reviewer (分支评审)
  ↓ (可选)
execute-task (Superpowers)
  ↓ (依赖)
12-Superpowers执行规范
14-审计汇报规范
```

### 6.2 协作示例

```text
场景: 评审后发现风险,需要修复

1. /branch-review                    # 分支评审
   ↓ 发现 3 个严重风险

2. 基于评审结果创建 tasks.md:
   - [ ] 修复 XSS 漏洞
   - [ ] 添加库存校验
   - [ ] 优化性能

3. execute-task 逐条执行            # Superpowers
   ↓ 每条走四道关卡

4. 修复完成后
   ↓

5. /branch-review                    # 重新评审
   ↓ 验证风险已修复
```

---

## 七、常见问题

### Q1: 什么时候用 OpenSpec,什么时候直接写代码?

**使用 OpenSpec**:
- ✅ 新功能开发
- ✅ 需求变更
- ✅ 复杂功能(需要设计、拆分任务)
- ✅ 多人协作(需要明确职责)

**直接写代码**:
- ✅ Bug fix(已有 spec 描述)
- ✅ 小优化(改注释、拼写)
- ✅ 依赖更新(非破坏性)

### Q2: Superpowers 会不会太慢?

**不会**,因为:
- 小任务可以快速通过(头脑风暴几句话)
- 可以批量执行(用户确认后连续执行)
- 简单任务可以跳过(符合条件时)

**但好处很大**:
- 避免返工(先思考再写)
- 提高质量(TDD + 审查)
- 可追溯(审计报告)

### Q3: 能否跳过某个关卡?

**不可以**(除非符合跳过条件)。

四道关卡是**强制约束**(NON-NEGOTIABLE):
- ❌ 不能跳过头脑风暴
- ❌ 不能跳过 TDD
- ❌ 不能跳过审查
- ❌ 不能跳过审计

这是为了确保代码质量!

### Q4: OpenSpec 的 proposal/spec/tasks 有什么区别?

| 文件 | 内容 | 读者 |
|------|------|------|
| `proposal.md` | 为什么做、做什么、不做什么 | 产品/设计/开发 |
| `spec.md` | 可测试的场景和验收标准 | 测试/开发 |
| `tasks.md` | 具体执行步骤(可操作) | 开发/AI |

### Q5: 如何查看当前状态?

```text
/spec-status

AI 输出:
- 当前阶段: prd-to-delivery
- 当前角色: frontend-implementer
- 当前任务: 3/5 完成
- 门禁状态: 已通过
- 下一步: 继续执行 tasks.md 第 4 条
```

---

## 八、总结

### 核心要点

1. **OpenSpec 管需求**
   - 从需求到任务的标准化流程
   - 多专家角色协作
   - 完整的交付产物

2. **Superpowers 管实现**
   - 四道关卡确保质量
   - TDD 驱动开发
   - 结构化审计汇报

3. **协同工作**
   - OpenSpec 产出 tasks.md
   - Superpowers 执行 tasks.md
   - 形成完整闭环

4. **灵活可控**
   - 高风险走完整流程
   - 低风险可以跳过
   - 用户可以随时干预

### 一句话总结

> **OpenSpec 让"做什么"清晰,Superpowers 让"怎么做"可靠。**

---

## 九、相关文档

- [OpenSpec 官方文档](https://github.com/Fission-AI/OpenSpec)
- [12-Superpowers执行规范](.agents/rules/common/12-Superpowers执行规范.md)
- [14-审计汇报规范](.agents/rules/common/14-审计汇报规范.md)
- [execute-task 技能](.agents/skills/common/execute-task/SKILL.md)
- [spec-start 命令](.agents/commands/common/spec-start.md)
- [branch-code-reviewer 技能](.agents/skills/common/branch-code-reviewer/SKILL.md)
