# 安装指南

这份文档只聚焦安装层：获取方式、前置条件、命令入口、`manifest` 同步、安装后产物、自检和排错。  
如果你只想先走一条最短路径，优先看 [README](../README.md) 和 [5 分钟快速上手](quick-start.md)。

## 1. 安装前准备

开始前，建议先确认这些条件：

- `Node.js >= 18`。CLI 会在启动时直接校验版本，低于 `v18` 会失败。
- 目标目录已经确定。若是 Monorepo，请先判断要装在工作区根还是具体子包。
- 推荐有 `npm` 或 `pnpm`。本地 CLI、lint/husky、OpenSpec 自动安装都依赖包管理器。
- 如果你要在 IDE 里直接跑协议命令，建议使用 Cursor 或 Claude Code。
- 如果你要使用 `install.sh` / `install.ps1`，需要先拿到当前仓库代码；如果只走 `npx`，不需要单独 clone。

补充说明：

- `git` 不是 `npx` 主路径的必需条件，但如果你走脚本入口或本地调试，会更方便。
- `python3` 不是基础安装必需条件，但 UIPro 的部分搜索脚本会用到。

## 2. 如何获取

### 2.1 通过公共 npm 获取

当前包发布在公共 npm registry：`@engineered/ai-spec-auto`。

如果本机 `npm config get registry` 为内网 `nodejs.100credit.cn`，且当前不在内网/VPN，需要先在 `~/.npmrc` 中配置 `@engineered` 作用域走公共 npm：

```ini
# ~/.npmrc
@engineered:registry=https://registry.npmjs.org/
```

配置完成后，直接执行：

```bash
npx @engineered/ai-spec-auto@latest init .
```

**或者单次命令指定 registry**：

```bash
npx --yes --registry https://registry.npmjs.org/ @engineered/ai-spec-auto@latest init .
```

### 2.2 通过仓库脚本入口获取

如果你要使用 `install.sh` 或 `install.ps1`，先拿到当前仓库：

```bash
git clone https://github.com/gong-chick/engineered-spec.git ai-spec-auto
cd ai-spec-auto
```

然后再执行：

```bash
bash install.sh init /path/to/your-project
```

```powershell
.\install.ps1 init C:\path\to\your-project
```

`install.sh` 和 `install.ps1` 现在都是薄壳入口，真正逻辑统一由 Node 核心实现。

## 3. 推荐入口

常用入口如下：

```bash
# 首次安装
npx @engineered/ai-spec-auto@latest init .

# 首次安装，并直接按 manifest 同步
npx @engineered/ai-spec-auto@latest init . --manifest ./manifest.json

# 更新已安装内容
npx @engineered/ai-spec-auto@latest update .

# 按 manifest 刷新已安装资产（项目内已存在 .ai-spec/manifest.json 时）
npx @engineered/ai-spec-auto@latest sync .

# 安装后自检
npx @engineered/ai-spec-auto@latest check .

# 卸载工具管理的安装层内容
npx @engineered/ai-spec-auto@latest uninstall .
```

建议这样理解：

- `init`：首次安装主入口
- `init --manifest`：首次安装，同时把 Hub/manifest 资产同步进项目
- `update`：已有安装基础上的增量更新
- `sync`：按 `.ai-spec/manifest.json` 或显式 `--manifest` 刷新专家、技能、规则、流程模板和 IDE 资产
- `check`：安装后自检
- `uninstall`：移除工具管理的安装层内容

## 4. 默认安装模型

默认安装就是完整安装，等价于现在的主路径：

- `.agents/rules`
- `.agents/skills`
- `.cursor` / `.claude` IDE 适配
- `openspec/`

如果检测到可用包管理器，安装阶段还会尽量补齐：

- `./node_modules/.bin/ai-spec-auto`
- lint/format 依赖与配置
- husky / lint-staged / commitlint
- `@fission-ai/openspec`

### `L1 / L2 / L3` 现在的定位

- 仍然保留为兼容参数
- 不再作为 README / 快速上手的主叙事
- 只有明确兼容旧安装模型时才需要使用

兼容用法如下：

```bash
npx @engineered/ai-spec-auto@latest init . --level L1
npx @engineered/ai-spec-auto@latest init . --level L2
npx @engineered/ai-spec-auto@latest init . --level L3
```

## 5. `init` 会问什么

交互式 `init` 默认只会问这些：

- `Profile`
- Monorepo 安装目标（若命中）
- 规则策略（标准 / 根据项目自定义）
- `UIPro`
- `lint/format`
- `husky`

默认不会再把 `L1 / L2 / L3` 当成必答题。

## 6. 常用参数

### 6.1 技术栈

