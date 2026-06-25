const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAssetLifecycle, AssetLifecycle } = require('../../src/asset/asset-lifecycle');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-lifecycle-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ============================================================
// P5.4 — 工厂函数
// ============================================================

async function testCreateLifecycleDefault() {
  const lc = createAssetLifecycle();
  assert(lc instanceof AssetLifecycle);
}

async function testCreateLifecycleWithStorage() {
  const tmpDir = createTempDir();
  try {
    const lc = createAssetLifecycle({ storageDir: tmpDir });
    assert(lc.registry instanceof require('../../src/asset/asset-registry').AssetRegistry);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.4 — submitForReview 提交审核
// ============================================================

async function testSubmitForReviewHappyPath() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-01', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  const result = lc.submitForReview('lc-01', '1.0.0');
  assert(result.reviewId);
  assert.strictEqual(result.assetId, 'lc-01');
  assert.strictEqual(result.version, '1.0.0');
  assert.strictEqual(result.status, 'submitted');
}

async function testSubmitForReviewAssetNotFound() {
  const lc = createAssetLifecycle();
  try {
    lc.submitForReview('nonexistent', '1.0.0');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

async function testSubmitForReviewMultipleVersions() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-mv', assetType: 'rule', name: 'test', currentVersion: '2.0.0' });

  lc.submitForReview('lc-mv', '1.0.0');
  lc.submitForReview('lc-mv', '2.0.0');

  const history = lc.getReviewHistory('lc-mv');
  assert.strictEqual(history.length, 2);
}

// ============================================================
// P5.4 — approve 批准
// ============================================================

async function testApproveHappyPath() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-ap', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  const submitted = lc.submitForReview('lc-ap', '1.0.0');
  const result = lc.approve('lc-ap', '1.0.0', '符合规范');
  assert.strictEqual(result.status, 'approved');
  assert.strictEqual(result.comment, '符合规范');
}

async function testApproveNotSubmitted() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-ns', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  // 未提交就批准
  lc.submitForReview('lc-ns', '1.0.0');
  // 先 approve 一次
  lc.approve('lc-ns', '1.0.0', 'ok');
  // 再 approve 应该失败（状态已变为 approved，不能再 approve）
  try {
    lc.approve('lc-ns', '1.0.0', 'again');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不允许') || err.message.includes('状态'));
  }
}

// ============================================================
// P5.4 — reject 拒绝
// ============================================================

async function testRejectHappyPath() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-rj', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  lc.submitForReview('lc-rj', '1.0.0');
  const result = lc.reject('lc-rj', '1.0.0', '不符合规范');
  assert.strictEqual(result.status, 'rejected');
  assert.strictEqual(result.reason, '不符合规范');
}

async function testRejectResubmit() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-rs', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  lc.submitForReview('lc-rs', '1.0.0');
  lc.reject('lc-rs', '1.0.0', '需修改');
  // 拒绝后可以重新提交
  const resubmit = lc.submitForReview('lc-rs', '1.0.0');
  assert.strictEqual(resubmit.status, 'submitted');
}

// ============================================================
// P5.4 — publish 发布
// ============================================================

async function testPublishHappyPath() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-pb', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  lc.submitForReview('lc-pb', '1.0.0');
  lc.approve('lc-pb', '1.0.0', 'ok');
  const result = lc.publish('lc-pb', '1.0.0');
  assert.strictEqual(result.status, 'published');
}

async function testPublishWithoutApprove() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-wa', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  lc.submitForReview('lc-wa', '1.0.0');
  try {
    lc.publish('lc-wa', '1.0.0');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不允许') || err.message.includes('状态'));
  }
}

// ============================================================
// P5.4 — deprecate 废弃
// ============================================================

async function testDeprecateHappyPath() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-dp', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  lc.submitForReview('lc-dp', '1.0.0');
  lc.approve('lc-dp', '1.0.0', 'ok');
  lc.publish('lc-dp', '1.0.0');
  const result = lc.deprecate('lc-dp', '已被新规范替代');
  assert.strictEqual(result.status, 'deprecated');
}

