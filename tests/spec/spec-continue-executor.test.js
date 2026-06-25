const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  initGitRepo,
  readJson,
  runCli,
  setupInitializedProject,
} = require('./spec-test-utils');

async function testSpecContinueWithoutExecuteDoesNotPrepareExecutor() {
  const root = initGitRepo('ai-spec-continue-no-execute-');
  const { cacheHome } = setupInitializedProject(root);
  const start = runCli(['spec-start', '新增用户列表', root, '--no-worktree'], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(start.status, 0, start.stderr || start.stdout);
  const runId = start.stdout.match(/runId：([^\n]+)/)[1].trim();

  const result = runCli(['spec-continue', runId, root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('等待人工确认'));
  assert.strictEqual(fs.existsSync(path.join(root, '.cursor/tmp', runId, 'task.md')), false);
}

async function testSpecContinueDryRunExecutePreparesExecutorAndWritesRun() {
  const root = initGitRepo('ai-spec-continue-executor-');
  const { cacheHome } = setupInitializedProject(root);
  const packageJsonBefore = fs.readFileSync(path.join(root, 'package.json'), 'utf8');
  const start = runCli(['spec-start', '新增用户列表', root, '--no-worktree'], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(start.status, 0, start.stderr || start.stdout);
  const runId = start.stdout.match(/runId：([^\n]+)/)[1].trim();

  const result = runCli(['spec-continue', runId, root, '--execute', '--dry-run', '--executor', 'cursor'], {
    AI_SPEC_AUTO_HOME: cacheHome,
  });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('spec-continue 执行器 dry-run 完成'));
  assert(fs.existsSync(path.join(root, '.cursor/tmp', runId, 'task.md')));

  const run = readJson(path.join(root, '.ai-spec/runs', runId, 'run.json'));
  assert.strictEqual(run.state, 'human_review');
  assert.strictEqual(run.executor.type, 'cursor');
  assert.strictEqual(run.executor.status, 'skipped');
  assert(run.executor.selectionReason.includes('CLI'));
  assert.strictEqual(fs.readFileSync(path.join(root, 'package.json'), 'utf8'), packageJsonBefore);
}

async function main() {
  await testSpecContinueWithoutExecuteDoesNotPrepareExecutor();
  await testSpecContinueDryRunExecutePreparesExecutorAndWritesRun();
  console.log('spec-continue-executor tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
