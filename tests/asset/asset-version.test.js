const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createAssetVersion,
  AssetVersion,
  compareSemver,
  bumpVersion,
} = require('../../src/asset/asset-version');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-version-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ============================================================
// P5.1.2 — 常量与工厂函数
// ============================================================

async function testCreateVersionDefault() {
  const version = createAssetVersion();
  assert(version instanceof AssetVersion);
}

async function testCreateVersionWithStorage() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'versions.ndjson');
    const version = createAssetVersion({ storagePath });
    assert.strictEqual(version.storagePath, storagePath);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.1.2 — create 创建版本
// ============================================================

async function testCreateVersionHappyPath() {
  const version = createAssetVersion();
  const record = version.create('asset-01', {
    version: '1.0.0',
    changelog: '初始版本',
    checksum: 'abc123',
    fileMap: { 'rules/test.md': 'def456' },
    dependencies: ['dep-01'],
    createdBy: 'user-a',
  });
  assert.strictEqual(record.assetId, 'asset-01');
  assert.strictEqual(record.version, '1.0.0');
  assert.strictEqual(record.changelog, '初始版本');
  assert.strictEqual(record.checksum, 'abc123');
  assert.deepStrictEqual(record.fileMap, { 'rules/test.md': 'def456' });
  assert.deepStrictEqual(record.dependencies, ['dep-01']);
  assert.strictEqual(record.createdBy, 'user-a');
  assert(typeof record.versionId === 'string');
  assert(typeof record.createdAt === 'string');
}

async function testCreateVersionDefaults() {
  const version = createAssetVersion();
  const record = version.create('asset-02', { version: '0.1.0' });
  assert.strictEqual(record.changelog, '');
  assert.strictEqual(record.checksum, '');
  assert.deepStrictEqual(record.fileMap, {});
  assert.deepStrictEqual(record.dependencies, []);
  assert.strictEqual(record.createdBy, 'system');
}

async function testCreateVersionMissingAssetId() {
  const version = createAssetVersion();
  try {
    version.create('', { version: '1.0.0' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('assetId'));
  }
}

async function testCreateVersionMissingVersion() {
  const version = createAssetVersion();
  try {
    version.create('asset-01', {});
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('version'));
  }
}

// ============================================================
// P5.1.2 — get / list / latest
// ============================================================

async function testGetVersion() {
  const version = createAssetVersion();
  version.create('a-01', { version: '1.0.0' });
  version.create('a-01', { version: '1.1.0' });
  const rec = version.get('a-01', '1.0.0');
  assert.strictEqual(rec.version, '1.0.0');
}

async function testGetVersionNotFound() {
  const version = createAssetVersion();
  const rec = version.get('nonexistent', '1.0.0');
  assert.strictEqual(rec, null);
}

async function testListVersions() {
  const version = createAssetVersion();
  version.create('a-02', { version: '1.0.0' });
  version.create('a-02', { version: '1.1.0' });
  version.create('a-02', { version: '2.0.0' });
  version.create('a-03', { version: '1.0.0' });
  const list = version.list('a-02');
  assert.strictEqual(list.length, 3);
  assert(list.every(r => r.assetId === 'a-02'));
}

async function testListVersionsEmpty() {
  const version = createAssetVersion();
  const list = version.list('nonexistent');
  assert.deepStrictEqual(list, []);
}

async function testLatestVersion() {
  const version = createAssetVersion();
  version.create('a-04', { version: '1.0.0' });
  version.create('a-04', { version: '2.0.0' });
  version.create('a-04', { version: '1.5.0' });
  const latest = version.latest('a-04');
  assert.strictEqual(latest.version, '2.0.0');
}

async function testLatestVersionEmpty() {
  const version = createAssetVersion();
  const latest = version.latest('nonexistent');
  assert.strictEqual(latest, null);
}

// ============================================================
// P5.1.2 — compareSemver
// ============================================================

