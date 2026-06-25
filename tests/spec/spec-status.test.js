const assert = require('assert');
const path = require('path');
const {
  initGitRepo,
  readJson,
  runCli,
  setupInitializedProject,
} = require('./spec-test-utils');

async function testSpecStatusReadsRun() {
  const root = initGitRepo('ai-spec-status-');
  const { cacheHome } = setupInitializedProject(root);
  const start = runCli(['spec-start', '新增用户列表', root, '--dry-run'], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(start.status, 0, start.stderr || start.stdout);
  const match = start.stdout.match(/runId：([^\n]+)/);
  assert(match, start.stdout);
  const runId = match[1].trim();
  const run = readJson(path.join(root, '.ai-spec/runs', runId, 'run.json'));
  assert.strictEqual(run.runId, runId);

  const status = runCli(['spec-status', runId, root], { AI_SPEC_AUTO_HOME: cacheHome });
  assert.strictEqual(status.status, 0, status.stderr || status.stdout);
  assert(status.stdout.includes(`runId：${runId}`));
  assert(status.stdout.includes('当前状态：initialized'));
  assert(status.stdout.includes('下一步建议'));
}

async function main() {
  await testSpecStatusReadsRun();
  console.log('spec-status tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
