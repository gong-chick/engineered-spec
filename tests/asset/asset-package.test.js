const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  ASSET_TYPES,
  ASSET_SOURCES,
  VALID_ASSET_TYPES,
  VALID_ASSET_SOURCES,
  createAssetPackage,
  validateAssetPackage,
  computeAssetChecksum,
  guessAssetType,
  buildAssetIdentity,
} = require('../../src/asset/asset-package');

const { AssetPackageManager, computePackageChecksumFromFiles } = require('../../src/asset/asset-package-manager');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-asset-'));
}

// ============================================================
// P1.3.1 — AssetPackage Schema
// ============================================================

async function testAssetTypes() {
  assert.strictEqual(ASSET_TYPES.RULE, 'rule');
  assert.strictEqual(ASSET_TYPES.SKILL, 'skill');
  assert.strictEqual(ASSET_TYPES.AGENT_PROFILE, 'agentProfile');
  assert.strictEqual(ASSET_TYPES.COMMAND, 'command');
  assert.strictEqual(ASSET_TYPES.HOOK, 'hook');
  assert.strictEqual(ASSET_TYPES.MEMORY, 'memory');
  assert.strictEqual(ASSET_TYPES.CONFIG, 'config');
  assert.strictEqual(ASSET_TYPES.ADAPTER, 'adapter');
  assert.strictEqual(ASSET_TYPES.OTHER, 'other');
}

async function testAssetSources() {
  assert.strictEqual(ASSET_SOURCES.LOCAL, 'local');
  assert.strictEqual(ASSET_SOURCES.HUB, 'hub');
  assert.strictEqual(ASSET_SOURCES.TEMPLATE, 'template');
}

async function testCreateAssetPackage() {
  const pkg = createAssetPackage();
  assert.strictEqual(pkg.assetId, '');
  assert.strictEqual(pkg.assetType, 'other');
  assert.strictEqual(pkg.version, '0.1.0');
  assert.strictEqual(pkg.source, 'local');
  assert.strictEqual(pkg.checksum, '');
  assert(Array.isArray(pkg.generatedFiles));
  assert.strictEqual(pkg.generatedFiles.length, 0);
  assert(typeof pkg.lockedAt === 'string');
}

async function testCreateAssetPackageWithOverrides() {
  const pkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '1.0.0',
    checksum: 'sha256:abc123',
    generatedFiles: ['.agents/rules/test.md'],
  });
  assert.strictEqual(pkg.assetId, 'test-rule');
  assert.strictEqual(pkg.assetType, 'rule');
  assert.strictEqual(pkg.version, '1.0.0');
  assert.strictEqual(pkg.checksum, 'sha256:abc123');
  assert.deepStrictEqual(pkg.generatedFiles, ['.agents/rules/test.md']);
}

async function testValidateAssetPackageOk() {
  const pkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    checksum: 'sha256:abc123',
  });
  const result = validateAssetPackage(pkg);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.errors.length, 0);
}

async function testValidateAssetPackageMissingId() {
  const pkg = createAssetPackage({ assetType: ASSET_TYPES.RULE, checksum: 'sha256:abc' });
  const result = validateAssetPackage(pkg);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some((e) => e.includes('assetId')));
}

async function testValidateAssetPackageInvalidType() {
  const pkg = createAssetPackage({ assetId: 'test', assetType: 'invalid', checksum: 'sha256:abc' });
  const result = validateAssetPackage(pkg);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some((e) => e.includes('assetType')));
}

async function testValidateAssetPackageNull() {
  const result = validateAssetPackage(null);
  assert.strictEqual(result.ok, false);
}

