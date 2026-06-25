const assert = require('assert');
const { HubClient } = require('../../src/hub/hub-client');
const { resolveHubConfig } = require('../../src/hub/hub-config');
const { createTempDir, writeJson, startHubServer } = require('./hub-test-utils');

async function testRecommendSuccess() {
  const server = await startHubServer();
  try {
    const result = await new HubClient().recommendManifests({
      hubUrl: server.url,
      workspace: {},
      projectFacts: [{ packageId: 'root', path: '.', primary: { confidence: 90 } }],
    });
    assert.strictEqual(result.recommendations[0].manifest.slug, 'frontend-react-nextjs-standard');
    assert(!JSON.stringify(server.requests[0].body).includes('/Users/'));
  } finally {
    await server.close();
  }
}

async function testRecommendFailureKeepsHubError() {
  const server = await startHubServer({ failAll: true });
  try {
    await assert.rejects(
      () => new HubClient().recommendManifests({ hubUrl: server.url, workspace: {}, projectFacts: [] }),
      (error) => {
        assert.strictEqual(error.code, 'HUB_DOWN');
        assert(error.message.includes('Hub 不可用'));
        assert(error.suggestion.includes('稍后'));
        return true;
      },
    );
  } finally {
    await server.close();
  }
}

async function testRuntimeFeedbackRejectsSensitivePayload() {
  await assert.rejects(
    () => new HubClient().sendRuntimeFeedback({ projectId: 'p', runId: 'r', rawPrompt: 'secret' }, { hubUrl: 'http://127.0.0.1:1' }),
    (error) => {
      assert.strictEqual(error.code, 'PRIVACY_VIOLATION');
      assert(error.message.includes('rawPrompt'));
      return true;
    },
  );
}

function testHubUrlPriority() {
  const root = createTempDir('ai-spec-hub-config-');
  writeJson(`${root}/.ai-spec/policy.json`, {
    schemaVersion: '1.0.0',
    hub: { url: 'http://policy.example', enabled: false, fallbackToLocal: false },
  });
  const oldEnv = process.env.AI_SPEC_HUB_URL;
  process.env.AI_SPEC_HUB_URL = 'http://env.example';
  try {
    const cliConfig = resolveHubConfig(root, { hubUrl: 'http://cli.example' });
    assert.strictEqual(cliConfig.url, 'http://cli.example');
    assert.strictEqual(cliConfig.enabled, true);
    assert.strictEqual(cliConfig.source, 'cli');

    const policyConfig = resolveHubConfig(root, {});
    assert.strictEqual(policyConfig.url, 'http://policy.example');
    assert.strictEqual(policyConfig.enabled, false);
    assert.strictEqual(policyConfig.source, 'policy');
    assert.strictEqual(policyConfig.fallbackToLocal, false);
  } finally {
    if (oldEnv === undefined) {
      delete process.env.AI_SPEC_HUB_URL;
    } else {
      process.env.AI_SPEC_HUB_URL = oldEnv;
    }
  }
}

async function main() {
  await testRecommendSuccess();
  await testRecommendFailureKeepsHubError();
  await testRuntimeFeedbackRejectsSensitivePayload();
  testHubUrlPriority();
  console.log('hub-client tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
