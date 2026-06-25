const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');

function createWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
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

function sha256Text(text) {
  return require('../../src/security/checksum').sha256Text(text);
}

function setupProject(root, options = {}) {
  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_test',
  });
  writeJson(path.join(root, '.ai-spec/policy.json'), {
    schemaVersion: '1.0.0',
    privacyPolicy: {
      uploadSourceCode: false,
      uploadRawPrompt: false,
      uploadRawResponse: false,
      uploadFileContent: false,
      uploadAbsolutePath: false,
      uploadUserName: false,
    },
  });
  writeJson(path.join(root, '.ai-spec/context-index.json'), {
    schemaVersion: '1.0.0',
    contextStrategy: 'progressive',
    stageLoadRules: [
      { stage: 'planning' },
      { stage: 'implementation' },
      { stage: 'verification' },
      { stage: 'diagnosing' },
    ],
  });
  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_test',
    hub: { url: '' },
    manifest: {
      slug: 'demo',
      version: '1.0.0',
      checksum: sha256Text('manifest'),
    },
    assets: options.assets || [],
    overlays: [],
    sharedContracts: [],
  });
  writeJson(path.join(root, '.agents/registry.index.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_test',
    source: 'local-init',
    manifest: { slug: 'demo', version: '1.0.0' },
    assets: {
      rules: options.registryRules || [],
      skills: [],
      agentProfiles: [],
    },
  });
}

async function testSyncEmptyAssetsPasses() {
  const root = createWorkspace('ai-spec-sync-empty-');
  const cacheHome = createWorkspace('ai-spec-cache-home-');
  setupProject(root);

  const result = runCli(['sync', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('当前 lock 未包含远程资产，跳过资产同步'), result.stdout);
}

async function testSyncCacheHitDoesNotReadContentUrl() {
  const root = createWorkspace('ai-spec-sync-hit-');
  const cacheHome = createWorkspace('ai-spec-cache-hit-');
  const content = '# cached rule\n';
  const checksum = sha256Text(content);
  const cacheDir = path.join(cacheHome, 'cache/assets', checksum);
  fs.mkdirSync(cacheDir, { recursive: true });
  writeText(path.join(cacheDir, 'content.md'), content);
  writeJson(path.join(cacheDir, 'metadata.json'), { checksum, slug: 'cached-rule' });
  setupProject(root, {
    assets: [{ kind: 'rule', slug: 'cached-rule', version: '1.0.0', checksum, contentUrl: 'file:///missing/content.md' }],
    registryRules: [{ slug: 'cached-rule', version: '1.0.0', checksum, cacheKey: checksum, cachePath: `assets/${checksum}` }],
  });

  const result = runCli(['sync', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('缓存命中：1'), result.stdout);
}

async function testSyncCacheMissWritesCache() {
  const root = createWorkspace('ai-spec-sync-miss-');
  const cacheHome = createWorkspace('ai-spec-cache-miss-');
  const source = createWorkspace('ai-spec-source-');
  const content = '# remote rule\n';
  const checksum = sha256Text(content);
  const sourceFile = path.join(source, 'content.md');
  writeText(sourceFile, content);
  setupProject(root, {
    assets: [{ kind: 'rule', slug: 'remote-rule', version: '1.0.0', checksum, contentUrl: `file://${sourceFile}` }],
    registryRules: [{ slug: 'remote-rule', version: '1.0.0', checksum, cacheKey: checksum, cachePath: `assets/${checksum}` }],
  });

  const result = runCli(['sync', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('已下载：1'), result.stdout);
  assert.strictEqual(fs.readFileSync(path.join(cacheHome, 'cache/assets', checksum, 'content.md'), 'utf8'), content);
  assert.strictEqual(readJson(path.join(cacheHome, 'cache/assets', checksum, 'metadata.json')).checksum, checksum);
}

async function testSyncChecksumMismatchFails() {
  const root = createWorkspace('ai-spec-sync-mismatch-');
  const cacheHome = createWorkspace('ai-spec-cache-mismatch-');
  const source = createWorkspace('ai-spec-source-mismatch-');
  const sourceFile = path.join(source, 'content.md');
  writeText(sourceFile, '# wrong\n');
  setupProject(root, {
    assets: [{ kind: 'rule', slug: 'bad-rule', version: '1.0.0', checksum: sha256Text('# expected\n'), contentUrl: `file://${sourceFile}` }],
    registryRules: [{ slug: 'bad-rule', version: '1.0.0', checksum: sha256Text('# expected\n') }],
  });

  const result = runCli(['sync', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.notStrictEqual(result.status, 0);
  assert((result.stderr + result.stdout).includes('checksum 不一致'));
}

async function main() {
  await testSyncEmptyAssetsPasses();
  await testSyncCacheHitDoesNotReadContentUrl();
  await testSyncCacheMissWritesCache();
  await testSyncChecksumMismatchFails();
  console.log('sync-cache tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
