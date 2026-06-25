const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');
const { sha256Text } = require('../../src/security/checksum');

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

function setupProject(root, cacheHome, options = {}) {
  const content = options.content || '# rule\n';
  const checksum = options.checksum || sha256Text(content);
  writeJson(path.join(root, '.ai-spec/project.json'), { schemaVersion: '1.0.0', projectId: 'proj_test' });
  writeJson(path.join(root, '.ai-spec/policy.json'), {
    schemaVersion: '1.0.0',
    privacyPolicy: {
      uploadSourceCode: false,
      uploadRawPrompt: false,
      uploadRawResponse: false,
      uploadFileContent: false,
      uploadAbsolutePath: false,
      uploadUserName: false,
      ...(options.privacyPolicy || {}),
    },
  });
  writeJson(path.join(root, '.ai-spec/context-index.json'), {
    schemaVersion: '1.0.0',
    contextStrategy: options.contextStrategy || 'progressive',
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
    manifest: { slug: 'demo', version: '1.0.0', checksum: sha256Text('manifest') },
    assets: options.assets === undefined ? [{ kind: 'rule', slug: 'demo-rule', version: '1.0.0', checksum }] : options.assets,
    overlays: [],
    sharedContracts: [],
  });
  writeJson(path.join(root, '.agents/registry.index.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_test',
    source: 'local-init',
    manifest: { slug: 'demo', version: '1.0.0' },
    assets: {
      rules: options.registryRules === undefined ? [{ slug: 'demo-rule', version: '1.0.0', checksum, cacheKey: checksum, cachePath: `assets/${checksum}` }] : options.registryRules,
      skills: [],
      agentProfiles: [],
    },
  });
  if (options.writeCache !== false) {
    const cacheDir = path.join(cacheHome, 'cache/assets', checksum);
    fs.mkdirSync(cacheDir, { recursive: true });
    writeText(path.join(cacheDir, 'content.md'), content);
    writeJson(path.join(cacheDir, 'metadata.json'), { checksum, slug: 'demo-rule' });
  }
  return { checksum, content };
}

async function testCheckMissingProjectJsonFails() {
  const root = createWorkspace('ai-spec-check-missing-project-');
  const cacheHome = createWorkspace('ai-spec-check-home-');
  setupProject(root, cacheHome);
  fs.unlinkSync(path.join(root, '.ai-spec/project.json'));

  const result = runCli(['check', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.notStrictEqual(result.status, 0);
  assert((result.stderr + result.stdout).includes('缺少 .ai-spec/project.json'));
}

async function testCheckMissingLockFails() {
  const root = createWorkspace('ai-spec-check-missing-lock-');
  const cacheHome = createWorkspace('ai-spec-check-home-lock-');
  setupProject(root, cacheHome);
  fs.unlinkSync(path.join(root, '.ai-spec/ai-spec.lock.json'));

  const result = runCli(['check', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.notStrictEqual(result.status, 0);
  assert((result.stderr + result.stdout).includes('缺少 .ai-spec/ai-spec.lock.json'));
}

async function testCheckPrivacyTrueFails() {
  const root = createWorkspace('ai-spec-check-privacy-');
  const cacheHome = createWorkspace('ai-spec-check-home-privacy-');
  setupProject(root, cacheHome, { privacyPolicy: { uploadSourceCode: true } });

  const result = runCli(['check', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.notStrictEqual(result.status, 0);
  assert((result.stderr + result.stdout).includes('隐私配置违规'));
}

async function testCheckRegistryContentFails() {
  const root = createWorkspace('ai-spec-check-registry-content-');
  const cacheHome = createWorkspace('ai-spec-check-home-content-');
  const content = '# rule\n';
  const checksum = sha256Text(content);
  setupProject(root, cacheHome, {
    content,
    registryRules: [{ slug: 'demo-rule', version: '1.0.0', checksum, content }],
  });

  const result = runCli(['check', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.notStrictEqual(result.status, 0);
  assert((result.stderr + result.stdout).includes('registry.index.json 不允许包含完整 content'));
}

async function testCheckContextStrategyFails() {
  const root = createWorkspace('ai-spec-check-context-');
  const cacheHome = createWorkspace('ai-spec-check-home-context-');
  setupProject(root, cacheHome, { contextStrategy: 'full' });

  const result = runCli(['check', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.notStrictEqual(result.status, 0);
  assert((result.stderr + result.stdout).includes('contextStrategy 必须是 progressive'));
}

async function testCheckCacheMissingWarns() {
  const root = createWorkspace('ai-spec-check-cache-missing-');
  const cacheHome = createWorkspace('ai-spec-check-home-cache-missing-');
  setupProject(root, cacheHome, { writeCache: false });

  const result = runCli(['check', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('缓存缺失'), result.stdout);
  assert(result.stdout.includes('警告：1'), result.stdout);
}

async function testGuardAssetsFailsOnTamper() {
  const root = createWorkspace('ai-spec-guard-tamper-');
  const cacheHome = createWorkspace('ai-spec-guard-home-tamper-');
  const { checksum } = setupProject(root, cacheHome);
  writeText(path.join(cacheHome, 'cache/assets', checksum, 'content.md'), '# tampered\n');

  const result = runCli(['guard', 'assets', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.notStrictEqual(result.status, 0);
  assert((result.stderr + result.stdout).includes('资产完整性检查失败'));
}

async function testGuardAssetsPasses() {
  const root = createWorkspace('ai-spec-guard-pass-');
  const cacheHome = createWorkspace('ai-spec-guard-home-pass-');
  setupProject(root, cacheHome);

  const result = runCli(['guard', 'assets', root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('资产完整性检查通过'), result.stdout);
}

async function testCommandsDoNotModifyBusinessSource() {
  const root = createWorkspace('ai-spec-readonly-source-');
  const cacheHome = createWorkspace('ai-spec-readonly-home-');
  setupProject(root, cacheHome);
  writeText(path.join(root, 'src/app.js'), 'console.log("business");\n');
  const before = fs.readFileSync(path.join(root, 'src/app.js'), 'utf8');

  assert.strictEqual(runCli(['sync', root], { AI_SPEC_AUTO_HOME: cacheHome }).status, 0);
  assert.strictEqual(runCli(['check', root], { AI_SPEC_AUTO_HOME: cacheHome }).status, 0);
  assert.strictEqual(runCli(['guard', 'assets', root], { AI_SPEC_AUTO_HOME: cacheHome }).status, 0);
  assert.strictEqual(fs.readFileSync(path.join(root, 'src/app.js'), 'utf8'), before);
}

async function main() {
  await testCheckMissingProjectJsonFails();
  await testCheckMissingLockFails();
  await testCheckPrivacyTrueFails();
  await testCheckRegistryContentFails();
  await testCheckContextStrategyFails();
  await testCheckCacheMissingWarns();
  await testGuardAssetsFailsOnTamper();
  await testGuardAssetsPasses();
  await testCommandsDoNotModifyBusinessSource();
  console.log('asset-tamper-checker tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
