/**
 * Regression tests for 3 P0 fixes in visual hook / bridge stack.
 *
 * Fix #1 — push-client.js
 *   payload now includes root_path (= process.cwd()) so visual side can
 *   upsert Workspace.rootPath. Without this, the file-inbox fallback for
 *   control-plane downstream commands cannot resolve the local project path.
 *
 * Fix #3 — config-loader.js
 *   visual-hooks loader now also recognizes .ai-spec/visual-bridge.json
 *   (the auto-CLI artifact) and maps server_url → visual_url, so
 *   protocol-step events can push without users hand-crafting a second
 *   visual-config.json.
 *
 * Fix #4 — visual-bridge-config.js buildVisualBridgeState
 *   `update` / `sync` now preserves previousState.server_url /
 *   workspace_id / agent_id when the manifest does not explicitly
 *   provide them, instead of clobbering the user's bridge config to null.
 */

const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const {
  buildVisualBridgeState,
  writeVisualBridgeState,
  readVisualBridgeState,
} = require('../../bin/visual-bridge-config');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

async function withServer(handler) {
  const received = [];
  const server = http.createServer((req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      received.push({
        method: req.method,
        url: req.url,
        headers: req.headers,
        body: chunks.length ? JSON.parse(Buffer.concat(chunks).toString('utf8')) : null,
      });
      handler(req, res);
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    received,
    async close() {
      await new Promise((resolve) => server.close(resolve));
    },
  };
}

function clearRequireCache(rootDir) {
  for (const key of Object.keys(require.cache)) {
    if (key.startsWith(rootDir)) {
      delete require.cache[key];
    }
  }
}

/**
 * Fix #3 — config-loader fallback to visual-bridge.json with field mapping.
 */
async function testConfigLoaderFallback() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-hooks-cfg-'));
  writeJson(path.join(tmpDir, '.ai-spec', 'visual-bridge.json'), {
    schema_version: 1,
    enabled: true,
    server_url: 'http://localhost:18781',
    workspace_id: 'ws-fallback-test',
    agent_id: 'ai-spec-auto',
    connect_token: 'tok-fallback',
  });

  const originalCwd = process.cwd();
  const visualHooksRoot = path.resolve(__dirname, '..', '..', 'internal', 'visual-hooks');
  process.chdir(tmpDir);
  try {
    clearRequireCache(visualHooksRoot);
    // eslint-disable-next-line global-require
    const { loadVisualConfig } = require('../../internal/visual-hooks/config-loader');
    const cfg = loadVisualConfig();
    assert.ok(cfg, 'loadVisualConfig returned null — bridge.json was not picked up');
    assert.strictEqual(cfg.enabled, true, 'enabled should pass through');
    assert.strictEqual(
      cfg.visual_url,
      'http://localhost:18781',
      'server_url should be mapped to visual_url',
    );
    assert.strictEqual(cfg.workspace_id, 'ws-fallback-test');
    assert.strictEqual(cfg.connect_token, 'tok-fallback');
  } finally {
    process.chdir(originalCwd);
  }
  console.log('  ✓ Fix #3: config-loader reads visual-bridge.json and maps server_url → visual_url');
}

/**
 * Fix #3 — explicit visual-config.json still has higher priority (back-compat).
 */
async function testConfigLoaderPriority() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-hooks-prio-'));
  writeJson(path.join(tmpDir, '.ai-spec', 'visual-bridge.json'), {
    enabled: true,
    server_url: 'http://from-bridge:18781',
    workspace_id: 'from-bridge',
  });
  writeJson(path.join(tmpDir, '.ai-spec', 'visual-config.json'), {
    enabled: true,
    visual_url: 'http://from-config:9999',
    workspace_id: 'from-config',
  });

  const originalCwd = process.cwd();
  const visualHooksRoot = path.resolve(__dirname, '..', '..', 'internal', 'visual-hooks');
  process.chdir(tmpDir);
  try {
    clearRequireCache(visualHooksRoot);
    // eslint-disable-next-line global-require
    const { loadVisualConfig } = require('../../internal/visual-hooks/config-loader');
    const cfg = loadVisualConfig();
    assert.ok(cfg);
    assert.strictEqual(
      cfg.visual_url,
      'http://from-config:9999',
      'visual-config.json must take priority over visual-bridge.json (back-compat)',
    );
    assert.strictEqual(cfg.workspace_id, 'from-config');
  } finally {
    process.chdir(originalCwd);
  }
  console.log('  ✓ Fix #3: explicit visual-config.json keeps higher priority over bridge fallback');
}

