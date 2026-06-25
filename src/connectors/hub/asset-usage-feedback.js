const crypto = require('crypto');

function hash(value, length = 12) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function normalizeStatus(value) {
  const text = String(value || '').trim();
  if (['success', 'passed', 'pass', 'ok', '成功', '通过'].includes(text)) return 'success';
  if (['failure', 'failed', 'fail', 'error', '失败'].includes(text)) return 'failure';
  if (['blocked', '阻塞'].includes(text)) return 'blocked';
  return 'unknown';
}

function normalizeAssetUsageFeedback(input = {}) {
  const timestamp = input.timestamp || new Date().toISOString();
  const assetId = input.assetId || input.asset?.assetId || input.asset?.slug || '';
  const assetType = input.assetType || input.asset?.assetType || input.asset?.kind || 'rule';
  const runId = input.runId || '';
  return {
    feedbackId: input.feedbackId || `fb_${hash(`${runId}:${assetId}:${timestamp}`)}`,
    runId,
    projectId: input.projectId || '',
    assetId,
    assetType,
    status: normalizeStatus(input.status || input.result?.status),
    metrics: {
      ...(input.metrics && typeof input.metrics === 'object' ? input.metrics : {}),
      adopted: input.metrics?.adopted ?? input.adopted ?? true,
      hookBlocked: input.metrics?.hookBlocked ?? false,
      testPassed: input.metrics?.testPassed ?? input.result?.success === true,
    },
    timestamp,
  };
}

function buildUsageFeedbackList(input = {}) {
  const assets = Array.isArray(input.assetsUsed) ? input.assetsUsed : [];
  if (assets.length === 0) return [normalizeAssetUsageFeedback(input)];
  return assets.map((asset) => normalizeAssetUsageFeedback({ ...input, asset }));
}

module.exports = {
  buildUsageFeedbackList,
  normalizeAssetUsageFeedback,
};
