# ai-spec-auto

[![npm version](https://img.shields.io/npm/v/@engineered/ai-spec-auto.svg)](https://www.npmjs.com/package/@engineered/ai-spec-auto)
[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![GitHub](https://img.shields.io/github/stars/Colouful/engineered-spec?style=social)](https://github.com/Colouful/engineered-spec)

> **它不是单个 AI 工具的替代品,而是一套把需求、实现、检查、归档串成团队开发链路的项目级交付底座。**

`ai-spec-auto` 是一套面向前端项目的 **AI 规范驱动开发底座**。它把项目规则、专家资产、IDE 命令入口、OpenSpec 交付产物和 `.ai-spec` 运行状态放进同一个项目里,让 AI 开发不再只停留在对话里,而是能够按统一约束执行、留痕、归档和复用。

## ✨ 核心特性

### 🎯 解决的问题

团队引入 AI 后最常见的痛点:

- ❌ 需求没收敛,AI 就开始改代码,返工成本高
- ❌ 规范散落在文档和口头经验里,难以稳定复用
- ❌ 过程只在聊天记录,缺少可追溯的交付产物
- ❌ 新功能和简单修复混用同一流程,效率和治理难平衡

### ✅ 提供的能力

| 能力 | 说明 |
|------|------|
| **需求治理** | OpenSpec 协议,从需求到任务的标准化流程 |
| **规范驱动** | 项目规则、编码规范、目录约定自动加载 |
| **质量控制** | Superpowers 四道关卡(头脑风暴→TDD→审查→审计) |
| **分支评审** | 技术风险+业务风险双维度分析,可视化 HTML 报告 |
| **多 IDE 支持** | Qoder、Cursor、Claude Code、OpenCode、Trae、Codex |
| **渐进式接入** | L1/L2/L3 三层策略,老项目零侵入接入 |

## 🚀 快速开始

### 1. 安装

```bash
# 推荐:单次指定公共 registry
npx --yes --registry https://registry.npmjs.org/ @engineered/ai-spec-auto@latest init . --profile vue -y

# 或已配置 ~/.npmrc 后
npx @engineered/ai-spec-auto@latest init .
```

**支持的 Profile**:
- `vue` - Vue 3 + TypeScript + Vite
- `react` - React + TypeScript + Vite
- `nestjs` - NestJS 后端框架
- `springboot` - Spring Boot 后端框架
- `node-tooling` - Node.js CLI/工具库

### 2. 项目初始化(老项目必做)

```text
在 IDE 中输入: 初始化项目规范

AI 会自动:
✅ 扫描项目技术栈
✅ 生成 01-项目概述.md
✅ 生成 03-项目结构.md
✅ 生成 context/PROJECT.md
✅ 归纳既有约定和能力规则
```

> 💡 **老项目接入必须先运行 project-init**,让 AI 了解项目现状再开始开发!

### 3. 开始需求开发

```text
/spec-start 创建订单列表页面,支持分页、筛选、状态切换

AI 自动执行:
1. 需求分析 → proposal.md / spec.md / tasks.md
2. 逐条执行任务 → Superpowers 四道关卡
3. 代码审查 → checklist.md
4. 归档交付 → .ai-spec/changes/
```

### 4. 分支代码评审(合并前必做)

```text
/branch-review                           # 仅技术风险
/branch-review docs/prd-order-module.md  # 技术+业务风险

生成可视化 HTML 报告:
✅ 代码差异对比(并排/统一模式)
✅ 技术风险识别(性能/安全/错误处理)
✅ 业务风险分析(功能缺失/流程错误/需求覆盖度)
✅ 交互式报告(搜索/过滤/评论/导出)
```

## 📦 安装后会得到什么

```
your-project/
├── .agents/                    # 规范源
│   ├── rules/                  # 项目规则(01-项目概述/03-项目结构/能力规则)
│   ├── skills/                 # 执行技能(execute-task/branch-code-reviewer等)
│   ├── commands/               # 命令模板源文件
│   └── registry/               # Profile 注册表
├── .ai-spec/                   # 运行态数据
│   ├── manifest.json           # 安装清单
│   └── changes/                # 需求交付产物
├── .qoder/                     # Qoder IDE 适配
├── .cursor/                    # Cursor IDE 适配
├── .claude/                    # Claude Code IDE 适配
├── openspec/                   # OpenSpec 流程模板
└── [你的业务代码]              # 完全不受影响!
```

## 🎮 核心命令

### IDE 命令(在 Qoder/Cursor/Claude 中使用)

| 命令 | 用途 | 阶段 |
|------|------|------|
| `/project-init` | 初始化项目规范 | 接入时 |
| `/spec-start` | 启动需求交付 | 新需求 |
| `/spec-update` | 增量更新需求 | 需求变更 |
| `/spec-continue` | 继续当前 run | 恢复开发 |
| `/spec-status` | 查看当前状态 | 任意时 |
| `/spec-stop` | 暂停当前 run | 暂停 |
| `/branch-review` | 分支代码评审 | 合并前 |

### CLI 命令

```bash
# 安装
npx @engineered/ai-spec-auto@latest init .

# 更新
npx @engineered/ai-spec-auto@latest update .

# 检查
npx @engineered/ai-spec-auto@latest check .

# 卸载
npx @engineered/ai-spec-auto@latest uninstall .
```

## 🏗️ 工作流程

### 完整交付流程

```
用户需求
  ↓
/spec-start 触发 OpenSpec 流程
  ↓
[OpenSpec 需求治理]
  ├─ task-orchestrator  分析需求,确定流程
  ├─ requirement-analyst 产出 proposal/spec/tasks
  └─ 生成 .ai-spec/changes/[id]/tasks.md
  ↓
[Superpowers 代码实现]
  ├─ 逐条执行 tasks.md
  ├─ 每条任务走四道关卡:
  │   1. 头脑风暴 (思考边界和风险)
  │   2. TDD 编码 (RED→GREEN→REFACTOR)
  │   3. 双重审查 (设计对齐+质量门禁)
  │   4. 审计汇报 (结构化输出)
  └─ 更新 tasks.md 状态
  ↓
code-guardian 验收
  ├─ checklist.md (验收清单)
  └─ iterations.md (迭代记录)
  ↓
/spec-status → 交付完成 ✅
```

### 小需求轻量流程

| 场景 | 推荐入口 | 流程 |
|------|---------|------|
| 新功能/跨模块改动 | `/spec-start` | prd-to-delivery (完整) |
| 当前 run 内小修正 | `/spec-update` | patch / scope-delta |
| 归档前发现不对 | 自然语言 | archive-fix |
| 已归档内容补丁 | 自然语言 | followup-patch |
| 低风险单点修复 | 自然语言 | bugfix-to-verification |

**判断原则**:
- 涉及 API/路由/全局状态/权限/支付 → 升级回完整流程
- 要求留痕/归档/评审 → 走完整 OpenSpec

## 📚 使用场景

### 场景 1: 老项目接入

```bash
# 1. 安装
npx @engineered/ai-spec-auto@latest init .

# 2. 初始化(自动梳理项目)
用户: 初始化项目规范

# 3. 验证生成内容
cat .agents/rules/01-项目概述.md
cat .agents/rules/03-项目结构.md

# 4. 开始开发
/spec-start 新功能...
```

### 场景 2: 新功能开发

```text
/spec-start 创建用户管理模块

AI 产出:
✅ proposal.md - 业务目标、工程目标、复用策略
✅ spec.md - 可测试的场景和验收标准
✅ tasks.md - 可执行的任务清单

逐条执行任务:
✅ Superpowers 四道关卡保证质量
✅ 审计报告可追溯
```

### 场景 3: 合并前评审

```text
/branch-review docs/prd-user-module.md

生成 HTML 报告:
✅ 技术风险: 12个 (🔴2 🟡5 🔵4 ⚪1)
✅ 业务风险: 5个 (🔴2 🟡3)
✅ 需求覆盖度: 85%
✅ 整体通过率: 78%

修复风险后重新评审验证
```

## 🔧 高级用法

### Monorepo 支持

```bash
# 安装到子包
npx @engineered/ai-spec-auto@latest init . --package packages/web

# 在仓库根安装
npx @engineered/ai-spec-auto@latest init . --workspace-root
```

### 自定义规则

```bash
# 启用可定制规则全集
npx @engineered/ai-spec-auto@latest init . --custom-rules

# 使用标准规则集
npx @engineered/ai-spec-auto@latest init . --standard-rules
```

### 多技术栈项目

```bash
# 一次安装多个技术栈
npx @engineered/ai-spec-auto@latest init . --profiles vue,nestjs
```

### 选择性更新

```bash
# 只更新规则与命令
npx @engineered/ai-spec-auto@latest update . --skip-skills --skip-configs --skip-openspec

# 强制覆盖本地规则
npx @engineered/ai-spec-auto@latest update . --force-update-rules
```

## 🌐 支持的 IDE

| IDE | 规则链接 | 技能链接 | 命令模板 | MCP 配置 |
|-----|---------|---------|---------|---------|
| **Qoder** | ✅ | ✅ | ✅ | ✅ |
| **Cursor** | ✅ | ✅ | ✅ | ✅ |
| **Claude Code** | ✅ | ✅ | ✅ | ❌ |
| **OpenCode** | ✅ | ✅ | ✅ | ❌ |
| **Trae** | ✅ | ✅ | ✅ | ❌ |
| **Codex** | ✅ | ✅ | ✅ | ❌ |

> 💡 **命令模板统一管理**: 所有 IDE 的命令模板都存放在 `.agents/commands/common/`,安装时自动映射到各 IDE 的 `commands/` 目录。

## 📖 详细文档

### 快速入门

- [5 分钟快速上手](docs/quick-start.md)
- [安装指南](docs/install-guide.md)
- [老项目接入指南](docs/legacy-project-onboarding-guide.md) 🆕
- [分支代码评审使用指南](docs/branch-code-reviewer-guide.md) 🆕

### 核心机制

- [Superpowers 与 OpenSpec 协同机制](docs/superpowers-and-openspec-guide.md) 🆕
- [IDE 命令模板映射机制](docs/ide-command-mapping-guide.md) 🆕
- [OpenSpec / 协议流说明](docs/openspec-guide.md)
- [小需求与补丁修正指南](docs/four/小需求与补丁修正指南.md)

### 架构与治理

- [第四阶段文档入口](docs/four/README.md)
- [架构设计与治理说明](docs/four/架构设计与治理说明.md)
- [项目介绍与运行机制说明](docs/four/项目介绍与运行机制说明.md)
- [开发最佳实践指南](docs/four/开发最佳实践指南.md)

### 其他

- [文档索引](docs/README.md)
- [培训大纲](docs/training-outline.md)
- [需求示例:从发起到归档](docs/four/需求示例-从发起到归档.md)

## ⚙️ 配置说明

### npm Registry 配置

如果本机默认使用内网 npm registry,需要配置 `@engineered` 作用域走公共 npm:

```ini
# ~/.npmrc
@engineered:registry=https://registry.npmjs.org/
```

### 匿名使用统计(可选)

默认关闭上报。如需开启:

```json
// ~/.ai-spec-auto/config.json
{
  "visualUrl": "http://your-visual-server:3000",
  "disabled": false
}
```

关闭统计:

```bash
export AI_SPEC_TELEMETRY_DISABLED=1
```

详见下方[匿名使用统计](#-匿名使用统计)章节。

## 🔮 后续规划

### 短期
- 继续跑稳 `prd-to-delivery` 主链和 `bugfix-to-verification` 轻量链
- 降低 `init / sync / manifest` 的接入摩擦
- 让普通开发者先用起来,不被底层协议细节拦在门外

### 中期
- Hub 负责资产管理与场景组合
- Manifest 成为能力组合的稳定描述
- 补齐 `git worktree` 支持,支撑多需求并行开发
- CLI 和 IDE 入口承担更轻量的状态提示与切换

### 中长期
- 补齐 OpenClaw 对接,形成远程入口与团队协同控制面
- CI/CD 校验纳入统一治理链
- 从本地开发到持续交付的一体化约束

## 🤝 贡献指南

欢迎提交 Issue 和 Pull Request!

- 报告问题: https://github.com/Colouful/engineered-spec/issues
- 提交 PR: https://github.com/Colouful/engineered-spec/pulls

## 📄 许可证

[MIT License](LICENSE)

---

## 📊 匿名使用统计

<details>
<summary>点击展开详细说明</summary>

`bin/telemetry/` 是一个**隔离的切面模块**,用于向私有部署的 [`engineered-spec-visual`](https://github.com/Colouful/engineered-spec-visual) 上报 CLI 安装与使用情况。

### 默认行为

仓库内置默认配置**关闭上报**(`disabled: true`)。需要统计时自行配置 Visual 地址并设置 `disabled: false`。

### 关闭统计

```bash
# 临时(当前会话)
export AI_SPEC_TELEMETRY_DISABLED=1

# 永久(写入配置)
mkdir -p ~/.ai-spec-auto
echo '{"disabled": true}' > ~/.ai-spec-auto/config.json
```

### 配置字段

| 字段 | 环境变量 | 配置 Key | 说明 |
|------|---------|----------|------|
| Visual 地址 | `AI_SPEC_VISUAL_URL` | `visualUrl` | 空值则不发送 |
| 总开关 | `AI_SPEC_TELEMETRY_DISABLED=1` | `disabled: true` | 任一源为真即关闭 |
| 鉴权密钥 | `AI_SPEC_TELEMETRY_SECRET` | `secret` | 与服务端一致 |
| 调试输出 | `AI_SPEC_TELEMETRY_DEBUG=1` | — | 排查问题时用 |

### 隐私保证

- **唯一标识**: 来自 `node-machine-id`,缺失时用 SHA256 兜底
- **项目路径**: 以 SHA256 哈希形式上报,不包含源码/绝对路径
- **健康探测**: 上报前 HEAD 请求(500ms 超时),失败自动跳过
- **删除即失效**: 模块移除不影响 CLI 正常工作

</details>

## 📝 兼容说明

以下能力继续保留:

- ✅ `install.sh` / `install.ps1` 脚本入口
- ✅ `--level L1/L2/L3` 渐进式接入参数
- ✅ `--custom-rules` 自定义规则
- ✅ 细粒度 `update` 选择性更新
- ✅ Monorepo 目标选择
- ✅ `configs/` 增量补齐

**重点收口**:
- 安装实现统一到 Node 核心
- Bash/PowerShell 只保留薄壳入口
- README 收成产品入口页
- Registry 说明集中统一

协议主链、专家链和运行时状态机没有因为入口收口而改变。