async function testGuessAssetType() {
  assert.strictEqual(guessAssetType('.agents/rules/test.md'), ASSET_TYPES.RULE);
  assert.strictEqual(guessAssetType('.agents/skills/test.md'), ASSET_TYPES.SKILL);
  assert.strictEqual(guessAssetType('.agents/roles/test.json'), ASSET_TYPES.AGENT_PROFILE);
  assert.strictEqual(guessAssetType('.agents/profiles/test.json'), ASSET_TYPES.AGENT_PROFILE);
  assert.strictEqual(guessAssetType('.agents/commands/test.md'), ASSET_TYPES.COMMAND);
  assert.strictEqual(guessAssetType('.harness/hooks.config.json'), ASSET_TYPES.HOOK);
  assert.strictEqual(guessAssetType('.memory/project.md'), ASSET_TYPES.MEMORY);
  assert.strictEqual(guessAssetType('.ai-spec/config.json'), ASSET_TYPES.CONFIG);
  assert.strictEqual(guessAssetType('.cursor/rules/test.mdc'), ASSET_TYPES.ADAPTER);
  assert.strictEqual(guessAssetType('.claude/commands/test.md'), ASSET_TYPES.ADAPTER);
  assert.strictEqual(guessAssetType('unknown/path.txt'), ASSET_TYPES.OTHER);
}

async function testBuildAssetIdentity() {
  const identity = buildAssetIdentity('rule', 'frontend-rule', '1.0.0');
  assert.strictEqual(identity, 'rule:frontend-rule@1.0.0');
}

async function testComputeAssetChecksum() {
  const checksum1 = computeAssetChecksum('hello');
  const checksum2 = computeAssetChecksum('hello');
  const checksum3 = computeAssetChecksum('world');
  assert.strictEqual(checksum1, checksum2);
  assert.notStrictEqual(checksum1, checksum3);
  assert(checksum1.startsWith('sha256:'));
}

async function testValidAssetTypesSet() {
  assert(VALID_ASSET_TYPES.has('rule'));
  assert(VALID_ASSET_TYPES.has('skill'));
  assert(VALID_ASSET_TYPES.has('agentProfile'));
  assert(!VALID_ASSET_TYPES.has('invalid'));
}

// ============================================================
// P1.3.2 — 安装流程
// ============================================================

async function testInstallHappyPath() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const pkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    checksum: computeAssetChecksum('rule content'),
    generatedFiles: ['.agents/rules/test.md'],
  });

  const result = manager.install(pkg, {
    '.agents/rules/test.md': 'rule content',
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.installedFiles.length, 1);
  assert(fs.existsSync(path.join(root, '.agents/rules/test.md')));
  assert.strictEqual(fs.readFileSync(path.join(root, '.agents/rules/test.md'), 'utf8'), 'rule content');
}

async function testInstallMultipleFiles() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const pkg = createAssetPackage({
    assetId: 'test-multi',
    assetType: ASSET_TYPES.RULE,
    checksum: 'sha256:test',
    generatedFiles: ['.agents/rules/a.md', '.agents/rules/b.md'],
  });

  const result = manager.install(pkg, {
    '.agents/rules/a.md': 'content a',
    '.agents/rules/b.md': 'content b',
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.installedFiles.length, 2);
}

async function testInstallValidationFailure() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const pkg = { assetId: '', assetType: 'invalid' };
  const result = manager.install(pkg, {});
  assert.strictEqual(result.ok, false);
  assert(result.errors.length > 0);
}

async function testInstallRollbackOnFailure() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const pkg = createAssetPackage({
    assetId: 'test-rollback',
    assetType: ASSET_TYPES.RULE,
    checksum: 'sha256:test',
    generatedFiles: ['.agents/rules/ok.md', '.agents/rules/fail.md'],
  });

  // 第二个文件使用无效路径触发失败
  const result = manager.install(pkg, {
    '.agents/rules/ok.md': 'ok content',
    '\x00invalid': 'fail content',
  });

  // 安装可能部分成功或失败，但不应留下残留
  if (!result.ok) {
    assert(!fs.existsSync(path.join(root, '.agents/rules/ok.md')));
  }
}

// ============================================================
// P1.3.3 — 升级流程
// ============================================================

