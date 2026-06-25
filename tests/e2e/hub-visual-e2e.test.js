const assert = require('assert');
const path = require('path');
const {
  assertNoSensitiveRequests,
  createE2EFixture,
  e2eEnv,
  runCliAsync,
  startHubServer,
  startVisualServer,
} = require('./e2e-test-utils');
const { createNextProject, createTempDir } = require('../hub/hub-test-utils');

async function testHubFallbackModes() {
  const root = createNextProject('ai-spec-e2e-hub-fallback-');
  const cacheHome = createTempDir('ai-spec-e2e-hub-cache-');
  const hub = await startHubServer({ failAll: true });
  try {
    const fallback = await runCliAsync(['init', root, '--recommend', '--dry-run', '--hub-url', hub.url], e2eEnv(cacheHome));
    assert.strictEqual(fallback.status, 0, fallback.stderr || fallback.stdout);
    assert(fallback.stdout.includes('推荐来源：本地'), fallback.stdout);
    assert(fallback.stdout.includes('Hub 推荐失败，已降级本地推荐'), fallback.stdout);

    const blocked = await runCliAsync(['init', root, '--recommend', '--dry-run', '--hub-url', hub.url, '--no-hub-fallback'], e2eEnv(cacheHome));
    assert.notStrictEqual(blocked.status, 0);
    assert((blocked.stderr + blocked.stdout).includes('Hub 不可用'));
  } finally {
    await hub.close();
  }
}

async function testVisualUnavailableDoesNotBlockInit() {
  const root = createNextProject('ai-spec-e2e-visual-down-');
  const cacheHome = createTempDir('ai-spec-e2e-visual-cache-');
  const hub = await startHubServer();
  const visual = await startVisualServer({ failAll: true });
  try {
    const result = await runCliAsync([
      'init',
      root,
      '--recommend',
      '--yes',
      '--hub-url',
      hub.url,
      '--visual-url',
      visual.url,
    ], e2eEnv(cacheHome));
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.includes('Visual 上报失败，已忽略'), result.stdout);
    assert(require('fs').existsSync(path.join(root, '.ai-spec/project.json')));
    assertNoSensitiveRequests([hub, visual], { rootDir: root });
  } finally {
    await hub.close();
    await visual.close();
  }
}

async function testHubUnavailableUsesCacheWhenComplete() {
  const fixture = await createE2EFixture();
  try {
    const init = await runCliAsync(['init', fixture.root, '--recommend', '--yes', '--hub-url', fixture.hub.url], fixture.env);
    assert.strictEqual(init.status, 0, init.stderr || init.stdout);
    const sync = await runCliAsync(['sync', fixture.root, '--hub-url', fixture.hub.url], fixture.env);
    assert.strictEqual(sync.status, 0, sync.stderr || sync.stdout);

    await fixture.hub.close();
    const offline = await runCliAsync(['sync', fixture.root, '--hub-url', fixture.hub.url], fixture.env);
    assert.strictEqual(offline.status, 0, offline.stderr || offline.stdout);
    assert(offline.stdout.includes('Hub 不可用，已使用本地缓存继续'), offline.stdout);
  } finally {
    await fixture.visual.close();
  }
}

async function main() {
  await testHubFallbackModes();
  await testVisualUnavailableDoesNotBlockInit();
  await testHubUnavailableUsesCacheWhenComplete();
  console.log('hub-visual e2e tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
