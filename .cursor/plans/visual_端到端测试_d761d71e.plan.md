---
name: visual 端到端测试
overview: 在 br-ai-spec-visual（Next.js + Docker MariaDB）上跑一次完整的端到端测试：启动数据库与服务 → 用 Collector CLI 采集测试项目 test_副本10 的 .ai-spec/.agents 数据 → 通过 API + 浏览器双重验证控制台能看到该工作区的真实数据。
todos:
  - id: start_db
    content: 运行 ./start-with-db.sh 启动 Docker MariaDB(13306) + visual(18780)，等待健康检查通过
    status: pending
  - id: run_collector
    content: 执行 npm run collector 扶助 --workspace-id=test-project-local 采集 test_副本10，确认 ingest.ok=true、inserted>0
    status: pending
  - id: verify_api
    content: curl 验证 /api/workspaces /api/runs /api/specs 返回真实数据（包含 test-project-local）
    status: pending
  - id: fix_login
    content: 排障登录无反应（DB 连通 → prisma db push → prisma:seed → 看 server action 报错日志），HMR WebSocket 报错忽略
    status: pending
  - id: verify_browser
    content: 浏览器打开 http://localhost:18780，截图 workspace / runs 页面作为验收证据
    status: pending
  - id: summary
    content: 输出端到端测试总结（通过/问题 + 关键证据汇总）
    status: pending
isProject: false
---

## 1. 背景

- **可视化服务**：[br-ai-spec-visual](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec-visual)（Next.js 16 + Prisma + MariaDB on Docker，端口 `18780`，DB 端口 `13306`）。
- **测试项目**：[test_副本10](/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本10)，已具备：
  - `.ai-spec/`（current-run.json、history、repo-map、visual-config 等）
  - `.agents/`（roles / skills / flows / rules / orchestration）
  - `.ai-spec/visual-config.json` → `workspace_id = test-project-local`，`visual_url = http://localhost:18780`
- **采集器**：[src/collector/cli.ts](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec-visual/src/collector/cli.ts) 简化模式（`--workspace-id` + `--server`，无需 token），通过 `npm run collector` 运行。
- **当前状态**：18780 返回 404、13306 无监听、Docker 没有 MariaDB 容器。需要从 0 启动。

## 2. 端到端流程

```mermaid
flowchart LR
  A[启动 Docker MariaDB:13306] --> B[Prisma generate + db push]
  B --> C[启动 visual 服务 :18780]
  C --> D[健康检查 /api/health]
  D --> E[Collector 扫描 test_副本10]
  E --> F[HTTP 上报到 visual /api/internal/raw-events]
  F --> G[API 验证: workspaces / runs / specs]
  G --> H[浏览器打开 18780 截图]
```



## 3. 关键执行命令

启动 DB + 服务（已有现成脚本）：

```bash
cd /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec-visual
./start-with-db.sh        # 后台执行，等待 18780 就绪
curl -s http://localhost:18780/api/health
```

执行 Collector（简化模式 + JSON 输出，便于审计 inserted/skipped）：

```bash
cd /Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec-visual
npm run collector -- \
  --workspace-id test-project-local \
  --project "/Users/lizhenwei/workspace/test/test-ai-spec/prd-to-delivery-local-first-060/test_副本10" \
  --server http://localhost:18780 \
  --json
```

API 验证（至少这三条，根据返回字段确认非空）：

```bash
curl -s -H "X-Workspace-ID: test-project-local" http://localhost:18780/api/workspaces
curl -s -H "X-Workspace-ID: test-project-local" http://localhost:18780/api/runs
curl -s -H "X-Workspace-ID: test-project-local" http://localhost:18780/api/specs
```

## 4. 预期成功标志

- `start-with-db.sh` 输出 `Server listening at http://0.0.0.0:18780`
- `/api/health` 返回 `{"ok":true}`
- Collector JSON 中 `ingest.ok === true` 且 `inserted > 0`
- API 返回包含 `workspace_id="test-project-local"` 的真实数据（非空数组/对象）
- 浏览器在 `http://localhost:18780` 能看到 workspace 列表 / runs 列表，截图保存

## 4.1 已知噪音 / 登录排障（新增）

### A. webpack-hmr WebSocket 报错 → 忽略

[server.mjs](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec-visual/server.mjs) 第 19-40 行用 `app.getUpgradeHandler()` 兜底 Next 的 HMR upgrade，在 Next 16 自定义 server 下握手不稳定，浏览器会刷红 `ws://localhost:18780/_next/webpack-hmr` 报错。

- 这不是业务 WebSocket（业务走 `/ws`，见 [ws-server.ts:258](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec-visual/src/server/ws-server.ts)）
- 不影响登录、API、Collector
- 想彻底消掉：跑生产模式 `npm run build && npm start`
- 用户**不需要**自己起 WebSocket 服务，`server.mjs` 已经把 ws-server 内嵌进同一进程

### B. "登录无反应" 排障顺序

登录走 Server Action [login/actions.ts](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec-visual/src/app/login/actions.ts) `loginAction` → `loginWithCredentials`，与 WebSocket 无关。按以下顺序排查：

1. **数据库连通**：`docker compose -f docker-compose-db-only.yml ps` 确认 mariadb 在跑、`13306` 监听
2. **Prisma 表已建**：`pnpm prisma db push --config prisma/prisma.config.ts`（schema 同步到 DB）
3. **种子用户存在**：`pnpm prisma:seed` 跑一次，拿 [src/lib/auth/local-accounts.ts](/Users/lizhenwei/workspace/vueworkspace/bairong/br-ai-spec-visual/src/lib/auth/local-accounts.ts) 里的演示账号登录
4. **看终端日志**：登录提交时 `node server.mjs` 进程会打印 server action 报错（DB 连不上 / bcrypt 报错等）
5. **抓接口**：DevTools Network → 找到 server action POST（同 URL，header `Next-Action`），看返回体是否带错误

### C. 跳过登录直接验数据（备选）

Collector 上报路径 `/api/internal/raw-events` 用 `X-Workspace-ID` header，不需要登录，所以即便登录有问题也能完成"采集 → 数据落库 → API 读出"这条主链。浏览器截图这一步等登录修好后再做。

## 5. 主要风险与回退

- **Schema 验证错误（已知）**：`README-FINAL.md` 提示 SQLite 不兼容；现已切到 MariaDB，`start-with-db.sh` 会执行 `prisma generate/db push`，若失败回退到 `pnpm prisma db push --accept-data-loss`。
- **端口占用**：先 `lsof -i :18780 / :13306` 检查；如冲突，先 `docker compose -f docker-compose-db-only.yml down`、kill 占用进程。
- **Collector 上报 401/404**：检查 `/api/internal/raw-events` 是否存在 + `X-Workspace-ID` header（`http-transport.ts` 已实现）。
- **登录/鉴权拦截 API**：visual 有 `(protected)` 路由组；API 验证优先用 `/api/internal/`* 或带 `X-Workspace-ID` 头；浏览器若需登录，使用 `prisma/seed.ts` 种子账号。

## 6. 交付物

- 终端输出：DB 启动日志、服务启动日志、健康检查结果
- Collector JSON 结果（含 `inserted/skipped/total`）
- 三条 API 的 JSON 返回片段
- 浏览器截图（首页 + workspace/runs 详情页）
- 一段简短的"端到端测试通过/失败"总结

