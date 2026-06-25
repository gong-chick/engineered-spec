const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const { sha256Text, safeJsonHash } = require('../../src/security/checksum');

const repoRoot = path.join(__dirname, '..', '..');

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function runCli(args, env = {}) {
  return spawnSync('node', ['./bin/cli.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_SPEC_SKIP_LAUNCHER_SYNC: '1',
      ...env,
    },
  });
}

function runCliAsync(args, env = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', ['./bin/cli.js', ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        AI_SPEC_SKIP_LAUNCHER_SYNC: '1',
        ...env,
      },
    });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString('utf8'); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString('utf8'); });
    child.on('close', (status) => resolve({ status, stdout, stderr }));
  });
}

function createNextProject(prefix) {
  const root = createTempDir(prefix);
  writeJson(path.join(root, 'package.json'), {
    name: 'next-hub-demo',
    dependencies: { next: '^16.0.0', react: '^19.0.0', 'react-dom': '^19.0.0' },
  });
  writeText(path.join(root, 'src/app/layout.tsx'), 'export default function Layout({ children }) { return children; }\n');
  return root;
}

function setupInitializedProject(root, options = {}) {
  writeJson(path.join(root, '.ai-spec/project.json'), { schemaVersion: '1.0.0', projectId: 'proj_hub' });
  writeJson(path.join(root, '.ai-spec/policy.json'), {
    schemaVersion: '1.0.0',
    hub: options.hub || { url: '', enabled: false, fallbackToLocal: true },
    privacyPolicy: {
      uploadSourceCode: false,
      uploadRawPrompt: false,
      uploadRawResponse: false,
      uploadFileContent: false,
      uploadAbsolutePath: false,
    },
  });
  writeJson(path.join(root, '.ai-spec/context-index.json'), {
    schemaVersion: '1.0.0',
    contextStrategy: 'progressive',
    stageLoadRules: [
      { stage: 'planning', loadKinds: ['role', 'flow'], maxAssets: 5 },
      { stage: 'implementation', loadKinds: ['rule', 'skill', 'agent-profile'], maxAssets: 8 },
      { stage: 'verification', loadKinds: ['rule', 'flow'], maxAssets: 6 },
      { stage: 'diagnosing', loadKinds: ['rule', 'skill', 'agent-profile'], maxAssets: 6 },
    ],
  });
  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_hub',
    hub: { url: '' },
    manifest: {
      slug: 'frontend-react-nextjs-standard',
      version: '1.0.0',
      checksum: sha256Text('manifest'),
    },
    assets: [],
    overlays: [],
    sharedContracts: [],
  });
  writeJson(path.join(root, '.agents/registry.index.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_hub',
    source: 'local-init',
    manifest: { slug: 'frontend-react-nextjs-standard', version: '1.0.0' },
    assets: { rules: [], skills: [], agentProfiles: [] },
  });
}

function createHubFixture() {
  const assetContent = '# Hub Rule\n';
  const assetChecksum = sha256Text(assetContent);
  const profileContent = {
    slug: 'diagnostic-agent',
    name: 'Diagnostic Agent',
    defaultExecutor: 'cursor',
    fallbackExecutors: ['claude-code', 'codex'],
    allowedTools: ['read', 'write', 'test'],
    deniedTools: ['upload-source', 'deploy', 'push', 'merge'],
  };
  const profileChecksum = safeJsonHash(profileContent);
  return {
    assetContent,
    assetChecksum,
    profileContent,
    profileChecksum,
    manifestExport: {
      schemaVersion: '1.0.0',
      exportedAt: new Date().toISOString(),
      hub: { url: '', name: 'skill-q-platform' },
      manifest: {
        slug: 'frontend-react-nextjs-standard',
        version: '1.0.0',
        checksum: sha256Text('manifest-export'),
        installPolicy: { defaultExecutor: 'cursor', fallbackExecutors: ['claude-code', 'codex'] },
      },
      assets: [{
        kind: 'rule',
        slug: 'hub-rule',
        name: 'Hub Rule',
        version: '1.0.0',
        checksum: assetChecksum,
        required: true,
        loadWhen: ['implementation'],
        contentUrl: '/api/hub/assets/hub-rule/content?version=1.0.0',
      }],
      agentProfiles: [{
        slug: 'diagnostic-agent',
        version: '1.0.0',
        checksum: profileChecksum,
        contentUrl: '/api/hub/agent-profiles/diagnostic-agent/export?version=1.0.0',
      }],
    },
  };
}

