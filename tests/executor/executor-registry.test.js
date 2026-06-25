const assert = require('assert');
const { ExecutorRegistry } = require('../../src/executor/executor-registry');

async function testDefaultProvidersRegistered() {
  const registry = new ExecutorRegistry();
  assert(registry.has('codex'));
  assert(registry.has('cursor'));
  assert(registry.has('claude-code'));
  assert.deepStrictEqual(registry.list().map((item) => item.name).sort(), ['claude-code', 'codex', 'cursor']);
}

async function testUnavailableProviderDoesNotCrashRegistry() {
  const registry = new ExecutorRegistry({ providers: [] });
  registry.register({
    name: 'bad',
    displayName: 'Bad',
    capabilities: [],
    async checkAvailability() {
      throw new Error('boom');
    },
  });
  const result = await registry.getAvailableProviders({ projectRoot: '.', env: {} });
  assert.deepStrictEqual(result.available, []);
  assert.strictEqual(result.unavailable[0].name, 'bad');
  assert(result.unavailable[0].reason.includes('执行器可用性检查失败'));
}

async function main() {
  await testDefaultProvidersRegistered();
  await testUnavailableProviderDoesNotCrashRegistry();
  console.log('executor-registry tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
