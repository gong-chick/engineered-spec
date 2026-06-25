const fs = require('fs');
const path = require('path');
const { BranchManager } = require('./branch-manager');
const { runGit } = require('./git-command');
const { createIssue, createWorktreeName } = require('./types');

function resolveWorktreeRoot(repoRoot, worktreeRoot) {
  if (path.isAbsolute(worktreeRoot)) return worktreeRoot;
  return path.resolve(repoRoot, worktreeRoot || '../.ai-worktrees');
}

function uniquePath(basePath, warnings) {
  if (!fs.existsSync(basePath)) return basePath;
  warnings.push(createIssue('warning', 'WORKTREE_PATH_EXISTS', `worktree 路径已存在，自动追加序号：${basePath}`, '无需处理'));
  let index = 2;
  let candidate = `${basePath}-${index}`;
  while (fs.existsSync(candidate)) {
    index += 1;
    candidate = `${basePath}-${index}`;
  }
  return candidate;
}

class WorktreeManager {
  constructor(options = {}) {
    this.branchManager = options.branchManager || new BranchManager(options);
  }

  async create(input = {}) {
    const warnings = [];
    const errors = [];
    const branchResult = await this.branchManager.createBranch(input);
    warnings.push(...branchResult.warnings);
    errors.push(...branchResult.errors);
    const worktreeRoot = resolveWorktreeRoot(input.repoRoot, input.worktreeRoot || '../.ai-worktrees');
    const leaf = input.worktreeName || createWorktreeName({
      runId: input.runId || 'run-local',
      requirementSummary: input.requirementSummary || '需求执行',
    });
    const worktreePath = uniquePath(path.join(worktreeRoot, leaf), warnings);

    if (!branchResult.created) {
      return {
        worktreePath,
        branchName: branchResult.branchName,
        created: false,
        warnings,
        errors,
      };
    }

    const result = runGit(input.repoRoot, ['worktree', 'add', worktreePath, branchResult.branchName], { allowFailure: true });
    if (!result.ok) {
      const rollback = this.branchManager.deleteBranch(input.repoRoot, branchResult.branchName);
      if (!rollback.ok) {
        warnings.push(createIssue('warning', 'BRANCH_ROLLBACK_FAILED', `worktree 创建失败后回滚分支失败：${branchResult.branchName}`, '请手动检查 Git 分支'));
      }
      errors.push(createIssue('error', 'WORKTREE_CREATE_FAILED', `worktree 创建失败：${result.stderr.trim() || result.stdout.trim()}`, '请检查 worktreeRoot 和 Git 状态'));
      return {
        worktreePath,
        branchName: branchResult.branchName,
        created: false,
        warnings,
        errors,
      };
    }

    return {
      worktreePath,
      branchName: branchResult.branchName,
      created: true,
      warnings,
      errors,
    };
  }

  removeWorktree(repoRoot, worktreePath) {
    return runGit(repoRoot, ['worktree', 'remove', '--force', worktreePath], { allowFailure: true });
  }
}

module.exports = {
  WorktreeManager,
  resolveWorktreeRoot,
};
