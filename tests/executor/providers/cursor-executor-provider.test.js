const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createTempDir } = require('../../spec/spec-test-utils');
const { CursorExecutorProvider } = require('../../../src/executor/providers/cursor-executor-provider');

async function testPrepareWritesTaskAndWarnsMissingRule() {
  const root = createTempDir('ai-spec-cursor-prepare-');
  const provider = new CursorExecutorProvider();
  const result = await provider.prepare({
    run: { runId: 'run-cursor-001', requirement: { summary: '新增用户列表' } },
    contextBundle: { stage: 'implementation', tokenEstimate: { inputTokens: 8 }, loadedAssets: [] },
    projectRoot: root,
    worktreePath: null,
    requirement: '新增用户列表',
    stage: 'implementation',
  });

  assert.strictEqual(result.prepared, true);
  assert.strictEqual(result.executorInputPath, null);
  assert.strictEqual(result.instructionFilePath, '.cursor/tmp/run-cursor-001/task.md');
  assert(result.warnings.some((item) => item.message.includes('.cursor/rules/ai-spec-auto.mdc')));
  const task = fs.readFileSync(path.join(root, result.instructionFilePath), 'utf8');
  assert(task.includes('新增用户列表'));
  assert(!task.includes(root));
}

async function testExecuteRequiresHumanReview() {
  const provider = new CursorExecutorProvider();
  const result = await provider.execute({
    run: { runId: 'run-cursor-001' },
    projectRoot: createTempDir('ai-spec-cursor-execute-'),
    worktreePath: null,
    instructionFilePath: '.cursor/tmp/run-cursor-001/task.md',
    executorInputPath: null,
    timeoutMs: 100,
    dryRun: false,
  });
  assert.strictEqual(result.success, false);
  assert.strictEqual(result.status, 'human_review_required');
  assert.strictEqual(result.error.code, 'EXECUTOR_PERMISSION_DENIED');
  assert(result.summary.includes('人工辅助模式'));
}

async function testDryRunSkipsExecution() {
  const provider = new CursorExecutorProvider();
  const result = await provider.execute({
    run: { runId: 'run-cursor-001' },
    projectRoot: createTempDir('ai-spec-cursor-dry-'),
    worktreePath: null,
    instructionFilePath: '.cursor/tmp/run-cursor-001/task.md',
    executorInputPath: null,
    timeoutMs: 100,
    dryRun: true,
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'skipped');
}

async function main() {
  await testPrepareWritesTaskAndWarnsMissingRule();
  await testExecuteRequiresHumanReview();
  await testDryRunSkipsExecution();
  console.log('cursor-executor-provider tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
