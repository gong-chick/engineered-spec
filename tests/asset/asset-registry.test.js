const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ASSET_REGISTRY_STATUSES,
  VALID_REGISTRY_STATUSES,
  createAssetRegistry,
  AssetRegistry,
} = require('../../src/asset/asset-registry');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-registry-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ============================================================
// P5.1.1 — 常量与工厂函数
// ============================================================

async function testStatusConstants() {
  assert.strictEqual(ASSET_REGISTRY_STATUSES.ACTIVE, 'active');
  assert.strictEqual(ASSET_REGISTRY_STATUSES.DEPRECATED, 'deprecated');
  assert.strictEqual(ASSET_REGISTRY_STATUSES.ARCHIVED, 'archived');
  assert.strictEqual(VALID_REGISTRY_STATUSES.size, 3);
  assert(VALID_REGISTRY_STATUSES.has('active'));
  assert(VALID_REGISTRY_STATUSES.has('deprecated'));
  assert(VALID_REGISTRY_STATUSES.has('archived'));
}

async function testCreateRegistryDefault() {
  const registry = createAssetRegistry();
  assert(registry instanceof AssetRegistry);
  assert.strictEqual(registry.size, 0);
}

async function testCreateRegistryWithStorage() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'registry.ndjson');
    const registry = createAssetRegistry({ storagePath });
    assert.strictEqual(registry.storagePath, storagePath);
    assert.strictEqual(registry.size, 0);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.1.1 — register 注册
// ============================================================

async function testRegisterHappyPath() {
  const registry = createAssetRegistry();
  const record = registry.register({
    assetId: 'test-rule-01',
    assetType: 'rule',
    name: '测试规则',
    currentVersion: '1.0.0',
  });
  assert.strictEqual(record.assetId, 'test-rule-01');
  assert.strictEqual(record.assetType, 'rule');
  assert.strictEqual(record.name, '测试规则');
  assert.strictEqual(record.currentVersion, '1.0.0');
  assert.strictEqual(record.status, 'active');
  assert.strictEqual(record.source, 'local');
  assert(Array.isArray(record.tags));
  assert.strictEqual(record.description, '');
  assert.strictEqual(record.owner, '');
  assert(typeof record.createdAt === 'string');
  assert(typeof record.updatedAt === 'string');
  assert.deepStrictEqual(record.metadata, {});
  assert.strictEqual(registry.size, 1);
}

async function testRegisterWithFullFields() {
  const registry = createAssetRegistry();
  const record = registry.register({
    assetId: 'skill-01',
    assetType: 'skill',
    name: '测试技能',
    currentVersion: '2.0.0',
    description: '一个测试技能',
    source: 'hub',
    tags: ['test', 'demo'],
    owner: 'team-a',
    metadata: { category: 'testing' },
  });
  assert.strictEqual(record.assetId, 'skill-01');
  assert.strictEqual(record.source, 'hub');
  assert.strictEqual(record.description, '一个测试技能');
  assert.deepStrictEqual(record.tags, ['test', 'demo']);
  assert.strictEqual(record.owner, 'team-a');
  assert.strictEqual(record.metadata.category, 'testing');
}

async function testRegisterMissingRequiredField() {
  const registry = createAssetRegistry();
  try {
    registry.register({ assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('assetId'));
  }
}

async function testRegisterInvalidAssetType() {
  const registry = createAssetRegistry();
  try {
    registry.register({ assetId: 'x', assetType: 'invalid', name: 'test', currentVersion: '1.0.0' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('assetType'));
  }
}

async function testRegisterDuplicateId() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'dup-01', assetType: 'rule', name: 'first', currentVersion: '1.0.0' });
  try {
    registry.register({ assetId: 'dup-01', assetType: 'skill', name: 'second', currentVersion: '2.0.0' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('已存在'));
  }
}

async function testRegisterInvalidStatus() {
  const registry = createAssetRegistry();
  try {
    registry.register({ assetId: 'x', assetType: 'rule', name: 'test', currentVersion: '1.0.0', status: 'unknown' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('status'));
  }
}

// ============================================================
// P5.1.1 — get / unregister
// ============================================================

async function testGetExisting() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'g-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  const record = registry.get('g-01');
  assert.strictEqual(record.assetId, 'g-01');
  assert.strictEqual(record.name, 'test');
}

async function testGetNotFound() {
  const registry = createAssetRegistry();
  const record = registry.get('nonexistent');
  assert.strictEqual(record, null);
}

