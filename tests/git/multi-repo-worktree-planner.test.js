const assert = require('assert');
const fs = require('fs');
const { MultiRepoWorktreePlanner } = require('../../src/git/multi-repo-worktree-planner');
const { createTempDir, git, initGitRepo } = require('./git-test-utils');

async function testMultiRepoPlanOnly() {
  const repo = initGitRepo('ai-spec-multi-plan-');
  const plan = new MultiRepoWorktreePlanner().plan({
    repos: [{ repoId: 'frontend', repoRoot: repo, baseBranch: 'main' }],
    runId: 'run-201',
    requirementSummary: '新增用户列表',
    branchPrefix: 'ai',
    worktreeRoot: '../.ai-worktrees',
  });

  assert.strictEqual(plan.runId, 'run-201');
  assert.strictEqual(plan.repos[0].status, 'planned');
  assert(plan.repos[0].branchName.startsWith('ai/run-201-'));
}

async function testMultiRepoCreateRollsBackOnPartialFailure() {
  const repoA = initGitRepo('ai-spec-multi-a-');
  const repoB = initGitRepo('ai-spec-multi-b-');
  const worktreeRoot = createTempDir('ai-spec-multi-worktrees-');
  const result = await new MultiRepoWorktreePlanner().create({
    repos: [
      { repoId: 'frontend', repoRoot: repoA, baseBranch: 'main' },
      { repoId: 'backend', repoRoot: repoB, baseBranch: 'missing-base' },
    ],
    runId: 'run-202',
    requirementSummary: '新增用户列表',
    branchPrefix: 'ai',
    worktreeRoot,
  });

  assert(result.errors.length > 0);
  assert.strictEqual(result.repos[0].status, 'rolled-back');
  assert.strictEqual(result.repos[1].status, 'failed');
  assert(!fs.existsSync(result.repos[0].worktreePath), '失败时应回滚已创建 worktree');
  const branches = git(repoA, ['branch', '--list', result.repos[0].branchName]).stdout;
  assert(!branches.includes(result.repos[0].branchName), '失败时应回滚已创建 branch');
}

async function main() {
  await testMultiRepoPlanOnly();
  await testMultiRepoCreateRollsBackOnPartialFailure();
  console.log('multi-repo-worktree-planner tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
