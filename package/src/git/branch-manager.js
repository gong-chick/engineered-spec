const { GitRepositoryDetector } = require('./git-repository-detector');
const { runGit } = require('./git-command');
const { createBranchName, createIssue } = require('./types');

class BranchManager {
  constructor(options = {}) {
    this.detector = options.detector || new GitRepositoryDetector();
  }

  branchExists(repoRoot, branchName) {
    return runGit(repoRoot, ['rev-parse', '--verify', '--quiet', `${branchName}^{commit}`], { allowFailure: true }).ok;
  }

  baseBranchExists(repoRoot, baseBranch) {
    if (!baseBranch) return false;
    return runGit(repoRoot, ['rev-parse', '--verify', '--quiet', `${baseBranch}^{commit}`], { allowFailure: true }).ok;
  }

  createUniqueBranchName(repoRoot, baseName, warnings) {
    if (!this.branchExists(repoRoot, baseName)) return baseName;
    warnings.push(createIssue('warning', 'BRANCH_ALREADY_EXISTS', `分支已存在，自动生成新分支名：${baseName}`, '无需处理'));
    let index = 2;
    let candidate = `${baseName}-${index}`;
    while (this.branchExists(repoRoot, candidate)) {
      index += 1;
      candidate = `${baseName}-${index}`;
    }
    return candidate;
  }

  async createBranch(input = {}) {
    const warnings = [];
    const errors = [];
    const detectorResult = this.detector.detect({ rootDir: input.repoRoot });
    const baseBranch = input.baseBranch || detectorResult.currentBranch || '';
    const branchNameBase = createBranchName({
      branchPrefix: input.branchPrefix || 'ai',
      runId: input.runId || 'run-local',
      requirementSummary: input.requirementSummary || '需求执行',
    });

    if (!detectorResult.isGitRepository) {
      errors.push(createIssue('error', 'GIT_REPOSITORY_NOT_FOUND', '目标目录不是 Git 仓库，无法创建分支', '请在 Git 仓库中执行'));
      return { branchName: branchNameBase, baseBranch, created: false, warnings, errors };
    }
    if (detectorResult.isDetachedHead) {
      errors.push(createIssue('error', 'GIT_DETACHED_HEAD', '当前仓库处于 detached HEAD，必须先切回分支', '请执行 git switch <branch> 后重试'));
      return { branchName: branchNameBase, baseBranch, created: false, warnings, errors };
    }
    if (!this.baseBranchExists(detectorResult.repoRoot, baseBranch)) {
      errors.push(createIssue('error', 'BASE_BRANCH_NOT_FOUND', `baseBranch 不存在：${baseBranch}`, '请检查 policy.branchPolicy.baseBranch 或切换到有效分支'));
      return { branchName: branchNameBase, baseBranch, created: false, warnings, errors };
    }

    const branchName = this.createUniqueBranchName(detectorResult.repoRoot, branchNameBase, warnings);
    const created = runGit(detectorResult.repoRoot, ['branch', branchName, baseBranch], { allowFailure: true });
    if (!created.ok) {
      errors.push(createIssue('error', 'BRANCH_CREATE_FAILED', `分支创建失败：${created.stderr.trim() || branchName}`, '请检查 Git 仓库状态'));
      return { branchName, baseBranch, created: false, warnings, errors };
    }
    return { branchName, baseBranch, created: true, warnings, errors };
  }

  deleteBranch(repoRoot, branchName) {
    return runGit(repoRoot, ['branch', '-D', branchName], { allowFailure: true });
  }
}

module.exports = {
  BranchManager,
};
