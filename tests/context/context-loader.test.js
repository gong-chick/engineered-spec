const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ContextLoader } = require('../../src/context/context-loader');
const { sha256Text } = require('../../src/security/checksum');

function createWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function createLoader(cacheHome) {
  return new ContextLoader({ rootDir: cacheHome });
}

function writeCachedAsset(cacheHome, checksum, content, kind = 'asset') {
  const dir = kind === 'agent-profile'
    ? path.join(cacheHome, 'cache/agent-profiles', checksum)
    : path.join(cacheHome, 'cache/assets', checksum);
  writeText(path.join(dir, 'content.md'), content);
}

function testRegistryContentFieldFails() {
  const loader = createLoader(createWorkspace('ai-spec-context-loader-content-'));
  assert.throws(() => loader.loadAssets([
    {
      kind: 'rule',
      slug: 'bad-rule',
      version: '1.0.0',
      checksum: sha256Text('bad'),
      content: '不允许出现在 registry 中',
      required: true,
    },
  ]), /registry\.index\.json 不允许包含完整 content/);
}

function testMissingRequiredCacheFails() {
  const loader = createLoader(createWorkspace('ai-spec-context-loader-missing-required-'));
  assert.throws(() => loader.loadAssets([
    {
      kind: 'rule',
      slug: 'missing-rule',
      version: '1.0.0',
      checksum: sha256Text('missing'),
      required: true,
    },
  ]), /必需资产缓存缺失/);
}

function testMissingOptionalCacheWarns() {
  const loader = createLoader(createWorkspace('ai-spec-context-loader-missing-optional-'));
  const result = loader.loadAssets([
    {
      kind: 'skill',
      slug: 'optional-skill',
      version: '1.0.0',
      checksum: sha256Text('missing'),
      required: false,
    },
  ]);

  assert.strictEqual(result.loadedAssets.length, 0);
  assert.strictEqual(result.errors.length, 0);
  assert(result.warnings.some((item) => item.message.includes('可选资产缓存缺失')));
}

function testChecksumMismatchFails() {
  const cacheHome = createWorkspace('ai-spec-context-loader-mismatch-');
  const checksum = sha256Text('expected');
  writeCachedAsset(cacheHome, checksum, 'actual');

  const loader = createLoader(cacheHome);
  assert.throws(() => loader.loadAssets([
    {
      kind: 'rule',
      slug: 'mismatch-rule',
      version: '1.0.0',
      checksum,
      required: true,
    },
  ]), /checksum 不一致/);
}

function testLoadsAssetFromGlobalCache() {
  const cacheHome = createWorkspace('ai-spec-context-loader-success-');
  const content = '# 规则正文\n';
  const checksum = sha256Text(content);
  writeCachedAsset(cacheHome, checksum, content);

  const result = createLoader(cacheHome).loadAssets([
    {
      kind: 'rule',
      slug: 'demo-rule',
      version: '1.0.0',
      checksum,
      required: true,
    },
  ]);

  assert.strictEqual(result.errors.length, 0);
  assert.strictEqual(result.loadedAssets.length, 1);
  assert.strictEqual(result.loadedAssets[0].content, content);
  assert.strictEqual(result.loadedAssets[0].source, 'global-cache');
  assert(result.loadedAssets[0].tokenEstimate > 0);
  assert(!JSON.stringify(result.loadedAssets[0]).includes(cacheHome));
}

function testLoadsAgentProfileFromAgentProfileCache() {
  const cacheHome = createWorkspace('ai-spec-context-loader-agent-');
  const content = '# 诊断专家\n';
  const checksum = sha256Text(content);
  writeCachedAsset(cacheHome, checksum, content, 'agent-profile');

  const result = createLoader(cacheHome).loadAssets([
    {
      kind: 'agent-profile',
      slug: 'diagnostic-agent',
      version: '1.0.0',
      checksum,
      required: true,
    },
  ]);

  assert.strictEqual(result.loadedAssets.length, 1);
  assert.strictEqual(result.loadedAssets[0].kind, 'agent-profile');
  assert.strictEqual(result.loadedAssets[0].content, content);
}

function testLoadsAgentProfileFromLegacyCache() {
  const cacheHome = createWorkspace('ai-spec-context-loader-agent-legacy-');
  const content = '{\n  "slug": "legacy-agent"\n}\n';
  const checksum = sha256Text(content);
  writeText(path.join(cacheHome, 'cache/agent-profiles/legacy-agent@1.0.0.json'), content);

  const result = createLoader(cacheHome).loadAssets([
    {
      kind: 'agent-profile',
      slug: 'legacy-agent',
      version: '1.0.0',
      checksum,
      required: true,
    },
  ]);

  assert.strictEqual(result.loadedAssets.length, 1);
  assert.strictEqual(result.loadedAssets[0].content, content);
}

function main() {
  testRegistryContentFieldFails();
  testMissingRequiredCacheFails();
  testMissingOptionalCacheWarns();
  testChecksumMismatchFails();
  testLoadsAssetFromGlobalCache();
  testLoadsAgentProfileFromAgentProfileCache();
  testLoadsAgentProfileFromLegacyCache();
  console.log('context-loader tests passed');
}

main();
