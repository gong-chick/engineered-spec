const fs = require('fs');
const path = require('path');
const { DirtyChecker } = require('../dirty-checker');
const { runGit } = require('../git-command');
const { summarizeChangedFiles } = require('../types');

class PatchSnapshotStrategy {
  constructor(options = {}) {
    this.dirtyChecker = options.dirtyChecker || new DirtyChecker();
  }

  handle(input) {
    const dirty = this.dirtyChecker.check({ repoRoot: input.repoRoot });
    if (dirty.clean) {
      return {
        canContinue: true,
        strategy: 'patch-snapshot',
        message: '工作区干净，无需生成 dirty patch 快照',
        warning: null,
        patchPath: null,
        wipCommitHash: null,
      };
    }

    const relativePatchPath = path.join('.ai-spec', 'runs', input.runId, 'dirty-snapshot.patch');
    const absolutePatchPath = path.join(input.repoRoot, relativePatchPath);
    const diff = runGit(input.repoRoot, ['diff', '--binary', 'HEAD'], { allowFailure: false }).stdout;
    const patchContent = [
      `# ai-spec-auto dirty snapshot`,
      `# runId: ${input.runId}`,
      `# requirement: ${input.requirementSummary || ''}`,
      `# changed files:`,
      summarizeChangedFiles(dirty.changedFiles).split(/\r?\n/).map((line) => `# ${line}`).join('\n'),
      '',
      diff,
    ].join('\n');
    fs.mkdirSync(path.dirname(absolutePatchPath), { recursive: true });
    fs.writeFileSync(absolutePatchPath, patchContent, 'utf8');

    return {
      canContinue: true,
      strategy: 'patch-snapshot',
      message: `已生成 dirty patch 快照：${relativePatchPath}`,
      warning: 'patch-snapshot 不会自动应用 patch，未暂存内容不会自动进入新 worktree',
      patchPath: relativePatchPath,
      wipCommitHash: null,
    };
  }
}

module.exports = {
  PatchSnapshotStrategy,
};
