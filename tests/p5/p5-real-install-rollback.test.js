/**
 * P5.8 — 真实安装/升级/回滚专项测试
 *
 * 验证 AssetInstaller 的真实文件安装、checksum 计算、
 * dryRun、升级 previousVersion、回滚版本正确性、lock 完整性。
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAssetInstaller, AssetInstaller } = require('../../src/asset/asset-installer');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-p58-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

/**
 * 在 packagesDir 下创建一个测试资产包
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
    assetId, assetType: 'rule', version, source: 'local',
    checksum: 'sha256:test-checksum', lockedAt: new Date().toISOString(), generatedFiles,
  };
  fs.writeFileSync(path.join(pkgDir, 'manifest.json'), JSON.stringify(manifest, null, 2), 'utf-8');
}

// ============================================================
// TC01: install 写入真实文件到 projectRoot
// ============================================================

async function testTC01_InstallWritesRealFiles() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc01', '1.0.0', { 'rules/coding.md': '# 编码规范' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'tc01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('tc01', '1.0.0', 'proj-01');

    const filePath = path.join(projectRoot, 'rules/coding.md');
    assert(fs.existsSync(filePath), '文件应被写入 projectRoot');
    const content = fs.readFileSync(filePath, 'utf-8');
    assert.strictEqual(content, '# 编码规范');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC02: install 记录非空 installedFiles
// ============================================================

async function testTC02_InstallRecordsInstalledFiles() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc02', '1.0.0', { 'a.md': 'a', 'b.md': 'b' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'tc02', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    const result = installer.install('tc02', '1.0.0', 'proj-01');

    assert(result.installedFiles.length === 2, '应记录 2 个文件');
    assert(result.installedFiles[0].action === 'created');
    assert(typeof result.installedFiles[0].checksum === 'string');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC03: install 记录真实 checksum（sha256 格式）
// ============================================================

async function testTC03_InstallRecordsChecksum() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc03', '1.0.0', { 'r.md': 'content' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'tc03', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    const result = installer.install('tc03', '1.0.0', 'proj-01');

    assert(result.checksum.startsWith('sha256:'), '聚合 checksum 应为 sha256 格式');
    assert(result.installedFiles[0].checksum.startsWith('sha256:'), '文件 checksum 应为 sha256 格式');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC04: install dryRun 不写文件
// ============================================================

async function testTC04_InstallDryRun() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc04', '1.0.0', { 'r.md': 'content' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'tc04', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    const result = installer.install('tc04', '1.0.0', 'proj-01', { dryRun: true });

    assert.strictEqual(result.status, 'dry_run');
    assert(!fs.existsSync(path.join(projectRoot, 'r.md')), 'dryRun 不应写入文件');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC05: install 资产不存在抛错
// ============================================================

async function testTC05_InstallAssetNotFound() {
  const installer = createAssetInstaller();
  try {
    installer.install('nonexistent', '1.0.0', 'proj-01');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

// ============================================================
// TC06: upgrade 更新文件内容
// ============================================================

async function testTC06_UpgradeUpdatesFiles() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc06', '1.0.0', { 'r.md': 'v1' });
    createTestPackage(packagesDir, 'tc06', '2.0.0', { 'r.md': 'v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'tc06', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('tc06', '1.0.0', 'proj-01');
    installer.upgrade('tc06', '2.0.0', 'proj-01');

    const content = fs.readFileSync(path.join(projectRoot, 'r.md'), 'utf-8');
    assert.strictEqual(content, 'v2', '文件应被更新为 v2');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC07: upgrade 记录 previousVersion
// ============================================================

async function testTC07_UpgradeRecordsPreviousVersion() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc07', '1.0.0', { 'r.md': 'v1' });
    createTestPackage(packagesDir, 'tc07', '2.0.0', { 'r.md': 'v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'tc07', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('tc07', '1.0.0', 'proj-01');
    const result = installer.upgrade('tc07', '2.0.0', 'proj-01');

    assert.strictEqual(result.status, 'upgraded');
    assert.strictEqual(result.metadata.previousVersion, '1.0.0');
    assert.strictEqual(result.metadata.newVersion, '2.0.0');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC08: upgrade metadata 包含 previousVersion
// ============================================================

async function testTC08_UpgradeMetadataContainsPreviousVersion() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc08', '1.0.0', { 'r.md': 'v1' });
    createTestPackage(packagesDir, 'tc08', '1.1.0', { 'r.md': 'v1.1' });
    createTestPackage(packagesDir, 'tc08', '2.0.0', { 'r.md': 'v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'tc08', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('tc08', '1.0.0', 'proj-01');
    installer.upgrade('tc08', '1.1.0', 'proj-01');
    const result = installer.upgrade('tc08', '2.0.0', 'proj-01');

    assert.strictEqual(result.metadata.previousVersion, '1.1.0');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC09: rollback 恢复旧版本文件
// ============================================================

async function testTC09_RollbackRestoresOldFiles() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc09', '1.0.0', { 'r.md': 'v1-content' });
    createTestPackage(packagesDir, 'tc09', '2.0.0', { 'r.md': 'v2-content' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'tc09', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('tc09', '1.0.0', 'proj-01');
    installer.upgrade('tc09', '2.0.0', 'proj-01');
    installer.rollback('tc09', 'proj-01');

    const content = fs.readFileSync(path.join(projectRoot, 'r.md'), 'utf-8');
    assert.strictEqual(content, 'v1-content', '回滚后文件应恢复为 v1');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC10: rollback version 为真实版本（非 'rollback'）
// ============================================================

async function testTC10_RollbackVersionIsReal() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc10', '1.0.0', { 'r.md': 'v1' });
    createTestPackage(packagesDir, 'tc10', '2.0.0', { 'r.md': 'v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'tc10', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('tc10', '1.0.0', 'proj-01');
    installer.upgrade('tc10', '2.0.0', 'proj-01');
    const result = installer.rollback('tc10', 'proj-01');

    assert.strictEqual(result.version, '1.0.0', 'rollback version 应为真实版本号');
    assert.notStrictEqual(result.version, 'rollback', 'rollback version 不应为 "rollback"');
    assert.strictEqual(result.metadata.rolledbackFrom, '2.0.0');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC11: lock 不出现 version: 'rollback'
// ============================================================

async function testTC11_LockNoRollbackVersion() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc11', '1.0.0', { 'r.md': 'v1' });
    createTestPackage(packagesDir, 'tc11', '2.0.0', { 'r.md': 'v2' });
    const lockPath = path.join(tmpDir, 'ai-spec.lock');
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot, lockPath });
    installer.registry.register({ assetId: 'tc11', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('tc11', '1.0.0', 'proj-01');
    installer.upgrade('tc11', '2.0.0', 'proj-01');
    installer.rollback('tc11', 'proj-01');
    const lock = installer.updateLock('proj-01');

    const asset = lock.assets.find(a => a.assetId === 'tc11');
    assert(asset, 'lock 应包含 tc11');
    assert.notStrictEqual(asset.version, 'rollback', 'lock 中 version 不应为 "rollback"');
    assert.strictEqual(asset.version, '1.0.0', 'lock 中 version 应为回滚后的版本');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC12: lock 包含 checksum 和 installedFiles
// ============================================================

async function testTC12_LockContainsChecksumAndFiles() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc12', '1.0.0', { 'r.md': 'v1' });
    const lockPath = path.join(tmpDir, 'ai-spec.lock');
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot, lockPath });
    installer.registry.register({ assetId: 'tc12', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('tc12', '1.0.0', 'proj-01');
    const lock = installer.updateLock('proj-01');

    const asset = lock.assets[0];
    assert(typeof asset.checksum === 'string', 'lock 应包含 checksum');
    assert(asset.checksum.startsWith('sha256:'), 'checksum 应为 sha256 格式');
    assert(Array.isArray(asset.installedFiles), 'lock 应包含 installedFiles');
    assert(asset.installedFiles.length > 0, 'installedFiles 不应为空');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// main
// ============================================================

async function main() {
  await testTC01_InstallWritesRealFiles();
  await testTC02_InstallRecordsInstalledFiles();
  await testTC03_InstallRecordsChecksum();
  await testTC04_InstallDryRun();
  await testTC05_InstallAssetNotFound();
  await testTC06_UpgradeUpdatesFiles();
  await testTC07_UpgradeRecordsPreviousVersion();
  await testTC08_UpgradeMetadataContainsPreviousVersion();
  await testTC09_RollbackRestoresOldFiles();
  await testTC10_RollbackVersionIsReal();
  await testTC11_LockNoRollbackVersion();
  await testTC12_LockContainsChecksumAndFiles();

  console.log('p5-real-install-rollback tests passed (12 cases)');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
