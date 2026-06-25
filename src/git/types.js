const crypto = require('crypto');

const DIRTY_STRATEGIES = ['block', 'patch-snapshot', 'wip-commit', 'ignore'];

const DEFAULT_BRANCH_POLICY = {
  autoCreateBranch: true,
  autoCreateWorktree: true,
  baseBranch: '',
  branchPrefix: 'ai',
  worktreeRoot: '../.ai-worktrees',
  dirtyStrategy: 'block',
};

function createIssue(level, code, message, suggestion) {
  return { level, code, message, suggestion };
}

function shortHash(text, length = 8) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, length);
}

function safeSegment(value, fallback = 'item') {
  const normalized = String(value || '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
  return normalized || `${fallback}-${shortHash(value || fallback)}`;
}

function createRequirementSlug(requirementSummary) {
  const slug = safeSegment(requirementSummary, 'task');
  if (/^task-[a-f0-9]{8}$/.test(slug)) return slug;
  return slug;
}

function createBranchName({ branchPrefix = 'ai', runId, requirementSummary }) {
  const prefix = String(branchPrefix || 'ai').replace(/^\/+|\/+$/g, '') || 'ai';
  return `${prefix}/${safeSegment(runId, 'run')}-${createRequirementSlug(requirementSummary)}`;
}

function createWorktreeName({ runId, requirementSummary }) {
  return `${safeSegment(runId, 'run')}-${createRequirementSlug(requirementSummary)}`;
}

function normalizeDirtyStrategy(strategy) {
  const value = strategy || DEFAULT_BRANCH_POLICY.dirtyStrategy;
  if (!DIRTY_STRATEGIES.includes(value)) {
    throw new Error(`未知 dirtyStrategy：${value}，允许值：${DIRTY_STRATEGIES.join(', ')}`);
  }
  return value;
}

function summarizeChangedFiles(changedFiles = []) {
  if (changedFiles.length === 0) return '无未提交变更';
  return changedFiles.map((file) => `${file.status} ${file.path}`).join('\n');
}

module.exports = {
  DEFAULT_BRANCH_POLICY,
  DIRTY_STRATEGIES,
  createBranchName,
  createIssue,
  createRequirementSlug,
  createWorktreeName,
  normalizeDirtyStrategy,
  safeSegment,
  shortHash,
  summarizeChangedFiles,
};
