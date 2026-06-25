const assert = require('assert');
const { RunService } = require('../../src/run/run-service');
const { StateMachine } = require('../../src/state-machine/state-machine');
const { createTempDir, startVisualServer, wait, writeJson } = require('./visual-test-utils');

function setupProject(root) {
  writeJson(`${root}/.ai-spec/project.json`, {
    schemaVersion: '1.0.0',
    projectId: 'proj_visual_sm',
    projectName: 'visual-sm',
    projectType: 'single',
    techProfile: {},
    manifest: { slug: 'demo', version: '1.0.0' },
  });
  writeJson(`${root}/.ai-spec/policy.json`, { schemaVersion: '1.0.0' });
}

async function testStateMachineTransitionReportsVisualEvent() {
  const root = createTempDir('ai-spec-visual-sm-');
  setupProject(root);
  const server = await startVisualServer();
  try {
    const runService = new RunService({ visualOptions: { visualUrl: server.url } });
    const run = runService.createRun({ rootDir: root, requirement: '新增用户列表', runId: 'run_sm' });
    await new StateMachine({ runService }).transition({ rootDir: root, runId: run.runId, to: 'planning', reason: '进入规划' });
    await wait(150);

    const request = server.requests.find((item) => item.url === '/api/collector/run-event' && item.body.type === 'state_transition');
    assert(request, 'StateMachine 状态流转应触发 run-event 上报');
    assert.strictEqual(request.body.state, 'planning');
    assert.strictEqual(request.body.projectId, 'proj_visual_sm');
  } finally {
    await server.close();
  }
}

async function main() {
  await testStateMachineTransitionReportsVisualEvent();
  console.log('state-machine-visual-integration tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
