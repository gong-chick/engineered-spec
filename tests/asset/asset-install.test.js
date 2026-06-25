const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  INSTALL_STATUSES,
  VALID_INSTALL_STATUSES,
  createAssetInstall,
  AssetInstall,
} = require('../../src/asset/asset-install');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-install-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ============================================================
// P5.1.4 — 常量与工厂函数
// ============================================================

async function testStatusConstants() {
  assert.strictEqual(INSTALL_STATUSES.INSTALLED, 'installed');
  assert.strictEqual(INSTALL_STATUSES.FAILED, 'failed');
  assert.strictEqual(INSTALL_STATUSES.ROLLED_BACK, 'rolled_back');
  assert.strictEqual(INSTALL_STATUSES.UPGRADED, 'upgraded');
  assert.strictEqual(VALID_INSTALL_STATUSES.size, 4);
}

async function testCreateInstallDefault() {
  const install = createAssetInstall();
  assert(install instanceof AssetInstall);
}

async function testCreateInstallWithStorage() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'installs.ndjson');
    const install = createAssetInstall({ storagePath });
    assert.strictEqual(install.storagePath, storagePath);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.1.4 — record 记录安装
// ============================================================

async function testRecordInstallHappyPath() {
  const install = createAssetInstall();
  const record = install.record({
    assetId: 'asset-01',
    version: '1.0.0',
    projectId: 'proj-01',
    installedFiles: ['rules/test.md', 'skills/demo.md'],
    checksum: 'abc123',
  });
  assert(typeof record.installId === 'string');
  assert.strictEqual(record.assetId, 'asset-01');
  assert.strictEqual(record.version, '1.0.0');
  assert.strictEqual(record.projectId, 'proj-01');
  assert.strictEqual(record.status, 'installed');
  assert.deepStrictEqual(record.installedFiles, ['rules/test.md', 'skills/demo.md']);
  assert.strictEqual(record.checksum, 'abc123');
  assert(typeof record.installedAt === 'string');
  assert.deepStrictEqual(record.metadata, {});
}

async function testRecordInstallDefaults() {
  const install = createAssetInstall();
  const record = install.record({ assetId: 'a-02', version: '1.0.0', projectId: 'p-01' });
  assert.deepStrictEqual(record.installedFiles, []);
  assert.strictEqual(record.checksum, '');
}