```bash
npx @engineered/ai-spec-auto@latest init . --profile vue
npx @engineered/ai-spec-auto@latest init . --profile react
```

### 6.2 IDE 目标

如果你只想给特定 IDE 落命令模板和链接，可以显式指定：

```bash
npx @engineered/ai-spec-auto@latest init . --ide cursor
npx @engineered/ai-spec-auto@latest init . --ide claude
npx @engineered/ai-spec-auto@latest init . --ide cursor,claude
npx @engineered/ai-spec-auto@latest init . --ide all
```

常见理解方式：

- `default`：按默认 IDE 组合安装
- `cursor` / `claude`：只装指定 IDE
- `cursor,claude`：按逗号组合
- `all`：安装全部已支持 IDE 资产

### 6.3 自定义规则

```bash
npx @engineered/ai-spec-auto@latest init . --custom-rules
npx @engineered/ai-spec-auto@latest init . --standard-rules
```

可自定义规则范围固定为：

- `01-项目概述.md`
- `03-项目结构.md`
- `04-组件规范.md`
- `05-API规范.md`
- `06-路由规范.md`
- `07-状态管理.md`
- `09-样式规范.md`

说明：

- `01/03` 始终属于项目特有规则
- 其它被选为自定义的规则在安装时不会从规范库直接落盘
- 后续由 `/project-init` 按项目实际情况补生成

### 6.4 Monorepo

如果在工作区根安装，命中 Monorepo 时会提示：

- 在根目录继续安装
- 或切到具体子包安装

也可以直接显式指定：

```bash
npx @engineered/ai-spec-auto@latest init . --package packages/web
npx @engineered/ai-spec-auto@latest init . --workspace-root
```

环境变量也支持：

```bash
EX_AI_SPEC_WORKSPACE_PACKAGE=packages/web npx @engineered/ai-spec-auto@latest init .
```

### 6.5 UIPro / lint / husky

```bash
npx @engineered/ai-spec-auto@latest init . --uipro
npx @engineered/ai-spec-auto@latest init . --no-uipro
npx @engineered/ai-spec-auto@latest init . --lint
npx @engineered/ai-spec-auto@latest init . --no-lint
npx @engineered/ai-spec-auto@latest init . --husky
npx @engineered/ai-spec-auto@latest init . --no-husky
```

### 6.6 `update` 细粒度控制

```bash
npx @engineered/ai-spec-auto@latest update . --skip-skills
npx @engineered/ai-spec-auto@latest update . --skip-configs
npx @engineered/ai-spec-auto@latest update . --skip-commands
npx @engineered/ai-spec-auto@latest update . --skip-ide-links
npx @engineered/ai-spec-auto@latest update . --skip-openspec
npx @engineered/ai-spec-auto@latest update . --skip-uipro
npx @engineered/ai-spec-auto@latest update . --update-commands
npx @engineered/ai-spec-auto@latest update . --update-uipro
npx @engineered/ai-spec-auto@latest update . --update-rules
npx @engineered/ai-spec-auto@latest update . --no-update-rules
```

交互式 `update` 也支持直接勾选模块，不必先记这些参数。

## 7. Hub / manifest 安装清单

如果你的项目不是手动选参数安装，而是通过 Hub 平台选择了一组规则、技能、专家和场景方案，那么推荐使用 `manifest` 驱动。

### 7.1 首次安装就按 manifest 落地

如果项目还是空白接入期，优先使用：

```bash
npx @engineered/ai-spec-auto@latest init . --manifest ./manifest.json
```

或者：

```bash
npx @engineered/ai-spec-auto@latest init . --manifest https://hub.example.com/manifests/project-abc.json
```

这条路径适合：

- 新项目第一次接入
- 希望首次安装时同时补齐本地 CLI、lint/husky、OpenSpec
- 希望 Hub 选择结果和本地安装一步对齐

补充说明：

- `init --manifest` 固定按默认完整安装执行
- 此时 `--level` 仅保留兼容意义，不影响场景资产同步
- `--profile`、`--ide` 可以显式覆盖 manifest 中的同名配置

### 7.2 已有项目按 manifest 刷新

如果项目已经接过一次，后续更适合使用：

```bash
npx @engineered/ai-spec-auto@latest sync . --manifest ./manifest.json
```

或者直接使用 Hub 导出的远程清单：

```bash
npx @engineered/ai-spec-auto@latest sync . --manifest https://hub.example.com/manifests/project-abc.json
```

如果项目里已经存在 `.ai-spec/manifest.json`，通常继续执行：

```bash
npx @engineered/ai-spec-auto@latest sync .
```

`sync` 更适合下面这些场景：

