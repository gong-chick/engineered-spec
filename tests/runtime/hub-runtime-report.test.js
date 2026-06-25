const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');

function workspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function runCli(args) {
  return new Promise((resolve) => {
    const child = spawn('node', ['./bin/cli.js', ...args], {
      cwd: repoRoot,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (status) => {
      resolve({ status, stdout, stderr });
    });
  });
}

function writeLock(target) {
  const lockPath = path.join(target, '.agents', 'registry', 'hub-lock.json');
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(lockPath, JSON.stringify({
    lockVersion: '1.0.0',
    hub: { baseUrl: 'http://127.0.0.1' },
    manifest: {
      id: 'enterprise-react-standard',
      slug: 'enterprise-react-standard',
      version: '1.0.0',
      checksum: 'manifest-checksum',
    },
    install: { mode: 'standard', installedAt: '2026-04-24T00:00:00.000Z' },
    assets: [
      {
        kind: 'skill',
        assetId: 'execute-task',
        version: '1.0.0',
        checksum: 'asset-checksum',
        installPath: '.agents/skills/execute-task/SKILL.md',
      },
    ],
  }, null, 2));
}

function startHub() {
  return new Promise((resolve) => {
    let reportBody = null;
    const server = http.createServer((req, res) => {
      if (req.url === '/api/hub/runtime/report' && req.method === 'POST') {
        let body = '';
        req.on('data', (chunk) => {
          body += chunk.toString();
        });
        req.on('end', () => {
          reportBody = JSON.parse(body);
          res.setHeader('content-type', 'application/json');
          res.end(JSON.stringify({ success: true, code: 'OK', data: { id: 'runtime-1' } }));
        });
        return;
      }
      res.statusCode = 404;
      res.end('missing');
    });
    server.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
        getReportBody: () => reportBody,
      });
    });
  });
}

async function main() {
  const target = workspace('ai-spec-hub-runtime-');
  writeLock(target);
  const hub = await startHub();

  const result = await runCli([
    'hub',
    'runtime-report',
    target,
    '--hub-origin',
    hub.origin,
    '--run-id',
    'run-100',
    '--stage',
    'test',
    '--status',
    'failed',
    '--duration-ms',
    '1200',
    '--failed-reason',
    '测试缺失',
    '--json',
  ]);

  assert.equal(result.status, 0, result.stderr);
  const stdout = JSON.parse(result.stdout);
  assert.equal(stdout.reported, true);
  assert.equal(stdout.usedAssetCount, 1);
  assert.deepEqual(hub.getReportBody(), {
    projectName: path.basename(target),
    manifestId: 'enterprise-react-standard',
    manifestVersion: '1.0.0',
    runId: 'run-100',
    stage: 'test',
    status: 'failed',
    usedAssets: [{ kind: 'skill', assetId: 'execute-task', version: '1.0.0' }],
    durationMs: 1200,
    failedReason: '测试缺失',
  });

  hub.server.close();
  console.log('hub-runtime-report test passed: hub-lock 资产运行上报符合预期');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
