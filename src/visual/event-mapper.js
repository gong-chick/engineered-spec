const crypto = require('crypto');
const { readProjectState } = require('../project/project-files');
const { createPrivacy } = require('./privacy-filter');

function stableHash(value, length = 16) {
  return crypto.createHash('sha256').update(String(value || '')).digest('hex').slice(0, length);
}

function asObject(value) {
  return value && typeof value === 'object' && !Array.isArray(value) ? value : {};
}

function getVisualProjectContext(rootDir) {
  const state = readProjectState(rootDir);
  const project = state.project || {};
  const workspace = state.files && state.files.project ? readOptionalWorkspace(rootDir) : null;
  return {
    projectId: project.projectId || state.lock?.projectId || '',
    workspaceId: workspace?.workspaceId || state.lock?.workspaceId || '',
    projectName: project.projectName || '',
    projectType: project.projectType || 'single',
    projectHash: project.projectId ? `sha256:${stableHash(project.projectId, 32)}` : '',
    techProfile: asObject(project.techProfile),
    manifest: asObject(project.manifest),
    packages: Array.isArray(workspace?.packages) ? workspace.packages : [],
  };
}

function readOptionalWorkspace(rootDir) {
  try {
    const { readJsonFile } = require('../project/project-files');
    const path = require('path');
    return readJsonFile(path.join(rootDir, '.ai-spec/workspace.json'));
  } catch (_error) {
    return null;
  }
}

function manifestForRun(rootDir, run = {}) {
  const state = readProjectState(rootDir);
  return asObject(run.manifest || state.project?.manifest || state.lock?.manifest);
}

function buildProjectStatePayload(rootDir, options = {}) {
  const context = getVisualProjectContext(rootDir);
  const reportedAt = options.reportedAt || new Date().toISOString();
  return {
    eventId: options.eventId || `project-state:${context.projectId}:${stableHash(reportedAt.slice(0, 10), 8)}`,
    projectId: context.projectId,
    workspaceId: context.workspaceId,
    projectHash: context.projectHash,
    name: context.projectName,
    type: context.projectType === 'package' ? 'workspace' : 'single',
    techProfile: context.techProfile,
    manifest: context.manifest || {},
    packages: context.packages,
    privacy: createPrivacy(),
    reportedAt,
  };
}

function buildRunEventPayload(rootDir, run = {}, event = {}, options = {}) {
  const context = getVisualProjectContext(rootDir);
  const occurredAt = options.occurredAt || event.createdAt || new Date().toISOString();
  const type = options.type || event.type || 'runtime_event';
  const eventIndex = typeof options.eventIndex === 'number' ? options.eventIndex : (run.events || []).length;
  return {
    eventId: options.eventId || `${run.runId || 'run'}:${type}:${eventIndex}`,
    runId: run.runId || '',
    projectId: context.projectId,
    workspaceId: context.workspaceId,
    type,
    state: options.state || run.state || '',
    stage: options.stage || run.stage || '',
    level: options.level || 'info',
    executor: options.executor || run.executor?.type || '',
    manifest: manifestForRun(rootDir, run),
    payload: options.payload || event.detail || {},
    occurredAt,
    privacy: createPrivacy(),
  };
}

function buildHistoryPayload(rootDir, run = {}, options = {}) {
  const context = getVisualProjectContext(rootDir);
  const createdAt = options.createdAt || new Date().toISOString();
  const changedFiles = options.changedFiles || run.executor?.lastResult?.changedFiles || [];
  return {
    historyId: options.historyId || `history:${run.runId || 'run'}:${run.state || 'state'}`,
    runId: run.runId || '',
    projectId: context.projectId,
    title: run.requirement?.summary || '未命名需求',
    summary: options.summary || `Run ${run.runId || ''} 当前状态：${run.state || ''}`,
    changedFiles,
    assetsUsed: options.assetsUsed || [],
    verificationSummary: run.executor?.lastResult?.verification || {},
    createdAt,
    privacy: createPrivacy(),
  };
}

function buildIncidentPayload(rootDir, incident = {}, options = {}) {
  const context = getVisualProjectContext(rootDir);
  return {
    incidentId: incident.incidentId || '',
    runId: incident.runId || '',
    projectId: context.projectId,
    type: incident.type || 'unknown',
    level: incident.level || 'error',
    stage: incident.stage || '',
    message: incident.message || '',
    suggestion: incident.suggestion || '',
    diagnoseResult: options.diagnoseResult || {},
    recoveryAction: options.recoveryAction || {},
    status: options.status || 'open',
    createdAt: incident.createdAt || new Date().toISOString(),
    privacy: createPrivacy(),
  };
}

module.exports = {
  buildHistoryPayload,
  buildIncidentPayload,
  buildProjectStatePayload,
  buildRunEventPayload,
  getVisualProjectContext,
  stableHash,
};
