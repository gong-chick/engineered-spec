const assert = require('assert');
const { BranchManager } = require('../../src/git/branch-manager');
const { git, initGitRepo } = require('./git-test-utils');

async function testBranchCreated() {
  const repo = initGitRepo('ai-spec-branch-create-');
  const result = await new BranchManager().createBranch({
    repoRoot: repo,
    baseBranch: 'main',
    branchPrefix: 'ai',
    runId: 'run-001',
    requirementSummary: '新增用户列表',
  });

  assert.strictEqual(result.created, true);
  assert(result.branchName.startsWith('ai/run-001-'));
  const branches = git(repo, ['branch', '--list', result.branchName]).stdout;
  assert(branches.includes(result.branchName));
}

async function testExistingBranchDoesNotOverwrite() {
  const repo = initGitRepo('ai-spec-branch-existing-');
  const manager = new BranchManager();
  const first = await manager.createBranch({
    repoRoot: repo,
    baseBranch: 'main',
    branchPrefix: 'ai',
    runId: 'run-002',
    requirementSummary: '新增用户列表',
  });
  const second = await manager.createBranch({
    repoRoot: repo,
    baseBranch: 'main',
    branchPrefix: 'ai',
    runId: 'run-002',
    requirementSummary: '新增用户列表',
  });

  assert.notStrictEqual(second.branchName, first.branchName);
  assert(second.warnings.some((item) => item.message.includes('已存在')));
}

async function testMissingBaseBranchFails() {
  const repo = initGitRepo('ai-spec-branch-missing-base-');
  const result = await new BranchManager().createBranch({
    repoRoot: repo,
    baseBranch: 'missing-base',
    branchPrefix: 'ai',
    runId: 'run-003',
    requirementSummary: '新增用户列表',
  });

  assert.strictEqual(result.created, false);
  assert(result.errors.some((item) => item.message.includes('baseBranch 不存在')));
}

async function testDetachedHeadFails() {
  const repo = initGitRepo('ai-spec-branch-detached-');
  const commit = git(repo, ['rev-parse', 'HEAD']).stdout.trim();
  git(repo, ['checkout', '--detach', commit]);
  const result = await new BranchManager().createBranch({
    repoRoot: repo,
    baseBranch: 'main',
    branchPrefix: 'ai',
    runId: 'run-004',
    requirementSummary: '新增用户列表',
  });

  assert.strictEqual(result.created, false);
  assert(result.errors.some((item) => item.message.includes('detached HEAD')));
}

async function main() {
  await testBranchCreated();
  await testExistingBranchDoesNotOverwrite();
  await testMissingBaseBranchFails();
  await testDetachedHeadFails();
  console.log('branch-manager tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
