const path = require('path');
const { BranchManager } = require('./branch-manager');
const { WorktreeManager } = require('./worktree-manager');
const { createBranchName, createIssue, createWorktreeName, safeSegment } = require('./types');

class MultiRepoWorktreePlanner {
  constructor(options = {}) {
    this.worktreeManager = options.worktreeManager || new WorktreeManager(options);
    this.branchManager = options.branchManager || new BranchManager(options);
  }

  plan(input = {}) {
    const runLeaf = createWorktreeName({
      runId: input.runId || 'run-local',
      requirementSummary: input.requirementSummary || '需求执行',
    });
    return {
      runId: input.runId || 'run-local',
      repos: (input.repos || []).map((repo) => {
        const repoId = repo.repoId || 'repo';
        return {
          repoId,
          repoRoot: repo.repoRoot,
          branchName: createBranchName({
            branchPrefix: input.branchPrefix || 'ai',
            runId: input.runId || 'run-local',
            requirementSummary: input.requirementSummary || repoId,
          }),
          worktreePath: path.join(input.worktreeRoot || '../.ai-worktrees', runLeaf, safeSegment(repoId, 'repo')),
          status: 'planned',
        };
      }),
      warnings: [],
      errors: [],
    };
  }

  async create(input = {}) {
    const plan = this.plan(input);
    const created = [];

    for (const repoPlan of plan.repos) {
      const result = await this.worktreeManager.create({
        repoRoot: repoPlan.repoRoot,
        baseBranch: (input.repos || []).find((repo) => repo.repoId === repoPlan.repoId)?.baseBranch,
        branchPrefix: input.branchPrefix || 'ai',
        worktreeRoot: input.worktreeRoot || '../.ai-worktrees',
        worktreeName: path.join(createWorktreeName({
          runId: input.runId || 'run-local',
          requirementSummary: input.requirementSummary || '需求执行',
        }), safeSegment(repoPlan.repoId, 'repo')),
        runId: input.runId || 'run-local',
        requirementSummary: input.requirementSummary || '需求执行',
      });
      repoPlan.branchName = result.branchName;
      repoPlan.worktreePath = result.worktreePath;
      plan.warnings.push(...result.warnings);
      plan.errors.push(...result.errors);
      if (!result.created) {
        repoPlan.status = 'failed';
        await this.rollbackCreated(created, plan);
        return plan;
      }
      repoPlan.status = 'created';
      created.push({ ...repoPlan });
    }
    return plan;
  }

  async rollbackCreated(createdRepos, plan) {
    for (const repo of createdRepos.reverse()) {
      const removeResult = this.worktreeManager.removeWorktree(repo.repoRoot, repo.worktreePath);
      if (!removeResult.ok) {
        plan.warnings.push(createIssue('warning', 'WORKTREE_ROLLBACK_FAILED', `回滚 worktree 失败：${repo.repoId}`, '请手动执行 git worktree remove --force'));
      }
      const branchResult = this.branchManager.deleteBranch(repo.repoRoot, repo.branchName);
      if (!branchResult.ok) {
        plan.warnings.push(createIssue('warning', 'BRANCH_ROLLBACK_FAILED', `回滚分支失败：${repo.branchName}`, '请手动删除临时分支'));
      }
      const target = plan.repos.find((item) => item.repoId === repo.repoId);
      if (target) target.status = 'rolled-back';
    }
  }
}

module.exports = {
  MultiRepoWorktreePlanner,
};