async function testCompareSemver() {
  assert.strictEqual(compareSemver('1.0.0', '1.0.0'), 0);
  assert.strictEqual(compareSemver('1.0.0', '1.0.1'), -1);
  assert.strictEqual(compareSemver('1.0.1', '1.0.0'), 1);
  assert.strictEqual(compareSemver('1.0.0', '2.0.0'), -1);
  assert.strictEqual(compareSemver('2.0.0', '1.0.0'), 1);
  assert.strictEqual(compareSemver('1.2.3', '1.3.0'), -1);
  assert.strictEqual(compareSemver('1.3.0', '1.2.3'), 1);
}

async function testCompareSemverInvalid() {
  try {
    compareSemver('1.0', '1.0.0');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('semver'));
  }
}

// ============================================================
// P5.1.2 — bumpVersion
// ============================================================

async function testBumpVersionPatch() {
  assert.strictEqual(bumpVersion('1.2.3', 'patch'), '1.2.4');
}

async function testBumpVersionMinor() {
  assert.strictEqual(bumpVersion('1.2.3', 'minor'), '1.3.0');
}

async function testBumpVersionMajor() {
  assert.strictEqual(bumpVersion('1.2.3', 'major'), '2.0.0');
}

async function testBumpVersionInvalidType() {
  try {
    bumpVersion('1.0.0', 'unknown');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('递增类型'));
  }
}

async function testBumpVersionInvalidSemver() {
  try {
    bumpVersion('1.0', 'patch');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('semver'));
  }
}

// ============================================================
// P5.1.2 — NDJSON 持久化
// ============================================================

async function testPersistenceWriteAndReload() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'versions.ndjson');
    const v1 = createAssetVersion({ storagePath });
    v1.create('p-01', { version: '1.0.0', changelog: 'first' });
    v1.create('p-01', { version: '1.1.0', changelog: 'second' });
    v1.create('p-02', { version: '1.0.0' });

    const v2 = createAssetVersion({ storagePath });
    const list = v2.list('p-01');
    assert.strictEqual(list.length, 2);
    assert.strictEqual(v2.get('p-01', '1.0.0').changelog, 'first');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testPersistenceBadLineTolerance() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'versions.ndjson');
    const goodLine = JSON.stringify({ versionId: 'v-1', assetId: 'bl-01', version: '1.0.0', changelog: '', checksum: '', fileMap: {}, dependencies: [], createdAt: '2026-01-01T00:00:00.000Z', createdBy: 'system' });
    fs.writeFileSync(storagePath, goodLine + '\n{bad json\n' + goodLine.replace('"v-1"', '"v-2"').replace('"1.0.0"', '"1.1.0"') + '\n', 'utf-8');

    const version = createAssetVersion({ storagePath });
    assert.strictEqual(version.list('bl-01').length, 2);
    assert.strictEqual(version.getLoadErrors().length, 1);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.1.2 — 导出
// ============================================================

async function testIndexExports() {
  const mod = require('../../src/asset/asset-version');
  assert(typeof mod.createAssetVersion === 'function');
  assert(typeof mod.AssetVersion === 'function');
  assert(typeof mod.compareSemver === 'function');
  assert(typeof mod.bumpVersion === 'function');
}

// ============================================================
// main
// ============================================================

async function main() {
  // 工厂
  await testCreateVersionDefault();
  await testCreateVersionWithStorage();

  // create
  await testCreateVersionHappyPath();
  await testCreateVersionDefaults();
  await testCreateVersionMissingAssetId();
  await testCreateVersionMissingVersion();

  // get / list / latest
  await testGetVersion();
  await testGetVersionNotFound();
  await testListVersions();
  await testListVersionsEmpty();
  await testLatestVersion();
  await testLatestVersionEmpty();

  // compareSemver
  await testCompareSemver();
  await testCompareSemverInvalid();

  // bumpVersion
  await testBumpVersionPatch();
  await testBumpVersionMinor();
  await testBumpVersionMajor();
  await testBumpVersionInvalidType();
  await testBumpVersionInvalidSemver();

  // 持久化
  await testPersistenceWriteAndReload();
  await testPersistenceBadLineTolerance();

  // 导出
  await testIndexExports();

  console.log('asset-version tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
