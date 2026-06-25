const assert = require('assert');
const path = require('path');
const { CircuitBreaker } = require('../../src/state-machine/circuit-breaker');
const { RunService } = require('../../src/run/run-service');
const { createTempDir, readJson } = require('../spec/spec-test-utils');

function createRun(root, runId = 'run-cb') {
  return new RunService().createRun({ rootDir: root, requirement: '新增用户列表', runId });
}

async function testTokenBudgetBreaksToSuspended() {
  const root = createTempDir('ai-spec-cb-token-');
  const run = createRun(root);
  const result = await new CircuitBreaker().evaluate({
    rootDir: root,
    run,
    metrics: { totalTokens: 90000 },
  });

  assert.strictEqual(result.shouldBreak, true);
  assert.strictEqual(result.nextState, 'suspended');
  assert.strictEqual(result.code, 'TOKEN_BUDGET_EXCEEDED');
  const saved = readJson(path.join(root, '.ai-spec/runs/run-cb/run.json'));
  assert.strictEqual(saved.circuitBreaker.triggered, true);
  assert.strictEqual(saved.state, 'suspended');
  assert.strictEqual(saved.incidents.length, 1);
}

async function testStageFailureBreaksToDiagnosing() {
  const root = createTempDir('ai-spec-cb-stage-');
  const run = createRun(root, 'run-stage');
  const result = await new CircuitBreaker().evaluate({
    rootDir: root,
    run,
    metrics: { stageFailureCount: 3 },
  });

  assert.strictEqual(result.shouldBreak, true);
  assert.strictEqual(result.nextState, 'diagnosing');
  assert.strictEqual(result.code, 'STAGE_FAILURE_LIMIT_EXCEEDED');
}

async function testAutoFixLimitBreaksToHumanReview() {
  const root = createTempDir('ai-spec-cb-autofix-');
  const run = createRun(root, 'run-autofix');
  const result = await new CircuitBreaker().evaluate({
    rootDir: root,
    run,
    metrics: { autoFixAttempts: 3 },
  });

  assert.strictEqual(result.shouldBreak, true);
  assert.strictEqual(result.nextState, 'human_review');
  assert.strictEqual(result.code, 'AUTO_FIX_LIMIT_EXCEEDED');
}

async function testNoBreakWhenUnderThreshold() {
  const root = createTempDir('ai-spec-cb-none-');
  const run = createRun(root, 'run-none');
  const result = await new CircuitBreaker().evaluate({
    rootDir: root,
    run,
    metrics: { totalTokens: 100, stageFailureCount: 0 },
  });

  assert.strictEqual(result.shouldBreak, false);
  assert.strictEqual(result.nextState, null);
}

async function main() {
  await testTokenBudgetBreaksToSuspended();
  await testStageFailureBreaksToDiagnosing();
  await testAutoFixLimitBreaksToHumanReview();
  await testNoBreakWhenUnderThreshold();
  console.log('circuit-breaker tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
