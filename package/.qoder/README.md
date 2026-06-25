# Qoder IDE 适配说明

## 概述

`ai-spec-auto` 现已支持 **Qoder IDE**。Qoder 是一款面向 AI 辅助开发的智能 IDE,提供强大的代码理解和生成能力。

## 安装 Qoder 适配

### 方式 1: 默认安装(包含 Qoder)

```bash
npx @engineered/ai-spec-auto@latest init . --ide all
```

### 方式 2: 仅安装 Qoder

```bash
npx @engineered/ai-spec-auto@latest init . --ide qoder
```

### 方式 3: 组合安装

```bash
# Qoder + Cursor
npx @engineered/ai-spec-auto@latest init . --ide qoder,cursor

# Qoder + Claude Code
npx @engineered/ai-spec-auto@latest init . --ide qoder,claude
```

## 安装后的目录结构

```
.your-project/
├── .qoder/
│   ├── rules/              → 链接到 .agents/rules/
│   ├── skills/             → 链接到 .agents/skills/
│   └── commands/           → 协议命令模板
│       ├── spec-start.md
│       ├── spec-continue.md
│       ├── spec-update.md
│       ├── spec-status.md
│       └── spec-stop.md
├── .agents/                # 规范源
│   ├── rules/
│   └── skills/
└── .ai-spec/               # 运行态数据
```

## 可用命令

安装完成后,在 Qoder 中可以使用以下协议命令:

| 命令 | 用途 |
|------|------|
| `/spec-start` | 新建一个需求交付 run |
| `/spec-continue` | 继续或恢复当前 run |
| `/spec-update` | 增量补充需求、修正方向 |
| `/spec-status` | 查看当前阶段、门禁和下一步 |
| `/spec-stop` | 暂停当前 run |

## 配置示例

### MCP 配置(可选)

如果 Qoder 支持 MCP(Model Context Protocol),可以创建 `.qoder/mcp.json`:

```json
{
  "mcpServers": {
    "ai-spec-auto": {
      "command": "npx",
      "args": ["@engineered/ai-spec-auto@latest"]
    }
  }
}
```

## 更新 Qoder 适配

```bash
# 更新所有 IDE 适配
npx @engineered/ai-spec-auto@latest update .

# 仅更新 Qoder
npx @engineered/ai-spec-auto@latest update . --ide qoder
```

## 检查安装

```bash
npx @engineered/ai-spec-auto@latest check .
```

检查输出中应该包含:
```
✅ .qoder/rules 链接有效
✅ .qoder/skills (N 个链接)
✅ 协议命令可用
```

## 卸载 Qoder 适配

```bash
npx @engineered/ai-spec-auto@latest uninstall .
```

这将移除 `.qoder/` 目录及其中的所有链接和命令模板。

## 技术支持

- 项目仓库: https://github.com/Colouful/engineered-spec
- 问题反馈: https://github.com/Colouful/engineered-spec/issues
- 文档索引: docs/README.md