- 你已经在 Hub 上选好了场景方案、技能包或规则包
- 你希望安装状态来自一份固定清单，而不是靠人工重新选择参数
- 你需要把同一套能力组合稳定同步到多个项目

需要注意：

- 直接 `sync` 主要负责同步 manifest 资产
- 它会刷新 `.agents/rules`、`.agents/skills`、`.agents/roles`、`.agents/flows`、IDE 资产，以及 `.ai-spec/manifest.json / lock.json / sources.json`
- 它不会替代首次 `init` 的全部行为，不负责完整补齐本地 CLI、lint/husky、OpenSpec 初始化链路

如果你需要本地协议命令稳定可执行，优先走 `init --manifest`。

### 7.3 常用 `sync` 参数

```bash
# 本地 manifest 缺失资产时，显式指定 Hub 来源
npx @engineered/ai-spec-auto@latest sync . --manifest ./manifest.json --hub-origin http://172.16.185.63:3000

# 禁止本地 manifest 通过 Hub 自动补齐缺失资产
npx @engineered/ai-spec-auto@latest sync . --manifest ./manifest.json --no-hub-fetch

# 临时覆盖 manifest 里的 profile / ide
npx @engineered/ai-spec-auto@latest sync . --manifest ./manifest.json --profile vue --ide cursor,claude

# 只预览，不真正落盘
npx @engineered/ai-spec-auto@latest sync . --manifest ./manifest.json --dry-run
```

建议按下面的边界理解：

- Hub 平台负责“用户选了什么”
- `manifest` 负责“把选择结果结构化描述出来”
- CLI `init --manifest` / `sync --manifest` 负责“把这份清单真正同步到项目里”

也就是说，Hub 不直接改项目，CLI 才是最终执行入口。

如果你需要进一步了解 Hub 资产怎么同步到平台，可继续看 [Hub 资产同步脚本说明](four/Hub资产同步脚本说明.md)。

如果你只想先复制一份能直接用的清单，可直接看 [最小 `manifest.json` 示例](manifest-最小示例.md)。

## 8. 安装完成后会有什么

默认 `init` 完成后，项目中通常会出现这些内容：

- `.agents/rules/`
- `.agents/skills/`
- `.cursor/`、`.claude/` 等 IDE 目录
- `.cursor/mcp.json`（当安装目标包含 Cursor 且项目里原本不存在时）
- `openspec/`
- `.ai-spec/install-state.json`
- `./node_modules/.bin/ai-spec-auto`（前提是检测到可用包管理器）

如果你走的是 manifest 路径，还会额外维护：

- `.agents/roles/`（专家定义）
- `.agents/flows/`（流程模板）
- `.ai-spec/manifest.json`
- `.ai-spec/lock.json`
- `.ai-spec/sources.json`

这些文件的职责可以简单理解为：

- `manifest`：本次希望安装什么
- `lock`：本次实际锁定到了什么
- `sources`：这些资产是从哪里来的

## 9. configs 同步策略

`configs/` 下的文件现在采用增量补齐策略：

- 缺什么补什么
- 已有文件不整份覆盖
- `.husky/` 等目录配置也按目录内补缺处理

这意味着目标项目里你已经手改过的配置，不会因为一次 `update` 被整份顶掉。

## 10. OpenSpec / MCP / 本地 CLI

### 10.1 OpenSpec

默认完整安装会配置 `openspec/`。

行为：

- 未存在时执行 `openspec init`
- 已存在时执行 `openspec update`
- 同步 `openspec/schemas`
- 增量补齐 `config.yaml`

如果本机没有 `openspec`，安装阶段会尝试自动补装 `@fission-ai/openspec`。  
如果机器上既没有可用包管理器，又没有已有 `openspec`，则需要手动安装：

```bash
npm install -g @fission-ai/openspec@latest
```

### 10.2 MCP

若生成了 `.cursor/mcp.json`：

- 先去 Cursor 设置 → MCP 里按需启用服务
- 再填写 `project-id`、`access-token` 等凭证

Cursor 里 MCP 默认关闭是预期行为，不等于安装失败。

### 10.3 本地 CLI

安装流程会尽量在目标项目内安装：

```bash
./node_modules/.bin/ai-spec-auto
```

这样 IDE 命令和宿主桥就可以稳定调用项目内版本。

需要注意：

- 如果项目只执行过 `sync --manifest`，`check` 里看到本地 CLI 缺失可能是预期行为
- 这种情况下，只有在你确实需要本地执行协议命令时，才建议补一次 `init --manifest` 或常规 `init`

## 11. 检查与卸载

### 11.1 安装后自检

推荐安装完成后执行：