/**
 * Fix #1 — push-client payload includes root_path = process.cwd().
 *
 * We bypass the hooks index so we don't have to deal with the loader cache;
 * instead we directly drive push-client + a local HTTP recorder.
 */
async function testPushClientIncludesRootPath() {
  const server = await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-hooks-push-'));
  const originalCwd = process.cwd();
  process.chdir(tmpDir);
  try {
    // push-client reads process.cwd() at createPushClient time
    clearRequireCache(path.resolve(__dirname, '..', '..', 'internal', 'visual-hooks'));
    // eslint-disable-next-line global-require
    const { createPushClient } = require('../../internal/visual-hooks/push-client');
    const client = createPushClient({
      visual_url: server.baseUrl,
      workspace_id: 'ws-push-test',
      push_timeout_ms: 3000,
      retry_times: 0,
    });
    await client.push({
      eventType: 'run.started',
      runId: 'run-push-1',
      workspaceId: 'ws-push-test',
      payload: { run_id: 'run-push-1' },
    });
  } finally {
    process.chdir(originalCwd);
  }

  assert.strictEqual(server.received.length, 1, 'expected exactly 1 push request');
  const req = server.received[0];
  assert.strictEqual(req.url, '/api/internal/ingest/raw');
  assert.strictEqual(req.body.workspaceId, 'ws-push-test');
  assert.strictEqual(
    req.body.root_path,
    fs.realpathSync(tmpDir),
    'push payload must include root_path = process.cwd() so visual can upsert Workspace.rootPath',
  );
  assert.ok(Array.isArray(req.body.rawEvents) && req.body.rawEvents.length === 1);
  assert.strictEqual(req.body.rawEvents[0].sourceKind, 'hook-event');
  assert.strictEqual(req.body.rawEvents[0].eventType, 'run.started');

  await server.close();
  console.log('  ✓ Fix #1: push-client payload carries root_path for Workspace.rootPath upsert');
}

/**
 * Full runtime-state push — hooks must be initialized against the target
 * project, not the CLI process cwd, and state_changed must preserve the full
 * runtime-state payload so visual can project RunState + ChangeDocument.
 */
async function testHooksUseTargetDirAndPushFullRuntimeState() {
  const server = await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-hooks-target-'));
  const wrongCwd = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-hooks-wrong-cwd-'));
  writeJson(path.join(targetDir, '.ai-spec', 'visual-bridge.json'), {
    schema_version: 1,
    enabled: true,
    server_url: server.baseUrl,
    workspace_id: 'ws-target-runtime',
    agent_id: 'ai-spec-auto',
    connect_token: 'tok-target-runtime',
  });

  const runtimeState = {
    schema_version: 1,
    kind: 'run-state',
    run_id: 'run_full_runtime',
    status: 'success',
    task: {
      change_id: 'add-login-page',
    },
    artifacts: {
      proposal: 'openspec/changes/add-login-page/proposal.md',
      tasks: 'openspec/changes/add-login-page/tasks.md',
    },
    events: [
      {
        at: '2026-04-22T08:00:00.000Z',
        type: 'run-created',
      },
      {
        at: '2026-04-22T08:05:00.000Z',
        type: 'run-completed',
      },
    ],
    timestamps: {
      updated_at: '2026-04-22T08:05:00.000Z',
    },
  };

  const originalCwd = process.cwd();
  const visualHooksRoot = path.resolve(__dirname, '..', '..', 'internal', 'visual-hooks');
  process.chdir(wrongCwd);
  try {
    clearRequireCache(visualHooksRoot);
    // eslint-disable-next-line global-require
    const { initVisualHooks, resetVisualHooks } = require('../../internal/visual-hooks');
    resetVisualHooks();
    const hooks = initVisualHooks({ targetDir });
    assert.ok(hooks, 'hooks should load visual-bridge.json from targetDir even when cwd differs');
    await hooks.onRunStateChange(runtimeState);
  } finally {
    process.chdir(originalCwd);
  }

  assert.strictEqual(server.received.length, 1, 'expected one state_changed push request');
  const body = server.received[0].body;
  assert.strictEqual(body.workspaceId, 'ws-target-runtime');
  assert.strictEqual(body.root_path, fs.realpathSync(targetDir));
  assert.strictEqual(body.rawEvents[0].eventType, 'run.state_changed');
  assert.deepStrictEqual(
    body.rawEvents[0].payload.task,
    runtimeState.task,
    'full runtime-state task block must be preserved for ChangeDocument projection',
  );
  assert.deepStrictEqual(body.rawEvents[0].payload.artifacts, runtimeState.artifacts);
  assert.strictEqual(body.rawEvents[0].payload.events.length, 2);

  await server.close();
  console.log('  ✓ Full runtime-state push: hooks use targetDir and preserve task/artifacts/events');
}

