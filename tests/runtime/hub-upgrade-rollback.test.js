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

function writeFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath, value) {
  writeFile(filePath, `${JSON.stringify(value, null, 2)}\n`);
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
              { kind: 'skill', assetId: 'execute-task', version: '1.0.1', required: true, checksum: sha256Text('# next\n'), installPath: '.agents/skills/execute-task/SKILL.md', contentUrl: `http://127.0.0.1:${server.address().port}/assets/execute-task`, riskLevel: 'L0' },
            ],
          },
        }));
        return;
      }
      if (req.url === '/assets/execute-task') {
        res.end('# next\n');
        return;
      }
      if (req.url === '/api/hub/install/report') {
        res.setHeader('content-type', 'application/json');
        res.end(JSON.stringify({ success: true, code: 'OK', data: {} }));
        return;
      }
      res.statusCode = 404;
      res.end('missing');
    });
    server.listen(0, () => resolve({ server, origin: `http://127.0.0.1:${server.address().port}` }));
  });
}

async function main() {
  const target = workspace('ai-spec-hub-upgrade-');
  writeFile(path.join(target, '.agents/skills/execute-task/SKILL.md'), '# old\n');
  writeJson(path.join(target, 'hub-lock.json'), {
    hub: 'http://127.0.0.1:1',
    manifestId: 'enterprise-react-standard',
    manifestVersion: '1.0.0',
    manifestChecksum: 'manifest-old',
    installedAt: '2026-04-24T00:00:00.000Z',
    mode: 'install',
    assets: [
      { kind: 'skill', assetId: 'execute-task', version: '1.0.0', checksum: sha256Text('# old\n'), installPath: '.agents/skills/execute-task/SKILL.md' },
    ],
  });

  const hub = await startHub();
  let result = await runCli(['hub', 'upgrade', target, '--hub-origin', hub.origin, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(target, '.agents/skills/execute-task/SKILL.md'), 'utf8'), '# next\n');

  result = await runCli(['hub', 'rollback', target, '--json']);
  assert.equal(result.status, 0, result.stderr);
  assert.equal(fs.readFileSync(path.join(target, '.agents/skills/execute-task/SKILL.md'), 'utf8'), '# old\n');
  hub.server.close();
  console.log('hub-upgrade-rollback test passed: upgrade 会备份，rollback 可恢复旧文件');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
