const assert = require('assert');
const path = require('path');
const {
  initGitRepo,
  readJson,
  runCli,
  setupInitializedProject,
} = require('./spec-test-utils');

async function testSpecContinueHumanReviewPrompt() {
  const root = initGitRepo('ai-spec-continue-human-review-');
  const { cacheHome } = setupInitializedProject(root);
  const start = runCli(['spec-start', '新增用户列表', root, '--no-worktree'], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(start.status, 0, start.stderr || start.stdout);
  const runId = start.stdout.match(/runId：([^\n]+)/)[1].trim();
  const run = readJson(path.join(root, '.ai-spec/runs', runId, 'run.json'));
  assert.strictEqual(run.state, 'human_review');

  const result = runCli(['spec-continue', runId, root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('执行器尚未接入，无法继续执行编码'));
}

async function main() {
  await testSpecContinueHumanReviewPrompt();
  console.log('spec-continue tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
