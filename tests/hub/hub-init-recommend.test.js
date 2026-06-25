const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createNextProject, readJson, runCliAsync, startHubServer } = require('./hub-test-utils');

function assertNoInitFiles(root) {
  assert(!fs.existsSync(path.join(root, '.ai-spec')));
  assert(!fs.existsSync(path.join(root, '.agents')));
}

async function testDryRunUsesHubRecommendation() {
  const root = createNextProject('ai-spec-hub-init-dry-');
  const server = await startHubServer();
  try {
    const result = await runCliAsync(['init', root, '--recommend', '--dry-run', '--hub-url', server.url]);
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.includes('推荐来源：Hub'), result.stdout);
    assert(result.stdout.includes('frontend-react-nextjs-standard'), result.stdout);
    assertNoInitFiles(root);
  } finally {
    await server.close();
  }
}

async function testHubUnavailableFallbackLocal() {
  const root = createNextProject('ai-spec-hub-init-fallback-');
  const server = await startHubServer({ failAll: true });
  try {
    const result = await runCliAsync(['init', root, '--recommend', '--dry-run', '--hub-url', server.url]);
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.includes('推荐来源：本地'), result.stdout);
    assert(result.stdout.includes('Hub 推荐失败，已降级本地推荐'), result.stdout);
  } finally {
    await server.close();
  }
}

async function testHubUnavailableNoFallbackBlocks() {
  const root = createNextProject('ai-spec-hub-init-block-');
  const server = await startHubServer({ failAll: true });
  try {
    const result = await runCliAsync(['init', root, '--recommend', '--dry-run', '--hub-url', server.url, '--no-hub-fallback']);
    assert.notStrictEqual(result.status, 0);
    assert((result.stderr + result.stdout).includes('Hub 不可用'));
  } finally {
    await server.close();
  }
}

async function testYesReportsInstallRecordAndDoesNotBlockOnFailure() {
  const root = createNextProject('ai-spec-hub-init-yes-');
  const server = await startHubServer({ failInstallRecord: true });
  try {
    const result = await runCliAsync(['init', root, '--recommend', '--yes', '--hub-url', server.url]);
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.includes('Install Record 上报失败'), result.stdout);
    const lock = readJson(path.join(root, '.ai-spec/ai-spec.lock.json'));
    assert.strictEqual(lock.hub.url, server.url);
    assert(server.requests.some((item) => item.url === '/api/hub/install-records'));
    const payload = server.requests.find((item) => item.url === '/api/hub/install-records').body;
    assert(!JSON.stringify(payload).includes(root));
  } finally {
    await server.close();
  }
}

async function main() {
  await testDryRunUsesHubRecommendation();
  await testHubUnavailableFallbackLocal();
  await testHubUnavailableNoFallbackBlocks();
  await testYesReportsInstallRecordAndDoesNotBlockOnFailure();
  console.log('hub-init-recommend tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
