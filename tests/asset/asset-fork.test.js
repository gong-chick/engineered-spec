const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAssetFork, AssetFork } = require('../../src/asset/asset-fork');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-fork-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ============================================================
// P5.5 — 工厂函数
// ============================================================

async function testCreateForkDefault() {
  const fork = createAssetFork();
  assert(fork instanceof AssetFork);
}

async function testCreateForkWithStorage() {
  const tmpDir = createTempDir();
  try {
    const fork = createAssetFork({ storageDir: tmpDir });
    assert(fork.registry instanceof require('../../src/asset/asset-registry').AssetRegistry);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.5 — forkAsset Fork 资产
// ============================================================

async function testForkAssetHappyPath() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'f-01', assetType: 'rule', name: 'enterprise rule', currentVersion: '1.0.0' });

  const result = fork.forkAsset('f-01', 'team-A', { forkType: 'team' });
  assert(result.forkId);
  assert.strictEqual(result.assetId, 'f-01');
  assert.strictEqual(result.projectId, 'team-A');
  assert.strictEqual(result.forkType, 'team');
  assert.strictEqual(result.parentId, null);
  assert(typeof result.forkedAt === 'string');
}

async function testForkAssetWithParent() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'f-parent', assetType: 'rule', name: 'base', currentVersion: '1.0.0' });

  const teamFork = fork.forkAsset('f-parent', 'team-B', { forkType: 'team' });
  const projectFork = fork.forkAsset('f-parent', 'proj-01', { forkType: 'project', parentId: teamFork.forkId });
  assert.strictEqual(projectFork.parentId, teamFork.forkId);
}

async function testForkAssetNotFound() {
  const fork = createAssetFork();
  try {
    fork.forkAsset('nonexistent', 'proj-01');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

async function testForkAssetDuplicate() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'f-dup', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  fork.forkAsset('f-dup', 'proj-01', { forkType: 'project' });
  try {
    fork.forkAsset('f-dup', 'proj-01', { forkType: 'project' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('已存在') || err.message.includes('已 Fork'));
  }
}

// ============================================================
// P5.5 — override 项目级 Override
// ============================================================

async function testOverrideHappyPath() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'ov-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  fork.forkAsset('ov-01', 'proj-01', { forkType: 'project' });
  const result = fork.override('ov-01', 'proj-01', { name: 'custom name', tags: ['custom'] });
  assert.deepStrictEqual(result.overrides, { name: 'custom name', tags: ['custom'] });
}

async function testOverrideNoFork() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'ov-nf', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  try {
    fork.override('ov-nf', 'proj-01', { name: 'x' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('未找到') || err.message.includes('未 Fork'));
  }
}

async function testOverrideMerge() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'ov-mg', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  fork.forkAsset('ov-mg', 'proj-01', { forkType: 'project' });
  fork.override('ov-mg', 'proj-01', { name: 'v1' });
  const result = fork.override('ov-mg', 'proj-01', { description: 'added' });
  // Override 应该合并
  assert.strictEqual(result.overrides.name, 'v1');
  assert.strictEqual(result.overrides.description, 'added');
}

// ============================================================
// P5.5 — getInheritanceTree 继承树
// ============================================================

async function testGetInheritanceTreeSimple() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'tree-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  fork.forkAsset('tree-01', 'team-A', { forkType: 'team' });
  fork.forkAsset('tree-01', 'proj-01', { forkType: 'project' });

  const tree = fork.getInheritanceTree('tree-01');
  assert(Array.isArray(tree));
  assert.strictEqual(tree.length, 2);
}

async function testGetInheritanceTreeEmpty() {
  const fork = createAssetFork();
  const tree = fork.getInheritanceTree('nonexistent');
  assert.strictEqual(tree.length, 0);
}

// ============================================================
// P5.5 — getForkRecord 获取 Fork 记录
// ============================================================

async function testGetForkRecord() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'gr-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  fork.forkAsset('gr-01', 'proj-01', { forkType: 'project' });
  const record = fork.getForkRecord('gr-01', 'proj-01');
  assert(record);
  assert.strictEqual(record.assetId, 'gr-01');
  assert.strictEqual(record.projectId, 'proj-01');
}

async function testGetForkRecordNotFound() {
  const fork = createAssetFork();
  const record = fork.getForkRecord('nonexistent', 'proj-01');
  assert.strictEqual(record, null);
}

// ============================================================
// P5.5 — detectConflicts 冲突检测
// ============================================================

