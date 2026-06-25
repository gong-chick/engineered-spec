const crypto = require('crypto');

const STATUS_MAP = {
  success: 'success',
  passed: 'success',
  pass: 'success',
  ok: 'success',
  running: 'running',
  pending: 'running',
  skipped: 'skipped',
  skip: 'skipped',
  blocked: 'blocked',
  failure: 'failure',
  failed: 'failure',
  fail: 'failure',
  error: 'failure',
  通过: 'success',
  成功: 'success',
  失败: 'failure',
  阻塞: 'blocked',
  待执行: 'unknown',
};

const SEVERITY_MAP = {
  info: 'info',
  warn: 'warn',
  warning: 'warn',
  error: 'error',
  failed: 'error',
  blocking: 'blocking',
  blocked: 'blocking',
};

function hash(value, length = 12) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function normalizeStatus(value) {
  return STATUS_MAP[String(value || '').trim()] || 'unknown';
}

function normalizeSeverity(value) {
  return SEVERITY_MAP[String(value || '').trim()] || 'info';
}

function normalizeRunEvent(input = {}) {
  const timestamp = input.timestamp || input.occurredAt || input.createdAt || new Date().toISOString();
  const eventType = input.eventType || input.type || 'runtime.event';
  const status = normalizeStatus(input.status || input.state);
  const severity = normalizeSeverity(input.severity || input.level || (status === 'failure' ? 'error' : status));
  const metadata = {
    ...(input.metadata && typeof input.metadata === 'object' ? input.metadata : {}),
    ...(input.payload && typeof input.payload === 'object' ? input.payload : {}),
  };
  const eventId = input.eventId || `evt_${hash(`${input.runId || 'run'}:${eventType}:${timestamp}`)}`;

  return {
    ...input,
    eventId,
    runId: input.runId || '',
    projectId: input.projectId || '',
    eventType,
    stage: input.stage || input.state || 'unknown',
    status,
    severity,
    message: input.message || input.summary || '',
    timestamp,
    metadata,

    // 兼容旧版 Visual Collector。
    type: input.type || eventType,
    level: input.level || severity,
    occurredAt: input.occurredAt || timestamp,
  };
}

module.exports = {
  normalizeRunEvent,
  normalizeSeverity,
  normalizeStatus,
};
