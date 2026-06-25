# init 命令参数详解

`init` 命令用于将 `br-ai-spec` 初始化到目标项目。命令会根据扫描结果生成 InitPlan（初始化计划），确认后写入 `.ai-spec/` 配置与 `.agents/` 资产文件。

---

## 快速入口

```bash
# 推荐方式（新 init）
npx @engineered/ai-spec-auto@latest init <目录> --recommend --yes

# 手动指定 Manifest（新 init）
npx @engineered/ai-spec-auto@latest init <目录> --manifest <slug> --yes

# 旧 init（无需 --recommend）
npx @engineered/ai-spec-auto@latest init <目录>
```

---

## 一、新 init 参数（`--recommend` 链路）

新 init 通过扫描目标项目自动检测技术栈并推荐 Manifest。所有参数定义在 `bin/init-command.js`。

### 必选参数（二选一）

| 参数 | 说明 |
|------|------|
| `--recommend` | 启用扫描推荐模式，自动检测技术栈 |
| `--manifest <slug>` | 手动指定 Manifest slug，跳过自动检测 |

> `--manifest` 和 `--recommend` **不能同时使用**。`--manifest` 优先级更高。

### 操作控制

| 参数 | 说明 |
|------|------|
| `--dry-run` | 仅预览 InitPlan 内容，不写入任何文件 |
| `--yes` / `-y` | 跳过用户确认，直接执行写入。不传时只输出计划等待确认 |
| `--json` | 以 JSON 格式输出 InitPlan，通常配合 `--dry-run` 使用 |
| `--help` / `-h` | 打印帮助信息 |

### Manifest 与技术栈

