const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createTempDir, readJson, runCliAsync, setupInitializedProject, startHubServer } = require('./hub-test-utils');

async function testSyncPullsManifestAssetsAndAgentProfiles() {
  const root = createTempDir('ai-spec-hub-sync-');
  const cacheHome = createTempDir('ai-spec-hub-cache-');
  setupInitializedProject(root);
  const server = await startHubServer();
  try {
    const result = await runCliAsync(['sync', root, '--hub-url', server.url], { AI_SPEC_AUTO_HOME: cacheHome });
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.includes('已下载：1'), result.stdout);
    assert(result.stdout.includes('Agent Profile 已下载：1'), result.stdout);

    const assetPath = path.join(cacheHome, 'cache/assets', server.fixture.assetChecksum, 'content.md');
    const profilePath = path.join(cacheHome, 'cache/agent-profiles', server.fixture.profileChecksum, 'content.json');
    assert.strictEqual(fs.readFileSync(assetPath, 'utf8'), server.fixture.assetContent);
    assert.deepStrictEqual(readJson(profilePath), server.fixture.profileContent);

    const registry = readJson(path.join(root, '.agents/registry.index.json'));
    assert.strictEqual(JSON.stringify(registry).includes('"content"'), false);
    assert.strictEqual(registry.assets.rules[0].slug, 'hub-rule');
    assert.strictEqual(registry.assets.agentProfiles[0].slug, 'diagnostic-agent');
  } finally {
    await server.close();
  }
}

async function testSyncChecksumMismatchFails() {
  const root = createTempDir('ai-spec-hub-sync-bad-');
  const cacheHome = createTempDir('ai-spec-hub-cache-bad-');
  setupInitializedProject(root);
  const server = await startHubServer({ badChecksum: true });
  try {
    const result = await runCliAsync(['sync', root, '--hub-url', server.url], { AI_SPEC_AUTO_HOME: cacheHome });
    assert.notStrictEqual(result.status, 0);
    assert((result.stderr + result.stdout).includes('checksum 不一致'));
  } finally {
    await server.close();
  }
}

async function main() {
  await testSyncPullsManifestAssetsAndAgentProfiles();
  await testSyncChecksumMismatchFails();
  console.log('hub-sync tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