/**
 * Workflow layer — after protocol advancement/update, the integration must
 * read .ai-spec/current-run.json and push that full snapshot rather than the
 * runner_status summary.
 */
async function testWorkflowPushesCurrentRunSnapshot() {
  const server = await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-workflow-current-run-'));
  const state = {
    schema_version: 1,
    kind: 'run-state',
    run_id: 'run_workflow_snapshot',
    status: 'success',
    task: {
      change_id: 'workflow-login-page',
    },
    artifacts: {
      proposal: 'openspec/changes/workflow-login-page/proposal.md',
      design: 'openspec/changes/workflow-login-page/design.md',
      tasks: 'openspec/changes/workflow-login-page/tasks.md',
    },
    events: [
      {
        at: '2026-04-22T09:00:00.000Z',
        type: 'run-created',
      },
    ],
    timestamps: {
      updated_at: '2026-04-22T09:00:00.000Z',
    },
  };

  writeJson(path.join(targetDir, '.ai-spec', 'visual-bridge.json'), {
    schema_version: 1,
    enabled: true,
    server_url: server.baseUrl,
    workspace_id: 'ws-workflow-current-run',
    agent_id: 'ai-spec-auto',
    connect_token: 'tok-workflow-current-run',
  });
  writeJson(path.join(targetDir, '.ai-spec', 'current-run.json'), state);

  clearRequireCache(path.resolve(__dirname, '..', '..', 'internal', 'visual-hooks'));
  clearRequireCache(path.resolve(__dirname, '..', '..', 'internal', 'ai-protocol-workflow.js'));
  // eslint-disable-next-line global-require
  const workflow = require('../../internal/ai-protocol-workflow');

  assert.ok(
    workflow.__test__?.pushCurrentRuntimeStateToVisual,
    'workflow should expose pushCurrentRuntimeStateToVisual for regression coverage',
  );

  await workflow.__test__.pushCurrentRuntimeStateToVisual(targetDir);

  assert.strictEqual(server.received.length, 1, 'expected workflow to push current-run once');
  const rawEvent = server.received[0].body.rawEvents[0];
  assert.strictEqual(server.received[0].body.workspaceId, 'ws-workflow-current-run');
  assert.strictEqual(rawEvent.eventType, 'run.state_changed');
  assert.strictEqual(rawEvent.payload.run_id, state.run_id);
  assert.strictEqual(rawEvent.payload.status, state.status);
  assert.deepStrictEqual(rawEvent.payload.task, state.task);
  assert.deepStrictEqual(rawEvent.payload.artifacts, state.artifacts);
  assert.deepStrictEqual(rawEvent.payload.events, state.events);
  assert.deepStrictEqual(rawEvent.payload.timestamps, state.timestamps);
  assert.strictEqual(rawEvent.payload.workspace_id, 'ws-workflow-current-run');

  await server.close();
  console.log('  ✓ Workflow push: current-run.json full snapshot is sent to visual');
}

/**
 * Runtime-state pusher — command exits can push the final current-run snapshot
 * after archive/complete writes success state, without changing core runtime
 * behavior.
 */
