const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DirtyStrategyHandler } = require('../../src/git/dirty-strategy-handler');
const { git, initGitRepo, writeText } = require('./git-test-utils');

function makeDirtyRepo(prefix) {
  const repo = initGitRepo(prefix);
  writeText(path.join(repo, 'README.md'), '# dirty\n');
  return repo;
}

async function testBlockStrategyStopsDirtyRepo() {
  const repo = makeDirtyRepo('ai-spec-strategy-block-');
  const result = await new DirtyStrategyHandler().handle({
    repoRoot: repo,
    strategy: 'block',
    runId: 'run-block',
    requirementSummary: '新增用户列表',
  });

  assert.strictEqual(result.canContinue, false);
  assert.strictEqual(result.patchPath, null);
  assert.strictEqual(result.wipCommitHash, null);
  assert(result.message.includes('阻断'));
  assert(result.message.includes('README.md'));
}

async function testPatchSnapshotStrategyCreatesPatch() {
  const repo = makeDirtyRepo('ai-spec-strategy-patch-');
  const beforePackage = fs.readFileSync(path.join(repo, 'package.json'), 'utf8');
  const result = await new DirtyStrategyHandler().handle({
    repoRoot: repo,
    strategy: 'patch-snapshot',
    runId: 'run-patch',
    requirementSummary: '新增用户列表',
  });

  assert.strictEqual(result.canContinue, true);
  assert.strictEqual(result.strategy, 'patch-snapshot');
  assert.strictEqual(result.patchPath, '.ai-spec/runs/run-patch/dirty-snapshot.patch');
  assert(fs.existsSync(path.join(repo, result.patchPath)));
  assert(fs.readFileSync(path.join(repo, result.patchPath), 'utf8').includes('README.md'));
  assert.strictEqual(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'), beforePackage);
}

async function testWipCommitStrategyCreatesCommit() {
  const repo = makeDirtyRepo('ai-spec-strategy-wip-');
  const result = await new DirtyStrategyHandler().handle({
    repoRoot: repo,
    strategy: 'wip-commit',
    runId: 'run-wip',
    requirementSummary: '新增用户列表',
  });

  assert.strictEqual(result.canContinue, true);
  assert(result.wipCommitHash);
  assert(result.warning.includes('临时提交'));
  const log = git(repo, ['log', '-1', '--pretty=%B']).stdout;
  assert(log.includes('chore(ai-spec): 临时保存需求执行前改动 run-wip'));
}

async function testIgnoreStrategyAllowsWithWarning() {
  const repo = makeDirtyRepo('ai-spec-strategy-ignore-');
  const result = await new DirtyStrategyHandler().handle({
    repoRoot: repo,
    strategy: 'ignore',
    runId: 'run-ignore',
    requirementSummary: '新增用户列表',
  });

  assert.strictEqual(result.canContinue, true);
  assert(result.warning.includes('dirty'));
  assert.strictEqual(result.patchPath, null);
  assert.strictEqual(result.wipCommitHash, null);
}

async function testCleanRepoDoesNotCreatePatchOrCommit() {
  const repo = initGitRepo('ai-spec-strategy-clean-');
  const beforeHead = git(repo, ['rev-parse', 'HEAD']).stdout.trim();
  const result = await new DirtyStrategyHandler().handle({
    repoRoot: repo,
    strategy: 'wip-commit',
    runId: 'run-clean',
    requirementSummary: '无改动',
  });
  const afterHead = git(repo, ['rev-parse', 'HEAD']).stdout.trim();

  assert.strictEqual(result.canContinue, true);
  assert.strictEqual(result.wipCommitHash, null);
  assert.strictEqual(beforeHead, afterHead);
}

async function main() {
  await testBlockStrategyStopsDirtyRepo();
  await testPatchSnapshotStrategyCreatesPatch();
  await testWipCommitStrategyCreatesCommit();
  await testIgnoreStrategyAllowsWithWarning();
  await testCleanRepoDoesNotCreatePatchOrCommit();
  console.log('dirty-strategy-handler tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
