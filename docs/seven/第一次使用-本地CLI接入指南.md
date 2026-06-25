# br-ai-spec v0.1.11 第一次使用 — 本地 CLI 接入指南

> **目标项目**：`/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html`（Vue 3 + TypeScript + Vite）
> **CLI 路径**：`/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js`
> **Visual 服务**：`http://localhost:18780`（需提前启动）
> **预计耗时**：3 分钟

---

## 一、设置环境变量（一次性）

```bash
CLI=/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js
PROJECT=/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html
```

**预期**：无输出，变量设置成功。

---

## 二、扫描项目技术栈

```bash
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js scan /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html --json 2>&1 | head -20
```

**预期输出（关键字段）**：

```json
{
  "workspace": {
    "type": "single-project",
    "packageManager": "pnpm"
  },
  "packages": [{
    "primary": {
      "detector": "VueViteDetector",
      "framework": "vue-vite",
      "confidence": 95
    }
  }]
}
```

**验证点**：
- `detector` = `VueViteDetector`
- `confidence` >= 80（高置信度，无需人工确认）

---

## 三、预览初始化计划（空跑，不写文件）

```bash
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js init /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html --recommend --dry-run
```

**预期输出**：

```
InitPlan 生成完成
目标目录：/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html
工作区类型：single-project
包数量：1

推荐 Manifest：
  - .
    项目类型：application
    primary detector：VueViteDetector
    confidence：95
    推荐 Manifest：frontend-vue-vite-standard@1.0.0（分数 95）

将要写入的文件：
  - .ai-spec/project.json：创建
  - .ai-spec/policy.json：创建
  - .ai-spec/ai-spec.lock.json：创建
  - .agents/registry.index.json：创建
  - .ai-spec/context-index.json：创建
  - .cursor/rules/ai-spec-auto.mdc：创建
  - CLAUDE.md：创建
  - memory.md：创建

dry-run 不会写入文件。
```

**验证点**：
- 项目类型 = `application`（不是 `cli-tool` 或 `unknown`）
- Manifest = `frontend-vue-vite-standard`

---

## 四、执行初始化（写入文件，含 Visual 上报）

```bash
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js init /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html --recommend --yes --visual-url http://localhost:18780
```

**预期输出**：

```
初始化写入完成
项目 ID：proj_xxxxxxxxxxxxxxxx
已写入文件：
  - .agents/rules/：创建
  - .agents/skills/：创建
  - .agents/roles/：创建
  - .agents/commands/：创建
  - .ai-spec/project.json：创建
  - .ai-spec/policy.json：创建
  - .ai-spec/ai-spec.lock.json：创建
  - .agents/registry.index.json：创建
  - .ai-spec/context-index.json：创建
  - .cursor/rules/ai-spec-auto.mdc：创建
  - CLAUDE.md：创建
  - memory.md：创建
```

**验证点**：
- 出现 "初始化写入完成"
- 列表包含 `.agents/rules/`、`.agents/skills/`
- 有 `项目 ID`
- **无** "已跳过运行态上报" 警告（Visual 上报成功）

> 如果 Visual 服务未启动，会看到警告 `已跳过运行态上报，不影响初始化`。启动 Visual 后重新执行即可。

---

## 五、IDE 同步（补齐 Pointer-only 指针层）

```bash
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js ide sync /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html \
  --ide cursor,claude \
  --profile vue \
  --link-mode copy \
  --yes
```

**预期输出**：

```
IDE 同步完成
使用模式：copy

已写入文件：
  - .agents/registry/ide-registry.json：创建
  - .ai-spec/ide-integration.json：创建
  - .cursor/rules/ai-spec-auto.mdc：更新
  - .cursor/commands/spec-start.md：创建
  - .cursor/commands/spec-update.md：创建
  - .cursor/commands/spec-status.md：创建
  - .claude/ai-spec-auto.md：创建
  - .claude/commands/spec-start.md：创建
  - .claude/commands/spec-update.md：创建
  - .claude/commands/spec-status.md：创建
  - AGENTS.md：创建
  - CLAUDE.md：更新
  - memory.md：更新
```

**验证点**：
- 出现 "IDE 同步完成"
- 使用模式 = `copy`（团队兼容模式）
- 列表中包含 `.cursor/commands/spec-start.md` 和 `.claude/commands/spec-start.md`

---

## 六、完整性检查

```bash
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js ide doctor /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html
```

**预期输出**：

```
IDE 指针文件检查通过，所有文件完整
```

**验证点**：所有检查项显示 ✅，无 ❌。

---

## 七、配置 Visual 持久化（可选，推荐）