async function testRecordInstallMissingAssetId() {
  const install = createAssetInstall();
  try {
    install.record({ version: '1.0.0', projectId: 'p-01' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('assetId'));
  }
}

async function testRecordInstallMissingVersion() {
  const install = createAssetInstall();
  try {
    install.record({ assetId: 'a-01', projectId: 'p-01' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('version'));
  }
}

async function testRecordInstallMissingProjectId() {
  const install = createAssetInstall();
  try {
    install.record({ assetId: 'a-01', version: '1.0.0' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('projectId'));
  }
}

// ============================================================
// P5.1.4 — get / list
// ============================================================

async function testGetInstall() {
  const install = createAssetInstall();
  const r1 = install.record({ assetId: 'a-01', version: '1.0.0', projectId: 'p-01' });
  const got = install.get(r1.installId);
  assert.strictEqual(got.assetId, 'a-01');
  assert.strictEqual(got.version, '1.0.0');
}

async function testGetInstallNotFound() {
  const install = createAssetInstall();
  const got = install.get('nonexistent');
  assert.strictEqual(got, null);
}

async function testListAll() {
  const install = createAssetInstall();
  install.record({ assetId: 'a-01', version: '1.0.0', projectId: 'p-01' });
  install.record({ assetId: 'a-02', version: '1.0.0', projectId: 'p-01' });
  install.record({ assetId: 'a-01', version: '1.0.0', projectId: 'p-02' });
  const list = install.list();
  assert.strictEqual(list.length, 3);
}

async function testListFilterByAssetId() {
  const install = createAssetInstall();
  install.record({ assetId: 'a-01', version: '1.0.0', projectId: 'p-01' });
  install.record({ assetId: 'a-02', version: '1.0.0', projectId: 'p-01' });
  const list = install.list({ assetId: 'a-01' });
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].assetId, 'a-01');
}

async function testListFilterByProjectId() {
  const install = createAssetInstall();
  install.record({ assetId: 'a-01', version: '1.0.0', projectId: 'p-01' });
  install.record({ assetId: 'a-02', version: '1.0.0', projectId: 'p-02' });
  install.record({ assetId: 'a-03', version: '1.0.0', projectId: 'p-01' });
  const list = install.list({ projectId: 'p-01' });
  assert.strictEqual(list.length, 2);
}

async function testListFilterByStatus() {
  const install = createAssetInstall();
  const r1 = install.record({ assetId: 'a-01', version: '1.0.0', projectId: 'p-01' });
  install.record({ assetId: 'a-02', version: '1.0.0', projectId: 'p-01' });
  install.updateStatus(r1.installId, 'failed');
  const failedList = install.list({ status: 'failed' });
  assert.strictEqual(failedList.length, 1);
  assert.strictEqual(failedList[0].installId, r1.installId);
}

// ============================================================
// P5.1.4 — updateStatus
// ============================================================

async function testUpdateStatusHappyPath() {
  const install = createAssetInstall();
  const r1 = install.record({ assetId: 'a-01', version: '1.0.0', projectId: 'p-01' });
  const updated = install.updateStatus(r1.installId, 'rolled_back');
  assert.strictEqual(updated.status, 'rolled_back');
}

async function testUpdateStatusInvalid() {
  const install = createAssetInstall();
  const r1 = install.record({ assetId: 'a-01', version: '1.0.0', projectId: 'p-01' });
  try {
    install.updateStatus(r1.installId, 'unknown');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('安装状态'));
  }
}

async function testUpdateStatusNotFound() {
  const install = createAssetInstall();
  try {
    install.updateStatus('nonexistent', 'failed');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

// ============================================================
// P5.1.4 — getInstalledAssets
// ============================================================

async function testGetInstalledAssets() {
  const install = createAssetInstall();
  install.record({ assetId: 'a-01', version: '1.0.0', projectId: 'p-01' });
  install.record({ assetId: 'a-02', version: '2.0.0', projectId: 'p-01' });
  install.record({ assetId: 'a-03', version: '1.0.0', projectId: 'p-02' });
  const assets = install.getInstalledAssets('p-01');
  assert.strictEqual(assets.length, 2);
  assert(assets.some(a => a.assetId === 'a-01'));
  assert(assets.some(a => a.assetId === 'a-02'));
}

async function testGetInstalledAssetsEmpty() {
  const install = createAssetInstall();
  const assets = install.getInstalledAssets('nonexistent');
  assert.deepStrictEqual(assets, []);
}

// ============================================================
// P5.1.4 — NDJSON 持久化
// ============================================================

async function testPersistenceWriteAndReload() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'installs.ndjson');
    const i1 = createAssetInstall({ storagePath });
    i1.record({ assetId: 'p-01', version: '1.0.0', projectId: 'proj-01' });
    i1.record({ assetId: 'p-02', version: '2.0.0', projectId: 'proj-01' });

    const i2 = createAssetInstall({ storagePath });
    const list = i2.list();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(i2.getInstalledAssets('proj-01').length, 2);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testPersistenceStatusUpdateSurvivesReload() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'installs.ndjson');
    const i1 = createAssetInstall({ storagePath });
    const r1 = i1.record({ assetId: 'p-01', version: '1.0.0', projectId: 'proj-01' });
    i1.updateStatus(r1.installId, 'failed');

    const i2 = createAssetInstall({ storagePath });
    const got = i2.get(r1.installId);
    assert.strictEqual(got.status, 'failed');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testPersistenceBadLineTolerance() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'installs.ndjson');
    const goodLine = JSON.stringify({ installId: 'i-1', assetId: 'bl-01', version: '1.0.0', projectId: 'p-01', status: 'installed', installedAt: '2026-01-01T00:00:00.000Z', installedFiles: [], checksum: '', metadata: {} });
    fs.writeFileSync(storagePath, goodLine + '\n{bad json\n' + goodLine.replace('"i-1"', '"i-2"') + '\n', 'utf-8');

    const install = createAssetInstall({ storagePath });
    assert.strictEqual(install.list().length, 2);
    assert.strictEqual(install.getLoadErrors().length, 1);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.8 — metadata 脱敏