```bash
npx @engineered/ai-spec-auto@latest check .
```

`check` 主要检查：

- `.agents/` 是否存在
- `rules/`、`skills/` 是否齐全
- `./node_modules/.bin/ai-spec-auto` 是否可用
- `.cursor/`、`.claude/` 等 IDE 链接是否有效
- `openspec/` 是否存在

如果当前项目是纯 `sync --manifest` 管理，`check` 对本地 CLI 会给出告警而不是直接当成错误。

### 11.2 卸载会删什么

执行：

```bash
npx @engineered/ai-spec-auto@latest uninstall .
```

会移除工具管理的安装层内容，通常包括：

- `.agents/`
- IDE 链接与命令模板
- `.ai-spec/manifest.json`
- `.ai-spec/lock.json`
- `.ai-spec/sources.json`
- `.ai-spec/install-state.json`
- 可证明由本工具创建的共享配置和依赖

不会主动删除：

- 你的业务代码
- 你自己手写的项目文件
- 已存在的 `openspec/specs/`、`openspec/changes/` 业务产物

## 12. Windows / PowerShell

PowerShell 入口仍然支持：

```powershell
.\install.ps1 init .
```

它主要负责：

- Windows 入口
- Node 检测
- 转发到 `node .\bin\cli.js`

如果遇到执行策略问题，可使用：

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1 init .
```

## 13. 常见排错

### 1）`npx @engineered/ai-spec-auto@latest init .` 拉不到包

通常是 registry 没配。

检查 `~/.npmrc`：

```ini
@engineered:registry=https://registry.npmjs.org/
```

**或者确认是否在内网环境**：

- 如果在内网/VPN，可以直接访问公共 npm
- 如果不在内网，必须配置 `@engineered:registry` 指向公共 npm
- 也可以使用单次命令：`npx --yes --registry https://registry.npmjs.org/ @engineered/ai-spec-auto@latest init .`

### 2）启动就报 Node 版本过低或未检测到 Node

当前最低要求是 `Node.js v18`。  
先检查：

```bash
node --version
```

如果机器上没有 `npm` 或 `pnpm`，安装不会完全失败，但本地 CLI、lint/husky、OpenSpec 自动安装会被跳过。

### 3）项目是 `sync --manifest` 管理，但本地 CLI 不存在

这通常不是异常，而是路径差异：

- `sync` 负责 manifest 资产同步
- `init --manifest` 才是“首次安装 + manifest 同步”的完整入口

如果你后续要在本地稳定执行协议命令，补一次：

```bash
npx @engineered/ai-spec-auto@latest init . --manifest ./manifest.json
```

### 4）安装完成但 Cursor 没法执行协议命令

首次运行 `/spec-start`、`/spec-continue`、`/spec-update`、`/spec-stop`、`/spec-status` 时：

- 如果 Cursor 弹出命令执行确认
- 请选择 `Always allow for this workspace`

### 5）Monorepo 装到根目录了，其实想装子包

重新执行并显式指定：

```bash
npx @engineered/ai-spec-auto@latest init . --package packages/web
```

### 6）OpenSpec 没装上

优先检查：

- 是否有 `npm` 或 `pnpm`
- `npx openspec --version` 是否可用

必要时手动执行：

```bash
npm install -g @fission-ai/openspec@latest
```

### 7）UIPro 没装上

可以后补：

```bash
npx @engineered/ai-spec-auto@latest update . --uipro
```

如果机器没有 `python3`，UIPro 的部分辅助能力可能不可用。

### 8）Hub 导出的 manifest 不生效

优先检查：

- `--manifest` 传入的是本地 JSON 路径还是远程 URL
- 同步后 `.ai-spec/manifest.json` 是否已经更新
- 当前项目是否本来就有旧的 `.ai-spec/lock.json / sources.json`
- 本地 manifest 缺失资产时，是否应该补 `--hub-origin`

建议重新执行：

```bash
npx @engineered/ai-spec-auto@latest sync . --manifest ./manifest.json
```

或者：

```bash
npx @engineered/ai-spec-auto@latest sync . --manifest https://hub.example.com/manifests/project-abc.json
```

如果你只是想先确认不会改文件，可以先加：

```bash
npx @engineered/ai-spec-auto@latest sync . --manifest ./manifest.json --dry-run
```

## 14. 相关文档

- [README](../README.md)
- [5 分钟快速上手](quick-start.md)
- [最小 `manifest.json` 示例](manifest-最小示例.md)
- [OpenSpec / 协议流说明](openspec-guide.md)
- [Hub 资产同步脚本说明](four/Hub资产同步脚本说明.md)
- [文档索引](README.md)
