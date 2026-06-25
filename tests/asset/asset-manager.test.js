const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAssetManager, AssetManager } = require('../../src/asset/asset-manager');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-mgr-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ============================================================
// P5.2 — 工厂函数
// ============================================================

async function testCreateManagerDefault() {
  const mgr = createAssetManager();
  assert(mgr instanceof AssetManager);
}

async function testCreateManagerWithStorage() {
  const tmpDir = createTempDir();
  try {
    const mgr = createAssetManager({ storageDir: tmpDir });
    assert(mgr.registry instanceof require('../../src/asset/asset-registry').AssetRegistry);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.2 — createAsset 创建资产
// ============================================================

async function testCreateAssetHappyPath() {
  const mgr = createAssetManager();
  const result = mgr.createAsset({
    assetId: 'rule-01',
    assetType: 'rule',
    name: '编码规范',
    currentVersion: '1.0.0',
    description: 'TypeScript 编码规范',
    tags: ['coding', 'typescript'],
  });
  assert.strictEqual(result.asset.assetId, 'rule-01');
  assert.strictEqual(result.version.version, '1.0.0');
}

async function testCreateAssetAllTypes() {
  const mgr = createAssetManager();
  const types = ['rule', 'skill', 'agentProfile', 'command', 'hook', 'memory', 'config', 'adapter', 'other'];
  for (const t of types) {
    const result = mgr.createAsset({ assetId: `asset-${t}`, assetType: t, name: `test ${t}`, currentVersion: '1.0.0' });
    assert.strictEqual(result.asset.assetType, t);
  }
  assert.strictEqual(mgr.registry.size, types.length);
}

async function testCreateAssetInvalidType() {
  const mgr = createAssetManager();
  try {
    mgr.createAsset({ assetId: 'x', assetType: 'invalid', name: 'test', currentVersion: '1.0.0' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('assetType'));
  }
}

async function testCreateAssetMissingFields() {
  const mgr = createAssetManager();
  try {
    mgr.createAsset({ assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('assetId'));
  }
}

async function testCreateAssetDuplicate() {
  const mgr = createAssetManager();
  mgr.createAsset({ assetId: 'dup-01', assetType: 'rule', name: 'first', currentVersion: '1.0.0' });
  try {
    mgr.createAsset({ assetId: 'dup-01', assetType: 'skill', name: 'second', currentVersion: '1.0.0' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('已存在'));
  }
}

// ============================================================
// P5.2 — editAsset / getAsset / listAssets
// ============================================================

async function testEditAsset() {
  const mgr = createAssetManager();
  mgr.createAsset({ assetId: 'e-01', assetType: 'rule', name: 'old', currentVersion: '1.0.0' });
  const updated = mgr.editAsset('e-01', { name: 'new name', description: 'updated' });
  assert.strictEqual(updated.name, 'new name');
  assert.strictEqual(updated.description, 'updated');
}

async function testEditAssetNotFound() {
  const mgr = createAssetManager();
  try {
    mgr.editAsset('nonexistent', { name: 'x' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

async function testGetAsset() {
  const mgr = createAssetManager();
  mgr.createAsset({ assetId: 'g-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  const asset = mgr.getAsset('g-01');
  assert.strictEqual(asset.assetId, 'g-01');
}

async function testGetAssetNotFound() {
  const mgr = createAssetManager();
  const asset = mgr.getAsset('nonexistent');
  assert.strictEqual(asset, null);
}

async function testListAssets() {
  const mgr = createAssetManager();
  mgr.createAsset({ assetId: 'l-01', assetType: 'rule', name: 'rule', currentVersion: '1.0.0' });
  mgr.createAsset({ assetId: 'l-02', assetType: 'skill', name: 'skill', currentVersion: '1.0.0' });
  const list = mgr.listAssets();
  assert.strictEqual(list.length, 2);
}

async function testListAssetsFilterByType() {
  const mgr = createAssetManager();
  mgr.createAsset({ assetId: 'lf-01', assetType: 'rule', name: 'rule', currentVersion: '1.0.0' });
  mgr.createAsset({ assetId: 'lf-02', assetType: 'skill', name: 'skill', currentVersion: '1.0.0' });
  mgr.createAsset({ assetId: 'lf-03', assetType: 'rule', name: 'rule2', currentVersion: '1.0.0' });
  const list = mgr.listAssets({ assetType: 'rule' });
  assert.strictEqual(list.length, 2);
}

// ============================================================
// P5.2 — createVersion 版本快照
// ============================================================

async function testCreateVersion() {
  const mgr = createAssetManager();
  mgr.createAsset({ assetId: 'v-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  const ver = mgr.createVersion('v-01', { version: '1.1.0', changelog: '新增规则' });
  assert.strictEqual(ver.assetId, 'v-01');
  assert.strictEqual(ver.version, '1.1.0');
  assert.strictEqual(ver.changelog, '新增规则');
}

async function testCreateVersionUpdatesCurrentVersion() {
  const mgr = createAssetManager();
  mgr.createAsset({ assetId: 'v-02', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  mgr.createVersion('v-02', { version: '2.0.0' });
  const asset = mgr.getAsset('v-02');
  assert.strictEqual(asset.currentVersion, '2.0.0');
}

async function testCreateVersionNotFound() {
  const mgr = createAssetManager();
  try {
    mgr.createVersion('nonexistent', { version: '1.0.0' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

// ============================================================
// P5.2 — declareDependency 依赖声明
// ============================================================

async function testDeclareDependency() {
  const mgr = createAssetManager();
  mgr.createAsset({ assetId: 'd-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  mgr.createAsset({ assetId: 'd-02', assetType: 'skill', name: 'dep', currentVersion: '1.0.0' });
  const dep = mgr.declareDependency('d-01', 'd-02', '^1.0.0');
  assert.strictEqual(dep.assetId, 'd-01');
  assert.strictEqual(dep.dependsOn, 'd-02');
}

async function testDeclareDependencyAssetNotFound() {
  const mgr = createAssetManager();
  try {
    mgr.declareDependency('nonexistent', 'other');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

// ============================================================
// P5.2 — getAssetWithDeps 资产详情含依赖
// ============================================================

async function testGetAssetWithDeps() {
  const mgr = createAssetManager();
  mgr.createAsset({ assetId: 'wd-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  mgr.createAsset({ assetId: 'wd-02', assetType: 'skill', name: 'dep1', currentVersion: '1.0.0' });
  mgr.createAsset({ assetId: 'wd-03', assetType: 'skill', name: 'dep2', currentVersion: '1.0.0' });
  mgr.declareDependency('wd-01', 'wd-02', '^1.0.0');
  mgr.declareDependency('wd-01', 'wd-03', '>=2.0.0');

  const detail = mgr.getAssetWithDeps('wd-01');
  assert.strictEqual(detail.asset.assetId, 'wd-01');
  assert.strictEqual(detail.dependencies.length, 2);
  assert(detail.dependencies.some(d => d.dependsOn === 'wd-02'));
  assert(detail.dependencies.some(d => d.dependsOn === 'wd-03'));
  assert(Array.isArray(detail.versions));
}

async function testGetAssetWithDepsNotFound() {
  const mgr = createAssetManager();
  try {
    mgr.getAssetWithDeps('nonexistent');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

// ============================================================
// P5.2 — NDJSON 持久化
// ============================================================

async function testPersistenceWriteAndReload() {
  const tmpDir = createTempDir();
  try {
    const mgr1 = createAssetManager({ storageDir: tmpDir });
    mgr1.createAsset({ assetId: 'p-01', assetType: 'rule', name: 'persisted', currentVersion: '1.0.0' });
    mgr1.createVersion('p-01', { version: '1.1.0', changelog: 'update' });

    const mgr2 = createAssetManager({ storageDir: tmpDir });
    const asset = mgr2.getAsset('p-01');
    assert.strictEqual(asset.name, 'persisted');
    assert.strictEqual(asset.currentVersion, '1.1.0');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.2 — 导出
// ============================================================

async function testIndexExports() {
  const mod = require('../../src/asset/asset-manager');
  assert(typeof mod.createAssetManager === 'function');
  assert(typeof mod.AssetManager === 'function');
}

// ============================================================
// main
// ============================================================

async function main() {
  // 工厂
  await testCreateManagerDefault();
  await testCreateManagerWithStorage();

  // createAsset
  await testCreateAssetHappyPath();
  await testCreateAssetAllTypes();
  await testCreateAssetInvalidType();
  await testCreateAssetMissingFields();
  await testCreateAssetDuplicate();

  // editAsset / getAsset / listAssets
  await testEditAsset();
  await testEditAssetNotFound();
  await testGetAsset();
  await testGetAssetNotFound();
  await testListAssets();
  await testListAssetsFilterByType();

  // createVersion
  await testCreateVersion();
  await testCreateVersionUpdatesCurrentVersion();
  await testCreateVersionNotFound();

  // declareDependency
  await testDeclareDependency();
  await testDeclareDependencyAssetNotFound();

  // getAssetWithDeps
  await testGetAssetWithDeps();
  await testGetAssetWithDepsNotFound();

  // 持久化
  await testPersistenceWriteAndReload();

  // 导出
  await testIndexExports();

  console.log('asset-manager tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
