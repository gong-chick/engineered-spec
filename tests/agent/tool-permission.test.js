/**
 * Tool Permission 测试
 */

const assert = require('assert');

const { createAgentProfile } = require('../../src/agent/agent-profile');
const { AGENT_ROLES, MEMORY_ACCESS_LEVELS, ESCALATION_POLICIES } = require('../../src/agent/agent-types');
const {
  checkToolPermission,
  checkBatchToolPermission,
  getAllowedTools,
} = require('../../src/agent/tool-permission');
const { PermissionAuditLog } = require('../../src/agent/permission-audit');

// ============================================================
// 测试用例
// ============================================================

async function testDeniedToolsPriority() {
  console.log('  TC01: deniedTools 优先于 allowedTools');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedTools: ['Read', 'Write', 'Edit'],
    deniedTools: ['Write'],
  });
  const result = checkToolPermission(profile, 'Write');
  assert.strictEqual(result.allowed, false);
  assert.ok(result.reason.includes('deniedTools'));
}

async function testAllowedToolsMatch() {
  console.log('  TC02: 工具在 allowedTools 中时允许');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedTools: ['Read', 'Grep'],
    deniedTools: [],
  });
  const result = checkToolPermission(profile, 'Read');
  assert.strictEqual(result.allowed, true);
}

async function testAllowedToolsNotMatch() {
  console.log('  TC03: 工具不在 allowedTools 中时拒绝');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedTools: ['Read', 'Grep'],
    deniedTools: [],
  });
  const result = checkToolPermission(profile, 'Bash');
  assert.strictEqual(result.allowed, false);
  assert.ok(result.reason.includes('不在 allowedTools'));
}

async function testEmptyAllowedToolsMeansAll() {
  console.log('  TC04: 空 allowedTools 表示全部允许');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedTools: [],
    deniedTools: ['Bash'],
  });
  assert.strictEqual(checkToolPermission(profile, 'Read').allowed, true);
  assert.strictEqual(checkToolPermission(profile, 'Write').allowed, true);
  assert.strictEqual(checkToolPermission(profile, 'Edit').allowed, true);
  assert.strictEqual(checkToolPermission(profile, 'Bash').allowed, false);
}

async function testInvalidProfile() {
  console.log('  TC05: 无效 profile 返回拒绝');
  const result = checkToolPermission(null, 'Read');
  assert.strictEqual(result.allowed, false);
  assert.ok(result.reason.includes('profile'));
}

async function testInvalidToolName() {
  console.log('  TC06: 无效 toolName 返回拒绝');
  const profile = createAgentProfile({ agentId: 'test', name: 'test' });
  const result = checkToolPermission(profile, '');
  assert.strictEqual(result.allowed, false);
  assert.ok(result.reason.includes('toolName'));
}

async function testBatchToolPermission() {
  console.log('  TC07: 批量工具权限校验');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedTools: ['Read', 'Grep'],
    deniedTools: ['Bash'],
  });
  const result = checkBatchToolPermission(profile, ['Read', 'Grep', 'Bash', 'Write']);
  assert.strictEqual(result.allAllowed, false);
  assert.strictEqual(result.results['Read'].allowed, true);
  assert.strictEqual(result.results['Grep'].allowed, true);
  assert.strictEqual(result.results['Bash'].allowed, false);
  assert.strictEqual(result.results['Write'].allowed, false);
}

async function testBatchToolPermissionAllAllowed() {
  console.log('  TC08: 批量工具权限全部允许');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedTools: ['Read', 'Grep', 'Glob'],
    deniedTools: [],
  });
  const result = checkBatchToolPermission(profile, ['Read', 'Grep', 'Glob']);
  assert.strictEqual(result.allAllowed, true);
}

async function testGetAllowedTools() {
  console.log('  TC09: getAllowedTools 返回有效工具列表');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedTools: ['Read', 'Write', 'Edit'],
    deniedTools: ['Write'],
  });
  const allowed = getAllowedTools(profile, ['Read', 'Write', 'Edit', 'Bash', 'Grep']);
  assert.deepStrictEqual(allowed, ['Read', 'Edit']);
}

