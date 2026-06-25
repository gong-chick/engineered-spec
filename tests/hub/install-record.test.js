const assert = require('assert');
const { HubClient } = require('../../src/hub/hub-client');
const { startHubServer } = require('./hub-test-utils');

async function testInstallRecordSuccess() {
  const server = await startHubServer();
  try {
    await new HubClient().createInstallRecord({
      projectId: 'proj',
      workspaceId: '',
      manifest: { slug: 'frontend-react-nextjs-standard', version: '1.0.0' },
      packages: [],
      installedAt: new Date().toISOString(),
      client: { name: 'br-ai-spec', version: '0.0.0' },
    }, { hubUrl: server.url });
    const request = server.requests.find((item) => item.url === '/api/hub/install-records');
    assert(request);
    assert(!JSON.stringify(request.body).includes('/Users/'));
  } finally {
    await server.close();
  }
}

async function main() {
  await testInstallRecordSuccess();
  console.log('install-record tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
