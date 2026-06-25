const { runGit } = require('./git-command');

function parsePorcelainLine(line) {
  const status = line.slice(0, 2);
  const rawPath = line.slice(3).trim();
  const filePath = rawPath.includes(' -> ') ? rawPath.split(' -> ').pop() : rawPath;
  const indexStatus = status[0];
  const worktreeStatus = status[1];
  const untracked = status === '??';
  return {
    path: filePath,
    status,
    staged: !untracked && indexStatus !== ' ' && indexStatus !== '?',
    unstaged: !untracked && worktreeStatus !== ' ' && worktreeStatus !== '?',
    untracked,
  };
}

class DirtyChecker {
  check(input = {}) {
    const repoRoot = input.repoRoot;
    const status = runGit(repoRoot, ['status', '--porcelain'], { allowFailure: false });
    const changedFiles = status.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .map(parsePorcelainLine);

    return {
      clean: changedFiles.length === 0,
      changedFiles,
      summary: {
        stagedCount: changedFiles.filter((item) => item.staged).length,
        unstagedCount: changedFiles.filter((item) => item.unstaged).length,
        untrackedCount: changedFiles.filter((item) => item.untracked).length,
      },
    };
  }
}

module.exports = {
  DirtyChecker,
  parsePorcelainLine,
};
