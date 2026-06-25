# 5 分钟快速上手

这份文档只讲一条主路径：**默认完整安装**。  
如果你只是想尽快把项目接起来，先按这里走，不需要先理解 `L1 / L2 / L3`。

## 0. 准备 npm registry

当前包发布在**公共 npm registry**。

如果本机 `npm config get registry` 为内网 `nodejs.100credit.cn`，且当前不在内网/VPN，需要配置 `@engineered` 作用域走公共 npm：

```ini
# ~/.npmrc
@engineered:registry=https://registry.npmjs.org/
```

配置完成后可直接执行安装命令。

## 1. 安装

在目标项目根目录执行：

```bash
npx @engineered/ai-spec-auto@latest init .
```

这条命令默认会安装：

- `.agents/rules`
- `.agents/skills`
- `.cursor` / `.claude` 命令与链接
- `openspec/`

交互过程中默认只会问这些：

- Profile
- Monorepo 安装目标（如果命中）
- 规则策略（标准 / 根据项目自定义）
- UIPro
- lint/format
- husky

如果你在 Monorepo 根目录执行，它会优先提醒你选根目录还是子包。

## 2. 初始化项目规范

安装完成后，在 AI IDE 中执行：

- `/project-init`
- 或直接输入：`初始化项目规范`

它会始终刷新：

- `01-项目概述.md`
- `03-项目结构.md`
- `context/PROJECT.md`

如果安装时选择了“根据项目自定义”，并且这些规则还缺失，也会一起补出来：

- `04-组件规范.md`
- `05-API规范.md`
- `06-路由规范.md`
- `07-状态管理.md`
- `09-样式规范.md`

## 3. 开始真实需求

最常用的协议命令：

| 命令 | 用途 |
|------|------|
| `/spec-start` | 新建一个需求交付 run |
| `/spec-update` | 增量补充需求、修正方向、归档前修正说明 |
| `/spec-continue` | 继续或恢复当前 run |
| `/spec-stop` | 暂停当前 run |
| `/spec-status` | 查看当前阶段、门禁和下一步 |

默认情况下，`/spec-start` 会以 `auto（自动） + none（无阻塞审核）` 启动；如果需要保留人工审核，再显式切换到 `main-flow-blocking（主流程阻塞审核）`。

如果你走 OpenSpec 提案流：

- Cursor：`/opsx-propose`、`/opsx-apply`、`/opsx-archive`、`/opsx-explore`
- Claude Code 等：`/opsx:propose`、`/opsx:apply`、`/opsx:archive`、`/opsx:explore`

## 4. 最短体验路径

推荐这样试一轮：

1. `npx @engineered/ai-spec-auto@latest init .`
2. 在 IDE 里执行 `/project-init`
3. 执行 `/spec-start`
4. 说一个真实需求，比如：

```text
/spec-start 创建一个订单列表页面，接真实接口，支持分页、筛选、状态切换和错误重试
```

如果中途要增量改需求：

```text
/spec-update 把筛选区改成状态 Tab，先不要高级筛选
```

如果要暂停：

```text
/spec-stop
```

如果要继续：

```text
/spec-continue
```

## 5. 常见变体

指定技术栈：

```bash
npx @engineered/ai-spec-auto@latest init . --profile vue
npx @engineered/ai-spec-auto@latest init . --profile react
```

Monorepo 直接指定子包：

```bash
npx @engineered/ai-spec-auto@latest init . --package packages/web
```

启用自定义规则：

```bash
npx @engineered/ai-spec-auto@latest init . --custom-rules
```

更新规范：

```bash
npx @engineered/ai-spec-auto@latest update .
```

只更新一部分：

```bash
npx @engineered/ai-spec-auto@latest update . --skip-skills --skip-configs --skip-openspec
```

## 6. 兼容参数说明

`--level L1/L2/L3` 仍然保留，但现在属于**兼容参数**：

- 默认不需要理解它
- 默认安装已经等价于原来的完整安装
- 如果你确实需要“少装一点”，再显式使用兼容层级参数

## 7. 继续阅读

- [安装指南](install-guide.md)
- [OpenSpec / 协议流说明](openspec-guide.md)
- [文档索引](README.md)
