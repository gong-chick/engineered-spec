const assert = require('assert');
const path = require('path');
const { VisualReporter } = require('../../src/visual/visual-reporter');
const { createNextProject, readJson, runCliAsync, startVisualServer } = require('./visual-test-utils');

async function testInitYesReportsProjectState() {
  const root = createNextProject('ai-spec-visual-init-');
  const server = await startVisualServer();
  try {
    const result = await runCliAsync(['init', root, '--recommend', '--yes', '--visual-url', server.url]);
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    const request = server.requests.find((item) => item.url === '/api/collector/project-state');
    assert(request, 'init --yes 应触发 project-state 上报');
    const project = readJson(path.join(root, '.ai-spec/project.json'));
    assert.strictEqual(request.body.projectId, project.projectId);
    assert.strictEqual(request.body.privacy.rawPromptIncluded, false);
    assert(!JSON.stringify(request.body).includes(root), '上报不应包含目标项目绝对路径');
  } finally {
    await server.close();
  }
}

async function testVisualUnavailableDoesNotBlockInit() {
  const root = createNextProject('ai-spec-visual-init-fail-');
  const server = await startVisualServer({ failAll: true });
  try {
    const result = await runCliAsync(['init', root, '--recommend', '--yes', '--visual-url', server.url]);
    assert.strictEqual(result.status, 0, result.stderr || result.stdout);
    assert(result.stdout.includes('Visual 上报失败'), result.stdout);
  } finally {
    await server.close();
  }
}

async function testVisualUrlEmptySkipsReport() {
  const root = createNextProject('ai-spec-visual-init-skip-');
  const result = await new VisualReporter().reportProjectState(root);
  assert.strictEqual(result.skipped, true);
  assert(result.warning.includes('未配置 Visual URL'));
}

async function main() {
  await testInitYesReportsProjectState();
  await testVisualUnavailableDoesNotBlockInit();
  await testVisualUrlEmptySkipsReport();
  console.log('project-state-report tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
