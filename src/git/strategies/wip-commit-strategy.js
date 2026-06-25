const { DirtyChecker } = require('../dirty-checker');
const { runGit } = require('../git-command');

class WipCommitStrategy {
  constructor(options = {}) {
    this.dirtyChecker = options.dirtyChecker || new DirtyChecker();
  }

  handle(input) {
    const dirty = this.dirtyChecker.check({ repoRoot: input.repoRoot });
    if (dirty.clean) {
      return {
        canContinue: true,
        strategy: 'wip-commit',
        message: '工作区干净，无需创建 WIP commit',
        warning: null,
        patchPath: null,
        wipCommitHash: null,
      };
    }

    runGit(input.repoRoot, ['add', '-A'], { allowFailure: false });
    runGit(input.repoRoot, ['commit', '-m', `chore(ai-spec): 临时保存需求执行前改动 ${input.runId}`], { allowFailure: false });
    const commitHash = runGit(input.repoRoot, ['rev-parse', '--short', 'HEAD'], { allowFailure: false }).stdout.trim();
    return {
      canContinue: true,
      strategy: 'wip-commit',
      message: `已创建临时 WIP commit：${commitHash}`,
      warning: '这是 ai-spec-auto 为隔离执行创建的临时提交，后续需要人工确认是否保留',
      patchPath: null,
      wipCommitHash: commitHash,
    };
  }
}

module.exports = {
  WipCommitStrategy,
};
