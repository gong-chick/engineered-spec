const assert = require('assert');
const { ExecutorRunner } = require('../../src/executor/executor-runner');

function createProvider(overrides = {}) {
  return {
    name: 'mock',
    displayName: 'Mock',
    capabilities: [],
    async checkAvailability() {
      return { available: true, reason: null, fixSuggestion: null, version: 'test' };
    },
    async prepare() {
      return { prepared: true, executorInputPath: 'tmp/input.json', instructionFilePath: 'tmp/task.md', warnings: [], errors: [] };
    },
    async execute() {
      return { success: true, status: 'succeeded', summary: 'ok', changedFiles: [], verification: { executed: false, passed: null, command: null, summary: null }, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, riskList: [], error: null };
    },
    async verify() { return { executed: false }; },
    async cleanup() { return { cleaned: true }; },
    ...overrides,
  };
}

async function testTimeoutReturnsStandardError() {
  const provider = createProvider({
    async execute() {
      await new Promise((resolve) => setTimeout(resolve, 50));
      return { success: true };
    },
  });
  const result = await new ExecutorRunner({
    selector: { async select() { return { executor: 'mock', provider, reason: '测试', fallbackTried: [], warnings: [] }; } },
  }).run({
    run: { runId: 'run-timeout' },
    projectRoot: '.',
    worktreePath: null,
    contextBundle: { stage: 'planning', loadedAssets: [] },
    requirement: '测试',
    stage: 'implementation',
    timeoutMs: 5,
  });

  assert.strictEqual(result.status, 'timeout');
  assert.strictEqual(result.error.code, 'EXECUTOR_TIMEOUT');
}

async function testInvalidResultReturnsStandardError() {
  const provider = createProvider({
    async execute() {
      return { unexpected: true };
    },
  });
  const result = await new ExecutorRunner({
    selector: { async select() { return { executor: 'mock', provider, reason: '测试', fallbackTried: [], warnings: [] }; } },
  }).run({
    run: { runId: 'run-invalid' },
    projectRoot: '.',
    worktreePath: null,
    contextBundle: { stage: 'planning', loadedAssets: [] },
    requirement: '测试',
    stage: 'implementation',
    timeoutMs: 100,
  });

  assert.strictEqual(result.status, 'failed');
  assert.strictEqual(result.error.code, 'EXECUTOR_RESULT_INVALID');
}

async function testDryRunPassesThroughWithoutExternalCommand() {
  let executedWithDryRun = false;
  const provider = createProvider({
    async execute(input) {
      executedWithDryRun = input.dryRun === true;
      return { success: true, status: 'skipped', summary: 'dry-run', changedFiles: [], verification: { executed: false, passed: null, command: null, summary: null }, tokenUsage: { inputTokens: 0, outputTokens: 0, totalTokens: 0 }, riskList: [], error: null };
    },
  });
  const result = await new ExecutorRunner({
    selector: { async select() { return { executor: 'mock', provider, reason: '测试', fallbackTried: [], warnings: [] }; } },
  }).run({
    run: { runId: 'run-dry' },
    projectRoot: '.',
    worktreePath: null,
    contextBundle: { stage: 'planning', loadedAssets: [] },
    requirement: '测试',
    stage: 'implementation',
    timeoutMs: 100,
    dryRun: true,
  });

  assert.strictEqual(executedWithDryRun, true);
  assert.strictEqual(result.status, 'skipped');
}

async function main() {
  await testTimeoutReturnsStandardError();
  await testInvalidResultReturnsStandardError();
  await testDryRunPassesThroughWithoutExternalCommand();
  console.log('executor-runner tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
