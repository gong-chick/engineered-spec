const assert = require('assert');
const { RunService } = require('../../src/run/run-service');
const { createTempDir, startVisualServer, wait, writeJson } = require('./visual-test-utils');

function setupProject(root) {
  writeJson(`${root}/.ai-spec/project.json`, {
    schemaVersion: '1.0.0',
    projectId: 'proj_visual_history',
    projectName: 'visual-history',
    projectType: 'single',
    techProfile: {},
    manifest: { slug: 'demo', version: '1.0.0' },
  });
  writeJson(`${root}/.ai-spec/policy.json`, { schemaVersion: '1.0.0' });
}

async function testHistoryReportsOnContextBuilt() {
  const root = createTempDir('ai-spec-visual-history-');
  setupProject(root);
  const server = await startVisualServer();
  try {
    const service = new RunService({ visualOptions: { visualUrl: server.url } });
    const run = service.createRun({ rootDir: root, requirement: '新增用户列表', runId: 'run_history' });
    service.appendEvent(root, run.runId, 'context_built', '上下文已构建', { changedFiles: [{ path: 'src/app.ts', action: 'updated' }] });
    await wait(150);

    const request = server.requests.find((item) => item.url === '/api/collector/history');
    assert(request, 'context_built 应触发 history 上报');
    assert.strictEqual(request.body.projectId, 'proj_visual_history');
    assert.deepStrictEqual(request.body.changedFiles, [{ path: 'src/app.ts', action: 'updated' }]);
  } finally {
    await server.close();
  }
}

async function main() {
  await testHistoryReportsOnContextBuilt();
  console.log('history-report tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
