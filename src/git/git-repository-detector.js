const path = require('path');
const { runGit } = require('./git-command');
const { createIssue } = require('./types');

class GitRepositoryDetector {
  detect(input = {}) {
    const rootDir = path.resolve(input.rootDir || process.cwd());
    const result = {
      isGitRepository: false,
      repoRoot: null,
      currentBranch: null,
      isDetachedHead: false,
      hasRemote: false,
      remotes: [],
      warnings: [],
      errors: [],
    };

    const inside = runGit(rootDir, ['rev-parse', '--is-inside-work-tree'], { allowFailure: true });
    if (!inside.ok || inside.stdout.trim() !== 'true') {
      result.warnings.push(createIssue('warning', 'GIT_REPOSITORY_NOT_FOUND', '目标目录不是 Git 仓库', '请在 Git 仓库内执行该命令'));
      return result;
    }

    const root = runGit(rootDir, ['rev-parse', '--show-toplevel'], { allowFailure: true });
    if (!root.ok) {
      result.errors.push(createIssue('error', 'GIT_REPOSITORY_ROOT_FAILED', '无法识别 Git 仓库根目录', '请确认 git 状态正常'));
      return result;
    }

    const branch = runGit(rootDir, ['symbolic-ref', '--short', 'HEAD'], { allowFailure: true });
    const remotes = runGit(rootDir, ['remote'], { allowFailure: true });
    result.isGitRepository = true;
    result.repoRoot = path.resolve(root.stdout.trim());
    result.currentBranch = branch.ok ? branch.stdout.trim() : null;
    result.isDetachedHead = !branch.ok;
    result.remotes = remotes.ok ? remotes.stdout.split(/\r?\n/).map((item) => item.trim()).filter(Boolean) : [];
    result.hasRemote = result.remotes.length > 0;
    return result;
  }
}

module.exports = {
  GitRepositoryDetector,
};
