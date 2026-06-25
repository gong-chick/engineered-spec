const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { createAssetQuality, AssetQuality } = require('../../src/asset/asset-quality');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-quality-'));
}

function cleanupTempDir(dir) {
  try { fs.rmSync(dir, { recursive: true, force: true }); } catch {}
}

// ============================================================
// P5.6 — 工厂函数
// ============================================================

async function testCreateQualityDefault() {
  const q = createAssetQuality();
  assert(q instanceof AssetQuality);
}

async function testCreateQualityWithStorage() {
  const tmpDir = createTempDir();
  try {
    const q = createAssetQuality({ storageDir: tmpDir });
    assert(q.feedback instanceof require('../../src/asset/asset-feedback').AssetFeedback);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.6 — computeScore 质量评分
// ============================================================

async function testComputeScoreWithFeedback() {
  const q = createAssetQuality();
  q.feedback.submit({ assetId: 'cs-01', version: '1.0.0', rating: 5 });
  q.feedback.submit({ assetId: 'cs-01', version: '1.0.0', rating: 3 });
  q.feedback.submit({ assetId: 'cs-01', version: '1.0.0', rating: 4 });

  const score = q.computeScore('cs-01');
  assert.strictEqual(score.assetId, 'cs-01');
  assert(typeof score.overallScore === 'number');
  assert(score.overallScore >= 0 && score.overallScore <= 100);
  assert(typeof score.dimensions === 'object');
  assert(typeof score.dimensions.averageRating === 'number');
  assert(typeof score.sampleSize === 'number');
  assert(typeof score.computedAt === 'string');
}

async function testComputeScoreNoFeedback() {
  const q = createAssetQuality();
  const score = q.computeScore('nonexistent');
  assert.strictEqual(score.assetId, 'nonexistent');
  assert.strictEqual(score.overallScore, 0);
  assert.strictEqual(score.sampleSize, 0);
}

async function testComputeScoreHighRating() {
  const q = createAssetQuality();
  for (let i = 0; i < 10; i++) {
    q.feedback.submit({ assetId: 'cs-high', version: '1.0.0', rating: 5 });
  }

  const score = q.computeScore('cs-high');
  assert(score.overallScore > 50);
  assert.strictEqual(score.dimensions.averageRating, 5);
}

// ============================================================
// P5.6 — getUsageMetrics 使用指标
// ============================================================

async function testGetUsageMetrics() {
  const q = createAssetQuality();
  q.installTracker.record({ assetId: 'um-01', version: '1.0.0', projectId: 'proj-A', status: 'installed' });
  q.installTracker.record({ assetId: 'um-01', version: '1.0.0', projectId: 'proj-B', status: 'installed' });
  q.installTracker.record({ assetId: 'um-01', version: '1.1.0', projectId: 'proj-A', status: 'upgraded' });

  const metrics = q.getUsageMetrics('um-01');
  assert(typeof metrics.totalInstalls === 'number');
  assert(metrics.totalInstalls >= 3);
  assert(typeof metrics.projectCount === 'number');
  assert(metrics.projectCount >= 2);
  assert(typeof metrics.upgradeCount === 'number');
}

async function testGetUsageMetricsEmpty() {
  const q = createAssetQuality();
  const metrics = q.getUsageMetrics('nonexistent');
  assert.strictEqual(metrics.totalInstalls, 0);
  assert.strictEqual(metrics.projectCount, 0);
}

// ============================================================
// P5.6 — getFeedbackAggregation 反馈聚合
// ============================================================

async function testGetFeedbackAggregation() {
  const q = createAssetQuality();
  q.feedback.submit({ assetId: 'fa-01', version: '1.0.0', rating: 5, category: 'quality' });
  q.feedback.submit({ assetId: 'fa-01', version: '1.0.0', rating: 3, category: 'usability' });
  q.feedback.submit({ assetId: 'fa-01', version: '1.1.0', rating: 4, category: 'quality' });

  const agg = q.getFeedbackAggregation('fa-01');
  assert.strictEqual(agg.totalFeedbacks, 3);
  assert(typeof agg.averageRating === 'number');
  assert(typeof agg.byCategory === 'object');
  assert.strictEqual(agg.byCategory.quality, 2);
}

async function testGetFeedbackAggregationEmpty() {
  const q = createAssetQuality();
  const agg = q.getFeedbackAggregation('nonexistent');
  assert.strictEqual(agg.totalFeedbacks, 0);
}

// ============================================================
// P5.6 — getRecommendationBasis 推荐依据
// ============================================================

async function testGetRecommendationBasis() {
  const q = createAssetQuality();
  q.feedback.submit({ assetId: 'rb-01', version: '1.0.0', rating: 5 });
  q.installTracker.record({ assetId: 'rb-01', version: '1.0.0', projectId: 'proj-A', status: 'installed' });

  const basis = q.getRecommendationBasis('rb-01');
  assert(typeof basis.qualityScore === 'number');
  assert(typeof basis.usageCount === 'number');
  assert(typeof basis.averageRating === 'number');
  assert(typeof basis.recommendationStrength === 'string');
}

async function testGetRecommendationBasisNoData() {
  const q = createAssetQuality();
  const basis = q.getRecommendationBasis('nonexistent');
  assert.strictEqual(basis.qualityScore, 0);
  assert.strictEqual(basis.recommendationStrength, 'weak');
}

// ============================================================
// P5.6 — rankAssets 资产排名
// ============================================================

async function testRankAssets() {
  const q = createAssetQuality();
  // 高评分资产
  for (let i = 0; i < 5; i++) {
    q.feedback.submit({ assetId: 'rank-high', version: '1.0.0', rating: 5 });
  }
  q.installTracker.record({ assetId: 'rank-high', version: '1.0.0', projectId: 'p1', status: 'installed' });

  // 低评分资产
  q.feedback.submit({ assetId: 'rank-low', version: '1.0.0', rating: 1 });
  q.installTracker.record({ assetId: 'rank-low', version: '1.0.0', projectId: 'p1', status: 'installed' });

  const ranked = q.rankAssets();
  assert(Array.isArray(ranked));
  assert(ranked.length >= 2);
  // 高评分应排在前面
  const highIdx = ranked.findIndex(r => r.assetId === 'rank-high');
  const lowIdx = ranked.findIndex(r => r.assetId === 'rank-low');
  assert(highIdx < lowIdx);
}

async function testRankAssetsEmpty() {
  const q = createAssetQuality();
  const ranked = q.rankAssets();
  assert.strictEqual(ranked.length, 0);
}

async function testRankAssetsWithLimit() {
  const q = createAssetQuality();
  for (let i = 0; i < 5; i++) {
    q.feedback.submit({ assetId: `rank-${i}`, version: '1.0.0', rating: 3 });
  }

  const ranked = q.rankAssets({ limit: 3 });
  assert.strictEqual(ranked.length, 3);
}

// ============================================================
// P5.6 — NDJSON 持久化
// ============================================================

async function testPersistenceWriteAndReload() {
  const tmpDir = createTempDir();
  try {
    const q1 = createAssetQuality({ storageDir: tmpDir });
    q1.feedback.submit({ assetId: 'p-q', version: '1.0.0', rating: 5 });
    q1.installTracker.record({ assetId: 'p-q', version: '1.0.0', projectId: 'proj-01', status: 'installed' });

    const q2 = createAssetQuality({ storageDir: tmpDir });
    const score = q2.computeScore('p-q');
    assert(score.sampleSize >= 1);
  } finally {
    cleanupTempDir(tmpDir);
  }
}

// ============================================================
// P5.6 — 导出
// ============================================================

async function testIndexExports() {
  const mod = require('../../src/asset/asset-quality');
  assert(typeof mod.createAssetQuality === 'function');
  assert(typeof mod.AssetQuality === 'function');
}

// ============================================================
// main
// ============================================================

async function main() {
  // 工厂
  await testCreateQualityDefault();
  await testCreateQualityWithStorage();

  // computeScore
  await testComputeScoreWithFeedback();
  await testComputeScoreNoFeedback();
  await testComputeScoreHighRating();

  // getUsageMetrics
  await testGetUsageMetrics();
  await testGetUsageMetricsEmpty();

  // getFeedbackAggregation
  await testGetFeedbackAggregation();
  await testGetFeedbackAggregationEmpty();

  // getRecommendationBasis
  await testGetRecommendationBasis();
  await testGetRecommendationBasisNoData();

  // rankAssets
  await testRankAssets();
  await testRankAssetsEmpty();
  await testRankAssetsWithLimit();

  // 持久化
  await testPersistenceWriteAndReload();

  // 导出
  await testIndexExports();

  console.log('asset-quality tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
