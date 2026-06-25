const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { IncidentWriter } = require('../../src/incident/incident-writer');
const { createTempDir, readJson } = require('../spec/spec-test-utils');

function testIncidentWriterWritesJson() {
  const root = createTempDir('ai-spec-incident-');
  const incident = new IncidentWriter().write({
    rootDir: root,
    runId: 'run-incident',
    type: 'token-budget-exceeded',
    level: 'warning',
    stage: 'planning',
    message: 'Token 预算超限',
    suggestion: '请减少上下文资产数量',
  });

  const filePath = path.join(root, '.ai-spec/runs/run-incident/incidents', `${incident.incidentId}.json`);
  assert(fs.existsSync(filePath));
  const saved = readJson(filePath);
  assert.strictEqual(saved.schemaVersion, '1.0.0');
  assert.strictEqual(saved.runId, 'run-incident');
  assert.strictEqual(saved.type, 'token-budget-exceeded');
  assert(!JSON.stringify(saved).includes(root), 'incident 不应包含绝对路径');
}

function main() {
  testIncidentWriterWritesJson();
  console.log('incident-writer tests passed');
}

main();
