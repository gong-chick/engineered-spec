const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAssetInstaller, AssetInstaller } = require('../../src/asset/asset-installer');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-installer-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/**
 * 在 packagesDir 下创建一个测试资产包
 * @param {string} packagesDir
 * @param {string} assetId
 * @param {string} version
 * @param {Object} [files] - { relativePath: content }
 */
function createTestPackage(packagesDir, assetId, version, files = {}) {
  const pkgDir = path.join(packagesDir, assetId, version);
  fs.mkdirSync(pkgDir, { recursive: true });

  const generatedFiles = Object.keys(files);
  for (const [rel, content] of Object.entries(files)) {
    const filePath = path.join(pkgDir, rel);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, content, 'utf-8');
  }

  const manifest = {
    assetId,
    assetType: 'rule',
    version,
    source: 'local',
    checksum: 'sha256:test-checksum',
    lockedAt: new Date().toISOString(),
    generatedFiles,
  };
  fs.writeFileSync(path.join(pkgDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

// ============================================================
// P5.3 — 工厂函数
// ============================================================

async function testCreateInstallerDefault() {
  const installer = createAssetInstaller();
  assert(installer instanceof AssetInstaller);
}

async function testCreateInstallerWithStorage() {
  const tmpDir = createTempDir();
  try {
    const installer = createAssetInstaller({ storageDir: tmpDir });
    assert(installer.registry instanceof require('../../src/asset/asset-registry').AssetRegistry);
    assert(installer.installTracker instanceof require('../../src/asset/asset-install').AssetInstall);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.3 — search 搜索资产
// ============================================================

async function testSearchByKeyword() {
  const installer = createAssetInstaller();
  installer.registry.register({ assetId: 's-01', assetType: 'rule', name: '编码规范', currentVersion: '1.0.0', description: 'TypeScript 编码规范', tags: ['coding'] });
  installer.registry.register({ assetId: 's-02', assetType: 'skill', name: 'API 设计', currentVersion: '1.0.0', description: 'RESTful API 设计指南', tags: ['api'] });

  const results = installer.search({ keyword: '编码' });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].assetId, 's-01');
}

async function testSearchByType() {
  const installer = createAssetInstaller();
  installer.registry.register({ assetId: 'st-01', assetType: 'rule', name: 'rule1', currentVersion: '1.0.0' });
  installer.registry.register({ assetId: 'st-02', assetType: 'skill', name: 'skill1', currentVersion: '1.0.0' });
  installer.registry.register({ assetId: 'st-03', assetType: 'rule', name: 'rule2', currentVersion: '1.0.0' });

  const results = installer.search({ assetType: 'rule' });
  assert.strictEqual(results.length, 2);
}

async function testSearchByTags() {
  const installer = createAssetInstaller();
  installer.registry.register({ assetId: 'stag-01', assetType: 'rule', name: 'r1', currentVersion: '1.0.0', tags: ['coding', 'ts'] });
  installer.registry.register({ assetId: 'stag-02', assetType: 'rule', name: 'r2', currentVersion: '1.0.0', tags: ['api'] });

  const results = installer.search({ tags: ['coding'] });
  assert.strictEqual(results.length, 1);
  assert.strictEqual(results[0].assetId, 'stag-01');
}

async function testSearchNoResults() {
  const installer = createAssetInstaller();
  installer.registry.register({ assetId: 'sn-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  const results = installer.search({ keyword: '不存在' });
  assert.strictEqual(results.length, 0);
}

async function testSearchEmpty() {
  const installer = createAssetInstaller();
  const results = installer.search({});
  assert.strictEqual(results.length, 0);
}

// ============================================================
// P5.3 — install 安装资产
// ============================================================

async function testInstallHappyPath() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'i-01', '1.0.0', { 'rules/coding.md': '# 编码规范' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'i-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    const result = installer.install('i-01', '1.0.0', 'proj-01');
    assert.strictEqual(result.assetId, 'i-01');
    assert.strictEqual(result.version, '1.0.0');
    assert.strictEqual(result.projectId, 'proj-01');
    assert.strictEqual(result.status, 'installed');
    assert(typeof result.installId === 'string');
    assert(result.installedFiles.length > 0);
    assert(result.checksum.startsWith('sha256:'));
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testInstallAssetNotFound() {
  const installer = createAssetInstaller();
  try {
    installer.install('nonexistent', '1.0.0', 'proj-01');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

async function testInstallRecordsHistory() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'ih-01', '1.0.0', { 'a.md': 'a' });
    createTestPackage(packagesDir, 'ih-01', '1.1.0', { 'a.md': 'a-v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'ih-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('ih-01', '1.0.0', 'proj-01');
    installer.install('ih-01', '1.1.0', 'proj-01');

    const history = installer.getInstallHistory('proj-01');
    assert.strictEqual(history.length, 2);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.3 — upgrade 升级资产
// ============================================================

async function testUpgradeHappyPath() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'u-01', '1.0.0', { 'rules/r.md': 'v1' });
    createTestPackage(packagesDir, 'u-01', '2.0.0', { 'rules/r.md': 'v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'u-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('u-01', '1.0.0', 'proj-01');
    const result = installer.upgrade('u-01', '2.0.0', 'proj-01');
    assert.strictEqual(result.version, '2.0.0');
    assert.strictEqual(result.status, 'upgraded');
    assert.strictEqual(result.metadata.previousVersion, '1.0.0');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testUpgradeAssetNotFound() {
  const installer = createAssetInstaller();
  try {
    installer.upgrade('nonexistent', '2.0.0', 'proj-01');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

// ============================================================
// P5.3 — rollback 回滚资产
// ============================================================

async function testRollbackHappyPath() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'rb-01', '1.0.0', { 'r.md': 'v1' });
    createTestPackage(packagesDir, 'rb-01', '2.0.0', { 'r.md': 'v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'rb-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('rb-01', '1.0.0', 'proj-01');
    installer.upgrade('rb-01', '2.0.0', 'proj-01');
    const result = installer.rollback('rb-01', 'proj-01');
    assert.strictEqual(result.status, 'rolled_back');
    assert.strictEqual(result.version, '1.0.0');
    assert.strictEqual(result.metadata.rolledbackFrom, '2.0.0');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testRollbackNoInstallFound() {
  const installer = createAssetInstaller();
  try {
    installer.rollback('nonexistent', 'proj-01');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('未找到'));
  }
}

// ============================================================
// P5.3 — updateLock 锁文件更新
// ============================================================

async function testUpdateLock() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'lk-01', '1.0.0', { 'r.md': 'v1' });
    const lockPath = path.join(tmpDir, 'ai-spec.lock');
    const installer = createAssetInstaller({ storageDir: tmpDir, lockPath, packagesDir, projectRoot });

    installer.registry.register({ assetId: 'lk-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
    installer.install('lk-01', '1.0.0', 'proj-01');

    const lock = installer.updateLock('proj-01');
    assert.strictEqual(lock.projectId, 'proj-01');
    assert(Array.isArray(lock.assets));
    assert.strictEqual(lock.assets.length, 1);
    assert(typeof lock.lockedAt === 'string');
    assert(typeof lock.assets[0].checksum === 'string');

    // 验证文件已写入
    const content = JSON.parse(fs.readFileSync(lockPath, 'utf-8'));
    assert.strictEqual(content.projectId, 'proj-01');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testUpdateLockIdempotent() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'lki-01', '1.0.0', { 'r.md': 'v1' });
    const lockPath = path.join(tmpDir, 'ai-spec.lock');
    const installer = createAssetInstaller({ storageDir: tmpDir, lockPath, packagesDir, projectRoot });

    installer.registry.register({ assetId: 'lki-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
    installer.install('lki-01', '1.0.0', 'proj-01');

    const lock1 = installer.updateLock('proj-01');
    const lock2 = installer.updateLock('proj-01');
    assert.deepStrictEqual(lock1.assets, lock2.assets);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.3 — getInstallHistory 安装历史
// ============================================================

async function testGetInstallHistoryEmpty() {
  const installer = createAssetInstaller();
  const history = installer.getInstallHistory('proj-empty');
  assert.strictEqual(history.length, 0);
}

async function testGetInstallHistoryFilterByProject() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'hf-01', '1.0.0', { 'r.md': 'v1' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'hf-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('hf-01', '1.0.0', 'proj-A');
    installer.install('hf-01', '1.0.0', 'proj-B');

    const historyA = installer.getInstallHistory('proj-A');
    assert.strictEqual(historyA.length, 1);
    assert.strictEqual(historyA[0].projectId, 'proj-A');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.3 — NDJSON 持久化
// ============================================================

async function testPersistenceWriteAndReload() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'p-01', '1.0.0', { 'r.md': 'v1' });
    const installer1 = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer1.registry.register({ assetId: 'p-01', assetType: 'rule', name: 'persisted', currentVersion: '1.0.0' });
    installer1.install('p-01', '1.0.0', 'proj-01');

    const installer2 = createAssetInstaller({ storageDir: tmpDir });
    const asset = installer2.registry.get('p-01');
    assert.strictEqual(asset.name, 'persisted');

    const history = installer2.getInstallHistory('proj-01');
    assert.strictEqual(history.length, 1);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.3 — 导出
// ============================================================

async function testIndexExports() {
  const mod = require('../../src/asset/asset-installer');
  assert(typeof mod.createAssetInstaller === 'function');
  assert(typeof mod.AssetInstaller === 'function');
}

// ============================================================
// P5.8 — 真实安装补充测试
// ============================================================

async function testInstallWritesRealFile() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'iwr', '1.0.0', { 'rules/test.md': '# hello' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'iwr', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('iwr', '1.0.0', 'proj-01');

    assert(fs.existsSync(path.join(projectRoot, 'rules/test.md')), '文件应被写入');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testUpgradeRecordsPreviousVersion() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'urpv', '1.0.0', { 'r.md': 'v1' });
    createTestPackage(packagesDir, 'urpv', '2.0.0', { 'r.md': 'v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'urpv', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('urpv', '1.0.0', 'proj-01');
    const result = installer.upgrade('urpv', '2.0.0', 'proj-01');

    assert.strictEqual(result.metadata.previousVersion, '1.0.0');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testRollbackVersionNotRollback() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'rvnr', '1.0.0', { 'r.md': 'v1' });
    createTestPackage(packagesDir, 'rvnr', '2.0.0', { 'r.md': 'v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'rvnr', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('rvnr', '1.0.0', 'proj-01');
    installer.upgrade('rvnr', '2.0.0', 'proj-01');
    const result = installer.rollback('rvnr', 'proj-01');

    assert.notStrictEqual(result.version, 'rollback', 'version 不应为 "rollback"');
    assert.strictEqual(result.version, '1.0.0');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testLockContainsChecksum() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'lcc', '1.0.0', { 'r.md': 'v1' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'lcc', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('lcc', '1.0.0', 'proj-01');
    const lock = installer.updateLock('proj-01');

    assert(typeof lock.assets[0].checksum === 'string', 'lock 应包含 checksum');
    assert(lock.assets[0].checksum.startsWith('sha256:'), 'checksum 应为 sha256 格式');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// main
// ============================================================

async function main() {
  // 工厂
  await testCreateInstallerDefault();
  await testCreateInstallerWithStorage();

  // search
  await testSearchByKeyword();
  await testSearchByType();
  await testSearchByTags();
  await testSearchNoResults();
  await testSearchEmpty();

  // install
  await testInstallHappyPath();
  await testInstallAssetNotFound();
  await testInstallRecordsHistory();

  // upgrade
  await testUpgradeHappyPath();
  await testUpgradeAssetNotFound();

  // rollback
  await testRollbackHappyPath();
  await testRollbackNoInstallFound();

  // lock
  await testUpdateLock();
  await testUpdateLockIdempotent();

  // history
  await testGetInstallHistoryEmpty();
  await testGetInstallHistoryFilterByProject();

  // 持久化
  await testPersistenceWriteAndReload();

  // P5.8 补充测试
  await testInstallWritesRealFile();
  await testUpgradeRecordsPreviousVersion();
  await testRollbackVersionNotRollback();
  await testLockContainsChecksum();

  // 导出
  await testIndexExports();

  console.log('asset-installer tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
