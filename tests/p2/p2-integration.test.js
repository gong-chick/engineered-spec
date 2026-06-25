/**
 * P2 集成测试 — 全链路受控多 Agent 协作
 *
 * 覆盖：Profile 创建 → 权限校验 → 上下文分配 → 协作 → Review/Repair → 冲突处理
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const os = require('os');

const {
  AGENT_ROLES,
  AGENT_STATES,
  ESCALATION_POLICIES,
  MEMORY_ACCESS_LEVELS,
  createAgentProfile,
  validateAgentProfile,
  buildAgentIdentity,
  computeAgentChecksum,
  getTemplate,
  listTemplates,
} = require('../../src/agent');

const { checkToolPermission } = require('../../src/agent/tool-permission');
const { checkFilePermission } = require('../../src/agent/file-permission');
const { PermissionAuditLog } = require('../../src/agent/permission-audit');
const { AgentContext } = require('../../src/agent/agent-context');
const { AgentCollaborationProtocol } = require('../../src/agent/collaboration-protocol');
const { ReviewRepairLoop } = require('../../src/agent/review-repair-loop');
const { ConflictHandler, detectConflicts } = require('../../src/agent/conflict-handler');

// ============================================================
// TC01: 全链路 — Profile 创建 → 校验 → 身份标识
// ============================================================

async function testFullLifecycleProfile() {
  console.log('  TC01: 全链路 Profile 创建 → 校验 → 身份标识');

  // 从模板创建
  const template = getTemplate('test-reviewer');
  const profile = createAgentProfile({
    ...template,
    agentId: 'custom-test-reviewer',
    name: '自定义测试审查者',
  });

  // 校验
  const validation = validateAgentProfile(profile);
  assert.strictEqual(validation.ok, true, `校验失败: ${validation.errors.join(', ')}`);

  // 身份标识
  const identity = buildAgentIdentity(profile.role, profile.agentId, profile.version);
  assert.strictEqual(identity, 'test-reviewer:custom-test-reviewer@1.0.0');

  // checksum 稳定
  const hash1 = computeAgentChecksum(profile);
  const hash2 = computeAgentChecksum(profile);
  assert.strictEqual(hash1, hash2);
}

// ============================================================
// TC02: 权限校验全链路
// ============================================================

async function testFullLifecyclePermissions() {
  console.log('  TC02: 权限校验全链路 — 工具 + 文件 + 审计');

  const profile = createAgentProfile({
    ...getTemplate('security-reviewer'),
    agentId: 'sec-reviewer-1',
    name: '安全审查者 1',
  });

  const auditLog = new PermissionAuditLog();

  // 工具权限 — Read 允许
  const readResult = checkToolPermission(profile, 'Read');
  assert.strictEqual(readResult.allowed, true);
  auditLog.recordToolCheck(profile.agentId, 'Read', readResult);

  // 工具权限 — Bash 拒绝
  const bashResult = checkToolPermission(profile, 'Bash');
  assert.strictEqual(bashResult.allowed, false);
  auditLog.recordToolCheck(profile.agentId, 'Bash', bashResult);

  // 文件权限 — src/main.js 允许
  const srcResult = checkFilePermission(profile, 'src/main.js');
  assert.strictEqual(srcResult.allowed, true);
  auditLog.recordFileCheck(profile.agentId, 'src/main.js', srcResult);

  // 文件权限 — secrets/key.pem 拒绝
  const secretResult = checkFilePermission(profile, 'secrets/key.pem');
  assert.strictEqual(secretResult.allowed, false);
  auditLog.recordFileCheck(profile.agentId, 'secrets/key.pem', secretResult);

  // 审计统计
  const stats = auditLog.getStats(profile.agentId);
  assert.strictEqual(stats.total, 4);
  assert.strictEqual(stats.allowed, 2);
  assert.strictEqual(stats.denied, 2);
}

// ============================================================
// TC03: 上下文边界与红脱
// ============================================================

async function testFullLifecycleContext() {
  console.log('  TC03: 上下文边界与红脱');

  const profile = createAgentProfile({
    agentId: 'ctx-agent-1',
    name: '上下文测试 Agent',
    role: AGENT_ROLES.FRONTEND_IMPLEMENTER,
  });

  const ctx = new AgentContext(profile, { maxTokens: 10000 });

  // 添加系统提示
  ctx.addFragment({ type: 'system', content: '你是前端实现者', estimatedTokens: 100 });

  // 添加任务描述（含敏感信息，应被红脱）
  ctx.addFragment({ type: 'task', content: '连接数据库 password=db_secret123', estimatedTokens: 200 });

  // 验证红脱
  const taskFragment = ctx.getFragmentsByType('task')[0];
  assert.ok(!taskFragment.content.includes('db_secret123'), '敏感信息应被红脱');

  // 验证 token 消耗
  assert.strictEqual(ctx.consumedTokens, 300);
  assert.strictEqual(ctx.getRemainingTokens(), 9700);

  // 设置可见文件
  ctx.setVisibleFiles(['src/components/Button.tsx', 'src/styles/main.scss']);
  assert.strictEqual(ctx.isFileVisible('src/components/Button.tsx'), true);
  assert.strictEqual(ctx.isFileVisible('src/secrets/key.js'), false);
}

// ============================================================
// TC04: Agent 协作 — 注册 → 分配 → 消息 → 完成
// ============================================================

async function testFullLifecycleCollaboration() {
  console.log('  TC04: Agent 协作全链路');

  const protocol = new AgentCollaborationProtocol();

  // 注册 Agent
  const reviewer = createAgentProfile({
    agentId: 'reviewer-1',
    name: '审查者',
    role: AGENT_ROLES.TEST_REVIEWER,
  });
  const implementer = createAgentProfile({
    agentId: 'implementer-1',
    name: '实现者',
    role: AGENT_ROLES.FRONTEND_IMPLEMENTER,
  });

  protocol.registerAgent(reviewer);
  protocol.registerAgent(implementer);

  // 分配任务
  const assignResult = protocol.assignTask('implementer-1', 'task-001', { spec: '实现用户登录' });
  assert.strictEqual(assignResult.ok, true);

  // 实现者开始执行
  const impState = protocol.getAgentState('implementer-1');
  assert.strictEqual(impState.transition(AGENT_STATES.EXECUTING).ok, true);

  // 发送审查请求
  protocol.sendMessage({
    fromAgentId: 'implementer-1',
    toAgentId: 'reviewer-1',
    type: 'review',
    payload: { taskId: 'task-001', files: ['src/login.tsx'] },
  });

  // 审查者收到消息
  const messages = protocol.getUnreadMessages('reviewer-1');
  assert.strictEqual(messages.length, 1);
  assert.strictEqual(messages[0].type, 'review');

  // 完成实现
  assert.strictEqual(impState.transition(AGENT_STATES.COMPLETED).ok, true);
  assert.strictEqual(impState.isTerminal(), true);

  // 统计
  const stats = protocol.getStats();
  assert.strictEqual(stats.totalAgents, 2);
  assert.strictEqual(stats.totalTasks, 1);
}

// ============================================================
// TC05: Review/Repair 闭环
// ============================================================

async function testFullLifecycleReviewRepair() {
  console.log('  TC05: Review/Repair 闭环 — 审查→修复→审查→通过');

  const loop = new ReviewRepairLoop({ maxRepairAttempts: 2 });

  // 第一轮审查
  loop.startReview();
  const rejectResult = loop.rejectReview({ issues: ['缺少错误处理', '未处理 null'] });
  assert.strictEqual(rejectResult.needsRepair, true);

  // 第一轮修复
  loop.startRepair();
  loop.completeRepair({ fixed: ['缺少错误处理'] });

  // 第二轮审查
  loop.startReview();
  const rejectResult2 = loop.rejectReview({ issues: ['未处理 null'] });
  assert.strictEqual(rejectResult2.needsRepair, true);

  // 第二轮修复
  loop.startRepair();
  loop.completeRepair({ fixed: ['未处理 null'] });

  // 第三轮审查 — 通过
  loop.startReview();
  const approveResult = loop.approveReview();
  assert.strictEqual(approveResult.ok, true);
  assert.strictEqual(loop.completed, true);
  assert.strictEqual(loop.repairCount, 2);
  assert.strictEqual(loop.reviewCount, 3);
}

// ============================================================
// TC06: Review/Repair 超过最大次数失败
// ============================================================

async function testFullLifecycleMaxRepairFail() {
  console.log('  TC06: Review/Repair 超过最大次数失败');

  const loop = new ReviewRepairLoop({ maxRepairAttempts: 1 });

  loop.startReview();
  loop.rejectReview({ issues: ['bug-1'] });
  loop.startRepair();
  loop.completeRepair();

  loop.startReview();
  loop.rejectReview({ issues: ['bug-2'] });
  const result = loop.startRepair();
  assert.strictEqual(result.ok, false);
  assert.strictEqual(loop.failed, true);
}

// ============================================================
// TC07: 冲突处理全链路
// ============================================================

async function testFullLifecycleConflict() {
  console.log('  TC07: 冲突处理 — 检测 → 锁定 → 审批');

  // 冲突检测
  const conflicts = detectConflicts([
    { agentId: 'agent-1', files: ['src/shared.ts', 'src/a.ts'] },
    { agentId: 'agent-2', files: ['src/shared.ts', 'src/b.ts'] },
  ]);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].filePath, 'src/shared.ts');

  // 冲突处理
  const handler = new ConflictHandler();

  // agent-1 先锁定
  const lock1 = handler.lockOrQueue('src/shared.ts', 'agent-1');
  assert.strictEqual(lock1.locked, true);

  // agent-2 冲突 → 自动提交审批
  const lock2 = handler.lockOrQueue('src/shared.ts', 'agent-2');
  assert.strictEqual(lock2.locked, false);
  assert.ok(lock2.approvalId);

  // 人工审批
  const approval = handler.approvalQueue.getPending()[0];
  handler.approvalQueue.approve(approval.id, 'admin', '允许 agent-2 修改');

  // 验证审批结果
  const stats = handler.approvalQueue.getStats();
  assert.strictEqual(stats.approved, 1);
  assert.strictEqual(stats.pending, 0);
}

// ============================================================
// TC08: 多 Agent 并行无冲突
// ============================================================

async function testFullLifecycleParallelNoConflict() {
  console.log('  TC08: 多 Agent 并行无冲突');

  const conflicts = detectConflicts([
    { agentId: 'agent-1', files: ['src/login.tsx'] },
    { agentId: 'agent-2', files: ['src/dashboard.tsx'] },
    { agentId: 'agent-3', files: ['src/settings.tsx'] },
  ]);
  assert.strictEqual(conflicts.length, 0);

  const handler = new ConflictHandler();
  assert.strictEqual(handler.lockOrQueue('src/login.tsx', 'agent-1').locked, true);
  assert.strictEqual(handler.lockOrQueue('src/dashboard.tsx', 'agent-2').locked, true);
  assert.strictEqual(handler.lockOrQueue('src/settings.tsx', 'agent-3').locked, true);

  const status = handler.getStatus();
  assert.strictEqual(status.activeLocks, 3);
  assert.strictEqual(status.pendingApprovals, 0);
}

// ============================================================
// TC09: 接口稳定性 — 所有模块公共接口存在
// ============================================================

async function testInterfaceStability() {
  console.log('  TC09: 接口稳定性验证');

  // agent-types
  assert.ok(AGENT_ROLES);
  assert.ok(AGENT_STATES);
  assert.ok(ESCALATION_POLICIES);
  assert.ok(MEMORY_ACCESS_LEVELS);

  // agent-profile
  assert.strictEqual(typeof createAgentProfile, 'function');
  assert.strictEqual(typeof validateAgentProfile, 'function');
  assert.strictEqual(typeof buildAgentIdentity, 'function');
  assert.strictEqual(typeof computeAgentChecksum, 'function');

  // agent-templates
  assert.strictEqual(typeof getTemplate, 'function');
  assert.strictEqual(typeof listTemplates, 'function');

  // tool-permission
  assert.strictEqual(typeof checkToolPermission, 'function');

  // file-permission
  assert.strictEqual(typeof checkFilePermission, 'function');

  // permission-audit
  assert.strictEqual(typeof PermissionAuditLog, 'function');

  // agent-context
  assert.strictEqual(typeof AgentContext, 'function');

  // collaboration-protocol
  assert.strictEqual(typeof AgentCollaborationProtocol, 'function');

  // review-repair-loop
  assert.strictEqual(typeof ReviewRepairLoop, 'function');

  // conflict-handler
  assert.strictEqual(typeof ConflictHandler, 'function');
  assert.strictEqual(typeof detectConflicts, 'function');
}

// ============================================================
// TC10: 幂等性 — 重复操作结果一致
// ============================================================

async function testIdempotency() {
  console.log('  TC10: 幂等性验证');

  // 重复创建 Profile 结果一致
  const p1 = createAgentProfile({ agentId: 'test', name: 'test' });
  const p2 = createAgentProfile({ agentId: 'test', name: 'test' });
  assert.strictEqual(computeAgentChecksum(p1), computeAgentChecksum(p2));

  // 重复校验结果一致
  assert.deepStrictEqual(validateAgentProfile(p1), validateAgentProfile(p2));

  // 重复权限检查结果一致
  const profile = createAgentProfile({
    agentId: 'test',
    name: 'test',
    allowedTools: ['Read'],
    deniedTools: ['Bash'],
  });
  assert.deepStrictEqual(checkToolPermission(profile, 'Read'), checkToolPermission(profile, 'Read'));
  assert.deepStrictEqual(checkToolPermission(profile, 'Bash'), checkToolPermission(profile, 'Bash'));
}

// ============================================================
// TC11: 全模板校验回归
// ============================================================

async function testAllTemplatesRegression() {
  console.log('  TC11: 全模板校验回归');
  const templates = listTemplates();
  assert.ok(templates.length >= 4);

  for (const tplSummary of templates) {
    const tpl = getTemplate(tplSummary.id);
    assert.ok(tpl, `模板 ${tplSummary.id} 不存在`);
    const result = validateAgentProfile(tpl);
    assert.strictEqual(result.ok, true, `模板 ${tplSummary.id} 校验失败: ${result.errors.join(', ')}`);
  }
}

// ============================================================
// TC12: P1 模块回归
// ============================================================

async function testP1Regression() {
  console.log('  TC12: P1 模块回归');

  // AssetPackage 回归
  const { createAssetPackage, validateAssetPackage } = require('../../src/asset/asset-package');
  const pkg = createAssetPackage({ assetId: 'test', checksum: 'sha256:abc' });
  assert.strictEqual(validateAssetPackage(pkg).ok, true);

  // ConfigLayer 回归
  const { CONFIG_LAYERS, LayerRegistry } = require('../../src/config/config-layer');
  assert.ok(CONFIG_LAYERS.length >= 11);
  const registry = new LayerRegistry();
  assert.ok(registry.getOrderedIds().length >= 11);
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== p2-integration.test.js ===');

  const tests = [
    testFullLifecycleProfile,
    testFullLifecyclePermissions,
    testFullLifecycleContext,
    testFullLifecycleCollaboration,
    testFullLifecycleReviewRepair,
    testFullLifecycleMaxRepairFail,
    testFullLifecycleConflict,
    testFullLifecycleParallelNoConflict,
    testInterfaceStability,
    testIdempotency,
    testAllTemplatesRegression,
    testP1Regression,
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