async function testVisualRuntimeStatePusherSendsTerminalSnapshot() {
  const server = await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-terminal-pusher-'));
  writeJson(path.join(targetDir, '.ai-spec', 'visual-bridge.json'), {
    schema_version: 1,
    enabled: true,
    server_url: server.baseUrl,
    workspace_id: 'ws-terminal-pusher',
    agent_id: 'ai-spec-auto',
    connect_token: 'tok-terminal-pusher',
    push_timeout_ms: 3000,
    retry_times: 0,
  });
  writeJson(path.join(targetDir, '.ai-spec', 'current-run.json'), {
    schema_version: 1,
    kind: 'run-state',
    run_id: 'run_terminal_pusher',
    status: 'success',
    current_role: 'archive-change',
    task: {
      change_id: 'terminal-pusher-change',
    },
    artifacts: {
      proposal: 'openspec/changes/archive/2026-04-22-terminal-pusher-change/proposal.md',
      specs: 'openspec/changes/archive/2026-04-22-terminal-pusher-change/specs',
      design: 'openspec/changes/archive/2026-04-22-terminal-pusher-change/design.md',
      tasks: 'openspec/changes/archive/2026-04-22-terminal-pusher-change/tasks.md',
    },
    events: [
      {
        at: '2026-04-22T09:00:00.000Z',
        type: 'role-handoff',
      },
      {
        at: '2026-04-22T09:10:00.000Z',
        type: 'run-completed',
      },
    ],
    timestamps: {
      updated_at: '2026-04-22T09:10:00.000Z',
      finished_at: '2026-04-22T09:10:00.000Z',
    },
  });

  clearRequireCache(path.resolve(__dirname, '..', '..', 'internal', 'visual-hooks'));
  // eslint-disable-next-line global-require
  const {
    pushVisualRuntimeStateSnapshot,
    pushVisualRuntimeStateSnapshotNow,
    drainVisualRuntimeStatePushes,
  } = require('../../internal/visual-hooks/runtime-state-pusher');

  pushVisualRuntimeStateSnapshot(targetDir);
  await drainVisualRuntimeStatePushes();

  assert.strictEqual(server.received.length, 1, 'expected terminal state pusher to send once');
  const rawEvent = server.received[0].body.rawEvents[0];
  assert.strictEqual(rawEvent.eventType, 'run.state_changed');
  assert.strictEqual(rawEvent.payload.run_id, 'run_terminal_pusher');
  assert.strictEqual(rawEvent.payload.status, 'success');
  assert.strictEqual(rawEvent.payload.current_role, 'archive-change');
  assert.ok(rawEvent.payload.events.some((event) => event.type === 'run-completed'));
  assert.ok(String(rawEvent.payload.artifacts.proposal).includes('openspec/changes/archive/'));
  const pushTrace = fs
    .readFileSync(path.join(targetDir, '.ai-spec', 'internal', 'visual-push.jsonl'), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line))
    .at(-1);
  assert.strictEqual(pushTrace.result, 'pushed');
  assert.strictEqual(pushTrace.run_id, 'run_terminal_pusher');

  await server.close();
  console.log('  ✓ Terminal state push: current-run snapshot is sent to visual');
}

async function testVisualRuntimeStatePusherWritesFailureTrace() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-terminal-failure-'));
  writeJson(path.join(targetDir, '.ai-spec', 'visual-bridge.json'), {
    schema_version: 1,
    enabled: true,
    server_url: 'http://127.0.0.1:1',
    workspace_id: 'ws-terminal-failure',
    agent_id: 'ai-spec-auto',
    connect_token: 'tok-terminal-failure',
    push_timeout_ms: 200,
    retry_times: 0,
  });
  writeJson(path.join(targetDir, '.ai-spec', 'current-run.json'), {
    schema_version: 1,
    kind: 'run-state',
    run_id: 'run_terminal_failure',
    status: 'running',
    current_role: 'frontend-implementer',
    events: [],
    timestamps: {
      updated_at: '2026-04-22T10:00:00.000Z',
    },
  });

  clearRequireCache(path.resolve(__dirname, '..', '..', 'internal', 'visual-hooks'));
  // eslint-disable-next-line global-require
  const { pushVisualRuntimeStateSnapshotNow } = require('../../internal/visual-hooks/runtime-state-pusher');
  const result = await pushVisualRuntimeStateSnapshotNow(targetDir);

  assert.strictEqual(result.pushed, false);
  assert.strictEqual(result.reason, 'request-failed');

  const tracePath = path.join(targetDir, '.ai-spec', 'internal', 'visual-push.jsonl');
  const traces = fs.readFileSync(tracePath, 'utf8').trim().split('\n').map((line) => JSON.parse(line));
  const last = traces.at(-1);
  assert.strictEqual(last.result, 'request-failed');
  assert.strictEqual(last.run_id, 'run_terminal_failure');
  assert.ok(typeof last.error === 'string' && last.error.length > 0);

  console.log('  ✓ Terminal state push failure: visual-push.jsonl records request-failed');
}

