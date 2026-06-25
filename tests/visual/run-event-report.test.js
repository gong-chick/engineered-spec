const assert = require('assert');
const { RunService } = require('../../src/run/run-service');
const { createTempDir, startVisualServer, wait, writeJson } = require('./visual-test-utils');

function setupProject(root) {
  writeJson(`${root}/.ai-spec/project.json`, {
    schemaVersion: '1.0.0',
    projectId: 'proj_visual_run',
    projectName: 'visual-run',
    projectType: 'single',
    techProfile: {},
    manifest: { slug: 'demo', version: '1.0.0' },
  });
  writeJson(`${root}/.ai-spec/policy.json`, {
    schemaVersion: '1.0.0',
    privacyPolicy: {
      uploadSourceCode: false,
      uploadRawPrompt: false,
      uploadRawResponse: false,
      uploadAbsolutePath: false,
    },
  });
}

async function testStateTransitionReportsRunEvent() {
  const root = createTempDir('ai-spec-visual-run-');
  setupProject(root);
  const server = await startVisualServer();
  try {
    const service = new RunService({ visualOptions: { visualUrl: server.url } });
    const run = service.createRun({ rootDir: root, requirement: '新增用户列表', runId: 'run_visual' });
    service.transition(root, run.runId, 'planning', '进入规划');
    await wait(150);

    const runEvents = server.requests.filter((item) => item.url === '/api/collector/run-event');
    assert(runEvents.some((item) => item.body.type === 'spec_started'));
    assert(runEvents.some((item) => item.body.type === 'state_transition'));
    for (const request of runEvents) {
      assert.strictEqual(request.body.projectId, 'proj_visual_run');
      assert(!JSON.stringify(request.body).includes(root));
    }
  } finally {
    await server.close();
  }
}

async function main() {
  await testStateTransitionReportsRunEvent();
  console.log('run-event-report tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
