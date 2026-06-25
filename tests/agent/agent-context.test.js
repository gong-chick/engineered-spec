/**
 * Agent Context 测试
 */

const assert = require('assert');

const { createAgentProfile } = require('../../src/agent/agent-profile');
const {
  AgentContext,
  redactSensitiveInfo,
  DEFAULT_CONTEXT_CONFIG,
} = require('../../src/agent/agent-context');

// ============================================================
// 测试用例
// ============================================================

async function testRedactPassword() {
  console.log('  TC01: 红脱 password 字段');
  const text = 'db_password=secret123 connect now';
  const result = redactSensitiveInfo(text);
  assert.ok(!result.includes('secret123'));
  assert.ok(result.includes('***'));
}

async function testRedactApiKey() {
  console.log('  TC02: 红脱 api_key 字段');
  const text = 'api_key=sk-abc123xyz';
  const result = redactSensitiveInfo(text);
  assert.ok(!result.includes('sk-abc123xyz'));
}

async function testRedactPrivateKey() {
  console.log('  TC03: 红脱私钥块');
  const text = '-----BEGIN RSA PRIVATE KEY-----\nMIIE...';
  const result = redactSensitiveInfo(text);
  assert.ok(!result.includes('RSA PRIVATE KEY'));
  assert.ok(result.includes('REDACTED'));
}

async function testRedactNull() {
  console.log('  TC04: 红脱 null 输入安全处理');
  assert.strictEqual(redactSensitiveInfo(null), null);
  assert.strictEqual(redactSensitiveInfo(''), '');
}

async function testRedactCleanText() {
  console.log('  TC05: 不含敏感信息的文本不变');
  const text = 'Hello world, no secrets here.';
  assert.strictEqual(redactSensitiveInfo(text), text);
}

async function testContextDefaultConfig() {
  console.log('  TC06: AgentContext 默认配置');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile);
  assert.strictEqual(ctx.config.maxTokens, 100000);
  assert.strictEqual(ctx.config.redactSensitive, true);
  assert.strictEqual(ctx.config.maxVisibleFiles, 50);
  assert.strictEqual(ctx.consumedTokens, 0);
}

async function testContextCustomConfig() {
  console.log('  TC07: AgentContext 自定义配置');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { maxTokens: 50000, maxVisibleFiles: 10 });
  assert.strictEqual(ctx.config.maxTokens, 50000);
  assert.strictEqual(ctx.config.maxVisibleFiles, 10);
}

async function testTokenBudgets() {
  console.log('  TC08: Token 预算计算正确');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { maxTokens: 1000 });
  assert.strictEqual(ctx.getSystemPromptBudget(), 200);
  assert.strictEqual(ctx.getHistoryBudget(), 300);
  assert.strictEqual(ctx.getTaskBudget(), 500);
  assert.strictEqual(ctx.getRemainingTokens(), 1000);
}

async function testConsumeTokens() {
  console.log('  TC09: 消耗 token 正确');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { maxTokens: 1000 });
  assert.strictEqual(ctx.consumeTokens(300), true);
  assert.strictEqual(ctx.consumedTokens, 300);
  assert.strictEqual(ctx.getRemainingTokens(), 700);
}

async function testConsumeTokensExceed() {
  console.log('  TC10: 超出 token 预算时返回 false');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { maxTokens: 100 });
  assert.strictEqual(ctx.consumeTokens(200), false);
  assert.strictEqual(ctx.consumedTokens, 0);
}

async function testHasEnoughTokens() {
  console.log('  TC11: hasEnoughTokens 判断正确');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { maxTokens: 100 });
  assert.strictEqual(ctx.hasEnoughTokens(50), true);
  assert.strictEqual(ctx.hasEnoughTokens(100), true);
  assert.strictEqual(ctx.hasEnoughTokens(101), false);
}

async function testVisibleFiles() {
  console.log('  TC12: 可见文件管理');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { maxVisibleFiles: 3 });
  ctx.setVisibleFiles(['a.js', 'b.js', 'c.js', 'd.js']);
  assert.deepStrictEqual(ctx.visibleFiles, ['a.js', 'b.js', 'c.js']);
  assert.strictEqual(ctx.isFileVisible('a.js'), true);
  assert.strictEqual(ctx.isFileVisible('d.js'), false);
}

