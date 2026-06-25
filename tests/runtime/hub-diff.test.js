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

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function sha256Text(text) {
  return require('crypto').createHash('sha256').update(text).digest('hex');
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
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function startHub() {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      if (req.url.startsWith('/api/hub/manifests/enterprise-react-standard/export')) {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({
          success: true,
          code: 'OK',
          data: {
            contractVersion: '1.0.0',
            manifest: { id: 'enterprise-react-standard', name: 'enterprise-react-standard', displayName: '企业级 React 标准研发方案包', description: '', version: '1.0.1', techStacks: [], ides: [], scenarios: [], compatibility: { minCliVersion: '0.1.11' } },
            version: '1.0.1',
            checksum: 'manifest-next',
            installPolicy: { mode: 'standard' },
            assets: [
              { kind: 'skill', assetId: 'execute-task', version: '1.0.1', required: true, checksum: 'asset-next', installPath: '.agents/skills/execute-task/SKILL.md', riskLevel: 'L0' },
              { kind: 'rule', assetId: 'api-standard', version: '1.0.0', required: true, checksum: 'rule-a', installPath: '.agents/rules/api-standard.md', riskLevel: 'L0' },
            ],
          },
        }));
        return;
      }
      res.statusCode = 404;
      res.end('missing');
    });
    server.listen(0, () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function main() {
  const target = workspace('ai-spec-hub-diff-');
  fs.mkdirSync(path.join(target, '.agents/skills/execute-task'), { recursive: true });
  fs.writeFileSync(path.join(target, '.agents/skills/execute-task/SKILL.md'), '# old\n', 'utf8');
  writeJson(path.join(target, 'hub-lock.json'), {
    hub: 'http://127.0.0.1:1',
    manifestId: 'enterprise-react-standard',
    manifestVersion: '1.0.0',
    manifestChecksum: 'manifest-old',
    installedAt: '2026-04-24T00:00:00.000Z',
    mode: 'install',
    assets: [
      { kind: 'skill', assetId: 'execute-task', version: '1.0.0', checksum: sha256Text('# old\n'), installPath: '.agents/skills/execute-task/SKILL.md' },
      { kind: 'role', assetId: 'legacy-role', version: '1.0.0', checksum: 'legacy', installPath: '.agents/roles/legacy.md' },
    ],
  });
  const hub = await startHub();
  const result = await runCli(['hub', 'diff', target, '--hub-origin', hub.origin, '--json']);
  assert.equal(result.status, 0, result.stderr);
  const payload = JSON.parse(result.stdout);
  assert.equal(payload.localVersion, '1.0.0');
  assert.equal(payload.remoteVersion, '1.0.1');
  assert.deepEqual(payload.changes.map((item) => item.type).sort(), ['extra', 'missing', 'outdated']);
  fs.writeFileSync(path.join(target, '.agents/skills/execute-task/SKILL.md'), '# local change\n', 'utf8');
  const modifiedResult = await runCli(['hub', 'diff', target, '--hub-origin', hub.origin, '--json']);
  assert.equal(modifiedResult.status, 0, modifiedResult.stderr);
  assert.ok(JSON.parse(modifiedResult.stdout).changes.some((item) => item.type === 'modified'));
  hub.server.close();
  console.log('hub-diff test passed: 能识别缺失、过期、额外和本地修改资产');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