编辑 `/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html/.ai-spec/policy.json`，确认或添加 `visual` 配置块：

```bash
cat >> /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html/.ai-spec/policy.json.tmp << 'POLICY'
{
  "visual": {
    "url": "http://localhost:18780",
    "enabled": true,
    "nonBlocking": true
  }
}
POLICY
```

> 更简单的方式：在 IDE 中直接编辑 `/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html/.ai-spec/policy.json`，找到或添加 `"visual"` 字段。

**验证点**：后续所有命令自动上报，无需每次传 `--visual-url`。

---

## 八、验证 Visual 上报

### 8.1 确认 Visual 服务可访问

```bash
curl -s http://localhost:18780/api/health
```

**预期输出**：`{"status":"ok"}` 或 HTTP 200。

### 8.2 发送一条测试上报

```bash
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js init /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html --recommend --yes --visual-url http://localhost:18780
```

**预期输出**：无 "已跳过运行态上报" 警告。

---

## 九、在 Cursor 中使用 /spec-start

1. 用 Cursor 打开项目目录：
   ```
   /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html
   ```

2. 打开 AI Chat（`Cmd+I`），确认 Cursor 加载了 `.cursor/rules/ai-spec-auto.mdc`

3. 输入命令启动需求：
   ```
   /spec-start 为首页添加用户登录状态显示功能
   ```

4. AI 自动按流程执行：读取注册表 → 确认技术栈 → 按规范推进

---

## 十、生成文件清单

初始化完成后，`/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html` 下新增以下文件和目录：

```
.ai-spec/                         # 项目配置
├── project.json                  # 项目画像 (projectId, manifest)
├── policy.json                   # 执行策略 + visual 配置
├── ai-spec.lock.json             # 资产锁定索引
├── context-index.json            # 渐进式上下文索引
└── ide-integration.json          # IDE 集成状态
.agents/                          # 资产正文（346+ 文件）
├── registry.index.json           # 资产注册表
├── registry/ide-registry.json   # IDE 消费索引
├── rules/                        # 编码规范
├── skills/                       # 技能定义
├── roles/                        # 角色定义
├── commands/                     # 命令模板
├── flows/                        # 工作流
└── templates/                    # 模板
.cursor/                          # Cursor 指针层
├── rules/ai-spec-auto.mdc        # 规则入口 (alwaysApply: true)
└── commands/{spec-start,spec-update,spec-status}.md
.claude/                          # Claude 指针层
├── ai-spec-auto.md               # Claude 入口
└── commands/{spec-start,spec-update,spec-status}.md
AGENTS.md                         # 通用 Agent 入口锚点
CLAUDE.md                         # Claude Code 入口锚点
memory.md                         # 跨会话记忆锚点
```

---

## 十一、完整流程速查（一键复制）

```bash
# ============================================
# br-ai-spec v0.1.11 完整接入流程
# 复制以下全部命令，粘贴到终端执行
# ============================================

CLI=/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js
PROJECT=/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html

# Step 1: 扫描技术栈
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js scan /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html --json 2>&1 | head -10

# Step 2: 预览初始化计划
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js init /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html --recommend --dry-run

# Step 3: 执行初始化 + Visual 上报
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js init /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html --recommend --yes --visual-url http://localhost:18780

# Step 4: IDE 同步
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js ide sync /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html --ide cursor,claude --profile vue --link-mode copy --yes

# Step 5: 完整性检查
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js ide doctor /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html

# Step 6: 验证 Visual 上报
curl -s http://localhost:18780/api/health && echo "Visual 服务正常"

echo ""
echo "========================================="
echo "  接入完成！在 Cursor 中打开项目并使用"
echo "  /spec-start <需求描述>"
echo "========================================="
```

---

## 附录：常见问题

### Q1: "目标项目尚未初始化，请先运行 init --recommend --yes"

先执行 Step 3。

### Q2: "未配置 Hub URL，已使用本地模式"

正常提示。不影响使用，所有资产从本地 CLI 复制。

### Q3: "已跳过运行态上报"

Visual 服务未启动或不可达。确认 `curl http://localhost:18780/api/health` 返回 200。

### Q4: 项目类型 = cli-tool，无自动推荐

手动指定 Manifest：
```bash
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js init /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html --manifest frontend-vue-vite-standard --yes
```

### Q5: 如何更新已有项目

```bash
node /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec/bin/cli.js ide sync /Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html --ide cursor,claude --profile vue --link-mode copy --yes
```

### Q6: 如何关闭 Visual 上报

编辑 `/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html/.ai-spec/policy.json`，将 `visual.enabled` 设为 `false`。