async function testAddVisibleFile() {
  console.log('  TC13: 添加可见文件');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { maxVisibleFiles: 2 });
  assert.strictEqual(ctx.addVisibleFile('a.js'), true);
  assert.strictEqual(ctx.addVisibleFile('a.js'), true); // 重复添加不计数
  assert.strictEqual(ctx.addVisibleFile('b.js'), true);
  assert.strictEqual(ctx.addVisibleFile('c.js'), false); // 超过限制
}

async function testFragments() {
  console.log('  TC14: 上下文片段管理');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { maxTokens: 1000 });
  ctx.addFragment({ type: 'system', content: '系统提示', estimatedTokens: 100 });
  ctx.addFragment({ type: 'task', content: '任务描述', estimatedTokens: 200 });
  assert.strictEqual(ctx.fragments.length, 2);
  assert.strictEqual(ctx.consumedTokens, 300);
  assert.deepStrictEqual(ctx.getFragmentsByType('system').map((f) => f.content), ['系统提示']);
}

async function testFragmentRedaction() {
  console.log('  TC15: 片段内容红脱');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { redactSensitive: true });
  ctx.addFragment({ type: 'file', content: 'password=abc123' });
  assert.ok(!ctx.fragments[0].content.includes('abc123'));
}

async function testFragmentExceedBudget() {
  console.log('  TC16: 超出预算时片段添加失败');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { maxTokens: 100 });
  assert.strictEqual(ctx.addFragment({ type: 'task', content: 'big', estimatedTokens: 50 }), true);
  assert.strictEqual(ctx.addFragment({ type: 'task', content: 'big', estimatedTokens: 60 }), false);
  assert.strictEqual(ctx.fragments.length, 1);
}

async function testContextReset() {
  console.log('  TC17: 上下文重置');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile);
  ctx.consumeTokens(100);
  ctx.addVisibleFile('a.js');
  ctx.addFragment({ type: 'task', content: 'test' });
  ctx.reset();
  assert.strictEqual(ctx.consumedTokens, 0);
  assert.deepStrictEqual(ctx.visibleFiles, []);
  assert.deepStrictEqual(ctx.fragments, []);
}

async function testContextSummary() {
  console.log('  TC18: 上下文摘要');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const ctx = new AgentContext(profile, { maxTokens: 1000 });
  ctx.consumeTokens(300);
  const summary = ctx.toSummary();
  assert.strictEqual(summary.agentId, 'test');
  assert.strictEqual(summary.maxTokens, 1000);
  assert.strictEqual(summary.consumedTokens, 300);
  assert.strictEqual(summary.remainingTokens, 700);
  assert.ok(summary.budgets);
}

async function testSensitivePatterns() {
  console.log('  TC19: 多种敏感信息红脱');
  const text = 'token=abc secret=xyz access_key=sk-123 private_key=pk-456';
  const result = redactSensitiveInfo(text);
  assert.ok(!result.includes('abc'));
  assert.ok(!result.includes('xyz'));
  assert.ok(!result.includes('sk-123'));
  assert.ok(!result.includes('pk-456'));
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== agent-context.test.js ===');

  const tests = [
    testRedactPassword,
    testRedactApiKey,
    testRedactPrivateKey,
    testRedactNull,
    testRedactCleanText,
    testContextDefaultConfig,
    testContextCustomConfig,
    testTokenBudgets,
    testConsumeTokens,
    testConsumeTokensExceed,
    testHasEnoughTokens,
    testVisibleFiles,
    testAddVisibleFile,
    testFragments,
    testFragmentRedaction,
    testFragmentExceedBudget,
    testContextReset,
    testContextSummary,
    testSensitivePatterns,
  ];

  let passed = 0;
  let failed = 0;

  for (const testFn of tests) {
    try {
      await testFn();
      passed++;
    } catch (err) {
      failed++;
      console.error(`  FAIL: ${testFn.name} — ${err.message}`);
    }
  }

  console.log(`\n结果: ${passed} 通过, ${failed} 失败, 共 ${tests.length} 个`);

  if (failed > 0) {
    process.exit(1);
  }
}

main().catch((err) => {
  console.error('测试执行失败:', err);
  process.exit(1);
});
