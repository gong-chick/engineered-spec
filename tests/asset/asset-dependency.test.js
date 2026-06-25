const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  createAssetDependency,
  AssetDependency,
} = require('../../src/asset/asset-dependency');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-dep-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ============================================================
// P5.1.3 — 工厂函数
// ============================================================

async function testCreateDependencyDefault() {
  const dep = createAssetDependency();
  assert(dep instanceof AssetDependency);
}

async function testCreateDependencyWithStorage() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'deps.ndjson');
    const dep = createAssetDependency({ storagePath });
    assert.strictEqual(dep.storagePath, storagePath);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.1.3 — add 添加依赖
// ============================================================

async function testAddDependency() {
  const dep = createAssetDependency();
  const record = dep.add('asset-a', 'asset-b', '^1.0.0');
  assert.strictEqual(record.assetId, 'asset-a');
  assert.strictEqual(record.dependsOn, 'asset-b');
  assert.strictEqual(record.constraint, '^1.0.0');
  assert.strictEqual(record.optional, false);
  assert(typeof record.createdAt === 'string');
}

async function testAddOptionalDependency() {
  const dep = createAssetDependency();
  const record = dep.add('asset-a', 'asset-c', '>=2.0.0', { optional: true });
  assert.strictEqual(record.optional, true);
}

async function testAddDefaultConstraint() {
  const dep = createAssetDependency();
  const record = dep.add('asset-a', 'asset-d');
  assert.strictEqual(record.constraint, '*');
}

async function testAddMissingAssetId() {
  const dep = createAssetDependency();
  try {
    dep.add('', 'asset-b');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('assetId'));
  }
}

async function testAddMissingDependsOn() {
  const dep = createAssetDependency();
  try {
    dep.add('asset-a', '');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('dependsOn'));
  }
}

async function testAddSelfDependency() {
  const dep = createAssetDependency();
  try {
    dep.add('asset-a', 'asset-a');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('自身'));
  }
}

async function testAddDuplicateDependency() {
  const dep = createAssetDependency();
  dep.add('asset-a', 'asset-b', '^1.0.0');
  try {
    dep.add('asset-a', 'asset-b', '^2.0.0');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('已存在'));
  }
}

// ============================================================
// P5.1.3 — remove 移除依赖
// ============================================================

async function testRemoveDependency() {
  const dep = createAssetDependency();
  dep.add('asset-a', 'asset-b');
  const result = dep.remove('asset-a', 'asset-b');
  assert.strictEqual(result, true);
  assert.strictEqual(dep.getDependencies('asset-a').length, 0);
}

