const assert = require('assert');
const path = require('path');
const { EscapeHatch } = require('../../src/state-machine/escape-hatch');
const { RunService } = require('../../src/run/run-service');
const { createTempDir, readJson } = require('../spec/spec-test-utils');

async function testEscapeHatchWritesIncidentAndSuggestion() {
  const root = createTempDir('ai-spec-escape-');
  const run = new RunService().createRun({ rootDir: root, requirement: '新增用户列表', runId: 'run-escape' });
  const result = await new EscapeHatch().handle({
    rootDir: root,
    run,
    failure: {
      stage: 'context_building',
      code: 'CONTEXT_BUILD_FAILED',
      message: '上下文构建失败',
      detail: '缓存缺失',
    },
  });

  assert.strictEqual(result.nextState, 'diagnosing');
  assert.strictEqual(result.canAutoRecover, false);
  assert(result.diagnosticSummary.includes('context_building'));
  assert(result.suggestedActions.some((item) => item.includes('检查')));
  const saved = readJson(path.join(root, '.ai-spec/runs/run-escape/run.json'));
  assert.strictEqual(saved.incidents.length, 1);
  assert.strictEqual(saved.state, 'diagnosing');
}

async function main() {
  await testEscapeHatchWritesIncidentAndSuggestion();
  console.log('escape-hatch tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