async function testDeprecateNotPublished() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-np', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  lc.submitForReview('lc-np', '1.0.0');
  try {
    lc.deprecate('lc-np', 'reason');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不允许') || err.message.includes('状态') || err.message.includes('没有'));
  }
}

// ============================================================
// P5.4 — getReviewHistory 审核历史
// ============================================================

async function testGetReviewHistory() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-hist', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  lc.submitForReview('lc-hist', '1.0.0');
  lc.reject('lc-hist', '1.0.0', '修改');
  lc.submitForReview('lc-hist', '1.0.0');
  lc.approve('lc-hist', '1.0.0', '通过');

  const history = lc.getReviewHistory('lc-hist');
  // 两次 submitForReview 创建两条审核记录
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].status, 'rejected');
  assert.strictEqual(history[1].status, 'approved');
}

async function testGetReviewHistoryEmpty() {
  const lc = createAssetLifecycle();
  const history = lc.getReviewHistory('nonexistent');
  assert.strictEqual(history.length, 0);
}

// ============================================================
// P5.4 — getChangeLog 变更记录
// ============================================================

async function testGetChangeLog() {
  const lc = createAssetLifecycle();
  lc.registry.register({ assetId: 'lc-cl', assetType: 'rule', name: 'test', currentVersion: '1.0.0' });

  lc.submitForReview('lc-cl', '1.0.0');
  lc.approve('lc-cl', '1.0.0', 'ok');
  lc.publish('lc-cl', '1.0.0');

  const changelog = lc.getChangeLog('lc-cl');
  assert(changelog.length >= 1);
  assert(changelog[0].version);
  assert(changelog[0].action);
  assert(changelog[0].timestamp);
}

async function testGetChangeLogEmpty() {
  const lc = createAssetLifecycle();
  const changelog = lc.getChangeLog('nonexistent');
  assert.strictEqual(changelog.length, 0);
}

// ============================================================
// P5.4 — NDJSON 持久化
// ============================================================

async function testPersistenceWriteAndReload() {
  const tmpDir = createTempDir();
  try {
    const lc1 = createAssetLifecycle({ storageDir: tmpDir });
    lc1.registry.register({ assetId: 'p-lc', assetType: 'rule', name: 'persisted', currentVersion: '1.0.0' });
    lc1.submitForReview('p-lc', '1.0.0');
    lc1.approve('p-lc', '1.0.0', 'ok');

    // 变更日志应持久化
    const lc2 = createAssetLifecycle({ storageDir: tmpDir });
    const changelog = lc2.getChangeLog('p-lc');
    assert(changelog.length >= 1);
    assert.strictEqual(changelog[0].action, 'submitted');
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.4 — 导出
// ============================================================

async function testIndexExports() {
  const mod = require('../../src/asset/asset-lifecycle');
  assert(typeof mod.createAssetLifecycle === 'function');
  assert(typeof mod.AssetLifecycle === 'function');
}

// ============================================================
// main
// ============================================================

async function main() {
  // 工厂
  await testCreateLifecycleDefault();
  await testCreateLifecycleWithStorage();

  // submitForReview
  await testSubmitForReviewHappyPath();
  await testSubmitForReviewAssetNotFound();
  await testSubmitForReviewMultipleVersions();

  // approve
  await testApproveHappyPath();
  await testApproveNotSubmitted();

  // reject
  await testRejectHappyPath();
  await testRejectResubmit();

  // publish
  await testPublishHappyPath();
  await testPublishWithoutApprove();

  // deprecate
  await testDeprecateHappyPath();
  await testDeprecateNotPublished();

  // history
  await testGetReviewHistory();
  await testGetReviewHistoryEmpty();

  // changelog
  await testGetChangeLog();
  await testGetChangeLogEmpty();

  // 持久化
  await testPersistenceWriteAndReload();

  // 导出
  await testIndexExports();

  console.log('asset-lifecycle tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
