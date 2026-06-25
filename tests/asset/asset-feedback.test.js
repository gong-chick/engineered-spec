const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  FEEDBACK_CATEGORIES,
  VALID_FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  VALID_FEEDBACK_STATUSES,
  createAssetFeedback,
  AssetFeedback,
} = require('../../src/asset/asset-feedback');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-feedback-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ============================================================
// P5.1.5 — 常量与工厂函数
// ============================================================

async function testCategoryConstants() {
  assert.strictEqual(FEEDBACK_CATEGORIES.QUALITY, 'quality');
  assert.strictEqual(FEEDBACK_CATEGORIES.USABILITY, 'usability');
  assert.strictEqual(FEEDBACK_CATEGORIES.PERFORMANCE, 'performance');
  assert.strictEqual(FEEDBACK_CATEGORIES.BUG, 'bug');
  assert.strictEqual(VALID_FEEDBACK_CATEGORIES.size, 4);
}

async function testStatusConstants() {
  assert.strictEqual(FEEDBACK_STATUSES.PENDING, 'pending');
  assert.strictEqual(FEEDBACK_STATUSES.REVIEWED, 'reviewed');
  assert.strictEqual(FEEDBACK_STATUSES.RESOLVED, 'resolved');
  assert.strictEqual(VALID_FEEDBACK_STATUSES.size, 3);
}

async function testCreateFeedbackDefault() {
  const feedback = createAssetFeedback();
  assert(feedback instanceof AssetFeedback);
}

async function testCreateFeedbackWithStorage() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'feedback.ndjson');
    const feedback = createAssetFeedback({ storagePath });
    assert.strictEqual(feedback.storagePath, storagePath);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.1.5 — submit 提交反馈
// ============================================================

async function testSubmitHappyPath() {
  const feedback = createAssetFeedback();
  const record = feedback.submit({
    assetId: 'asset-01',
    version: '1.0.0',
    projectId: 'proj-01',
    rating: 4,
    comment: '很好用',
    category: 'quality',
  });
  assert(typeof record.feedbackId === 'string');
  assert.strictEqual(record.assetId, 'asset-01');
  assert.strictEqual(record.version, '1.0.0');
  assert.strictEqual(record.projectId, 'proj-01');
  assert.strictEqual(record.rating, 4);
  assert.strictEqual(record.comment, '很好用');
  assert.strictEqual(record.category, 'quality');
  assert.strictEqual(record.status, 'pending');
  assert(typeof record.createdAt === 'string');
  assert.deepStrictEqual(record.metadata, {});
}

async function testSubmitDefaults() {
  const feedback = createAssetFeedback();
  const record = feedback.submit({ assetId: 'a-02', version: '1.0.0' });
  assert.strictEqual(record.rating, 0);
  assert.strictEqual(record.comment, '');
  assert.strictEqual(record.category, 'quality');
  assert.strictEqual(record.projectId, '');
}

async function testSubmitMissingAssetId() {
  const feedback = createAssetFeedback();
  try {
    feedback.submit({ version: '1.0.0' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('assetId'));
  }
}

async function testSubmitMissingVersion() {
  const feedback = createAssetFeedback();
  try {
    feedback.submit({ assetId: 'a-01' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('version'));
  }
}

async function testSubmitInvalidRating() {
  const feedback = createAssetFeedback();
  try {
    feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 6 });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('rating'));
  }
}

async function testSubmitInvalidCategory() {
  const feedback = createAssetFeedback();
  try {
    feedback.submit({ assetId: 'a-01', version: '1.0.0', category: 'unknown' });
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('category'));
  }
}

// ============================================================
// P5.1.5 — get / list
// ============================================================

async function testGetFeedback() {
  const feedback = createAssetFeedback();
  const r1 = feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 5 });
  const got = feedback.get(r1.feedbackId);
  assert.strictEqual(got.rating, 5);
  assert.strictEqual(got.assetId, 'a-01');
}

async function testGetFeedbackNotFound() {
  const feedback = createAssetFeedback();
  const got = feedback.get('nonexistent');
  assert.strictEqual(got, null);
}

async function testListAll() {
  const feedback = createAssetFeedback();
  feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 4 });
  feedback.submit({ assetId: 'a-02', version: '1.0.0', rating: 3 });
  const list = feedback.list();
  assert.strictEqual(list.length, 2);
}