async function testGetAllowedToolsEmptyMeansAll() {
  console.log('  TC10: getAllowedTools 空 allowedTools 返回除 denied 外全部');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedTools: [],
    deniedTools: ['Bash'],
  });
  const allowed = getAllowedTools(profile, ['Read', 'Write', 'Edit', 'Bash', 'Grep']);
  assert.deepStrictEqual(allowed, ['Read', 'Write', 'Edit', 'Grep']);
}

async function testGetAllowedToolsNullProfile() {
  console.log('  TC11: getAllowedTools 空 profile 返回空数组');
  assert.deepStrictEqual(getAllowedTools(null, ['Read']), []);
}

// ============================================================
// PermissionAuditLog 测试
// ============================================================

async function testAuditLogRecord() {
  console.log('  TC12: PermissionAuditLog 记录权限检查');
  const log = new PermissionAuditLog();
  log.recordToolCheck('agent-1', 'Read', { allowed: true, reason: '允许' });
  log.recordFileCheck('agent-1', 'src/main.js', { allowed: false, reason: '拒绝' });

  assert.strictEqual(log.size, 2);
  assert.strictEqual(log.getByAgent('agent-1').length, 2);
  assert.strictEqual(log.getDenied('agent-1').length, 1);
}

async function testAuditLogStats() {
  console.log('  TC13: PermissionAuditLog 统计正确');
  const log = new PermissionAuditLog();
  log.recordToolCheck('agent-1', 'Read', { allowed: true, reason: '' });
  log.recordToolCheck('agent-1', 'Write', { allowed: false, reason: '' });
  log.recordFileCheck('agent-1', 'src/a.js', { allowed: true, reason: '' });

  const stats = log.getStats('agent-1');
  assert.strictEqual(stats.total, 3);
  assert.strictEqual(stats.allowed, 2);
  assert.strictEqual(stats.denied, 1);
  assert.strictEqual(stats.byType['tool'], 2);
  assert.strictEqual(stats.byType['file'], 1);
}

async function testAuditLogGlobalStats() {
  console.log('  TC14: PermissionAuditLog 全局统计');
  const log = new PermissionAuditLog();
  log.recordToolCheck('agent-1', 'Read', { allowed: true, reason: '' });
  log.recordToolCheck('agent-2', 'Write', { allowed: false, reason: '' });

  const stats = log.getStats();
  assert.strictEqual(stats.total, 2);
  assert.strictEqual(stats.allowed, 1);
  assert.strictEqual(stats.denied, 1);
}

async function testAuditLogClear() {
  console.log('  TC15: PermissionAuditLog 清空日志');
  const log = new PermissionAuditLog();
  log.recordToolCheck('agent-1', 'Read', { allowed: true, reason: '' });
  assert.strictEqual(log.size, 1);
  log.clear();
  assert.strictEqual(log.size, 0);
}

async function testAuditLogToJSON() {
  console.log('  TC16: PermissionAuditLog 导出 JSON');
  const log = new PermissionAuditLog();
  log.recordToolCheck('agent-1', 'Read', { allowed: true, reason: 'ok' });
  const json = log.toJSON();
  assert.ok(Array.isArray(json));
  assert.strictEqual(json.length, 1);
  assert.strictEqual(json[0].agentId, 'agent-1');
  assert.strictEqual(json[0].checkType, 'tool');
  assert.strictEqual(json[0].target, 'Read');
  assert.strictEqual(json[0].allowed, true);
  assert.ok(json[0].timestamp);
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== tool-permission.test.js ===');

  const tests = [
    testDeniedToolsPriority,
    testAllowedToolsMatch,
    testAllowedToolsNotMatch,
    testEmptyAllowedToolsMeansAll,
    testInvalidProfile,
    testInvalidToolName,
    testBatchToolPermission,
    testBatchToolPermissionAllAllowed,
    testGetAllowedTools,
    testGetAllowedToolsEmptyMeansAll,
    testGetAllowedToolsNullProfile,
    testAuditLogRecord,
    testAuditLogStats,
    testAuditLogGlobalStats,
    testAuditLogClear,
    testAuditLogToJSON,
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
