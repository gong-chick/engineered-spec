const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createTempDir, readJson } = require('../../spec/spec-test-utils');
const { CodexExecutorProvider } = require('../../../src/executor/providers/codex-executor-provider');

function createPrepareInput(root) {
  return {
    run: { runId: 'run-codex-001', requirement: { summary: '新增用户列表' } },
    contextBundle: {
      stage: 'implementation',
      tokenEstimate: { inputTokens: 12 },
      loadedAssets: [
        {
          kind: 'rule',
          slug: 'safe-rule',
          version: '1.0.0',
          checksum: 'sha256:test',
          content: '源码正文不应进入执行器输入',
          tokenEstimate: 10,
        },
      ],
    },
    projectRoot: root,
    worktreePath: null,
    requirement: '新增用户列表',
    stage: 'implementation',
  };
}

async function testUnavailableWhenCommandMissing() {
  const provider = new CodexExecutorProvider();
  const result = await provider.checkAvailability({
    projectRoot: createTempDir('ai-spec-codex-check-'),
    env: { PATH: '' },
  });
  assert.strictEqual(result.available, false);
  assert(result.reason.includes('未检测到 Codex CLI'));
  assert(result.fixSuggestion.includes('cursor'));
}

async function testPrepareWritesSafeRelativeFiles() {
  const root = createTempDir('ai-spec-codex-prepare-');
  const provider = new CodexExecutorProvider();
  const result = await provider.prepare(createPrepareInput(root));

  assert.strictEqual(result.prepared, true);
  assert.strictEqual(result.executorInputPath, '.codex/tmp/run-codex-001/executor-input.json');
  assert.strictEqual(result.instructionFilePath, '.codex/tmp/run-codex-001/instructions.md');

  const input = readJson(path.join(root, result.executorInputPath));
  const instructions = fs.readFileSync(path.join(root, result.instructionFilePath), 'utf8');
  assert.strictEqual(input.runId, 'run-codex-001');
  assert(!JSON.stringify(input).includes(root));
  assert(!JSON.stringify(input).includes('源码正文不应进入执行器输入'));
  assert(!instructions.includes(root));
  assert(!instructions.includes('源码正文不应进入执行器输入'));
  assert(instructions.includes('不要上传源码'));
}

async function testDryRunExecuteSkipsExternalCommand() {
  const provider = new CodexExecutorProvider();
  const result = await provider.execute({
    run: { runId: 'run-codex-001' },
    projectRoot: createTempDir('ai-spec-codex-dry-'),
    worktreePath: null,
    instructionFilePath: '.codex/tmp/run-codex-001/instructions.md',
    executorInputPath: '.codex/tmp/run-codex-001/executor-input.json',
    timeoutMs: 100,
    dryRun: true,
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'skipped');
  assert(result.summary.includes('dry-run'));
}

async function main() {
  await testUnavailableWhenCommandMissing();
  await testPrepareWritesSafeRelativeFiles();
  await testDryRunExecuteSkipsExternalCommand();
  console.log('codex-executor-provider tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
