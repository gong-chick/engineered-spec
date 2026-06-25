const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  assertNoSensitiveRequests,
  createE2EFixture,
  hasRequest,
  readJson,
  readRegistry,
  runCliAsync,
  waitForReports,
} = require('./e2e-test-utils');

async function testInitSyncCheckGuardE2E() {
  const fixture = await createE2EFixture();
  try {
    const dryRun = await runCliAsync([
      'init',
      fixture.root,
      '--recommend',
      '--dry-run',
      '--hub-url',
      fixture.hub.url,
      '--visual-url',
      fixture.visual.url,
    ], fixture.env);
    assert.strictEqual(dryRun.status, 0, dryRun.stderr || dryRun.stdout);
    assert(dryRun.stdout.includes('推荐来源：Hub'), dryRun.stdout);
    assert(dryRun.stdout.includes('dry-run 不会写入文件'), dryRun.stdout);
    assert(!fs.existsSync(path.join(fixture.root, '.ai-spec')), 'dry-run 不应写入 .ai-spec');
    assert(!hasRequest(fixture.visual, '/api/collector/project-state'), 'dry-run 不应上报 Project State');

    const init = await runCliAsync([
      'init',
      fixture.root,
      '--recommend',
      '--yes',
      '--hub-url',
      fixture.hub.url,
      '--visual-url',
      fixture.visual.url,
    ], fixture.env);
    assert.strictEqual(init.status, 0, init.stderr || init.stdout);
    await waitForReports();

    assert(fs.existsSync(path.join(fixture.root, '.ai-spec/project.json')));
    assert(fs.existsSync(path.join(fixture.root, '.ai-spec/policy.json')));
    assert(fs.existsSync(path.join(fixture.root, '.ai-spec/ai-spec.lock.json')));
    assert(fs.existsSync(path.join(fixture.root, '.agents/registry.index.json')));
    assert(fs.existsSync(path.join(fixture.root, '.ai-spec/context-index.json')));
    assert(hasRequest(fixture.hub, '/api/hub/install-records'), '应上报 Install Record');
    assert(hasRequest(fixture.visual, '/api/collector/project-state'), '应上报 Project State');

    const sync = await runCliAsync(['sync', fixture.root, '--hub-url', fixture.hub.url], fixture.env);
    assert.strictEqual(sync.status, 0, sync.stderr || sync.stdout);
    assert(sync.stdout.includes('已下载：1'), sync.stdout);
    assert(sync.stdout.includes('Agent Profile 已下载：1'), sync.stdout);
    assert(hasRequest(fixture.hub, /\/api\/hub\/manifests\/frontend-react-nextjs-standard\/export/));
    assert(hasRequest(fixture.hub, /\/api\/hub\/assets\/hub-rule\/content/));
    assert(hasRequest(fixture.hub, /\/api\/hub\/agent-profiles\/diagnostic-agent\/export/));

    const assetPath = path.join(fixture.cacheHome, 'cache/assets', fixture.hub.fixture.assetChecksum, 'content.md');
    const profilePath = path.join(fixture.cacheHome, 'cache/agent-profiles', fixture.hub.fixture.profileChecksum, 'content.json');
    assert.strictEqual(fs.readFileSync(assetPath, 'utf8'), fixture.hub.fixture.assetContent);
    assert.deepStrictEqual(readJson(profilePath), fixture.hub.fixture.profileContent);
    assert.strictEqual(JSON.stringify(readRegistry(fixture.root)).includes('"content"'), false);

    const check = await runCliAsync(['check', fixture.root], fixture.env);
    assert.strictEqual(check.status, 0, check.stderr || check.stdout);
    assert(check.stdout.includes('错误：0'), check.stdout);

    const guard = await runCliAsync(['guard', 'assets', fixture.root], fixture.env);
    assert.strictEqual(guard.status, 0, guard.stderr || guard.stdout);
    assert(guard.stdout.includes('资产完整性检查通过'), guard.stdout);

    assertNoSensitiveRequests([fixture.hub, fixture.visual], { rootDir: fixture.root });
  } finally {
    await fixture.close();
  }
}

async function main() {
  await testInitSyncCheckGuardE2E();
  console.log('init-sync e2e tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