async function testUpgradeHappyPath() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const oldPkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '1.0.0',
    checksum: computeAssetChecksum('old content'),
    generatedFiles: ['.agents/rules/test.md'],
  });

  // 先安装旧版本
  manager.install(oldPkg, { '.agents/rules/test.md': 'old content' });

  const newPkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '2.0.0',
    checksum: computeAssetChecksum('new content'),
    generatedFiles: ['.agents/rules/test.md'],
  });

  const result = manager.upgrade(oldPkg, newPkg, {
    '.agents/rules/test.md': 'new content',
  });

  assert.strictEqual(result.ok, true);
  assert(result.backupId.includes('test-rule'));
  assert.strictEqual(fs.readFileSync(path.join(root, '.agents/rules/test.md'), 'utf8'), 'new content');

  // 验证备份存在
  const backups = manager.listBackups('test-rule');
  assert(backups.length > 0);
}

async function testUpgradeAddsNewFiles() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const oldPkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '1.0.0',
    generatedFiles: ['.agents/rules/a.md'],
  });
  manager.install(oldPkg, { '.agents/rules/a.md': 'a' });

  const newPkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '2.0.0',
    checksum: computeAssetChecksum('a v2'),
    generatedFiles: ['.agents/rules/a.md', '.agents/rules/b.md'],
  });

  const result = manager.upgrade(oldPkg, newPkg, {
    '.agents/rules/a.md': 'a v2',
    '.agents/rules/b.md': 'b new',
  });

  assert.strictEqual(result.ok, true);
  assert.strictEqual(fs.readFileSync(path.join(root, '.agents/rules/a.md'), 'utf8'), 'a v2');
  assert(fs.existsSync(path.join(root, '.agents/rules/b.md')));
}

async function testUpgradeValidationFailure() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const oldPkg = createAssetPackage({ assetId: 'test', assetType: ASSET_TYPES.RULE, version: '1.0.0' });
  const newPkg = { assetId: '', assetType: 'invalid' };

  const result = manager.upgrade(oldPkg, newPkg, {});
  assert.strictEqual(result.ok, false);
}

// ============================================================
// P1.3.4 — 回滚流程
// ============================================================

async function testRollbackHappyPath() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  // 安装 v1
  const v1Pkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '1.0.0',
    checksum: computeAssetChecksum('v1 content'),
    generatedFiles: ['.agents/rules/test.md'],
  });
  manager.install(v1Pkg, { '.agents/rules/test.md': 'v1 content' });

  // 升级到 v2
  const v2Pkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '2.0.0',
    checksum: computeAssetChecksum('v2 content'),
    generatedFiles: ['.agents/rules/test.md'],
  });
  const upgradeResult = manager.upgrade(v1Pkg, v2Pkg, {
    '.agents/rules/test.md': 'v2 content',
  });

  // 确认 v2 已安装
  assert.strictEqual(fs.readFileSync(path.join(root, '.agents/rules/test.md'), 'utf8'), 'v2 content');

  // 回滚到 v1
  const rollbackResult = manager.rollback(upgradeResult.backupId, v2Pkg);
  assert.strictEqual(rollbackResult.ok, true);
  assert(rollbackResult.restoredFiles.length > 0);
  assert.strictEqual(fs.readFileSync(path.join(root, '.agents/rules/test.md'), 'utf8'), 'v1 content');
}

async function testRollbackDeletesNewFiles() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const v1Pkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '1.0.0',
    checksum: computeAssetChecksum('a v1'),
    generatedFiles: ['.agents/rules/a.md'],
  });
  manager.install(v1Pkg, { '.agents/rules/a.md': 'a v1' });

  const v2Pkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '2.0.0',
    checksum: computeAssetChecksum('a v2'),
    generatedFiles: ['.agents/rules/a.md', '.agents/rules/b.md'],
  });
  const upgradeResult = manager.upgrade(v1Pkg, v2Pkg, {
    '.agents/rules/a.md': 'a v2',
    '.agents/rules/b.md': 'b new',
  });

  // 回滚
  const rollbackResult = manager.rollback(upgradeResult.backupId, v2Pkg);
  assert.strictEqual(rollbackResult.ok, true);
  assert(rollbackResult.deletedFiles.includes('.agents/rules/b.md'));
  assert(!fs.existsSync(path.join(root, '.agents/rules/b.md')));
}