async function testRemoveNotFound() {
  const dep = createAssetDependency();
  try {
    dep.remove('asset-a', 'nonexistent');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

// ============================================================
// P5.1.3 — getDependencies / getDependents
// ============================================================

async function testGetDependencies() {
  const dep = createAssetDependency();
  dep.add('asset-a', 'asset-b', '^1.0.0');
  dep.add('asset-a', 'asset-c', '>=2.0.0');
  const deps = dep.getDependencies('asset-a');
  assert.strictEqual(deps.length, 2);
  assert(deps.some(d => d.dependsOn === 'asset-b'));
  assert(deps.some(d => d.dependsOn === 'asset-c'));
}

async function testGetDependenciesEmpty() {
  const dep = createAssetDependency();
  const deps = dep.getDependencies('nonexistent');
  assert.deepStrictEqual(deps, []);
}

async function testGetDependents() {
  const dep = createAssetDependency();
  dep.add('asset-a', 'asset-shared');
  dep.add('asset-b', 'asset-shared');
  dep.add('asset-c', 'asset-other');
  const dependents = dep.getDependents('asset-shared');
  assert.strictEqual(dependents.length, 2);
  assert(dependents.some(d => d.assetId === 'asset-a'));
  assert(dependents.some(d => d.assetId === 'asset-b'));
}

async function testGetDependentsEmpty() {
  const dep = createAssetDependency();
  const dependents = dep.getDependents('nonexistent');
  assert.deepStrictEqual(dependents, []);
}

// ============================================================
// P5.1.3 — resolve 依赖树解析
// ============================================================

async function testResolveSimple() {
  const dep = createAssetDependency();
  dep.add('a', 'b');
  dep.add('b', 'c');
  const tree = dep.resolve('a');
  assert.deepStrictEqual(tree, ['b', 'c']);
}

async function testResolveDiamond() {
  const dep = createAssetDependency();
  dep.add('a', 'b');
  dep.add('a', 'c');
  dep.add('b', 'd');
  dep.add('c', 'd');
  const tree = dep.resolve('a');
  // d 只出现一次（去重）
  assert.strictEqual(tree.filter(x => x === 'd').length, 1);
  assert(tree.includes('b'));
  assert(tree.includes('c'));
}

async function testResolveNoDependencies() {
  const dep = createAssetDependency();
  const tree = dep.resolve('standalone');
  assert.deepStrictEqual(tree, []);
}

// ============================================================
// P5.1.3 — hasConflict 循环依赖检测
// ============================================================

async function testHasConflictCircular() {
  const dep = createAssetDependency();
  dep.add('a', 'b');
  dep.add('b', 'c');
  dep.add('c', 'a');
  const result = dep.hasConflict('a');
  assert.strictEqual(result.hasConflict, true);
  assert(result.cycle.includes('a'));
}

async function testHasConflictNone() {
  const dep = createAssetDependency();
  dep.add('a', 'b');
  dep.add('b', 'c');
  const result = dep.hasConflict('a');
  assert.strictEqual(result.hasConflict, false);
}

async function testHasConflictNoDeps() {
  const dep = createAssetDependency();
  const result = dep.hasConflict('standalone');
  assert.strictEqual(result.hasConflict, false);
}

// ============================================================
// P5.1.3 — NDJSON 持久化
// ============================================================

async function testPersistenceWriteAndReload() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'deps.ndjson');
    const d1 = createAssetDependency({ storagePath });
    d1.add('p-a', 'p-b', '^1.0.0');
    d1.add('p-a', 'p-c', '>=2.0.0');

    const d2 = createAssetDependency({ storagePath });
    const deps = d2.getDependencies('p-a');
    assert.strictEqual(deps.length, 2);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testPersistenceRemoveSurvivesReload() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'deps.ndjson');
    const d1 = createAssetDependency({ storagePath });
    d1.add('pr-a', 'pr-b');
    d1.add('pr-a', 'pr-c');
    d1.remove('pr-a', 'pr-b');

    const d2 = createAssetDependency({ storagePath });
    const deps = d2.getDependencies('pr-a');
    assert.strictEqual(deps.length, 1);
    assert.strictEqual(deps[0].dependsOn, 'pr-c');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testPersistenceBadLineTolerance() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'deps.ndjson');
    const goodLine = JSON.stringify({ assetId: 'bl-a', dependsOn: 'bl-b', constraint: '*', optional: false, createdAt: '2026-01-01T00:00:00.000Z' });
    fs.writeFileSync(storagePath, goodLine + '\n{bad json\n' + goodLine.replace('bl-a', 'bl-x').replace('bl-b', 'bl-y') + '\n', 'utf-8');

    const dep = createAssetDependency({ storagePath });
    assert.strictEqual(dep.getDependencies('bl-a').length, 1);
    assert.strictEqual(dep.getDependencies('bl-x').length, 1);
    assert.strictEqual(dep.getLoadErrors().length, 1);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.1.3 — 导出
// ============================================================

async function testIndexExports() {
  const mod = require('../../src/asset/asset-dependency');
  assert(typeof mod.createAssetDependency === 'function');
  assert(typeof mod.AssetDependency === 'function');
}

// ============================================================
// main
// ============================================================

async function main() {
  // 工厂
  await testCreateDependencyDefault();
  await testCreateDependencyWithStorage();

  // add
  await testAddDependency();
  await testAddOptionalDependency();
  await testAddDefaultConstraint();
  await testAddMissingAssetId();
  await testAddMissingDependsOn();
  await testAddSelfDependency();
  await testAddDuplicateDependency();

  // remove
  await testRemoveDependency();
  await testRemoveNotFound();

  // getDependencies / getDependents
  await testGetDependencies();
  await testGetDependenciesEmpty();
  await testGetDependents();
  await testGetDependentsEmpty();

  // resolve
  await testResolveSimple();
  await testResolveDiamond();
  await testResolveNoDependencies();

  // hasConflict
  await testHasConflictCircular();
  await testHasConflictNone();
  await testHasConflictNoDeps();

  // 持久化
  await testPersistenceWriteAndReload();
  await testPersistenceRemoveSurvivesReload();
  await testPersistenceBadLineTolerance();

  // 导出
  await testIndexExports();

  console.log('asset-dependency tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
