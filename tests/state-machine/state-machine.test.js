const assert = require('assert');
const path = require('path');
const { RunService } = require('../../src/run/run-service');
const { StateMachine } = require('../../src/state-machine/state-machine');
const { createTempDir, readJson } = require('../spec/spec-test-utils');

async function testTransitionsWriteRunJson() {
  const root = createTempDir('ai-spec-state-machine-');
  const runService = new RunService();
  const run = runService.createRun({
    rootDir: root,
    requirement: '新增用户列表',
    runId: 'run-sm',
  });
  const machine = new StateMachine({ runService });

  await machine.transition({ rootDir: root, runId: run.runId, to: 'planning', reason: '进入规划' });
  await machine.transition({ rootDir: root, runId: run.runId, to: 'branch_preparing', reason: '进入分支准备' });
  await machine.transition({ rootDir: root, runId: run.runId, to: 'context_building', reason: '进入上下文构建' });
  await machine.transition({ rootDir: root, runId: run.runId, to: 'human_review', reason: '等待人工审核' });

  const saved = readJson(path.join(root, '.ai-spec/runs/run-sm/run.json'));
  assert.strictEqual(saved.state, 'human_review');
  assert.strictEqual(saved.stage, 'human_review');
  assert(saved.events.length >= 4);
  assert(saved.events.every((event) => event.type === 'state_transition' || event.type === 'run_created'));
}

async function testInvalidTransitionDoesNotWrite() {
  const root = createTempDir('ai-spec-state-invalid-');
  const runService = new RunService();
  const run = runService.createRun({ rootDir: root, requirement: '新增用户列表', runId: 'run-invalid' });
  const machine = new StateMachine({ runService });

  await assert.rejects(() => machine.transition({
    rootDir: root,
    runId: run.runId,
    to: 'completed',
    reason: '非法完成',
  }), (error) => error.code === 'INVALID_STATE_TRANSITION');

  const saved = readJson(path.join(root, '.ai-spec/runs/run-invalid/run.json'));
  assert.strictEqual(saved.state, 'initialized');
}

async function main() {
  await testTransitionsWriteRunJson();
  await testInvalidTransitionDoesNotWrite();
  console.log('state-machine tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
