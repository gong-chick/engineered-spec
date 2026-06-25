const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  // P5.1 基础模型
  AssetRegistry, createAssetRegistry,
  AssetVersion, createAssetVersion, compareSemver, bumpVersion,
  AssetDependency, createAssetDependency,
  AssetInstall, createAssetInstall,
  AssetFeedback, createAssetFeedback,
  // P5.2-P5.6 高层模型
  AssetManager, createAssetManager,
  AssetInstaller, createAssetInstaller,
  AssetLifecycle, createAssetLifecycle,
  AssetFork, createAssetFork,
  AssetQuality, createAssetQuality,
} = require('../../src/asset/index');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-p5-int-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

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
// TC01: 全链路 AssetRegistry — 注册→查询→更新→注销
// ============================================================

async function testTC01_RegistryFullChain() {
  const registry = createAssetRegistry();

  // 注册
  const r1 = registry.register({ assetId: 'tc01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
  assert.strictEqual(r1.assetId, 'tc01');

  // 查询
  const got = registry.get('tc01');
  assert.strictEqual(got.name, 'test');

  // 更新
  const updated = registry.update('tc01', { name: 'updated' });
  assert.strictEqual(updated.name, 'updated');

  // 注销
  registry.unregister('tc01');
  assert.strictEqual(registry.get('tc01'), null);
}

// ============================================================
// TC02: 全链路 AssetVersion — 创建版本→列表→比较→递增
// ============================================================

async function testTC02_VersionFullChain() {
  const ver = createAssetVersion();

  ver.create('tc02', { version: '1.0.0' });
  ver.create('tc02', { version: '1.1.0' });
  ver.create('tc02', { version: '2.0.0' });

  const list = ver.list('tc02');
  assert.strictEqual(list.length, 3);

  const latest = ver.latest('tc02');
  assert.strictEqual(latest.version, '2.0.0');

  assert.strictEqual(compareSemver('1.0.0', '2.0.0'), -1);
  assert.strictEqual(bumpVersion('1.0.0', 'major'), '2.0.0');
}

// ============================================================
// TC03: 全链路 AssetDependency — 声明→解析→冲突检测
// ============================================================

async function testTC03_DependencyFullChain() {
  const dep = createAssetDependency();

  dep.add('tc03-a', 'tc03-b', '^1.0.0');
  dep.add('tc03-b', 'tc03-c', '>=1.0.0');

  const deps = dep.getDependencies('tc03-a');
  assert.strictEqual(deps.length, 1);

  const tree = dep.resolve('tc03-a');
  assert(tree.length >= 2);

  const conflict = dep.hasConflict('tc03-a');
  assert.strictEqual(conflict.hasConflict, false);
}

// ============================================================
// TC04: 全链路 AssetInstall — 安装→状态更新→历史查询
// ============================================================

async function testTC04_InstallFullChain() {
  const install = createAssetInstall();

  const r1 = install.record({ assetId: 'tc04', version: '1.0.0', projectId: 'proj-01', status: 'installed' });
  assert.strictEqual(r1.status, 'installed');

  install.updateStatus(r1.installId, 'upgraded');
  const got = install.get(r1.installId);
  assert.strictEqual(got.status, 'upgraded');

  const history = install.list({ projectId: 'proj-01' });
  assert.strictEqual(history.length, 1);
}

// ============================================================
// TC05: 全链路 AssetFeedback — 提交→摘要→评分
// ============================================================

async function testTC05_FeedbackFullChain() {
  const fb = createAssetFeedback();

  fb.submit({ assetId: 'tc05', version: '1.0.0', rating: 5, category: 'quality' });
  fb.submit({ assetId: 'tc05', version: '1.0.0', rating: 3, category: 'usability' });

  const summary = fb.getAssetSummary('tc05');
  assert.strictEqual(summary.totalFeedbacks, 2);
  assert.strictEqual(summary.averageRating, 4);

  const avg = fb.getAverageRating('tc05');
  assert.strictEqual(avg, 4);
}

// ============================================================
// TC06: 全链路 AssetManager — 创建资产→版本→依赖联动
// ============================================================

async function testTC06_ManagerFullChain() {
  const mgr = createAssetManager();

  mgr.createAsset({ assetId: 'tc06-a', assetType: 'rule', name: 'base', currentVersion: '1.0.0' });
  mgr.createAsset({ assetId: 'tc06-b', assetType: 'skill', name: 'dep', currentVersion: '1.0.0' });

  mgr.createVersion('tc06-a', { version: '1.1.0', changelog: 'update' });
  mgr.declareDependency('tc06-a', 'tc06-b', '^1.0.0');

  const detail = mgr.getAssetWithDeps('tc06-a');
  assert.strictEqual(detail.asset.currentVersion, '1.1.0');
  assert.strictEqual(detail.dependencies.length, 1);
  assert.strictEqual(detail.versions.length, 2);
}

// ============================================================
// TC07: 全链路 AssetInstaller — 搜索→安装→升级→回滚
// ============================================================

async function testTC07_InstallerFullChain() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc07', '1.0.0', { 'rules/r.md': 'v1' });
    createTestPackage(packagesDir, 'tc07', '2.0.0', { 'rules/r.md': 'v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });

    installer.registry.register({ assetId: 'tc07', assetType: 'rule', name: 'searchable', currentVersion: '1.0.0', description: '测试资产' });

    // 搜索
    const results = installer.search({ keyword: 'searchable' });
    assert.strictEqual(results.length, 1);

    // 安装
    const inst = installer.install('tc07', '1.0.0', 'proj-01');
    assert.strictEqual(inst.status, 'installed');
    assert(inst.installedFiles.length > 0);

    // 升级
    const upg = installer.upgrade('tc07', '2.0.0', 'proj-01');
    assert.strictEqual(upg.status, 'upgraded');
    assert.strictEqual(upg.metadata.previousVersion, '1.0.0');

    // 回滚
    const rb = installer.rollback('tc07', 'proj-01');
    assert.strictEqual(rb.status, 'rolled_back');
    assert.strictEqual(rb.version, '1.0.0');

    // Lock
    const lock = installer.updateLock('proj-01');
    assert(Array.isArray(lock.assets));
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC08: 全链路 AssetLifecycle — 审核→发布→废弃
// ============================================================

async function testTC08_LifecycleFullChain() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'tc08', assetType: 'rule', name: 'lifecycle', currentVersion: '1.0.0' });

  // 提交→批准→发布
  lc.submitForReview('tc08', '1.0.0');
  lc.approve('tc08', '1.0.0', '通过');
  const published = lc.publish('tc08', '1.0.0');
  assert.strictEqual(published.status, 'published');

  // 废弃
  const deprecated = lc.deprecate('tc08', '已被替代');
  assert.strictEqual(deprecated.status, 'deprecated');

  // 变更记录
  const changelog = lc.getChangeLog('tc08');
  assert(changelog.length >= 3);
}

// ============================================================
// TC09: 全链路 AssetFork — Fork→Override→冲突检测
// ============================================================

async function testTC09_ForkFullChain() {
  const fork = createAssetFork();
  fork.registry.register({ assetId: 'tc09', assetType: 'rule', name: 'enterprise', currentVersion: '2.0.0' });

  // Fork 到团队
  const teamFork = fork.forkAsset('tc09', 'team-A', { forkType: 'team', upstreamVersion: '1.0.0' });
  assert.strictEqual(teamFork.forkType, 'team');

  // Override
  const overridden = fork.override('tc09', 'team-A', { name: 'team version' });
  assert.strictEqual(overridden.overrides.name, 'team version');

  // 冲突检测（上游已到 2.0.0，fork 时是 1.0.0）
  const conflicts = fork.detectConflicts('tc09', 'team-A');
  assert.strictEqual(conflicts.hasConflict, true);

  // 合并上游
  const merged = fork.mergeUpstream('tc09', 'team-A');
  assert.strictEqual(merged.upstreamVersion, '2.0.0');
}

// ============================================================
// TC10: 全链路 AssetQuality — 评分→排名→推荐
// ============================================================

async function testTC10_QualityFullChain() {
  const q = createAssetQuality();

  // 高质量资产
  for (let i = 0; i < 5; i++) {
    q.feedback.submit({ assetId: 'tc10-good', version: '1.0.0', rating: 5 });
  }
  q.installTracker.record({ assetId: 'tc10-good', version: '1.0.0', projectId: 'p1', status: 'installed' });

  // 低质量资产
  q.feedback.submit({ assetId: 'tc10-bad', version: '1.0.0', rating: 1 });

  // 评分
  const score = q.computeScore('tc10-good');
  assert(score.overallScore > 0);

  // 排名
  const ranked = q.rankAssets();
  assert(ranked.length >= 2);
  assert.strictEqual(ranked[0].assetId, 'tc10-good');

  // 推荐
  const basis = q.getRecommendationBasis('tc10-good');
  assert(basis.qualityScore > 0);
}

// ============================================================
// TC11: 跨模块联动 — Registry + Version + Dependency
// ============================================================

async function testTC11_CrossModuleRegistryVersionDep() {
  const mgr = createAssetManager();

  mgr.createAsset({ assetId: 'tc11-core', assetType: 'rule', name: 'core', currentVersion: '1.0.0' });
  mgr.createAsset({ assetId: 'tc11-util', assetType: 'skill', name: 'util', currentVersion: '1.0.0' });
  mgr.createAsset({ assetId: 'tc11-app', assetType: 'agentProfile', name: 'app', currentVersion: '1.0.0' });

  mgr.declareDependency('tc11-app', 'tc11-core', '^1.0.0');
  mgr.declareDependency('tc11-app', 'tc11-util', '>=1.0.0');
  mgr.declareDependency('tc11-core', 'tc11-util', '^1.0.0');

  const detail = mgr.getAssetWithDeps('tc11-app');
  assert.strictEqual(detail.dependencies.length, 2);
  assert.strictEqual(detail.versions.length, 1);
}

// ============================================================
// TC12: 跨模块联动 — Install + Lock + Feedback
// ============================================================

async function testTC12_CrossModuleInstallLockFeedback() {
  const tmpDir = createTempDir();
  const packagesDir = path.join(tmpDir, 'packages');
  const projectRoot = path.join(tmpDir, 'project');
  fs.mkdirSync(projectRoot, { recursive: true });
  try {
    createTestPackage(packagesDir, 'tc12', '1.0.0', { 'r.md': 'v1' });
    createTestPackage(packagesDir, 'tc12', '2.0.0', { 'r.md': 'v2' });
    const installer = createAssetInstaller({ storageDir: tmpDir, packagesDir, projectRoot });
    installer.registry.register({ assetId: 'tc12', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

    installer.install('tc12', '1.0.0', 'proj-01');
    installer.upgrade('tc12', '2.0.0', 'proj-01');

    const lock = installer.updateLock('proj-01');
    assert.strictEqual(lock.assets.length, 1);
    assert.strictEqual(lock.assets[0].version, '2.0.0');

    const history = installer.getInstallHistory('proj-01');
    assert.strictEqual(history.length, 2);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC13: NDJSON 持久化完整性
// ============================================================

async function testTC13_NDJSONPersistenceIntegrity() {
  const tmpDir = createTempDir();
  try {
    const mgr1 = createAssetManager({ storageDir: tmpDir });
    mgr1.createAsset({ assetId: 'tc13', assetType: 'rule', name: 'persist', currentVersion: '1.0.0' });
    mgr1.createVersion('tc13', { version: '1.1.0' });
    mgr1.declareDependency('tc13', 'other', '^1.0.0');

    const mgr2 = createAssetManager({ storageDir: tmpDir });
    const asset = mgr2.getAsset('tc13');
    assert.strictEqual(asset.currentVersion, '1.1.0');

    const detail = mgr2.getAssetWithDeps('tc13');
    assert.strictEqual(detail.versions.length, 2);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC14: 接口稳定性与幂等性
// ============================================================

async function testTC14_Idempotency() {
  const tmpDir = createTempDir();
  try {
    const registry = createAssetRegistry({ storagePath: path.join(tmpDir, 'reg.ndjson') });

    // 重复注册应抛出
    registry.register({ assetId: 'tc14', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
    try {
      registry.register({ assetId: 'tc14', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });
      assert.fail('应抛出错误');
    } catch (err) {
      assert(err.message.includes('已存在'));
    }

    // 重复注销应抛出
    registry.unregister('tc14');
    try {
      registry.unregister('tc14');
      assert.fail('应抛出错误');
    } catch (err) {
      assert(err.message.includes('不存在'));
    }
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// TC15: barrel 导出完整性
// ============================================================

async function testTC15_BarrelExports() {
  const mod = require('../../src/asset/index');

  // P5.1
  assert(typeof mod.AssetRegistry === 'function');
  assert(typeof mod.createAssetRegistry === 'function');
  assert(typeof mod.AssetVersion === 'function');
  assert(typeof mod.createAssetVersion === 'function');
  assert(typeof mod.AssetDependency === 'function');
  assert(typeof mod.createAssetDependency === 'function');
  assert(typeof mod.AssetInstall === 'function');
  assert(typeof mod.createAssetInstall === 'function');
  assert(typeof mod.AssetFeedback === 'function');
  assert(typeof mod.createAssetFeedback === 'function');

  // P5.2
  assert(typeof mod.AssetManager === 'function');
  assert(typeof mod.createAssetManager === 'function');

  // P5.3
  assert(typeof mod.AssetInstaller === 'function');
  assert(typeof mod.createAssetInstaller === 'function');

  // P5.4
  assert(typeof mod.AssetLifecycle === 'function');
  assert(typeof mod.createAssetLifecycle === 'function');

  // P5.5
  assert(typeof mod.AssetFork === 'function');
  assert(typeof mod.createAssetFork === 'function');

  // P5.6
  assert(typeof mod.AssetQuality === 'function');
  assert(typeof mod.createAssetQuality === 'function');
}

// ============================================================
// main
// ============================================================

async function main() {
  await testTC01_RegistryFullChain();
  await testTC02_VersionFullChain();
  await testTC03_DependencyFullChain();
  await testTC04_InstallFullChain();
  await testTC05_FeedbackFullChain();
  await testTC06_ManagerFullChain();
  await testTC07_InstallerFullChain();
  await testTC08_LifecycleFullChain();
  await testTC09_ForkFullChain();
  await testTC10_QualityFullChain();
  await testTC11_CrossModuleRegistryVersionDep();
  await testTC12_CrossModuleInstallLockFeedback();
  await testTC13_NDJSONPersistenceIntegrity();
  await testTC14_Idempotency();
  await testTC15_BarrelExports();

  console.log('P5 integration tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
