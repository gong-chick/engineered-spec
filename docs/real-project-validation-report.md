# 真实项目只读验证报告

生成时间：2026-04-25

验证范围仅包含 `scan`、`scan --json`、`init --recommend --dry-run`。本轮未执行 `init --recommend --yes`，未执行 `sync`、`cache`、`check`、`guard`、状态机、Worktree、执行器、Hub API、Visual API。

## 验证命令

所有命令均在 `/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec` 执行，并设置：

```bash
AI_SPEC_SKIP_LAUNCHER_SYNC=1
```

每个真实项目均执行：

```bash
node bin/cli.js scan <项目路径> --explain
node bin/cli.js scan <项目路径> --json
node bin/cli.js init <项目路径> --recommend --dry-run
```

## 只读性检查

| 项目 | 验证前 Git 状态 | 验证后 Git 状态 | 是否写入文件 |
| --- | --- | --- | --- |
| `/Users/lizhenwei/workspace/javaworkspace/asset-cube` | 空 | 空 | 否 |
| `/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html` | 空 | 空 | 否 |
| `/Users/lizhenwei/workspace/reactworkspace/tian-zhi/bulldog` | 空 | 空 | 否 |
| `/Users/lizhenwei/workspace/vueworkspace/bairong/trace` | 非 Git 仓库，已跳过 git status | 非 Git 仓库，已跳过 git status | 否 |
| `/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-workspace` | 非 Git 仓库，已跳过 git status | 非 Git 仓库，已跳过 git status | 否 |

额外检查：`asset-cube-html/.ai-spec` 和 `asset-cube-workspace/asset-cube-html/.ai-spec` 在验证后可见，但未出现在 Git 状态中；本轮只执行 dry-run，不会创建或更新这些目录。

## 结果总览

| 项目 | workspace 类型 | 包数量 | 识别摘要 | dry-run 推荐结果 | 是否误判 |
| --- | --- | ---: | --- | --- | --- |
| asset-cube | `maven-multi-module` | 7 | Java 后端，多模块 Spring Boot / Spring MVC / Spring Cloud | 按包推荐 Spring Boot 或 Spring MVC Legacy | 否 |
| asset-cube-html | `pnpm-workspace` | 2 | Vue + Vite；`packages/de` 为应用，`packages/i18n` 为库 | 应用包推荐 `frontend-vue-vite-standard`，库包不自动推荐业务 Manifest | 否 |
| bulldog | `single-project` | 1 | React + Webpack / CRA 类项目 | 推荐 `frontend-react-standard` | 已修复 |
| trace | `multi-project-workspace` | 2 | React Vite 前端 + NestJS 后端 | 前端推荐 `frontend-react-vite-standard`，后端推荐 `backend-node-nestjs-standard` | 已修复 |
| asset-cube-workspace | `multi-project-workspace` | 2 | Java 后端 + Vue Vite 前端 | 后端推荐 `backend-java-springcloud-standard`，前端推荐 `frontend-vue-vite-standard` | 否 |

## 项目明细

### 1. asset-cube

路径：`/Users/lizhenwei/workspace/javaworkspace/asset-cube`

`scan --explain` 结果：

- 工作区类型：`maven-multi-module`
- 包管理器：`maven`
- 包数量：7
- `asset-cube-auth`：primary 为 `SpringMvcDetector`，framework 为 `spring-mvc`，confidence 为 90。
- 其他 6 个模块主要识别为 `SpringBootDetector`，confidence 为 85。
- 部分模块保留 `SpringCloudDetector`、`SpringMvcDetector` 作为 candidates。

`scan --json` 核心摘要：

```json
{
  "workspace": {
    "type": "maven-multi-module",
    "packageManager": "maven"
  },
  "packages": [
    { "path": "asset-cube-auth", "primary": "spring-mvc", "confidence": 90 },
    { "path": "asset-cube-common", "primary": "spring-boot", "confidence": 85 },
    { "path": "asset-cube-web", "primary": "spring-boot", "confidence": 85 },
    { "path": "asset-cube-dispose-web", "primary": "spring-boot", "confidence": 85 },
    { "path": "asset-cube-alarm", "primary": "spring-boot", "confidence": 85 },
    { "path": "asset-cube-manage-web", "primary": "spring-boot", "confidence": 85 },
    { "path": "asset-cube-document-classify-web", "primary": "spring-boot", "confidence": 85 }
  ]
}
```