async function testListFilterByAssetId() {
  const feedback = createAssetFeedback();
  feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 4 });
  feedback.submit({ assetId: 'a-02', version: '1.0.0', rating: 3 });
  const list = feedback.list({ assetId: 'a-01' });
  assert.strictEqual(list.length, 1);
  assert.strictEqual(list[0].assetId, 'a-01');
}

async function testListFilterByRating() {
  const feedback = createAssetFeedback();
  feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 5 });
  feedback.submit({ assetId: 'a-02', version: '1.0.0', rating: 3 });
  feedback.submit({ assetId: 'a-03', version: '1.0.0', rating: 5 });
  const list = feedback.list({ rating: 5 });
  assert.strictEqual(list.length, 2);
}

async function testListFilterByStatus() {
  const feedback = createAssetFeedback();
  const r1 = feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 4 });
  feedback.submit({ assetId: 'a-02', version: '1.0.0', rating: 3 });
  feedback.updateStatus(r1.feedbackId, 'reviewed');
  const list = feedback.list({ status: 'reviewed' });
  assert.strictEqual(list.length, 1);
}

async function testListWithLimit() {
  const feedback = createAssetFeedback();
  for (let i = 0; i < 10; i++) {
    feedback.submit({ assetId: `a-${i}`, version: '1.0.0', rating: 3 });
  }
  const list = feedback.list({ limit: 3 });
  assert.strictEqual(list.length, 3);
}

// ============================================================
// P5.1.5 — updateStatus
// ============================================================

async function testUpdateStatusHappyPath() {
  const feedback = createAssetFeedback();
  const r1 = feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 4 });
  const updated = feedback.updateStatus(r1.feedbackId, 'resolved');
  assert.strictEqual(updated.status, 'resolved');
}

async function testUpdateStatusInvalid() {
  const feedback = createAssetFeedback();
  const r1 = feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 4 });
  try {
    feedback.updateStatus(r1.feedbackId, 'unknown');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('feedback status'));
  }
}

async function testUpdateStatusNotFound() {
  const feedback = createAssetFeedback();
  try {
    feedback.updateStatus('nonexistent', 'reviewed');
    assert.fail('应抛出错误');
  } catch (err) {
    assert(err.message.includes('不存在'));
  }
}

// ============================================================
// P5.1.5 — getAssetSummary / getAverageRating
// ============================================================

async function testGetAssetSummary() {
  const feedback = createAssetFeedback();
  feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 5, category: 'quality' });
  feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 3, category: 'usability' });
  feedback.submit({ assetId: 'a-01', version: '1.1.0', rating: 4, category: 'quality' });
  feedback.submit({ assetId: 'a-02', version: '1.0.0', rating: 2 });
  const summary = feedback.getAssetSummary('a-01');
  assert.strictEqual(summary.totalFeedbacks, 3);
  assert.strictEqual(summary.averageRating, 4);
  assert.strictEqual(summary.byCategory.quality, 2);
  assert.strictEqual(summary.byCategory.usability, 1);
  assert.strictEqual(summary.byStatus.pending, 3);
}

async function testGetAssetSummaryEmpty() {
  const feedback = createAssetFeedback();
  const summary = feedback.getAssetSummary('nonexistent');
  assert.strictEqual(summary.totalFeedbacks, 0);
  assert.strictEqual(summary.averageRating, 0);
  assert.deepStrictEqual(summary.byCategory, {});
  assert.deepStrictEqual(summary.byStatus, {});
}

async function testGetAverageRating() {
  const feedback = createAssetFeedback();
  feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 5 });
  feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 3 });
  feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 4 });
  const avg = feedback.getAverageRating('a-01');
  assert.strictEqual(avg, 4);
}

async function testGetAverageRatingZero() {
  const feedback = createAssetFeedback();
  const avg = feedback.getAverageRating('nonexistent');
  assert.strictEqual(avg, 0);
}

async function testGetAverageRatingIgnoresZeroRating() {
  const feedback = createAssetFeedback();
  feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 5 });
  feedback.submit({ assetId: 'a-01', version: '1.0.0', rating: 0 }); // 默认值
  const avg = feedback.getAverageRating('a-01');
  assert.strictEqual(avg, 5);
}

// ============================================================
// P5.1.5 — NDJSON 持久化
// ============================================================