// ============================================================

async function testMetadataRedactsToken() {
  const ai = createAssetInstall();
  const r = ai.record({ assetId: 'a', version: '1.0.0', projectId: 'p', metadata: { token: 'secret123' } });
  assert.strictEqual(r.metadata.token, '[REDACTED]');
}

async function testMetadataRedactsPassword() {
  const ai = createAssetInstall();
  const r = ai.record({ assetId: 'a', version: '1.0.0', projectId: 'p', metadata: { password: 'pw123' } });
  assert.strictEqual(r.metadata.password, '[REDACTED]');
}

async function testMetadataRedactsSecret() {
  const ai = createAssetInstall();
  const r = ai.record({ assetId: 'a', version: '1.0.0', projectId: 'p', metadata: { secret: 's1' } });
  assert.strictEqual(r.metadata.secret, '[REDACTED]');
}

async function testMetadataRedactsApiKey() {
  const ai = createAssetInstall();
  const r = ai.record({ assetId: 'a', version: '1.0.0', projectId: 'p', metadata: { apiKey: 'key1' } });
  assert.strictEqual(r.metadata.apiKey, '[REDACTED]');
}

async function testMetadataRedactsRawPrompt() {
  const ai = createAssetInstall();
  const r = ai.record({ assetId: 'a', version: '1.0.0', projectId: 'p', metadata: { rawPrompt: 'user input' } });
  assert.strictEqual(r.metadata.rawPrompt, '[REDACTED]');
}

async function testGetListReturnsCopies() {
  const ai = createAssetInstall();
  ai.record({ assetId: 'a', version: '1.0.0', projectId: 'p', metadata: { x: 1 } });
  const list = ai.list();
  list[0].metadata.x = 999;
  const list2 = ai.list();
  assert.strictEqual(list2[0].metadata.x, 1);
}

// ============================================================
// P5.1.4 — 导出
// ============================================================

async function testIndexExports() {
  const mod = require('../../src/asset/asset-install');
  assert(typeof mod.createAssetInstall === 'function');
  assert(typeof mod.AssetInstall === 'function');
  assert(typeof mod.INSTALL_STATUSES === 'object');
  assert(typeof mod.VALID_INSTALL_STATUSES === 'object');
}

// ============================================================
// main
// ============================================================

async function main() {
  // 常量与工厂
  await testStatusConstants();
  await testCreateInstallDefault();
  await testCreateInstallWithStorage();

  // record
  await testRecordInstallHappyPath();
  await testRecordInstallDefaults();
  await testRecordInstallMissingAssetId();
  await testRecordInstallMissingVersion();
  await testRecordInstallMissingProjectId();

  // get / list
  await testGetInstall();
  await testGetInstallNotFound();
  await testListAll();
  await testListFilterByAssetId();
  await testListFilterByProjectId();
  await testListFilterByStatus();

  // updateStatus
  await testUpdateStatusHappyPath();
  await testUpdateStatusInvalid();
  await testUpdateStatusNotFound();

  // getInstalledAssets
  await testGetInstalledAssets();
  await testGetInstalledAssetsEmpty();

  // 持久化
  await testPersistenceWriteAndReload();
  await testPersistenceStatusUpdateSurvivesReload();
  await testPersistenceBadLineTolerance();

  // P5.8 metadata 脱敏
  await testMetadataRedactsToken();
  await testMetadataRedactsPassword();
  await testMetadataRedactsSecret();
  await testMetadataRedactsApiKey();
  await testMetadataRedactsRawPrompt();
  await testGetListReturnsCopies();

  // 导出
  await testIndexExports();

  console.log('asset-install tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