/**
 * Fix #4 — buildVisualBridgeState preserves previousState during update/sync.
 */
async function testBuildVisualBridgeStatePreservesPrevious() {
  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-bridge-keep-'));

  const initialState = buildVisualBridgeState({
    targetDir: tmpDir,
    manifestConfig: {
      enabled: true,
      server_url: 'http://localhost:3000',
      workspace_id: 'ws-init',
      agent_id: 'ai-spec-auto',
    },
    cliVersion: 'test-1.0',
    source: 'init',
    previousState: null,
  });
  writeVisualBridgeState(tmpDir, {
    ...initialState,
    connect_token: 'init-token-please-keep-me',
  });

  // Simulate `auto update .` — manifest only carries `enabled`, NOT server_url/workspace_id.
  const previousState = readVisualBridgeState(tmpDir);
  const next = buildVisualBridgeState({
    targetDir: tmpDir,
    manifestConfig: { enabled: true }, // intentionally no server_url / workspace_id
    cliVersion: 'test-1.0',
    source: 'update',
    previousState,
  });

  assert.strictEqual(
    next.server_url,
    'http://localhost:3000',
    'server_url must be preserved across update when manifest does not provide it',
  );
  assert.strictEqual(next.workspace_id, 'ws-init', 'workspace_id must be preserved across update');
  assert.strictEqual(next.agent_id, 'ai-spec-auto', 'agent_id must be preserved across update');
  assert.strictEqual(
    next.connect_token,
    'init-token-please-keep-me',
    'connect_token must be preserved across update',
  );
  assert.strictEqual(next.source, 'update', 'source field correctly reflects update phase');

  console.log('  ✓ Fix #4: buildVisualBridgeState keeps server_url/workspace_id/agent_id/connect_token on update');
}

/**
 * Sanity: when a fresh install passes explicit server_url=null and there is
 * no previousState, the result is null (no implicit defaults leaking).
 */
async function testBuildVisualBridgeStateNoLeak() {
  const next = buildVisualBridgeState({
    targetDir: null,
    manifestConfig: {
      enabled: false,
      server_url: null,
      workspace_id: null,
      agent_id: null,
    },
    cliVersion: 'test-1.0',
    source: 'init',
    previousState: null,
  });
  assert.strictEqual(next.server_url, null, 'no previousState → server_url stays null');
  assert.strictEqual(next.workspace_id, null);
  assert.strictEqual(next.agent_id, 'ai-spec-auto', 'agent_id always falls back to default literal');
  console.log('  ✓ Fix #4 sanity: previousState=null does not invent fake defaults');
}

async function main() {
  console.log('# visual-hooks regression suite (P0 fixes #1 / #3 / #4)');
  await testConfigLoaderFallback();
  await testConfigLoaderPriority();
  await testPushClientIncludesRootPath();
  await testHooksUseTargetDirAndPushFullRuntimeState();
  await testWorkflowPushesCurrentRunSnapshot();
  await testVisualRuntimeStatePusherSendsTerminalSnapshot();
  await testVisualRuntimeStatePusherWritesFailureTrace();
  await testBuildVisualBridgeStatePreservesPrevious();
  await testBuildVisualBridgeStateNoLeak();
  console.log('# all 9 regression checks passed');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