async function testUnregisterExisting() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'u-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  assert.strictEqual(registry.size, 1);
  const result = registry.unregister('u-01');
  assert.strictEqual(result, true);
  assert.strictEqual(registry.size, 0);
  assert.strictEqual(registry.get('u-01'), null);
}

async function testUnregisterNotFound() {
  const registry = createAssetRegistry();
  try {
    registry.unregister('nonexistent');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

// ============================================================
// P5.1.1 — list 查询
// ============================================================

async function testListAll() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'l-01', assetType: 'rule', name: 'rule A', currentVersion: '1.0.0' });
  registry.register({ assetId: 'l-02', assetType: 'skill', name: 'skill B', currentVersion: '1.0.0' });
  const list = registry.list();
  assert.strictEqual(list.length, 2);
}

async function testListFilterByType() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'lt-01', assetType: 'rule', name: 'rule', currentVersion: '1.0.0' });
  registry.register({ assetId: 'lt-02', assetType: 'skill', name: 'skill', currentVersion: '1.0.0' });
  registry.register({ assetId: 'lt-03', assetType: 'rule', name: 'rule2', currentVersion: '1.0.0' });
  const list = registry.list({ assetType: 'rule' });
  assert.strictEqual(list.length, 2);
  assert(list.every(r => r.assetType === 'rule'));
}

async function testListFilterByStatus() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'ls-01', assetType: 'rule', name: 'active', currentVersion: '1.0.0' });
  registry.register({ assetId: 'ls-02', assetType: 'rule', name: 'deprecated', currentVersion: '1.0.0', status: 'deprecated' });
  const activeList = registry.list({ status: 'active' });
  assert.strictEqual(activeList.length, 1);
  assert.strictEqual(activeList[0].status, 'active');
}

async function testListFilterByKeyword() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'lk-01', assetType: 'rule', name: '编码规范', currentVersion: '1.0.0', description: 'TypeScript 编码规范' });
  registry.register({ assetId: 'lk-02', assetType: 'rule', name: '测试规范', currentVersion: '1.0.0', description: '单元测试规范' });
  registry.register({ assetId: 'lk-03', assetType: 'skill', name: '创建组件', currentVersion: '1.0.0' });
  const list = registry.list({ keyword: '规范' });
  assert.strictEqual(list.length, 2);
}

async function testListFilterBySource() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'lso-01', assetType: 'rule', name: 'local', currentVersion: '1.0.0', source: 'local' });
  registry.register({ assetId: 'lso-02', assetType: 'rule', name: 'hub', currentVersion: '1.0.0', source: 'hub' });
  const list = registry.list({ source: 'hub' });
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].source, 'hub');
}

async function testListWithLimit() {
  const registry = createAssetRegistry();
  for (let i = 0; i < 10; i++) {
    registry.register({ assetId: `ll-${i}`, assetType: 'rule', name: `r${i}`, currentVersion: '1.0.0' });
  }
  const list = registry.list({ limit: 3 });
  assert.strictEqual(list.length, 3);
}

// ============================================================
// P5.1.1 — update 更新
// ============================================================

async function testUpdateHappyPath() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'up-01', assetType: 'rule', name: 'old name', currentVersion: '1.0.0' });
  const updated = registry.update('up-01', { name: 'new name', description: 'updated' });
  assert.strictEqual(updated.name, 'new name');
  assert.strictEqual(updated.description, 'updated');
  assert.strictEqual(updated.assetId, 'up-01');
  assert.strictEqual(updated.assetType, 'rule');
}