`init --recommend --dry-run` 结果：

- `asset-cube-auth` 推荐 `backend-java-springmvc-legacy-standard`。
- 其他 Spring Boot 模块推荐 `backend-java-springboot-standard`。
- 只输出将要写入的文件清单，未写入。

结论：符合预期。

### 2. asset-cube-html

路径：`/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-html`

`scan --explain` 结果：

- 工作区类型：`pnpm-workspace`
- 包管理器：`pnpm`
- 包数量：2
- `packages/de`：`vue-vite`，confidence 95。
- `packages/i18n`：`vue-vite`，confidence 85。

`scan --json` 核心摘要：

```json
{
  "workspace": {
    "type": "pnpm-workspace",
    "packageManager": "pnpm"
  },
  "packages": [
    { "path": "packages/de", "primary": "vue-vite", "confidence": 95 },
    { "path": "packages/i18n", "primary": "vue-vite", "confidence": 85 }
  ]
}
```

`init --recommend --dry-run` 结果：

- `packages/de` 被识别为 `application`，推荐 `frontend-vue-vite-standard`。
- `packages/i18n` 被识别为 `library`，不自动推荐前端业务 Manifest。
- 只输出将要写入的文件清单，未写入。

结论：符合预期。库包不自动安装业务 Manifest 的门禁有效。

### 3. bulldog

路径：`/Users/lizhenwei/workspace/reactworkspace/tian-zhi/bulldog`

首次验证结果：

- `scan` 未识别 primary。
- 原因：项目是 React + Webpack / CRA 类结构，已有 detector 只覆盖 React Vite。

已在 `br-ai-spec` 内做最小修复：

- 新增 `ReactWebpackDetector`。
- FactExtractor 增加 `src/index.tsx`、`src/index.jsx`、`config/webpack.config.js`、`webpack.config.js` 关键路径。
- Manifest 推荐规则增加 `react-webpack -> frontend-react-standard`。

修复后 `scan --explain` 结果：

- 工作区类型：`single-project`
- 包管理器：`npm`
- 包数量：1
- primary：`ReactWebpackDetector`
- framework：`react-webpack`
- buildTool：`Webpack`
- confidence：100

`scan --json` 核心摘要：

```json
{
  "workspace": {
    "type": "single-project",
    "packageManager": "npm"
  },
  "packages": [
    {
      "path": ".",
      "primary": "react-webpack",
      "detector": "ReactWebpackDetector",
      "confidence": 100,
      "recommendedManifest": "frontend-react-standard"
    }
  ]
}
```

`init --recommend --dry-run` 结果：

- 项目类型：`application`
- 推荐 `frontend-react-standard`
- 只输出将要写入的文件清单，未写入。

结论：误判/漏判已修复。

### 4. trace

路径：`/Users/lizhenwei/workspace/vueworkspace/bairong/trace`

首次验证结果：

- 前端 `trace-pilot-front` 被识别为 React Vite。
- 后端 `trace-pilot-serve` primary 为 null。
- 根目录被标为 `unknown`，未明确体现多项目工作区。

已在 `br-ai-spec` 内做最小修复：

- 新增 `NestJsDetector`。
- FactExtractor 增加 `nest-cli.json`、`src/app.module.ts` 关键路径。
- BoundaryResolver fallback 多项目目录识别为 `multi-project-workspace`。
- Manifest 推荐规则增加 `nestjs -> backend-node-nestjs-standard`。

修复后 `scan --explain` 结果：

- 工作区类型：`multi-project-workspace`
- 包数量：2
- `trace-pilot-front`：`react-vite`，confidence 95，推荐 `frontend-react-vite-standard`。
- `trace-pilot-serve`：`nestjs`，confidence 100，推荐 `backend-node-nestjs-standard`。

`scan --json` 核心摘要：