| 参数 | 说明 |
|------|------|
| `--manifest <slug>` | 指定要安装的 Manifest。可选值见下方 [Manifest Slug 对照表](#二manifest-slug-对照表) |

### Hub 与 Visual 集成

| 参数 | 说明 |
|------|------|
| `--hub-url <url>` | 指定 Hub 服务地址，用于远程获取 Manifest 推荐 |
| `--no-hub-fallback` | Hub 推荐失败时禁止降级本地推荐，直接报错退出 |

### Monorepo 控制

| 参数 | 说明 |
|------|------|
| `--workspace-root` | 仅在 workspace 根目录初始化，忽略所有子包。不会写入 `workspace.json` |

> 不传 `--workspace-root` 时，init 会扫描并初始化所有子包。

### 目标目录（位置参数）

```bash
ai-spec-auto init /path/to/project --recommend --yes
ai-spec-auto init . --recommend --yes
```

第一个非 `--` 开头的参数视为目标目录，默认为当前目录 `.`。

---

## 二、Manifest Slug 对照表

| Slug | 适用场景 |
|------|----------|
| `frontend-vue-vite-standard` | Vue 3 + Vite + TypeScript |
| `frontend-react-vite-standard` | React + Vite + TypeScript |
| `frontend-react-nextjs-standard` | React + Next.js |
| `frontend-react-standard` | React + Webpack |
| `backend-java-springboot-standard` | Java Spring Boot |
| `backend-java-springcloud-standard` | Java Spring Cloud |
| `backend-java-springmvc-legacy-standard` | Java Spring MVC（存量项目） |
| `backend-node-nestjs-standard` | Node.js NestJS |
| `backend-python-fastapi-standard` | Python FastAPI |
| `backend-go-standard` | Go 后端 |

---

## 三、旧 init 参数（`install-workflow` 链路）

不带 `--recommend` 或 `--manifest` 的 `init` 走的是旧链路（定义在 `bin/install-workflow.js`），功能包含规范安装、lint/format 配置、husky 提交校验、IDE 适配等。**新旧 init 参数不通用**。

### 命令模式

```bash
ai-spec-auto init [dir]       # 完整首次安装
ai-spec-auto update [dir]     # 更新已有安装
ai-spec-auto sync [dir]       # 按 manifest 同步资产
ai-spec-auto check [dir]      # 检查安装状态
ai-spec-auto uninstall [dir]  # 卸载规范库
```

### 技术栈与安装级别

| 参数 | 说明 |
|------|------|
| `--profile <name>` | 单一技术栈：`vue` / `react` / `nestjs` / `springboot` / `node-tooling` |
| `--profiles <a,b>` | 多技术栈，逗号分隔，如 `--profiles vue,nestjs` |
| `--level <L1\|L2\|L3>` | 兼容参数。L1=只规范 | L2=规范+IDE | L3=全量（默认） |

### 规则控制

| 参数 | 说明 |
|------|------|
| `--standard-rules` | 使用标准规则集 |
| `--custom-rules` | 使用自定义规则模式 |
| `--force-update-rules` | update 时强制覆盖已有规则文件 |
| `--no-force-update-rules` | update 时保留已有规则（默认） |

### Lint / Format / Husky

| 参数 | 说明 |
|------|------|
| `--lint` / `--no-lint` | 安装/跳过 ESLint + Prettier + Stylelint 配置 |
| `--husky` / `--no-husky` | 安装/跳过 husky + lint-staged + commitlint |

### IDE 适配

| 参数 | 说明 |
|------|------|
| `--ide <name>` | 指定 IDE：`cursor` / `claude` / `codex` / `opencode` / `trae` |

### 模块级跳过（update 时使用）

| 参数 | 说明 |
|------|------|
| `--skip-skills` | 跳过 Skills（技能）更新 |
| `--skip-configs` | 跳过 Configs（lint/format 配置）更新 |
| `--skip-commands` | 跳过 Commands（命令模板）更新 |
| `--skip-ide-links` | 跳过 IDE 链接更新 |
| `--skip-openspec` | 跳过 OpenSpec 更新 |
| `--skip-uipro` | 跳过 UI UX Pro Max 更新 |

### 平台增强

| 参数 | 说明 |
|------|------|
| `--uipro` / `--no-uipro` | 启用/禁用 UI UX Pro Max |
| `--superpowers` / `--no-superpowers` | 启用/禁用 Superpowers 平台增强 |
| `--visual-bridge` / `--no-visual-bridge` | 启用/禁用 Visual 平台桥接 |
| `--refresh-superpowers` | 刷新 Superpowers 绑定状态 |

### Monorepo 控制

| 参数 | 说明 |
|------|------|
| `--workspace-root` | 强制在 workspace 根目录安装，不询问交互 |
| `--package <path>` | 指定子包路径，如 `--package packages/web` |

---

## 四、Monorepo 场景最佳实践

### 场景 1：只在根目录初始化

```bash
ai-spec-auto init . --recommend --workspace-root --yes
```

效果：
- 只扫描/初始化根 `package.json`
- 不写入 `workspace.json`
- 不处理子包

### 场景 2：初始化到指定子包

```bash
# 新 init：先 cd 到子包目录
cd packages/my-app
npx @engineered/ai-spec-auto@latest init . --recommend --yes

# 旧 init：用 --package
npx @engineered/ai-spec-auto@latest init . --package packages/my-app
```

### 场景 3：交互式选择（旧 init）

旧 init 检测到 monorepo 后会弹出交互式选择：

```
检测到 Monorepo，工作区根目录: /path/to/root
  1) 在工作区根目录继续安装
  2) 改为在具体子包中安装（推荐）
请选择 [1/2]
```

| 你的选择 | 效果 |
|----------|------|
| 选 `1` | 根目录安装，pnpm 自动加 `-w`，依赖写入根 `package.json` |
| 选 `2` + 输入路径 | 安装到指定子包，依赖只写入该子包的 `package.json` |

### 环境变量

```bash
# 等价于 --package
export EX_AI_SPEC_WORKSPACE_PACKAGE=packages/web
npx @engineered/ai-spec-auto@latest init .
```

---

## 五、新 init 的完整执行流程

```
ai-spec-auto init <目录> --recommend --yes
                │
                ▼
    1. 扫描目标目录（TechScannerEngine）
       ├── 检测工作区类型（pnpm / npm / lerna / maven / gradle）
       ├── 枚举所有包
       └── 对每个包提取依赖、关键文件
                │
                ▼
    2. 技术栈检测（DetectorRegistry）
       ├── VueViteDetector    → frontend-vue-vite-standard
       ├── ReactViteDetector  → frontend-react-vite-standard
       ├── NextJsDetector     → frontend-react-nextjs-standard
       ├── SpringBootDetector → backend-java-springboot-standard
       ├── NestJsDetector     → backend-node-nestjs-standard
       ├── FastApiDetector    → backend-python-fastapi-standard
       └── GoDetector         → backend-go-standard
                │
                ▼
    3. 生成 InitPlan
       ├── 每个包匹配推荐 Manifest
       ├── 列出将要写入的文件
       └── 标记警告信息
                │
                ▼
    4. 应用 InitPlan（InitApplier）
       ├── 写入 .ai-spec/project.json（项目画像）
       ├── 写入 .ai-spec/policy.json（分支/隐私策略）
       ├── 写入 .ai-spec/workspace.json（仅多包工作区）
       ├── 写入 .ai-spec/ai-spec.lock.json（清单锁定）
       ├── 写入 .agents/ 资产（rules、skills、commands 等）
       ├── 注入 IDE 指针文件（CLAUDE.md、.cursor/、.codex/）
       └── 上报安装记录到 Hub / Visual 平台
```

---

## 六、常见问题

### `init` 会执行 `pnpm install` 吗？

不会。新 init 只写配置文件和复制 `.agents/` 资产，不安装任何 npm/pnpm 依赖。

旧 init 会执行 `pnpm add -D`（或 `npm install -D`）安装 ESLint、Prettier 等 devDependencies，但不执行 `pnpm install` 安装项目全部依赖。

### manifest slug 和 profile 有什么区别？

- **Manifest slug**（新 init）：完整的"技术栈名-项目类型-标准级别"，如 `frontend-vue-vite-standard`
- **Profile**（旧 init）：简化的技术栈标识，如 `vue`、`react`、`nestjs`

### 如何在 CI 中无交互使用？

```bash
# 新 init
npx @engineered/ai-spec-auto@latest init . --recommend --yes

# 旧 init + 跳过 lint/husky 提示（默认 ask）
npx @engineered/ai-spec-auto@latest init . --profile vue --lint --no-husky
```

### init 后如何更新？

```bash
# 新 init 后：重新 init 即可（会写入/覆盖 .ai-spec/ 文件）
# 旧 init 后：
npx @engineered/ai-spec-auto@latest update .
```