async function testUpdatePreservesCreatedAt() {
  const registry = createAssetRegistry();
  const original = registry.register({ assetId: 'up-02', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  const updated = registry.update('up-02', { name: 'changed' });
  assert.strictEqual(updated.createdAt, original.createdAt);
  assert(updated.updatedAt >= original.updatedAt);
}

async function testUpdateCannotChangeAssetId() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'up-03', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  try {
    registry.update('up-03', { assetId: 'changed' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('assetId'));
  }
}

async function testUpdateNotFound() {
  const registry = createAssetRegistry();
  try {
    registry.update('nonexistent', { name: 'x' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

async function testUpdateInvalidStatus() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'up-04', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  try {
    registry.update('up-04', { status: 'invalid' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('status'));
  }
}

// ============================================================
// P5.1.1 — NDJSON 持久化
// ============================================================

async function testPersistenceWriteAndReload() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'registry.ndjson');
    const r1 = createAssetRegistry({ storagePath });
    r1.register({ assetId: 'p-01', assetType: 'rule', name: 'persisted', currentVersion: '1.0.0' });
    r1.register({ assetId: 'p-02', assetType: 'skill', name: 'also', currentVersion: '2.0.0' });
    assert.strictEqual(r1.size, 2);

    // 重新加载
    const r2 = createAssetRegistry({ storagePath });
    assert.strictEqual(r2.size, 2);
    const rec = r2.get('p-01');
    assert.strictEqual(rec.name, 'persisted');
    assert.strictEqual(rec.assetType, 'rule');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testPersistenceBadLineTolerance() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'registry.ndjson');
    // 写入一行正常 + 一行损坏
    const goodLine = JSON.stringify({ assetId: 'bl-01', assetType: 'rule', name: 'good', currentVersion: '1.0.0', status: 'active', source: 'local', tags: [], description: '', owner: '', createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z', metadata: {} });
    fs.writeFileSync(storagePath, goodLine + '\n{bad json\n' + goodLine.replace('bl-01', 'bl-02') + '\n', 'utf-8');

    const registry = createAssetRegistry({ storagePath });
    assert.strictEqual(registry.size, 2);
    assert.strictEqual(registry.getLoadErrors().length, 1);
    assert.strictEqual(registry.getLoadErrors()[0].lineNumber, 2);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testPersistenceUnregisterSurvivesReload() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'registry.ndjson');
    const r1 = createAssetRegistry({ storagePath });
    r1.register({ assetId: 'pu-01', assetType: 'rule', name: 'first', currentVersion: '1.0.0' });
    r1.register({ assetId: 'pu-02', assetType: 'skill', name: 'second', currentVersion: '1.0.0' });
    r1.unregister('pu-01');

    const r2 = createAssetRegistry({ storagePath });
    assert.strictEqual(r2.size, 1);
    assert.strictEqual(r2.get('pu-01'), null);
    assert.strictEqual(r2.get('pu-02').name, 'second');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testPersistenceClear() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'registry.ndjson');
    const r1 = createAssetRegistry({ storagePath });
    r1.register({ assetId: 'pc-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
    assert.strictEqual(r1.size, 1);
    r1.clear();
    assert.strictEqual(r1.size, 0);

    const r2 = createAssetRegistry({ storagePath });
    assert.strictEqual(r2.size, 0);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.1.1 — 导出
// ============================================================

async function testExport() {
  const registry = createAssetRegistry();
  registry.register({ assetId: 'ex-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  const json = registry.export('json');
  const parsed = JSON.parse(json);
  assert.strictEqual(parsed.length, 1);
  assert.strictEqual(parsed[0].assetId, 'ex-01');

  const ndjson = registry.export('ndjson');
  const lines = ndjson.split('\n').filter(Boolean);
  assert.strictEqual(lines.length, 1);
}

async function testIndexExports() {
  const mod = require('../../src/asset/asset-registry');
  assert(typeof mod.createAssetRegistry === 'function');
  assert(typeof mod.AssetRegistry === 'function');
  assert(typeof mod.ASSET_REGISTRY_STATUSES === 'object');
  assert(typeof mod.VALID_REGISTRY_STATUSES === 'object');
}

// ============================================================
// main
// ============================================================

async function main() {
  // 常量与工厂
  await testStatusConstants();
  await testCreateRegistryDefault();
  await testCreateRegistryWithStorage();

  // register
  await testRegisterHappyPath();
  await testRegisterWithFullFields();
  await testRegisterMissingRequiredField();
  await testRegisterInvalidAssetType();
  await testRegisterDuplicateId();
  await testRegisterInvalidStatus();

  // get / unregister
  await testGetExisting();
  await testGetNotFound();
  await testUnregisterExisting();
  await testUnregisterNotFound();

  // list
  await testListAll();
  await testListFilterByType();
  await testListFilterByStatus();
  await testListFilterByKeyword();
  await testListFilterBySource();
  await testListWithLimit();

  // update
  await testUpdateHappyPath();
  await testUpdatePreservesCreatedAt();
  await testUpdateCannotChangeAssetId();
  await testUpdateNotFound();
  await testUpdateInvalidStatus();

  // NDJSON 持久化
  await testPersistenceWriteAndReload();
  await testPersistenceBadLineTolerance();
  await testPersistenceUnregisterSurvivesReload();
  await testPersistenceClear();

  // 导出
  await testExport();
  await testIndexExports();

  console.log('asset-registry tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