```json
{
  "workspace": {
    "type": "multi-project-workspace"
  },
  "packages": [
    { "path": "trace-pilot-front", "primary": "react-vite", "confidence": 95 },
    { "path": "trace-pilot-serve", "primary": "nestjs", "confidence": 100 }
  ]
}
```

`init --recommend --dry-run` 结果：

- `trace-pilot-front` 推荐 `frontend-react-vite-standard`。
- `trace-pilot-serve` 推荐 `backend-node-nestjs-standard`。
- 只输出将要写入的文件清单，未写入。

结论：漏判已修复。

### 5. asset-cube-workspace

路径：`/Users/lizhenwei/workspace/vueworkspace/bairong/asset-cube-workspace`

`scan --explain` 结果：

- 工作区类型：`multi-project-workspace`
- 包数量：2
- `asset-cube`：Java 后端，primary 为 `spring-cloud`，confidence 80；candidate 包含 `spring-boot`，confidence 75。
- `asset-cube-html`：Vue + Vite，confidence 95。

`scan --json` 核心摘要：

```json
{
  "workspace": {
    "type": "multi-project-workspace"
  },
  "packages": [
    { "path": "asset-cube", "primary": "spring-cloud", "confidence": 80 },
    { "path": "asset-cube-html", "primary": "vue-vite", "confidence": 95 }
  ]
}
```

`init --recommend --dry-run` 结果：

- `asset-cube` 推荐 `backend-java-springcloud-standard`。
- `asset-cube-html` 推荐 `frontend-vue-vite-standard`。
- 只输出将要写入的文件清单，未写入。

结论：符合“前后端按 package 分别给出推荐”的要求。

## 新增 Detector

本轮新增：

1. `ReactWebpackDetector`：识别 React + Webpack / CRA 类项目。
2. `NestJsDetector`：识别 NestJS 后端项目。

未新增：

- `NodeBackendDetector`：当前真实项目中 NestJS 已覆盖后端 Node 场景，暂不泛化。
- `JavaMavenDetector`：已有 Spring Boot / Spring MVC / Spring Cloud 对真实 Java 项目覆盖足够。

## Manifest 推荐规则调整

本轮新增映射：

```text
react-webpack -> frontend-react-standard
nestjs -> backend-node-nestjs-standard
```

已有推荐门禁保持不变：

- primary 为 null 时不推荐。
- confidence < 60 时不推荐。
- 60 <= confidence < 80 时要求确认。
- confidence >= 80 时允许自动推荐。
- cli-tool 不自动推荐前端业务 Manifest。

## 风险点

1. `asset-cube` 内部分模块同时命中 Spring Boot / Spring Cloud / Spring MVC，当前按最高分 primary 推荐；后续可引入更细的 Java 项目画像，区分 Web 层、公共库、微服务网关。
2. `asset-cube-workspace/asset-cube` 当前 primary 为 Spring Cloud，Spring Boot 为 candidate；这符合依赖关键词，但未来如果需要按业务运行形态区分，应补更强的 Java detector 优先级策略。
3. `ReactWebpackDetector` 是基础关键词识别，当前适合 CRA / Webpack 项目；未来可细分 CRA、Umi、Webpack 自研脚手架。
4. `NestJsDetector` 只做基础关键词识别，未区分 Express / Fastify adapter，也未做 monorepo Nest package 细分。
5. fallback 多项目工作区目前以“根目录无工程标记且发现多个子项目”为依据，适合真实同目录前后端项目，但后续仍应补更明确的 workspace 类型模型。

## 是否可以进入 Sync / Cache / Check / Guard

可以进入，但建议顺序为：

1. `Sync / Cache`：先定义 Manifest Export mock、cacheKey、cachePath 和 registry.index 更新规则。
2. `Check`：校验 lock、registry、context-index 一致性。
3. `Guard`：加入只读、隐私、错误 Manifest、防误写等保护。

进入前建议补充：

- `backend-node-nestjs-standard`、`frontend-react-standard` 在后续 Hub / Manifest mock 中的结构占位。
- 对 `multi-project-workspace` 的 workspace.json 结构回归测试。
