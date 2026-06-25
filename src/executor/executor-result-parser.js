const { ExecutorStatus, createExecutionResult, createExecutorErrorResult } = require('./types');

const VALID_STATUSES = new Set(Object.values(ExecutorStatus));

function isRelativePath(value) {
  return typeof value === 'string' && value.length > 0 && !value.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(value);
}

function normalizeChangedFiles(changedFiles) {
  if (!Array.isArray(changedFiles)) return [];
  return changedFiles
    .map((item) => (typeof item === 'string' ? { path: item } : item))
    .filter((item) => item && isRelativePath(item.path))
    .map((item) => ({
      path: item.path,
      status: item.status || 'modified',
    }));
}

function normalizeExecutionResult(raw) {
  if (!raw || typeof raw !== 'object' || typeof raw.success !== 'boolean' || !VALID_STATUSES.has(raw.status)) {
    return createExecutorErrorResult(
      'EXECUTOR_RESULT_INVALID',
      '执行器返回结果不符合 ExecutorExecutionResult 契约。',
      '请检查 Provider 实现，确保返回 success、status、summary、changedFiles、verification、tokenUsage、riskList、error。'
    );
  }

  return createExecutionResult({
    success: raw.success,
    status: raw.status,
    summary: raw.summary || '',
    changedFiles: normalizeChangedFiles(raw.changedFiles),
    verification: raw.verification || {},
    tokenUsage: raw.tokenUsage || {},
    riskList: Array.isArray(raw.riskList) ? raw.riskList : [],
    error: raw.error || null,
  });
}

module.exports = {
  normalizeChangedFiles,
  normalizeExecutionResult,
};
