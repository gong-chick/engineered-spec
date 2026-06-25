# IDE 命令模板映射机制说明

## 概述

所有 IDE(Cursor、Claude Code、Qoder、OpenCode、Trae、Codex)的命令模板都**统一维护**在 `.agents/commands/` 目录下,安装时通过 CLI 自动映射到各 IDE 的原生命令目录。

## 目录结构

```
.agents/commands/
├── README.md                    # 映射机制说明
├── common/                      # 所有 IDE 共用的命令模板
│   ├── spec-start.md
│   ├── spec-continue.md
│   ├── spec-update.md
│   ├── spec-status.md
│   ├── spec-stop.md
│   ├── branch-review.md         # 🆕 分支代码评审
│   └── ...
├── cursor/                      # Cursor 专属覆盖(可选)
│   ├── opsx-propose.md
│   └── opsx-apply.md
├── claude/                      # Claude 专属覆盖(可选)
├── codex/                       # Codex 专属覆盖(可选)
├── qoder/                       # Qoder 专属覆盖(可选)
├── opencode/                    # OpenCode 专属覆盖(可选)
└── trae/                        # Trae 专属覆盖(可选)
```

## 映射规则

### 1. 基础映射

CLI 安装时会执行:

```javascript
// 伪代码
for (const ide of ALL_IDES) {
  // 1. 复制 common/ 中的所有命令到 IDE 的 commands/ 目录
  for (const cmdFile of common/*.md) {
    copy(`.agents/commands/common/${cmdFile}`, `.${ide}/commands/${cmdFile}`);
  }
  
  // 2. 如果 IDE 有专属覆盖,则覆盖同名文件
  if (exists(`.agents/commands/${ide}/${cmdFile}`)) {
    copy(`.agents/commands/${ide}/${cmdFile}`, `.${ide}/commands/${cmdFile}`);
  }
}
```

### 2. 安装后的目录结构

安装到目标项目后:

```
.your-project/
├── .agents/commands/            # 源定义(只读)
│   ├── common/
│   ├── cursor/
│   └── ...
├── .cursor/commands/            # Cursor 实际消费
│   ├── spec-start.md            # ← 从 common/ 复制
│   ├── spec-continue.md         # ← 从 common/ 复制
│   ├── opsx-propose.md          # ← 从 cursor/ 复制(覆盖)
│   └── ...
├── .claude/commands/            # Claude 实际消费
│   ├── spec-start.md            # ← 从 common/ 复制
│   └── ...
├── .qoder/commands/             # Qoder 实际消费
│   ├── spec-start.md            # ← 从 common/ 复制
│   ├── branch-review.md         # ← 从 common/ 复制
│   └── ...
└── ...
```

## 为什么这样设计?

### ✅ 优点

1. **单一数据源**: 命令模板只维护一份,避免多份副本不一致
2. **易于维护**: 修改一个文件,所有 IDE 自动生效
3. **支持差异化**: 某个 IDE 需要特殊处理时,可以单独覆盖
4. **降低维护成本**: 新增命令只需加到 `common/`,无需为每个 IDE 重复添加

### ❌ 不这样做的后果

如果每个 IDE 单独维护命令模板:

```
.qoder/commands/branch-review.md     # ← 单独维护
.cursor/commands/branch-review.md    # ← 单独维护
.claude/commands/branch-review.md    # ← 单独维护
```

**问题**:
- 修改一处,需要同步修改多处
- 容易遗漏某个 IDE
- 维护成本高
- 容易出现版本不一致

## 新增命令模板

### 步骤 1: 添加到 common/

```bash
# 创建新命令模板
vim .agents/commands/common/my-new-command.md
```

### 步骤 2: 验证映射

```bash
# 安装到测试项目
npx @engineered/ai-spec-auto@latest init ./test-project --ide all

# 检查各 IDE 的 commands/ 目录
ls .test-project/.cursor/commands/my-new-command.md  # ✅ 应该存在
ls .test-project/.qoder/commands/my-new-command.md   # ✅ 应该存在
ls .test-project/.claude/commands/my-new-command.md  # ✅ 应该存在
```

