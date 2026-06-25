const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  createNextProject,
  createTempDir,
  readJson,
  runCliAsync,
  startHubServer,
} = require('../hub/hub-test-utils');
const {
  startVisualServer,
  wait,
} = require('../visual/visual-test-utils');

function e2eEnv(cacheHome) {
  return {
    AI_SPEC_AUTO_HOME: cacheHome,
  };
}

function requestBodies(server) {
  return server.requests.map((item) => item.body).filter(Boolean);
}

function assertNoSensitivePayload(value, options = {}) {
  const rootDir = options.rootDir || '';
  const forbiddenKeys = new Set([
    'sourceCode',
    'sourceContent',
    'fileContent',
    'rawPrompt',
    'rawResponse',
    'absolutePath',
    'apiKey',
    'password',
    'token',
    'secret',
  ]);
  const visit = (item, keyPath = '') => {
    if (Array.isArray(item)) {
      item.forEach((child, index) => visit(child, `${keyPath}[${index}]`));
      return;
    }
    if (item && typeof item === 'object') {
      for (const [key, child] of Object.entries(item)) {
        assert(!forbiddenKeys.has(key), `payload 包含敏感字段：${keyPath ? `${keyPath}.` : ''}${key}`);
        visit(child, keyPath ? `${keyPath}.${key}` : key);
      }
      return;
    }
    if (typeof item === 'string') {
      assert(!item.includes('/Users/'), `payload 包含用户绝对路径：${item}`);
      assert(!item.includes('.env'), `payload 包含 .env：${item}`);
      if (rootDir) {
        assert(!item.includes(rootDir), `payload 包含 fixture 绝对路径：${item}`);
      }
    }
  };
  visit(value);
}

function assertNoSensitiveRequests(servers, options = {}) {
  for (const server of servers) {
    for (const body of requestBodies(server)) {
      assertNoSensitivePayload(body, options);
    }
  }
}

function hasRequest(server, matcher) {
  return server.requests.some((item) => {
    if (typeof matcher === 'string') return item.url === matcher;
    if (matcher instanceof RegExp) return matcher.test(item.url);
    return matcher(item);
  });
}

function findRequest(server, matcher) {
  return server.requests.find((item) => {
    if (typeof matcher === 'string') return item.url === matcher;
    if (matcher instanceof RegExp) return matcher.test(item.url);
    return matcher(item);
  });
}

function latestRunId(rootDir) {
  const runsDir = path.join(rootDir, '.ai-spec/runs');
  const runIds = fs.readdirSync(runsDir).filter((name) => fs.existsSync(path.join(runsDir, name, 'run.json')));
  assert(runIds.length > 0, '未找到 run.json');
  return runIds.sort().at(-1);
}

async function createE2EFixture() {
  const root = createNextProject('ai-spec-e2e-fixture-');
  const cacheHome = createTempDir('ai-spec-e2e-cache-');
  const hub = await startHubServer();
  const visual = await startVisualServer();
  return {
    root,
    cacheHome,
    hub,
    visual,
    env: e2eEnv(cacheHome),
    close: async () => {
      await hub.close();
      await visual.close();
    },
  };
}

async function initYesAndSync(fixture) {
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

  const sync = await runCliAsync(['sync', fixture.root, '--hub-url', fixture.hub.url], fixture.env);
  assert.strictEqual(sync.status, 0, sync.stderr || sync.stdout);
  return { init, sync };
}

async function waitForReports() {
  await wait(120);
}

function readRegistry(rootDir) {
  return readJson(path.join(rootDir, '.agents/registry.index.json'));
}

module.exports = {
  assertNoSensitivePayload,
  assertNoSensitiveRequests,
  createE2EFixture,
  e2eEnv,
  findRequest,
  hasRequest,
  initYesAndSync,
  latestRunId,
  readJson,
  readRegistry,
  requestBodies,
  runCliAsync,
  startHubServer,
  startVisualServer,
  waitForReports,
};
