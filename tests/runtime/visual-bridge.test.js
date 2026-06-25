const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');

const visualBridge = require('../../bin/visual-bridge');

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

async function main() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-visual-bridge-'));
  const runStatePath = path.join(targetDir, '.ai-spec', 'current-run.json');
  const bridgePath = path.join(targetDir, '.ai-spec', 'visual-bridge.json');

  writeJson(runStatePath, {
    run_id: 'run_20260420_demo',
    status: 'running',
    task: {
      change_id: 'demo-change',
    },
    flow: {
      id: 'prd-to-delivery',
      name: 'PRD 到交付',
    },
    timestamps: {
      updated_at: '2026-04-20T12:05:00.000Z',
    },
  });

  const server = await withServer((req, res) => {
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ ok: true }));
  });

  writeJson(bridgePath, {
    enabled: true,
    workspace_id: 'workspace-demo',
    agent_id: 'ai-spec-auto-demo',
    connect_token: 'bridge-token',
    server_url: server.baseUrl,
  });

  const config = visualBridge.loadVisualBridgeConfig(targetDir);
  assert.strictEqual(config.enabled, true);
  assert.strictEqual(config.workspace_id, 'workspace-demo');

  const result = await visualBridge.pushRunStateUpdate({
    targetDir,
    eventName: 'handoff',
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(server.received.length, 1);
  assert.strictEqual(server.received[0].url, '/api/internal/ingest/run-state');
  assert.strictEqual(server.received[0].body.workspace_id, 'workspace-demo');
  assert.strictEqual(server.received[0].body.agent_id, 'ai-spec-auto-demo');
  assert.strictEqual(server.received[0].body.source_kind, 'run-state-json');
  assert.strictEqual(server.received[0].body.raw_events.length, 1);
  assert.strictEqual(server.received[0].body.raw_events[0].entityId, 'run_20260420_demo');

  await server.close();
  console.log('visual-bridge test passed: runtime-state can be forwarded to visual platform');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