### 步骤 3: 发布

```bash
npm publish
```

## 差异化覆盖

如果某个 IDE 需要特殊处理:

### 示例: Qoder 需要不同的 spec-start 行为

```bash
# 创建 Qoder 专属覆盖
mkdir -p .agents/commands/qoder
cp .agents/commands/common/spec-start.md .agents/commands/qoder/spec-start.md
# 编辑 qoder/spec-start.md,添加 Qoder 特有逻辑
```

安装时会自动使用 `qoder/spec-start.md` 覆盖 `common/spec-start.md`。

## 实际案例: branch-review

### 背景

新增分支代码评审功能,需要在所有 IDE 中可用。

### 实现

```bash
# 1. 添加到 common/
vim .agents/commands/common/branch-review.md

# 2. 不需要为每个 IDE 单独创建
# ❌ 错误做法:
# vim .qoder/commands/branch-review.md
# vim .cursor/commands/branch-review.md
# vim .claude/commands/branch-review.md

# 3. CLI 安装时自动映射
# ✅ 正确做法: 只维护一份,自动映射到所有 IDE
```

### 安装后的效果

所有 IDE 都可以使用 `/branch-review` 命令:
- ✅ Qoder: `/branch-review`
- ✅ Cursor: `/branch-review`
- ✅ Claude: `/branch-review`
- ✅ OpenCode: `/branch-review`
- ✅ Trae: `/branch-review`
- ✅ Codex: `/branch-review`

## CLI 实现细节

### 核心函数

```javascript
// bin/install-workflow.js

function listTemplateCommandFiles(sourceDir, ideName) {
  const commandFiles = new Set();
  
  // 1. 先加载 common/ 中的所有命令
  for (const relDir of [
    path.join(sourceDir, '.agents', 'commands', 'common'),
    path.join(sourceDir, '.agents', 'commands', ideName),  // 2. 再加载 IDE 专属覆盖
  ]) {
    if (!fs.existsSync(relDir)) continue;
    for (const entry of fs.readdirSync(relDir)) {
      if (entry.endsWith('.md')) {
        commandFiles.add(`.${ideName}/commands/${entry}`);
      }
    }
  }
  
  return [...commandFiles].sort();
}
```

### 映射时机

1. **init**: 初始安装时映射
2. **update**: 更新时重新映射(检测变更)
3. **sync**: 同步时重新映射

## 常见问题

### Q: 为什么 `.qoder/commands/` 目录还有文件?

A: 那是**目标项目**中的文件,是安装时从 `.agents/commands/common/` 映射过来的。**源仓库**中不应该维护 `.qoder/commands/`,只应该维护 `.agents/commands/`。

### Q: 如何验证映射是否生效?

A: 安装到测试项目后检查:

```bash
ls -la .test-project/.qoder/commands/
ls -la .test-project/.cursor/commands/
# 应该能看到 common/ 中的所有命令
```

### Q: 能否跳过某个 IDE 不映射?

A: 可以,安装时指定 `--ide` 参数:

```bash
# 仅安装 Qoder,不安装其他 IDE
npx @engineered/ai-spec-auto@latest init . --ide qoder

# 仅安装 Cursor + Claude
npx @engineered/ai-spec-auto@latest init . --ide cursor,claude
```

## 总结

| 目录 | 用途 | 维护位置 |
|------|------|---------|
| `.agents/commands/common/` | 所有 IDE 共用的命令模板 | **源仓库**(本项目) |
| `.agents/commands/{ide}/` | IDE 专属覆盖(可选) | **源仓库**(本项目) |
| `.{ide}/commands/` | IDE 实际消费的命令 | **目标项目**(安装后生成) |

**核心原则**: 
- ✅ 源仓库只维护 `.agents/commands/`
- ✅ 目标项目的 `.{ide}/commands/` 由 CLI 自动生成
- ✅ 新增命令只需加到 `common/`,无需为每个 IDE 重复添加
- ✅ 需要差异化时,在 `{ide}/` 创建同名文件覆盖
