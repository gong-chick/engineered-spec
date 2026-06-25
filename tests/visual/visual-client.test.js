const assert = require('assert');
const { VisualClient } = require('../../src/visual/visual-client');
const { startVisualServer } = require('./visual-test-utils');

function basePrivacy() {
  return {
    sourceCodeIncluded: false,
    rawPromptIncluded: false,
    rawResponseIncluded: false,
    absolutePathIncluded: false,
  };
}

async function testVisualClientSendsAllCollectors() {
  const server = await startVisualServer();
  const client = new VisualClient({ visualUrl: server.url });
  try {
    await client.sendProjectState({ eventId: 'evt_project', projectId: 'proj', type: 'single', privacy: basePrivacy() });
    await client.sendRunEvent({ eventId: 'evt_run', runId: 'run', projectId: 'proj', type: 'spec_started', level: 'info', payload: {}, privacy: basePrivacy() });
    await client.sendHistory({ historyId: 'hist', runId: 'run', projectId: 'proj', title: '标题', summary: '摘要', changedFiles: [{ path: 'src/a.js', action: 'updated' }], privacy: basePrivacy() });
    await client.sendIncident({ incidentId: 'inc', runId: 'run', projectId: 'proj', type: 'unknown', level: 'error', message: '异常', privacy: basePrivacy() });

    assert(server.requests.some((item) => item.url === '/api/collector/project-state'));
    assert(server.requests.some((item) => item.url === '/api/collector/run-event'));
    assert(server.requests.some((item) => item.url === '/api/collector/history'));
    assert(server.requests.some((item) => item.url === '/api/collector/incident'));
    for (const request of server.requests) {
      assert.strictEqual(request.body.privacy.sourceCodeIncluded, false);
      assert(!JSON.stringify(request.body).includes('/Users/'));
    }
  } finally {
    await server.close();
  }
}

async function testVisualClientFailureIsStructured() {
  const server = await startVisualServer({ failAll: true });
  try {
    await assert.rejects(
      () => new VisualClient({ visualUrl: server.url }).sendProjectState({ eventId: 'evt', projectId: 'proj', privacy: basePrivacy() }),
      (error) => {
        assert.strictEqual(error.code, 'VISUAL_DOWN');
        assert(error.message.includes('Visual 不可用'));
        return true;
      },
    );
  } finally {
    await server.close();
  }
}

async function testVisualClientRejectsSensitivePayloadBeforeSend() {
  const server = await startVisualServer();
  try {
    await assert.rejects(
      () => new VisualClient({ visualUrl: server.url }).sendRunEvent({
        eventId: 'evt_bad',
        runId: 'run',
        projectId: 'proj',
        type: 'executor_completed',
        level: 'error',
        payload: { rawPrompt: '完整提示词' },
        privacy: basePrivacy(),
      }),
      (error) => {
        assert.strictEqual(error.code, 'PRIVACY_POLICY_VIOLATED');
        return true;
      },
    );
    assert.strictEqual(server.requests.length, 0, '隐私违规时不应发送请求');
  } finally {
    await server.close();
  }
}

async function main() {
  await testVisualClientSendsAllCollectors();
  await testVisualClientFailureIsStructured();
  await testVisualClientRejectsSensitivePayloadBeforeSend();
  console.log('visual-client tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
