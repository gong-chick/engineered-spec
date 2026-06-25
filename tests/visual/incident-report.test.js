const assert = require('assert');
const { IncidentWriter } = require('../../src/incident/incident-writer');
const { createTempDir, startVisualServer, wait, writeJson } = require('./visual-test-utils');

function setupProject(root) {
  writeJson(`${root}/.ai-spec/project.json`, {
    schemaVersion: '1.0.0',
    projectId: 'proj_visual_incident',
    projectName: 'visual-incident',
    projectType: 'single',
    techProfile: {},
    manifest: { slug: 'demo', version: '1.0.0' },
  });
  writeJson(`${root}/.ai-spec/policy.json`, { schemaVersion: '1.0.0' });
}

async function testIncidentWriterReportsIncident() {
  const root = createTempDir('ai-spec-visual-incident-');
  setupProject(root);
  const server = await startVisualServer();
  try {
    const incident = new IncidentWriter({ visualOptions: { visualUrl: server.url } }).write({
      rootDir: root,
      runId: 'run_incident',
      type: 'stage-failed',
      level: 'fatal',
      stage: 'implementation',
      message: '阶段失败',
      suggestion: '请人工处理',
    });
    await wait(150);

    const request = server.requests.find((item) => item.url === '/api/collector/incident');
    assert(request, 'IncidentWriter 应触发 incident 上报');
    assert.strictEqual(request.body.incidentId, incident.incidentId);
    assert.strictEqual(request.body.projectId, 'proj_visual_incident');
    assert.strictEqual(request.body.level, 'fatal');
  } finally {
    await server.close();
  }
}

async function main() {
  await testIncidentWriterReportsIncident();
  console.log('incident-report tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