async function testRollbackBackupNotFound() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const pkg = createAssetPackage({ assetId: 'test', assetType: ASSET_TYPES.RULE });
  const result = manager.rollback('nonexistent-backup', pkg);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some((e) => e.includes('备份不存在')));
}

// ============================================================
// P1.3.5 — Checksum 校验
// ============================================================

async function testVerifyChecksumHappyPath() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const content = 'test content';
  const generatedFiles = ['.agents/rules/test.md'];

  // 先安装文件（用占位 checksum 通过校验）
  manager.install(
    createAssetPackage({ assetId: 'test', assetType: ASSET_TYPES.RULE, checksum: 'sha256:placeholder', generatedFiles }),
    { '.agents/rules/test.md': content },
  );
  // 基于文件内容计算真实包级 checksum
  const checksum = computePackageChecksumFromFiles(root, generatedFiles);

  const pkg = createAssetPackage({
    assetId: 'test',
    assetType: ASSET_TYPES.RULE,
    checksum,
    generatedFiles,
  });

  const result = manager.verifyChecksum(pkg);
  assert.strictEqual(result.ok, true);
}

async function testVerifyChecksumMissingFile() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const pkg = createAssetPackage({
    assetId: 'test',
    assetType: ASSET_TYPES.RULE,
    checksum: 'sha256:abc',
    generatedFiles: ['.agents/rules/missing.md'],
  });

  const result = manager.verifyChecksum(pkg);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some((e) => e.includes('文件不存在')));
}

async function testVerifyFileChecksum() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const content = 'hello world';
  const checksum = computeAssetChecksum(content);
  fs.mkdirSync(path.join(root, '.agents/rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/rules/test.md'), content, 'utf8');

  const result = manager.verifyFileChecksum('.agents/rules/test.md', checksum);
  assert.strictEqual(result.ok, true);

  const wrongResult = manager.verifyFileChecksum('.agents/rules/test.md', 'sha256:wrong');
  assert.strictEqual(wrongResult.ok, false);
}

// ============================================================
// P1.7 — verifyChecksum 包级 checksum 校验
// ============================================================

async function testVerifyChecksumPackageLevel() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const generatedFiles = ['.agents/rules/a.md', '.agents/rules/b.md'];
  const fileMap = {
    '.agents/rules/a.md': 'content a',
    '.agents/rules/b.md': 'content b',
  };

  // 安装后计算包级 checksum
  manager.install(
    createAssetPackage({ assetId: 'pkg', assetType: ASSET_TYPES.RULE, checksum: 'sha256:placeholder', generatedFiles }),
    fileMap,
  );
  const checksum = computePackageChecksumFromFiles(root, generatedFiles);

  const pkg = createAssetPackage({
    assetId: 'pkg',
    assetType: ASSET_TYPES.RULE,
    checksum,
    generatedFiles,
  });

  assert.strictEqual(manager.verifyChecksum(pkg).ok, true);
}

async function testVerifyChecksumTamperedFile() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const generatedFiles = ['.agents/rules/test.md'];
  manager.install(
    createAssetPackage({ assetId: 'tamper', assetType: ASSET_TYPES.RULE, checksum: 'sha256:placeholder', generatedFiles }),
    { '.agents/rules/test.md': 'original' },
  );
  const checksum = computePackageChecksumFromFiles(root, generatedFiles);

  // 篡改文件内容
  fs.writeFileSync(path.join(root, '.agents/rules/test.md'), 'tampered', 'utf8');

  const pkg = createAssetPackage({
    assetId: 'tamper',
    assetType: ASSET_TYPES.RULE,
    checksum,
    generatedFiles,
  });

  const result = manager.verifyChecksum(pkg);
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.expected, checksum);
  assert.notStrictEqual(result.actual, checksum);
}

