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

function manifest(origin, overrides = {}) {
  return {
    success: true,
    code: 'OK',
    message: '操作成功',
    requestId: 'req-test',
    data: {
      contractVersion: '1.0.0',
      manifest: {
        id: 'enterprise-react-standard',
        name: 'enterprise-react-standard',
        displayName: '企业级 React 标准研发方案包',
        description: '测试方案包',
        version: '1.0.0',
        techStacks: ['react'],
        ides: ['cursor'],
        scenarios: ['new-feature'],
        compatibility: { minCliVersion: '0.1.11' },
      },
      version: '1.0.0',
      checksum: 'manifest-checksum',
      installPolicy: { mode: 'standard' },
      assets: [
        {
          kind: 'skill',
          assetId: 'execute-task',
          version: '1.0.0',
          required: true,
          installPath: '.agents/skills/execute-task/SKILL.md',
          checksum: '5f1c73d8aefdf0e05d9235581867ddc76dcf6820202c44952c8b746d1e73b256',
          contentUrl: `${origin}/assets/execute-task`,
          riskLevel: 'L1',
        },
      ],
      ...overrides,
    },
  };
}

function startHub(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.listen(0, () => {
      const address = server.address();
      resolve({ server, origin: `http://127.0.0.1:${address.port}` });
    });
  });
}

async function main() {
  const target = workspace('ai-spec-hub-install-');
  let installReported = false;
  const hub = await startHub((req, res) => {
    if (req.url.startsWith('/api/hub/manifests/enterprise-react-standard/export')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(manifest(`http://${req.headers.host}`)));
      return;
    }
    if (req.url === '/assets/execute-task') {
      res.end('# execute-task\n');
      return;
    }
    if (req.url === '/api/hub/install/report') {
      installReported = true;
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify({ success: true, code: 'OK', data: { id: 'record-1' } }));
      return;
    }
    res.statusCode = 404;
    res.end('missing');
  });

  let result = await runCli(['hub', 'install', 'enterprise-react-standard', target, '--hub-origin', hub.origin, '--dry-run', '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(path.join(target, 'hub-lock.json')), 'dry-run 不应写锁文件');

  result = await runCli(['hub', 'install', 'enterprise-react-standard', target, '--hub-origin', hub.origin, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(path.join(target, 'hub-lock.json')));
  assert.ok(fs.existsSync(path.join(target, '.agents/registry/hub-lock.json')));
  assert.ok(fs.existsSync(path.join(target, '.agents/skills/execute-task/SKILL.md')));
  assert.equal(JSON.parse(fs.readFileSync(path.join(target, '.agents/registry/hub-lock.json'), 'utf8')).manifest.slug, 'enterprise-react-standard');
  assert.equal(installReported, true);

  hub.server.close();

  const highRisk = await startHub((req, res) => {
    if (req.url.startsWith('/api/hub/manifests/high-risk/export')) {
      res.setHeader('content-type', 'application/json');
      res.end(JSON.stringify(manifest(`http://${req.headers.host}`, {
        contractVersion: '1.0.0',
        manifest: { id: 'high-risk', name: 'high-risk', displayName: '高风险方案包', description: '', version: '1.0.0', techStacks: [], ides: [], scenarios: [], compatibility: { minCliVersion: '0.1.11' } },
        assets: [{ kind: 'skill', assetId: 'danger', version: '1.0.0', required: true, checksum: 'x', riskLevel: 'L3' }],
      })));
      return;
    }
    res.end('{}');
  });
  result = await runCli(['hub', 'install', 'high-risk', workspace('ai-spec-hub-risk-'), '--hub-origin', highRisk.origin]);
  assert.equal(result.status, 1);
  assert.ok(result.stderr.includes('--allow-high-risk'));
  highRisk.server.close();

  console.log('hub-install test passed: dry-run、锁文件、上报和高风险兜底均符合预期');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
