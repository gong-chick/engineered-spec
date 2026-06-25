const assert = require('assert');
const fs = require('fs');
const { GitRepositoryDetector } = require('../../src/git/git-repository-detector');
const { createTempDir, git, initGitRepo } = require('./git-test-utils');

async function testNonGitRepository() {
  const root = createTempDir('ai-spec-non-git-');
  const result = new GitRepositoryDetector().detect({ rootDir: root });

  assert.strictEqual(result.isGitRepository, false);
  assert.strictEqual(result.repoRoot, null);
  assert(result.warnings.some((item) => item.message.includes('不是 Git 仓库')));
}

async function testGitRepository() {
  const repo = initGitRepo('ai-spec-detector-git-');
  const result = new GitRepositoryDetector().detect({ rootDir: repo });

  assert.strictEqual(result.isGitRepository, true);
  assert.strictEqual(result.repoRoot, fs.realpathSync(repo));
  assert.strictEqual(result.currentBranch, 'main');
  assert.strictEqual(result.isDetachedHead, false);
  assert.deepStrictEqual(result.remotes, []);
  assert.strictEqual(result.hasRemote, false);
}

async function testDetachedHead() {
  const repo = initGitRepo('ai-spec-detector-detached-');
  const commit = git(repo, ['rev-parse', 'HEAD']).stdout.trim();
  git(repo, ['checkout', '--detach', commit]);

  const result = new GitRepositoryDetector().detect({ rootDir: repo });
  assert.strictEqual(result.isGitRepository, true);
  assert.strictEqual(result.currentBranch, null);
  assert.strictEqual(result.isDetachedHead, true);
}

async function main() {
  await testNonGitRepository();
  await testGitRepository();
  await testDetachedHead();
  console.log('git-repository-detector tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