async function testDetectConflictsNone() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'dc-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  fork.forkAsset('dc-01', 'team-A', { forkType: 'team', upstreamVersion: '1.0.0' });
  fork.forkAsset('dc-01', 'proj-01', { forkType: 'project', upstreamVersion: '1.0.0' });

  const result = fork.detectConflicts('dc-01', 'proj-01');
  assert(result.hasConflict === false);
}

async function testDetectConflictsVersionDrift() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'dc-vd', assetType: 'rule', name: 'test', currentVersion: '2.0.0' });

  fork.forkAsset('dc-vd', 'proj-01', { forkType: 'project', upstreamVersion: '1.0.0' });

  const result = fork.detectConflicts('dc-vd', 'proj-01');
  // 上游已更新到 2.0.0，fork 时是 1.0.0，存在版本漂移
  assert(result.hasConflict === true);
  assert(result.conflicts.some(c => c.type === 'version_drift'));
}

// ============================================================
// P5.5 — mergeUpstream 合并上游
// ============================================================

async function testMergeUpstreamHappyPath() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'mu-01', assetType: 'rule', name: 'test', currentVersion: '2.0.0' });

  fork.forkAsset('mu-01', 'proj-01', { forkType: 'project', upstreamVersion: '1.0.0' });
  const result = fork.mergeUpstream('mu-01', 'proj-01');
  assert.strictEqual(result.upstreamVersion, '2.0.0');
}

async function testMergeUpstreamNoFork() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'mu-nf', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  try {
    fork.mergeUpstream('mu-nf', 'proj-01');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('未找到') || err.message.includes('未 Fork'));
  }
}

// ============================================================
// P5.5 — NDJSON 持久化
// ============================================================

async function testPersistenceWriteAndReload() {
  const tmpDir = createTempDir();
  try {
    const fork1 = createAssetFork({ storageDir: tmpDir });
    fork1.registry.register({ assetId: 'p-fk', assetType: 'rule', name: 'persisted', currentVersion: '1.0.0' });
    fork1.forkAsset('p-fk', 'proj-01', { forkType: 'project' });
    fork1.override('p-fk', 'proj-01', { name: 'custom' });

    const fork2 = createAssetFork({ storageDir: tmpDir });
    const record = fork2.getForkRecord('p-fk', 'proj-01');
    assert(record);
    assert.strictEqual(record.overrides.name, 'custom');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.8 — loadErrors
// ============================================================

async function testLoadErrorsRecordsBadLine() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'forks.ndjson');
    fs.writeFileSync(storagePath, '{"valid":true,"assetId":"a","projectId":"p"}\nnot-json\n{"assetId":"b","projectId":"q"}\n', 'utf-8');
    const fork = createAssetFork({ storageDir: tmpDir });

    assert(fork.loadErrors.length === 1, '应记录 1 个坏行');
    assert.strictEqual(fork.loadErrors[0].line, 2);
    assert(fork.loadErrors[0].error.includes('JSON'));
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testGetLoadErrorsReturnsCopy() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'forks.ndjson');
    fs.writeFileSync(storagePath, 'bad\n', 'utf-8');
    const fork = createAssetFork({ storageDir: tmpDir });

    const errors = fork.getLoadErrors();
    errors.push({ fake: true });
    assert.strictEqual(fork.getLoadErrors().length, 1, '应返回副本');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.5 — 导出
// ============================================================

async function testIndexExports() {
  const mod = require('../../src/asset/asset-fork');
  assert(typeof mod.createAssetFork === 'function');
  assert(typeof mod.AssetFork === 'function');
}

// ============================================================
// main
// ============================================================

async function main() {
  // 工厂
  await testCreateForkDefault();
  await testCreateForkWithStorage();

  // forkAsset
  await testForkAssetHappyPath();
  await testForkAssetWithParent();
  await testForkAssetNotFound();
  await testForkAssetDuplicate();

  // override
  await testOverrideHappyPath();
  await testOverrideNoFork();
  await testOverrideMerge();

  // getInheritanceTree
  await testGetInheritanceTreeSimple();
  await testGetInheritanceTreeEmpty();

  // getForkRecord
  await testGetForkRecord();
  await testGetForkRecordNotFound();

  // detectConflicts
  await testDetectConflictsNone();
  await testDetectConflictsVersionDrift();

  // mergeUpstream
  await testMergeUpstreamHappyPath();
  await testMergeUpstreamNoFork();

  // 持久化
  await testPersistenceWriteAndReload();

  // P5.8 loadErrors
  await testLoadErrorsRecordsBadLine();
  await testGetLoadErrorsReturnsCopy();

  // 导出
  await testIndexExports();

  console.log('asset-fork tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
