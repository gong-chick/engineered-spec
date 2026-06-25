const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { RunIdGenerator } = require('../../src/run/run-id');
const { RunService } = require('../../src/run/run-service');
const { createTempDir, readJson, writeJson } = require('../spec/spec-test-utils');

function testRunIdGeneratorIsStableShape() {
  const id = new RunIdGenerator().generate('新增用户列表');
  assert(/^run-\d{8}-\d{6}-[a-f0-9]{6}$/.test(id), id);
}

function testCreateRunWritesRunJsonWithoutAbsolutePath() {
  const root = createTempDir('ai-spec-run-service-');
  const run = new RunService().createRun({
    rootDir: root,
    requirement: '新增用户列表',
    runId: 'run-service',
  });

  const runPath = path.join(root, '.ai-spec/runs/run-service/run.json');
  assert(fs.existsSync(runPath));
  assert.strictEqual(run.state, 'initialized');
  const content = fs.readFileSync(runPath, 'utf8');
  assert(!content.includes(root), 'run.json 不应包含绝对路径');
  const saved = JSON.parse(content);
  assert.strictEqual(saved.requirement.rawText, '新增用户列表');
  assert.strictEqual(saved.events[0].type, 'run_created');
}

function testLoadLatestRun() {
  const root = createTempDir('ai-spec-run-latest-');
  const service = new RunService();
  service.createRun({ rootDir: root, requirement: 'A', runId: 'run-a' });
  service.createRun({ rootDir: root, requirement: 'B', runId: 'run-b' });
  const latest = service.loadLatestRun(root);
  assert.strictEqual(latest.runId, 'run-b');
}

function testExistingRunCanBeLoaded() {
  const root = createTempDir('ai-spec-run-load-');
  writeJson(path.join(root, '.ai-spec/runs/run-load/run.json'), {
    schemaVersion: '1.0.0',
    runId: 'run-load',
    state: 'human_review',
    stage: 'human_review',
    events: [],
    incidents: [],
  });
  const run = new RunService().loadRun(root, 'run-load');
  assert.strictEqual(run.state, 'human_review');
}

function main() {
  testRunIdGeneratorIsStableShape();
  testCreateRunWritesRunJsonWithoutAbsolutePath();
  testLoadLatestRun();
  testExistingRunCanBeLoaded();
  console.log('run-service tests passed');
}

main();