async function startHubServer(options = {}) {
  const fixture = options.fixture || createHubFixture();
  const requests = [];
  const server = http.createServer(async (req, res) => {
    const chunks = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      const bodyText = Buffer.concat(chunks).toString('utf8');
      const body = bodyText ? JSON.parse(bodyText) : null;
      requests.push({ method: req.method, url: req.url, body });
      const send = (status, payload) => {
        res.writeHead(status, { 'content-type': 'application/json' });
        res.end(JSON.stringify(payload));
      };
      if (options.failAll) {
        send(500, { success: false, data: null, error: { code: 'HUB_DOWN', message: 'Hub 不可用', suggestion: '请稍后重试' }, requestId: 'test', timestamp: new Date().toISOString() });
        return;
      }
      if (req.method === 'POST' && req.url === '/api/hub/manifests/recommend') {
        send(200, { success: true, data: { recommendations: [{ packageId: 'root', manifest: { slug: 'frontend-react-nextjs-standard', version: '1.0.0' }, score: 91, reasons: ['Hub 推荐'], requiresConfirmation: false }] }, error: null, requestId: 'test', timestamp: new Date().toISOString() });
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/api/hub/manifests/frontend-react-nextjs-standard/export')) {
        send(200, { success: true, data: fixture.manifestExport, error: null, requestId: 'test', timestamp: new Date().toISOString() });
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/api/hub/assets/hub-rule/content')) {
        send(200, { success: true, data: { slug: 'hub-rule', version: '1.0.0', kind: 'rule', contentFormat: 'markdown', content: options.badChecksum ? '# wrong\n' : fixture.assetContent, checksum: fixture.assetChecksum }, error: null, requestId: 'test', timestamp: new Date().toISOString() });
        return;
      }
      if (req.method === 'GET' && req.url.startsWith('/api/hub/agent-profiles/diagnostic-agent/export')) {
        send(200, { success: true, data: { slug: 'diagnostic-agent', version: '1.0.0', content: fixture.profileContent, checksum: fixture.profileChecksum }, error: null, requestId: 'test', timestamp: new Date().toISOString() });
        return;
      }
      if (req.method === 'POST' && req.url === '/api/hub/install-records') {
        if (options.failInstallRecord) {
          send(500, { success: false, data: null, error: { code: 'INSTALL_FAILED', message: '安装记录失败', suggestion: '忽略并稍后重试' }, requestId: 'test', timestamp: new Date().toISOString() });
          return;
        }
        send(200, { success: true, data: { ok: true }, error: null, requestId: 'test', timestamp: new Date().toISOString() });
        return;
      }
      if (req.method === 'POST' && req.url === '/api/hub/runtime-feedback') {
        send(200, { success: true, data: { ok: true }, error: null, requestId: 'test', timestamp: new Date().toISOString() });
        return;
      }
      send(404, { success: false, data: null, error: { code: 'NOT_FOUND', message: '未找到接口', suggestion: '检查路径' }, requestId: 'test', timestamp: new Date().toISOString() });
    });
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const address = server.address();
  return {
    url: `http://127.0.0.1:${address.port}`,
    fixture,
    requests,
    close: () => new Promise((resolve) => server.close(resolve)),
  };
}

module.exports = {
  createHubFixture,
  createNextProject,
  createTempDir,
  readJson,
  repoRoot,
  runCli,
  runCliAsync,
  setupInitializedProject,
  sha256Text,
  startHubServer,
  writeJson,
  writeText,
};