async function testPersistenceWriteAndReload() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'feedback.ndjson');
    const f1 = createAssetFeedback({ storagePath });
    f1.submit({ assetId: 'p-01', version: '1.0.0', rating: 5, comment: 'excellent' });
    f1.submit({ assetId: 'p-01', version: '1.1.0', rating: 3, comment: 'ok' });

    const f2 = createAssetFeedback({ storagePath });
    const list = f2.list();
    assert.strictEqual(list.length, 2);
    assert.strictEqual(f2.getAverageRating('p-01'), 4);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

async function testPersistenceBadLineTolerance() {
  const tmpDir = createTempDir();
  try {
    const storagePath = path.join(tmpDir, 'feedback.ndjson');
    const goodLine = JSON.stringify({ feedbackId: 'fb-1', assetId: 'bl-01', version: '1.0.0', projectId: '', rating: 4, comment: '', category: 'quality', status: 'pending', createdAt: '2026-01-01T00:00:00.000Z', metadata: {} });
    fs.writeFileSync(storagePath, goodLine + '\n{bad json\n' + goodLine.replace('"fb-1"', '"fb-2"') + '\n', 'utf-8');

    const feedback = createAssetFeedback({ storagePath });
    assert.strictEqual(feedback.list().length, 2);
    assert.strictEqual(feedback.getLoadErrors().length, 1);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.8 — metadata 脱敏
// ============================================================

async function testMetadataRedactsToken() {
  const af = createAssetFeedback();
  const r = af.submit({ assetId: 'a', version: '1.0.0', metadata: { token: 'secret123' } });
  assert.strictEqual(r.metadata.token, '[REDACTED]');
}

async function testMetadataRedactsPassword() {
  const af = createAssetFeedback();
  const r = af.submit({ assetId: 'a', version: '1.0.0', metadata: { password: 'pw123' } });
  assert.strictEqual(r.metadata.password, '[REDACTED]');
}

async function testMetadataRedactsSecret() {
  const af = createAssetFeedback();
  const r = af.submit({ assetId: 'a', version: '1.0.0', metadata: { secret: 's1' } });
  assert.strictEqual(r.metadata.secret, '[REDACTED]');
}

async function testMetadataRedactsApiKey() {
  const af = createAssetFeedback();
  const r = af.submit({ assetId: 'a', version: '1.0.0', metadata: { apiKey: 'key1' } });
  assert.strictEqual(r.metadata.apiKey, '[REDACTED]');
}

async function testMetadataRedactsRawPrompt() {
  const af = createAssetFeedback();
  const r = af.submit({ assetId: 'a', version: '1.0.0', metadata: { rawPrompt: 'user input' } });
  assert.strictEqual(r.metadata.rawPrompt, '[REDACTED]');
}

async function testGetListReturnsCopies() {
  const af = createAssetFeedback();
  af.submit({ assetId: 'a', version: '1.0.0', metadata: { x: 1 } });
  const list = af.list();
  list[0].metadata.x = 999;
  const list2 = af.list();
  assert.strictEqual(list2[0].metadata.x, 1);
}

// ============================================================
// P5.1.5 — 导出
// ============================================================

async function testIndexExports() {
  const mod = require('../../src/asset/asset-feedback');
  assert(typeof mod.createAssetFeedback === 'function');
  assert(typeof mod.AssetFeedback === 'function');
  assert(typeof mod.FEEDBACK_CATEGORIES === 'object');
  assert(typeof mod.FEEDBACK_STATUSES === 'object');
}

// ============================================================
// main
// ============================================================

async function main() {
  // 常量与工厂
  await testCategoryConstants();
  await testStatusConstants();
  await testCreateFeedbackDefault();
  await testCreateFeedbackWithStorage();

  // submit
  await testSubmitHappyPath();
  await testSubmitDefaults();
  await testSubmitMissingAssetId();
  await testSubmitMissingVersion();
  await testSubmitInvalidRating();
  await testSubmitInvalidCategory();

  // get / list
  await testGetFeedback();
  await testGetFeedbackNotFound();
  await testListAll();
  await testListFilterByAssetId();
  await testListFilterByRating();
  await testListFilterByStatus();
  await testListWithLimit();

  // updateStatus
  await testUpdateStatusHappyPath();
  await testUpdateStatusInvalid();
  await testUpdateStatusNotFound();

  // getAssetSummary / getAverageRating
  await testGetAssetSummary();
  await testGetAssetSummaryEmpty();
  await testGetAverageRating();
  await testGetAverageRatingZero();
  await testGetAverageRatingIgnoresZeroRating();

  // 持久化
  await testPersistenceWriteAndReload();
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

  console.log('asset-feedback tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
