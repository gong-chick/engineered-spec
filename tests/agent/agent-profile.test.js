/**
 * Agent Profile 测试
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  AGENT_ROLES,
  VALID_AGENT_ROLES,
  AGENT_STATES,
  VALID_AGENT_STATES,
  ESCALATION_POLICIES,
  VALID_ESCALATION_POLICIES,
  MEMORY_ACCESS_LEVELS,
  VALID_MEMORY_ACCESS_LEVELS,
  AGENT_PROFILE_VERSION,
} = require('../../src/agent/agent-types');

const {
  createAgentProfile,
  validateAgentProfile,
  buildAgentIdentity,
  computeAgentChecksum,
} = require('../../src/agent/agent-profile');

const {
  AGENT_TEMPLATES,
  TEMPLATE_IDS,
  getTemplate,
  listTemplates,
  architectReviewer,
  frontendImplementer,
  testReviewer,
  securityReviewer,
} = require('../../src/agent/agent-templates');

// ============================================================
// 工具函数
// ============================================================

function assertThrows(fn, expectedMsg) {
  try {
    fn();
    assert.fail('应该抛出错误');
  } catch (err) {
    if (expectedMsg) {
      assert.ok(err.message.includes(expectedMsg), `错误信息应包含 "${expectedMsg}"，实际: "${err.message}"`);
    }
  }
}

// ============================================================
// 测试用例
// ============================================================

async function testAgentRolesEnum() {
  console.log('  TC01: AGENT_ROLES 枚举包含 5 种角色');
  assert.strictEqual(Object.keys(AGENT_ROLES).length, 5);
  assert.strictEqual(AGENT_ROLES.ARCHITECT_REVIEWER, 'architect-reviewer');
  assert.strictEqual(AGENT_ROLES.FRONTEND_IMPLEMENTER, 'frontend-implementer');
  assert.strictEqual(AGENT_ROLES.TEST_REVIEWER, 'test-reviewer');
  assert.strictEqual(AGENT_ROLES.SECURITY_REVIEWER, 'security-reviewer');
  assert.strictEqual(AGENT_ROLES.CUSTOM, 'custom');
  assert.strictEqual(VALID_AGENT_ROLES.size, 5);
}

async function testAgentStatesEnum() {
  console.log('  TC02: AGENT_STATES 枚举包含 8 种状态');
  assert.strictEqual(Object.keys(AGENT_STATES).length, 8);
  assert.strictEqual(AGENT_STATES.IDLE, 'idle');
  assert.strictEqual(AGENT_STATES.ASSIGNED, 'assigned');
  assert.strictEqual(AGENT_STATES.EXECUTING, 'executing');
  assert.strictEqual(AGENT_STATES.REVIEWING, 'reviewing');
  assert.strictEqual(AGENT_STATES.REPAIRING, 'repairing');
  assert.strictEqual(AGENT_STATES.BLOCKED, 'blocked');
  assert.strictEqual(AGENT_STATES.COMPLETED, 'completed');
  assert.strictEqual(AGENT_STATES.FAILED, 'failed');
  assert.strictEqual(VALID_AGENT_STATES.size, 8);
}

async function testEscalationPoliciesEnum() {
  console.log('  TC03: ESCALATION_POLICIES 枚举包含 4 种策略');
  assert.strictEqual(Object.keys(ESCALATION_POLICIES).length, 4);
  assert.strictEqual(ESCALATION_POLICIES.BLOCK, 'block');
  assert.strictEqual(ESCALATION_POLICIES.RETRY, 'retry');
  assert.strictEqual(ESCALATION_POLICIES.SKIP, 'skip');
  assert.strictEqual(ESCALATION_POLICIES.ABORT, 'abort');
  assert.strictEqual(VALID_ESCALATION_POLICIES.size, 4);
}

async function testMemoryAccessLevelsEnum() {
  console.log('  TC04: MEMORY_ACCESS_LEVELS 枚举包含 3 种级别');
  assert.strictEqual(Object.keys(MEMORY_ACCESS_LEVELS).length, 3);
  assert.strictEqual(MEMORY_ACCESS_LEVELS.READ, 'read');
  assert.strictEqual(MEMORY_ACCESS_LEVELS.READ_WRITE, 'read-write');
  assert.strictEqual(MEMORY_ACCESS_LEVELS.NONE, 'none');
  assert.strictEqual(VALID_MEMORY_ACCESS_LEVELS.size, 3);
}

async function testCreateAgentProfileDefaults() {
  console.log('  TC05: createAgentProfile 默认值正确');
  const profile = createAgentProfile();
  assert.strictEqual(profile.agentId, '');
  assert.strictEqual(profile.name, '');
  assert.strictEqual(profile.role, AGENT_ROLES.CUSTOM);
  assert.strictEqual(profile.version, '0.1.0');
  assert.strictEqual(profile.description, '');
  assert.deepStrictEqual(profile.responsibilities, []);
  assert.deepStrictEqual(profile.allowedTools, []);
  assert.deepStrictEqual(profile.deniedTools, []);
  assert.deepStrictEqual(profile.allowedFileScopes, ['**']);
  assert.deepStrictEqual(profile.deniedFileScopes, []);
  assert.strictEqual(profile.memoryAccess, MEMORY_ACCESS_LEVELS.READ);
  assert.strictEqual(profile.maxIterations, 10);
  assert.strictEqual(profile.escalationPolicy, ESCALATION_POLICIES.BLOCK);
  assert.strictEqual(profile.timeout, 300000);
  assert.deepStrictEqual(profile.tags, []);
  assert.ok(profile.createdAt);
  assert.ok(profile.updatedAt);
}

async function testCreateAgentProfileOverrides() {
  console.log('  TC06: createAgentProfile 支持字段覆盖');
  const profile = createAgentProfile({
    agentId: 'test-agent',
    name: '测试 Agent',
    role: AGENT_ROLES.TEST_REVIEWER,
    maxIterations: 5,
  });
  assert.strictEqual(profile.agentId, 'test-agent');
  assert.strictEqual(profile.name, '测试 Agent');
  assert.strictEqual(profile.role, AGENT_ROLES.TEST_REVIEWER);
  assert.strictEqual(profile.maxIterations, 5);
  assert.strictEqual(profile.version, '0.1.0');
}

async function testValidateAgentProfileValid() {
  console.log('  TC07: validateAgentProfile 校验合法 Profile');
  const profile = createAgentProfile({
    agentId: 'test-agent',
    name: '测试 Agent',
    role: AGENT_ROLES.TEST_REVIEWER,
    responsibilities: ['审查测试覆盖'],
    allowedTools: ['Read'],
    deniedTools: [],
  });
  const result = validateAgentProfile(profile);
  assert.strictEqual(result.ok, true);
  assert.deepStrictEqual(result.errors, []);
}

async function testValidateAgentProfileMissingRequired() {
  console.log('  TC08: validateAgentProfile 检测缺失必填字段');
  const result = validateAgentProfile({});
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.length > 0);
  assert.ok(result.errors.some((e) => e.includes('agentId')));
  assert.ok(result.errors.some((e) => e.includes('name')));
}

async function testValidateAgentProfileInvalidRole() {
  console.log('  TC09: validateAgentProfile 检测非法 role');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    role: 'invalid-role',
  });
  const result = validateAgentProfile(profile);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('role')));
}

async function testValidateAgentProfileInvalidMemoryAccess() {
  console.log('  TC10: validateAgentProfile 检测非法 memoryAccess');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    memoryAccess: 'invalid',
  });
  const result = validateAgentProfile(profile);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('memoryAccess')));
}

async function testValidateAgentProfileInvalidEscalationPolicy() {
  console.log('  TC11: validateAgentProfile 检测非法 escalationPolicy');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    escalationPolicy: 'invalid',
  });
  const result = validateAgentProfile(profile);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('escalationPolicy')));
}

async function testValidateAgentProfileInvalidMaxIterations() {
  console.log('  TC12: validateAgentProfile 检测非法 maxIterations');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    maxIterations: 0,
  });
  const result = validateAgentProfile(profile);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('maxIterations')));
}

async function testValidateAgentProfileInvalidTimeout() {
  console.log('  TC13: validateAgentProfile 检测非法 timeout');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    timeout: 500,
  });
  const result = validateAgentProfile(profile);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('timeout')));
}

async function testValidateAgentProfileNotObject() {
  console.log('  TC14: validateAgentProfile 检测非对象输入');
  const result = validateAgentProfile(null);
  assert.strictEqual(result.ok, false);
  assert.ok(result.errors.some((e) => e.includes('必须是对象')));
}

async function testBuildAgentIdentity() {
  console.log('  TC15: buildAgentIdentity 生成正确格式');
  const identity = buildAgentIdentity('test-reviewer', 'my-agent', '1.0.0');
  assert.strictEqual(identity, 'test-reviewer:my-agent@1.0.0');
}

async function testComputeAgentChecksumStable() {
  console.log('  TC16: computeAgentChecksum 对相同内容生成稳定摘要');
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    role: AGENT_ROLES.CUSTOM,
  });
  const hash1 = computeAgentChecksum(profile);
  const hash2 = computeAgentChecksum(profile);
  assert.strictEqual(hash1, hash2);
  assert.ok(hash1.startsWith('sha256:'));
}

async function testComputeAgentChecksumIgnoresTimestamps() {
  console.log('  TC17: computeAgentChecksum 忽略时间戳字段');
  const profile1 = createAgentProfile({ agentId: 'test', name: 'test' });
  const profile2 = { ...profile1, createdAt: '2000-01-01T00:00:00.000Z', updatedAt: '2000-01-01T00:00:00.000Z' };
  assert.strictEqual(computeAgentChecksum(profile1), computeAgentChecksum(profile2));
}

async function testTemplatesCount() {
  console.log('  TC18: 预定义模板包含 4 个');
  assert.strictEqual(TEMPLATE_IDS.length, 4);
  assert.strictEqual(Object.keys(AGENT_TEMPLATES).length, 4);
}

async function testArchitectReviewerTemplate() {
  console.log('  TC19: architect-reviewer 模板字段正确');
  assert.strictEqual(architectReviewer.agentId, 'architect-reviewer');
  assert.strictEqual(architectReviewer.role, AGENT_ROLES.ARCHITECT_REVIEWER);
  assert.ok(architectReviewer.responsibilities.length > 0);
  assert.ok(architectReviewer.deniedTools.includes('Write'));
  assert.ok(architectReviewer.deniedTools.includes('Edit'));
  assert.strictEqual(architectReviewer.memoryAccess, MEMORY_ACCESS_LEVELS.READ);
  const validation = validateAgentProfile(architectReviewer);
  assert.strictEqual(validation.ok, true, `校验失败: ${validation.errors.join(', ')}`);
}

async function testFrontendImplementerTemplate() {
  console.log('  TC20: frontend-implementer 模板字段正确');
  assert.strictEqual(frontendImplementer.agentId, 'frontend-implementer');
  assert.strictEqual(frontendImplementer.role, AGENT_ROLES.FRONTEND_IMPLEMENTER);
  assert.ok(frontendImplementer.allowedTools.includes('Write'));
  assert.ok(frontendImplementer.allowedTools.includes('Edit'));
  assert.strictEqual(frontendImplementer.memoryAccess, MEMORY_ACCESS_LEVELS.READ_WRITE);
  const validation = validateAgentProfile(frontendImplementer);
  assert.strictEqual(validation.ok, true, `校验失败: ${validation.errors.join(', ')}`);
}

async function testTestReviewerTemplate() {
  console.log('  TC21: test-reviewer 模板字段正确');
  assert.strictEqual(testReviewer.agentId, 'test-reviewer');
  assert.strictEqual(testReviewer.role, AGENT_ROLES.TEST_REVIEWER);
  assert.ok(testReviewer.deniedTools.includes('Write'));
  assert.ok(testReviewer.deniedTools.includes('Edit'));
  assert.strictEqual(testReviewer.memoryAccess, MEMORY_ACCESS_LEVELS.READ);
  const validation = validateAgentProfile(testReviewer);
  assert.strictEqual(validation.ok, true, `校验失败: ${validation.errors.join(', ')}`);
}

async function testSecurityReviewerTemplate() {
  console.log('  TC22: security-reviewer 模板字段正确');
  assert.strictEqual(securityReviewer.agentId, 'security-reviewer');
  assert.strictEqual(securityReviewer.role, AGENT_ROLES.SECURITY_REVIEWER);
  assert.ok(securityReviewer.deniedTools.includes('Write'));
  assert.ok(securityReviewer.deniedTools.includes('Edit'));
  assert.ok(securityReviewer.deniedTools.includes('Bash'));
  assert.strictEqual(securityReviewer.memoryAccess, MEMORY_ACCESS_LEVELS.READ);
  const validation = validateAgentProfile(securityReviewer);
  assert.strictEqual(validation.ok, true, `校验失败: ${validation.errors.join(', ')}`);
}

async function testGetTemplate() {
  console.log('  TC23: getTemplate 返回正确模板');
  const tpl = getTemplate('architect-reviewer');
  assert.ok(tpl);
  assert.strictEqual(tpl.agentId, 'architect-reviewer');
  assert.strictEqual(getTemplate('nonexistent'), null);
}

async function testListTemplates() {
  console.log('  TC24: listTemplates 返回所有模板摘要');
  const list = listTemplates();
  assert.strictEqual(list.length, 4);
  for (const item of list) {
    assert.ok(item.id);
    assert.ok(item.name);
    assert.ok(item.role);
    assert.ok(item.description);
  }
}

async function testTemplatesAreFrozen() {
  console.log('  TC25: 模板对象不可修改');
  assertThrows(() => {
    architectReviewer.agentId = 'modified';
  });
}

async function testAllTemplatesValid() {
  console.log('  TC26: 所有模板通过 validateAgentProfile 校验');
  for (const [id, tpl] of Object.entries(AGENT_TEMPLATES)) {
    const result = validateAgentProfile(tpl);
    assert.strictEqual(result.ok, true, `模板 ${id} 校验失败: ${result.errors.join(', ')}`);
  }
}

async function testCreateProfileWithTemplate() {
  console.log('  TC27: 从模板创建自定义 Profile');
  const tpl = getTemplate('test-reviewer');
  const profile = createAgentProfile({
    ...tpl,
    agentId: 'custom-test-reviewer',
    name: '自定义测试审查者',
    maxIterations: 3,
  });
  const result = validateAgentProfile(profile);
  assert.strictEqual(result.ok, true, `校验失败: ${result.errors.join(', ')}`);
  assert.strictEqual(profile.agentId, 'custom-test-reviewer');
  assert.strictEqual(profile.maxIterations, 3);
}

async function testEnumerationsFrozen() {
  console.log('  TC28: 枚举对象不可修改');
  assertThrows(() => {
    AGENT_ROLES.NEW_ROLE = 'new';
  });
  assertThrows(() => {
    AGENT_STATES.NEW_STATE = 'new';
  });
  assertThrows(() => {
    ESCALATION_POLICIES.NEW_POLICY = 'new';
  });
  assertThrows(() => {
    MEMORY_ACCESS_LEVELS.NEW_LEVEL = 'new';
  });
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== agent-profile.test.js ===');

  const tests = [
    testAgentRolesEnum,
    testAgentStatesEnum,
    testEscalationPoliciesEnum,
    testMemoryAccessLevelsEnum,
    testCreateAgentProfileDefaults,
    testCreateAgentProfileOverrides,
    testValidateAgentProfileValid,
    testValidateAgentProfileMissingRequired,
    testValidateAgentProfileInvalidRole,
    testValidateAgentProfileInvalidMemoryAccess,
    testValidateAgentProfileInvalidEscalationPolicy,
    testValidateAgentProfileInvalidMaxIterations,
    testValidateAgentProfileInvalidTimeout,
    testValidateAgentProfileNotObject,
    testBuildAgentIdentity,
    testComputeAgentChecksumStable,
    testComputeAgentChecksumIgnoresTimestamps,
    testTemplatesCount,
    testArchitectReviewerTemplate,
    testFrontendImplementerTemplate,
    testTestReviewerTemplate,
    testSecurityReviewerTemplate,
    testGetTemplate,
    testListTemplates,
    testTemplatesAreFrozen,
    testAllTemplatesValid,
    testCreateProfileWithTemplate,
    testEnumerationsFrozen,
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
