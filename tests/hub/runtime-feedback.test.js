const assert = require('assert');
const { HubClient } = require('../../src/hub/hub-client');
const { startHubServer } = require('./hub-test-utils');

async function testRuntimeFeedbackSuccessAndPrivacy() {
  const server = await startHubServer();
  try {
    await new HubClient().sendRuntimeFeedback({
      projectId: 'proj',
      runId: 'run',
      manifest: { slug: 'frontend-react-nextjs-standard', version: '1.0.0' },
      assetsUsed: [],
      executor: 'cursor',
      result: { status: 'succeeded', success: true, durationMs: 1 },
      issues: [{ file: 'src/index.ts', message: '相对路径' }],
    }, { hubUrl: server.url });
    const request = server.requests.find((item) => item.url === '/api/hub/runtime-feedback');
    assert(request);
    assert(!JSON.stringify(request.body).includes('rawPrompt'));
  } finally {
    await server.close();
  }
}

async function main() {
  await testRuntimeFeedbackSuccessAndPrivacy();
  console.log('runtime-feedback tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