async function testVerifyChecksumMissingGeneratedFile() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const generatedFiles = ['.agents/rules/a.md', '.agents/rules/b.md'];
  manager.install(
    createAssetPackage({ assetId: 'miss', assetType: ASSET_TYPES.RULE, checksum: 'sha256:placeholder', generatedFiles }),
    { '.agents/rules/a.md': 'a', '.agents/rules/b.md': 'b' },
  );
  const checksum = computePackageChecksumFromFiles(root, generatedFiles);

  // 删除一个文件
  fs.unlinkSync(path.join(root, '.agents/rules/b.md'));

  const pkg = createAssetPackage({
    assetId: 'miss',
    assetType: ASSET_TYPES.RULE,
    checksum,
    generatedFiles,
  });

  const result = manager.verifyChecksum(pkg);
  assert.strictEqual(result.ok, false);
  assert(result.errors.some((e) => e.includes('文件不存在')));
}

async function testVerifyChecksumMultiFileStability() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  // 两个文件内容相同但路径不同，验证排序后 checksum 稳定
  const generatedFiles = ['.agents/rules/z.md', '.agents/rules/a.md'];
  const fileMap = {
    '.agents/rules/z.md': 'same',
    '.agents/rules/a.md': 'same',
  };

  manager.install(
    createAssetPackage({ assetId: 'stable', assetType: ASSET_TYPES.RULE, checksum: 'sha256:placeholder', generatedFiles }),
    fileMap,
  );

  // 无论 generatedFiles 数组顺序如何，checksum 应一致
  const checksum1 = computePackageChecksumFromFiles(root, ['.agents/rules/z.md', '.agents/rules/a.md']);
  const checksum2 = computePackageChecksumFromFiles(root, ['.agents/rules/a.md', '.agents/rules/z.md']);
  assert.strictEqual(checksum1, checksum2);

  const pkg = createAssetPackage({
    assetId: 'stable',
    assetType: ASSET_TYPES.RULE,
    checksum: checksum1,
    generatedFiles,
  });

  assert.strictEqual(manager.verifyChecksum(pkg).ok, true);
}

async function testVerifyFileChecksumPreserved() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const content = 'single file content';
  const checksum = computeAssetChecksum(content);
  fs.mkdirSync(path.join(root, '.agents/rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/rules/single.md'), content, 'utf8');

  // verifyFileChecksum 仍保持单文件校验能力
  const result = manager.verifyFileChecksum('.agents/rules/single.md', checksum);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.actual, checksum);

  // 修改后应失败
  fs.writeFileSync(path.join(root, '.agents/rules/single.md'), 'modified', 'utf8');
  const result2 = manager.verifyFileChecksum('.agents/rules/single.md', checksum);
  assert.strictEqual(result2.ok, false);
}

// ============================================================
// P1.3.6 — Generated Files 清单
// ============================================================

async function testGetGeneratedFiles() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const pkg = createAssetPackage({
    assetId: 'test',
    assetType: ASSET_TYPES.RULE,
    checksum: computeAssetChecksum('a'),
    generatedFiles: ['.agents/rules/a.md', '.agents/rules/b.md'],
  });

  manager.install(pkg, {
    '.agents/rules/a.md': 'a',
    '.agents/rules/b.md': 'b',
  });

  const files = manager.getGeneratedFiles(pkg);
  assert.strictEqual(files.length, 2);
  assert(files.every((f) => f.exists));
}

async function testGetGeneratedFilesPartial() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const pkg = createAssetPackage({
    assetId: 'test',
    assetType: ASSET_TYPES.RULE,
    generatedFiles: ['.agents/rules/a.md', '.agents/rules/b.md'],
  });

  // 只创建一个文件
  fs.mkdirSync(path.join(root, '.agents/rules'), { recursive: true });
  fs.writeFileSync(path.join(root, '.agents/rules/a.md'), 'a', 'utf8');

  const files = manager.getGeneratedFiles(pkg);
  assert.strictEqual(files.length, 2);
  assert.strictEqual(files[0].exists, true);
  assert.strictEqual(files[1].exists, false);
}

