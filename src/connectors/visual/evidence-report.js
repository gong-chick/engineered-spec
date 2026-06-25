const STATUS_MAP = {
  success: 'success',
  passed: 'success',
  pass: 'success',
  ok: 'success',
  failure: 'failure',
  failed: 'failure',
  fail: 'failure',
  error: 'failure',
  blocked: 'blocked',
  通过: 'success',
  成功: 'success',
  失败: 'failure',
  阻塞: 'blocked',
  待执行: 'unknown',
};

function normalizeFinalStatus(value) {
  return STATUS_MAP[String(value || '').trim()] || 'unknown';
}

function normalizeChangedFiles(changedFiles = []) {
  return (Array.isArray(changedFiles) ? changedFiles : []).map((file) => ({
    path: String(file.path || ''),
    changeType: file.changeType || file.action || 'modify',
    summary: file.summary || file.description || '',
  })).filter((file) => file.path);
}

function normalizeEvidenceReport(input = {}) {
  return {
    ...input,
    runId: input.runId || '',
    projectId: input.projectId || '',
    taskId: input.taskId || '',
    specId: input.specId || '',
    changedFiles: normalizeChangedFiles(input.changedFiles),
    testResults: Array.isArray(input.testResults) ? input.testResults : [],
    hookResults: Array.isArray(input.hookResults) ? input.hookResults : [],
    repairResults: Array.isArray(input.repairResults) ? input.repairResults : [],
    reviewResults: Array.isArray(input.reviewResults) ? input.reviewResults : [],
    finalStatus: normalizeFinalStatus(input.finalStatus || input.status),
  };
}

module.exports = {
  normalizeEvidenceReport,
  normalizeFinalStatus,
};
