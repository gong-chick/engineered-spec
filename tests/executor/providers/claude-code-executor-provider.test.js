const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createTempDir } = require('../../spec/spec-test-utils');
const { ClaudeCodeExecutorProvider } = require('../../../src/executor/providers/claude-code-executor-provider');

async function testUnavailableWhenCommandMissing() {
  const provider = new ClaudeCodeExecutorProvider();
  const result = await provider.checkAvailability({
    projectRoot: createTempDir('ai-spec-claude-check-'),
    env: { PATH: '' },
  });
  assert.strictEqual(result.available, false);
  assert(result.reason.includes('未检测到 Claude Code CLI'));
  assert(result.fixSuggestion.includes('codex'));
}

async function testPrepareWritesSafeTaskFile() {
  const root = createTempDir('ai-spec-claude-prepare-');
  const provider = new ClaudeCodeExecutorProvider();
  const result = await provider.prepare({
    run: { runId: 'run-claude-001', requirement: { summary: '新增用户列表' } },
    contextBundle: {
      stage: 'implementation',
      tokenEstimate: { inputTokens: 10 },
      loadedAssets: [
        {
          kind: 'skill',
          slug: 'safe-skill',
          version: '1.0.0',
          checksum: 'sha256:test',
          content: '源码正文不应进入 Claude 任务',
          tokenEstimate: 10,
        },
      ],
    },
    projectRoot: root,
    worktreePath: null,
    requirement: '新增用户列表',
    stage: 'implementation',
  });

  assert.strictEqual(result.prepared, true);
  assert.strictEqual(result.instructionFilePath, '.ai-spec/runs/run-claude-001/claude-task.md');
  assert(result.warnings.some((item) => item.message.includes('CLAUDE.md')));
  const task = fs.readFileSync(path.join(root, result.instructionFilePath), 'utf8');
  assert(task.includes('新增用户列表'));
  assert(!task.includes(root));
  assert(!task.includes('源码正文不应进入 Claude 任务'));
}

async function testDryRunExecuteSkipsExternalCommand() {
  const provider = new ClaudeCodeExecutorProvider();
  const result = await provider.execute({
    run: { runId: 'run-claude-001' },
    projectRoot: createTempDir('ai-spec-claude-dry-'),
    worktreePath: null,
    instructionFilePath: '.ai-spec/runs/run-claude-001/claude-task.md',
    executorInputPath: null,
    timeoutMs: 100,
    dryRun: true,
  });
  assert.strictEqual(result.success, true);
  assert.strictEqual(result.status, 'skipped');
}

async function main() {
  await testUnavailableWhenCommandMissing();
  await testPrepareWritesSafeTaskFile();
  await testDryRunExecuteSkipsExternalCommand();
  console.log('claude-code-executor-provider tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