async function testCleanupGeneratedFiles() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const pkg = createAssetPackage({
    assetId: 'test',
    assetType: ASSET_TYPES.RULE,
    checksum: computeAssetChecksum('a'),
    generatedFiles: ['.agents/rules/a.md', '.agents/rules/b.md'],
  });

  manager.install(pkg, {
    '.agents/rules/a.md': 'a',
    '.agents/rules/b.md': 'b',
  });

  const result = manager.cleanupGeneratedFiles(pkg);
  assert.strictEqual(result.deletedFiles.length, 2);
  assert(!fs.existsSync(path.join(root, '.agents/rules/a.md')));
  assert(!fs.existsSync(path.join(root, '.agents/rules/b.md')));
}

async function testListBackups() {
  const root = createTempDir();
  const manager = new AssetPackageManager(root);

  const oldPkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '1.0.0',
    checksum: computeAssetChecksum('v1'),
    generatedFiles: ['.agents/rules/test.md'],
  });
  manager.install(oldPkg, { '.agents/rules/test.md': 'v1' });

  const newPkg = createAssetPackage({
    assetId: 'test-rule',
    assetType: ASSET_TYPES.RULE,
    version: '2.0.0',
    checksum: computeAssetChecksum('v2'),
    generatedFiles: ['.agents/rules/test.md'],
  });
  manager.upgrade(oldPkg, newPkg, { '.agents/rules/test.md': 'v2' });

  const backups = manager.listBackups('test-rule');
  assert(backups.length >= 1);
  assert(backups[0].backupId.includes('test-rule'));
}

// ============================================================
// Barrel 导出
// ============================================================

async function testIndexExports() {
  const exports = require('../../src/asset/index');
  assert.strictEqual(typeof exports.ASSET_TYPES, 'object');
  assert.strictEqual(typeof exports.ASSET_SOURCES, 'object');
  assert.strictEqual(typeof exports.createAssetPackage, 'function');
  assert.strictEqual(typeof exports.validateAssetPackage, 'function');
  assert.strictEqual(typeof exports.computeAssetChecksum, 'function');
  assert.strictEqual(typeof exports.guessAssetType, 'function');
  assert.strictEqual(typeof exports.buildAssetIdentity, 'function');
  assert.strictEqual(typeof exports.AssetPackageManager, 'function');
}

// ============================================================
// main
// ============================================================

async function main() {
  // P1.3.1 — Schema
  await testAssetTypes();
  await testAssetSources();
  await testCreateAssetPackage();
  await testCreateAssetPackageWithOverrides();
  await testValidateAssetPackageOk();
  await testValidateAssetPackageMissingId();
  await testValidateAssetPackageInvalidType();
  await testValidateAssetPackageNull();
  await testGuessAssetType();
  await testBuildAssetIdentity();
  await testComputeAssetChecksum();
  await testValidAssetTypesSet();

  // P1.3.2 — 安装
  await testInstallHappyPath();
  await testInstallMultipleFiles();
  await testInstallValidationFailure();
  await testInstallRollbackOnFailure();

  // P1.3.3 — 升级
  await testUpgradeHappyPath();
  await testUpgradeAddsNewFiles();
  await testUpgradeValidationFailure();

  // P1.3.4 — 回滚
  await testRollbackHappyPath();
  await testRollbackDeletesNewFiles();
  await testRollbackBackupNotFound();

  // P1.3.5 — Checksum
  await testVerifyChecksumHappyPath();
  await testVerifyChecksumMissingFile();
  await testVerifyFileChecksum();

  // P1.7 — 包级 checksum 校验
  await testVerifyChecksumPackageLevel();
  await testVerifyChecksumTamperedFile();
  await testVerifyChecksumMissingGeneratedFile();
  await testVerifyChecksumMultiFileStability();
  await testVerifyFileChecksumPreserved();

  // P1.3.6 — Generated Files
  await testGetGeneratedFiles();
  await testGetGeneratedFilesPartial();
  await testCleanupGeneratedFiles();
  await testListBackups();

  // barrel
  await testIndexExports();

  console.log('asset-package tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
