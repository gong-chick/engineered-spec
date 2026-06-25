const { DirtyChecker } = require('../dirty-checker');
const { summarizeChangedFiles } = require('../types');

class BlockDirtyStrategy {
  constructor(options = {}) {
    this.dirtyChecker = options.dirtyChecker || new DirtyChecker();
  }

  handle(input) {
    const dirty = this.dirtyChecker.check({ repoRoot: input.repoRoot });
    if (dirty.clean) {
      return {
        canContinue: true,
        strategy: 'block',
        message: '工作区干净，可以继续创建分支和 worktree',
        warning: null,
        patchPath: null,
        wipCommitHash: null,
      };
    }
    return {
      canContinue: false,
      strategy: 'block',
      message: `当前工作区存在未提交变更，已按 block 策略阻断。\n变更文件：\n${summarizeChangedFiles(dirty.changedFiles)}`,
      warning: '未暂存内容不会自动进入新 worktree，请先提交、清理或显式选择其他 dirtyStrategy',
      patchPath: null,
      wipCommitHash: null,
    };
  }
}

module.exports = {
  BlockDirtyStrategy,
};
