const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  git,
  initGitRepo,
  readJson,
  runCli,
  setupInitializedProject,
} = require('./spec-test-utils');

function listRuns(root) {
  const runsDir = path.join(root, '.ai-spec/runs');
  return fs.readdirSync(runsDir).filter((item) => item.startsWith('run-'));
}

async function testDryRunCreatesRunButNoBranchOrWorktree() {
  const root = initGitRepo('ai-spec-spec-start-dry-');
  const { cacheHome } = setupInitializedProject(root);
  const beforeBranches = git(root, ['branch', '--format=%(refname:short)']).stdout;
  const result = runCli(['spec-start', '新增用户列表', root, '--dry-run'], { AI_SPEC_AUTO_HOME: cacheHome });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('dry-run 不会创建 branch / worktree'));
  const runId = listRuns(root)[0];
  const run = readJson(path.join(root, '.ai-spec/runs', runId, 'run.json'));
  assert.strictEqual(run.state, 'initialized');
  assert.strictEqual(run.branch.branchName, '');
  assert.strictEqual(run.branch.worktreePath, '');
  const afterBranches = git(root, ['branch', '--format=%(refname:short)']).stdout;
  assert.strictEqual(afterBranches, beforeBranches);
}

async function testNoWorktreeDoesNotCreateWorktree() {
  const root = initGitRepo('ai-spec-spec-start-no-worktree-');
  const { cacheHome } = setupInitializedProject(root);
  const beforePackage = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const result = runCli(['spec-start', '新增用户列表', root, '--no-worktree'], { AI_SPEC_AUTO_HOME: cacheHome });

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('执行器尚未接入'));
  const runId = listRuns(root)[0];
  const run = readJson(path.join(root, '.ai-spec/runs', runId, 'run.json'));
  assert.strictEqual(run.state, 'human_review');
  assert.strictEqual(run.branch.worktreeEnabled, false);
  assert.strictEqual(run.branch.worktreePath, '');
  assert.strictEqual(run.context.built, true);
  assert.strictEqual(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), beforePackage);
}

async function testUninitializedProjectPrintsChineseHint() {
  const root = initGitRepo('ai-spec-spec-start-uninit-');
  const result = runCli(['spec-start', '新增用户列表', root, '--dry-run']);

  assert.notStrictEqual(result.status, 0);
  assert((result.stdout + result.stderr).includes('请先执行 ai-spec-auto init . --recommend --dry-run'));
}

async function main() {
  await testDryRunCreatesRunButNoBranchOrWorktree();
  await testNoWorktreeDoesNotCreateWorktree();
  await testUninitializedProjectPrintsChineseHint();
  console.log('spec-start tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
