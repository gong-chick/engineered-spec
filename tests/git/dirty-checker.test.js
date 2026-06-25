const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DirtyChecker } = require('../../src/git/dirty-checker');
const { git, initGitRepo, writeText } = require('./git-test-utils');

async function testCleanRepo() {
  const repo = initGitRepo('ai-spec-dirty-clean-');
  const result = new DirtyChecker().check({ repoRoot: repo });

  assert.strictEqual(result.clean, true);
  assert.strictEqual(result.changedFiles.length, 0);
  assert.strictEqual(result.summary.stagedCount, 0);
  assert.strictEqual(result.summary.unstagedCount, 0);
  assert.strictEqual(result.summary.untrackedCount, 0);
}

async function testDirtyRepo() {
  const repo = initGitRepo('ai-spec-dirty-repo-');
  writeText(path.join(repo, 'README.md'), '# changed\n');
  writeText(path.join(repo, 'staged.txt'), 'staged\n');
  git(repo, ['add', 'staged.txt']);
  writeText(path.join(repo, 'untracked.txt'), 'untracked\n');

  const result = new DirtyChecker().check({ repoRoot: repo });
  assert.strictEqual(result.clean, false);
  assert(result.changedFiles.some((item) => item.path === 'README.md' && item.unstaged));
  assert(result.changedFiles.some((item) => item.path === 'staged.txt' && item.staged));
  assert(result.changedFiles.some((item) => item.path === 'untracked.txt' && item.untracked));
  assert(result.changedFiles.every((item) => !path.isAbsolute(item.path)));
  assert(!JSON.stringify(result).includes(repo), 'DirtyChecker 输出不应包含绝对路径');
  assert.strictEqual(fs.readFileSync(path.join(repo, 'README.md'), 'utf8'), '# changed\n');
}

async function main() {
  await testCleanRepo();
  await testDirtyRepo();
  console.log('dirty-checker tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
