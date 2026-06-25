const assert = require('assert');
const { ExecutorSelector } = require('../../src/executor/executor-selector');

function createRegistry(availability) {
  const providers = new Map();
  for (const name of ['codex', 'cursor', 'claude-code']) {
    providers.set(name, {
      name,
      displayName: name,
      capabilities: [],
      async checkAvailability() {
        return availability[name]
          ? { available: true, reason: null, fixSuggestion: null, version: 'test' }
          : { available: false, reason: `${name} 不可用`, fixSuggestion: '请切换执行器', version: null };
      },
    });
  }
  return {
    get(name) { return providers.get(name); },
    has(name) { return providers.has(name); },
    list() { return Array.from(providers.values()); },
  };
}

async function select(input, availability = { codex: true, cursor: true, 'claude-code': true }) {
  return new ExecutorSelector().select({
    registry: createRegistry(availability),
    projectRoot: '.',
    worktreePath: null,
    mode: 'local-assisted',
    ...input,
  });
}

async function testCliExecutorPriority() {
  assert.strictEqual((await select({ cliExecutor: 'codex' })).executor, 'codex');
  assert.strictEqual((await select({ cliExecutor: 'cursor' })).executor, 'cursor');
  assert.strictEqual((await select({ cliExecutor: 'claude-code' })).executor, 'claude-code');
}

async function testAgentProfileBeforePolicy() {
  const result = await select({
    agentProfile: { defaultExecutor: 'claude-code' },
    policy: { execution: { defaultExecutor: 'cursor' } },
  });
  assert.strictEqual(result.executor, 'claude-code');
  assert(result.reason.includes('Agent Profile'));
}

async function testPolicyBeforeModeDefault() {
  const result = await select({
    policy: { execution: { defaultExecutor: 'cursor' } },
    mode: 'local-auto',
  });
  assert.strictEqual(result.executor, 'cursor');
  assert(result.reason.includes('policy'));
}

async function testModeDefaults() {
  assert.strictEqual((await select({ mode: 'local-assisted' })).executor, 'cursor');
  assert.strictEqual((await select({ mode: 'local-auto' })).executor, 'codex');
  assert.strictEqual((await select({ mode: 'remote-orchestrated' })).executor, 'codex');
}

async function testFallbackWhenPreferredUnavailable() {
  const result = await select({
    cliExecutor: 'cursor',
    policy: { execution: { fallbackExecutors: ['claude-code', 'codex'] } },
  }, { codex: true, cursor: false, 'claude-code': true });
  assert.strictEqual(result.executor, 'claude-code');
  assert(result.warnings.some((item) => item.message.includes('CLI 指定的执行器不可用')));
  assert(result.fallbackTried.includes('cursor'));
}

async function testAllUnavailableThrows() {
  await assert.rejects(() => select({}, { codex: false, cursor: false, 'claude-code': false }), (error) => {
    assert.strictEqual(error.code, 'EXECUTOR_NOT_AVAILABLE');
    assert(error.message.includes('没有可用执行器'));
    return true;
  });
}

async function main() {
  await testCliExecutorPriority();
  await testAgentProfileBeforePolicy();
  await testPolicyBeforeModeDefault();
  await testModeDefaults();
  await testFallbackWhenPreferredUnavailable();
  await testAllUnavailableThrows();
  console.log('executor-selector tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
