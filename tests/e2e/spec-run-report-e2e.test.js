const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  assertNoSensitiveRequests,
  createE2EFixture,
  findRequest,
  hasRequest,
  initYesAndSync,
  latestRunId,
  readJson,
  runCliAsync,
  waitForReports,
} = require('./e2e-test-utils');

async function testSpecStartAndContinueReports() {
  const fixture = await createE2EFixture();
  try {
    await initYesAndSync(fixture);
    fixture.visual.requests.length = 0;
    fixture.hub.requests.length = 0;

    const start = await runCliAsync([
      'spec-start',
      '新增用户列表',
      fixture.root,
      '--dry-run',
      '--visual-url',
      fixture.visual.url,
    ], fixture.env);
    assert.strictEqual(start.status, 0, start.stderr || start.stdout);
    assert(start.stdout.includes('spec-start dry-run 完成'), start.stdout);
    assert(start.stdout.includes('不会创建 branch / worktree'), start.stdout);
    await waitForReports();

    const runId = latestRunId(fixture.root);
    const dryRunJson = readJson(path.join(fixture.root, '.ai-spec/runs', runId, 'run.json'));
    assert.strictEqual(dryRunJson.branch.branchName, '');
    assert.strictEqual(dryRunJson.branch.worktreePath, '');
    assert(!JSON.stringify(dryRunJson).includes(fixture.root), 'run.json 不应保存绝对路径');
    assert(hasRequest(fixture.visual, (item) => item.url === '/api/collector/run-event' && item.body?.type === 'spec_started'), 'spec-start 应上报 run-event');

    const cont = await runCliAsync([
      'spec-continue',
      runId,
      fixture.root,
      '--execute',
      '--dry-run',
      '--executor',
      'cursor',
      '--visual-url',
      fixture.visual.url,
      '--hub-url',
      fixture.hub.url,
    ], fixture.env);
    assert.strictEqual(cont.status, 0, cont.stderr || cont.stdout);
    assert(cont.stdout.includes('spec-continue 执行器 dry-run 完成'), cont.stdout);
    await waitForReports();

    const run = readJson(path.join(fixture.root, '.ai-spec/runs', runId, 'run.json'));
    assert.strictEqual(run.state, 'human_review');
    assert.strictEqual(run.executor.type, 'cursor');
    assert.strictEqual(run.executor.status, 'skipped');
    assert(fs.existsSync(path.join(fixture.root, '.cursor/tmp', runId, 'task.md')));

    assert(hasRequest(fixture.visual, (item) => item.url === '/api/collector/run-event' && item.body?.type === 'executor_completed'), '应上报 executor_completed');
    assert(hasRequest(fixture.visual, '/api/collector/history'), '应上报 history');
    assert(hasRequest(fixture.hub, '/api/hub/runtime-feedback'), '应上报 runtime-feedback');
    const feedback = findRequest(fixture.hub, '/api/hub/runtime-feedback').body;
    assert.strictEqual(feedback.runId, runId);
    assert.strictEqual(feedback.executor, 'cursor');
    assertNoSensitiveRequests([fixture.hub, fixture.visual], { rootDir: fixture.root });
  } finally {
    await fixture.close();
  }
}

async function main() {
  await testSpecStartAndContinueReports();
  console.log('spec-run-report e2e tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
