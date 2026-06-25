const { DirtyChecker } = require('../dirty-checker');

class IgnoreDirtyStrategy {
  constructor(options = {}) {
    this.dirtyChecker = options.dirtyChecker || new DirtyChecker();
  }

  handle(input) {
    const dirty = this.dirtyChecker.check({ repoRoot: input.repoRoot });
    if (dirty.clean) {
      return {
        canContinue: true,
        strategy: 'ignore',
        message: '工作区干净，可以继续',
        warning: null,
        patchPath: null,
        wipCommitHash: null,
      };
    }
    return {
      canContinue: true,
      strategy: 'ignore',
      message: '已按 ignore 策略允许继续',
      warning: '当前仓库 dirty，未暂存内容不会自动进入新 worktree，请确认风险',
      patchPath: null,
      wipCommitHash: null,
    };
  }
}

module.exports = {
  IgnoreDirtyStrategy,
};
