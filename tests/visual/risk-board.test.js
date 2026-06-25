'use strict';

const assert = require('node:assert');
const {
  POLICY_DENIAL_TYPES,
  SECURITY_RISK_TYPES,
  PRIVILEGE_ESCALATION_TYPES,
  AUDIT_OPERATION_TYPES,
  RISK_LEVELS,
  SEVERITY_TO_RISK_LEVEL,
  RISK_LEVEL_RANK,
  mapSeverityToRiskLevel,
  getRiskLevelRank,
  RiskBoard,
  createRiskBoard
} = require('../../src/visual/risk-board');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    passed++;
    console.log(`  ✓ ${name}`);
  } catch (err) {
    failed++;
    console.log(`  ✗ ${name}`);
    console.log(`    ${err.message}`);
  }
}

function makeEvent(overrides = {}) {
  return {
    eventId: 'evt-1',
    runId: 'run-001',
    projectId: 'p1',
    eventType: 'policy_denied',
    stage: 'pre-task',
    status: 'blocked',
    severity: 'warn',
    message: '策略拒绝',
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides
  };
}

async function main() {
  console.log('\n=== Risk Board 测试 ===\n');

  // --- 策略拒绝 ---
  console.log('策略拒绝:');

  test('getPolicyDenials 应提取 policy_denied 事件', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'policy_denied', message: '无权访问' }),
      makeEvent({ eventType: 'test.passed' })
    ]);
    const denials = rb.getPolicyDenials();
    assert.strictEqual(denials.length, 1);
    assert.strictEqual(denials[0].message, '无权访问');
  });

  test('无策略拒绝时应返回空数组', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([makeEvent({ eventType: 'test.passed' })]);
    assert.deepStrictEqual(rb.getPolicyDenials(), []);
  });

  // --- 安全风险 ---
  console.log('\n安全风险:');

  test('getSecurityRisks 应提取安全事件', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'security.risk', severity: 'error', message: '检测到注入' }),
      makeEvent({ eventType: 'security.violation', severity: 'warn' }),
      makeEvent({ eventType: 'test.passed' })
    ]);
    const risks = rb.getSecurityRisks();
    assert.strictEqual(risks.length, 2);
    assert.strictEqual(risks[0].type, 'security.risk');
  });

  test('无安全风险时应返回空数组', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([]);
    assert.deepStrictEqual(rb.getSecurityRisks(), []);
  });

  // --- 越权尝试 ---
  console.log('\n越权尝试:');

  test('getPrivilegeEscalations 应提取越权事件', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'agent.tool_denied', metadata: { agentId: 'coder' } }),
      makeEvent({ eventType: 'agent.file_scope', metadata: { agentId: 'coder' } }),
      makeEvent({ eventType: 'agent.max_iterations', metadata: { agentId: 'coder' } })
    ]);
    const esc = rb.getPrivilegeEscalations();
    assert.strictEqual(esc.length, 3);
    assert.strictEqual(esc[0].type, 'tool_denied');
    assert.strictEqual(esc[1].type, 'file_scope');
    assert.strictEqual(esc[2].type, 'max_iterations');
  });

  test('越权事件应包含 agentId', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'agent.tool_denied', metadata: { agentId: 'reviewer' } })
    ]);
    assert.strictEqual(rb.getPrivilegeEscalations()[0].agentId, 'reviewer');
  });

  // --- 审计操作 ---
  console.log('\n审计操作:');

  test('getAuditOperations 应提取审计事件', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'audit.operation', message: '部署审批' }),
      makeEvent({ eventType: 'audit.approval', message: '已批准' }),
      makeEvent({ eventType: 'audit.rollback', message: '回滚' })
    ]);
    const ops = rb.getAuditOperations();
    assert.strictEqual(ops.length, 3);
  });

  test('无审计操作时应返回空数组', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([]);
    assert.deepStrictEqual(rb.getAuditOperations(), []);
  });

  // --- 风险摘要 ---
  console.log('\n风险摘要:');

  test('getRiskSummary 应包含正确计数', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'policy_denied' }),
      makeEvent({ eventType: 'policy_denied' }),
      makeEvent({ eventType: 'security.risk' }),
      makeEvent({ eventType: 'agent.tool_denied' }),
      makeEvent({ eventType: 'audit.operation' })
    ]);
    const summary = rb.getRiskSummary();
    assert.strictEqual(summary.totalPolicyDenials, 2);
    assert.strictEqual(summary.totalSecurityRisks, 1);
    assert.strictEqual(summary.totalPrivilegeEscalations, 1);
    assert.strictEqual(summary.totalAuditOperations, 1);
  });

  test('blocking 安全事件应触发 critical', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'security.risk', severity: 'blocking' })
    ]);
    assert.strictEqual(rb.getRiskSummary().riskLevel, 'critical');
  });

  test('error 安全事件应触发 high', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'security.risk', severity: 'error' })
    ]);
    assert.strictEqual(rb.getRiskSummary().riskLevel, 'high');
  });

  test('>5 次策略拒绝应触发 high', () => {
    const rb = createRiskBoard();
    const events = [];
    for (let i = 0; i < 6; i++) {
      events.push(makeEvent({ eventType: 'policy_denied' }));
    }
    rb.ingestEvents(events);
    assert.strictEqual(rb.getRiskSummary().riskLevel, 'high');
  });

  test('warn 安全事件应触发 medium', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'security.risk', severity: 'warn' })
    ]);
    assert.strictEqual(rb.getRiskSummary().riskLevel, 'medium');
  });

  test('无安全事件应为 low', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'test.passed' })
    ]);
    assert.strictEqual(rb.getRiskSummary().riskLevel, 'low');
  });

  test('computedAt 应存在', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([]);
    const summary = rb.getRiskSummary();
    assert.ok(summary.computedAt);
  });

  // --- 多维过滤 ---
  console.log('\n多维过滤:');

  test('按 severity 过滤', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ severity: 'error' }),
      makeEvent({ severity: 'warn' })
    ]);
    assert.strictEqual(rb.filter({ severity: 'error' }).length, 1);
  });

  test('按 type 过滤', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'policy_denied' }),
      makeEvent({ eventType: 'security.risk' })
    ]);
    assert.strictEqual(rb.filter({ type: 'policy_denied' }).length, 1);
  });

  test('按 type 前缀过滤', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'security.risk' }),
      makeEvent({ eventType: 'security.violation' }),
      makeEvent({ eventType: 'policy_denied' })
    ]);
    assert.strictEqual(rb.filter({ type: 'security' }).length, 2);
  });

  test('按时间范围过滤', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ timestamp: '2026-05-01T10:00:00.000Z' }),
      makeEvent({ timestamp: '2026-05-02T10:00:00.000Z' })
    ]);
    assert.strictEqual(rb.filter({ from: '2026-05-01T12:00:00.000Z' }).length, 1);
  });

  test('ingestEvents null 应不报错', () => {
    const rb = createRiskBoard();
    rb.ingestEvents(null);
    assert.deepStrictEqual(rb.getPolicyDenials(), []);
  });

  // --- 工厂函数 ---
  console.log('\n工厂函数:');

  test('createRiskBoard 应返回 RiskBoard 实例', () => {
    const rb = createRiskBoard();
    assert.ok(rb instanceof RiskBoard);
  });

  // --- P4.8: severity → riskLevel 映射 ---
  console.log('\nseverity → riskLevel 映射:');

  test('info 应映射为 low', () => {
    assert.strictEqual(mapSeverityToRiskLevel('info'), 'low');
  });

  test('warn 应映射为 medium', () => {
    assert.strictEqual(mapSeverityToRiskLevel('warn'), 'medium');
  });

  test('error 应映射为 high', () => {
    assert.strictEqual(mapSeverityToRiskLevel('error'), 'high');
  });

  test('blocking 应映射为 critical', () => {
    assert.strictEqual(mapSeverityToRiskLevel('blocking'), 'critical');
  });

  test('low / medium / high / critical 应保持原语义', () => {
    assert.strictEqual(mapSeverityToRiskLevel('low'), 'low');
    assert.strictEqual(mapSeverityToRiskLevel('medium'), 'medium');
    assert.strictEqual(mapSeverityToRiskLevel('high'), 'high');
    assert.strictEqual(mapSeverityToRiskLevel('critical'), 'critical');
  });

  test('未知 severity 应降级为 low', () => {
    assert.strictEqual(mapSeverityToRiskLevel('unknown'), 'low');
    assert.strictEqual(mapSeverityToRiskLevel(''), 'low');
    assert.strictEqual(mapSeverityToRiskLevel(undefined), 'low');
  });

  // --- P4.8: getRiskLevelRank ---
  console.log('\ngetRiskLevelRank:');

  test('getRiskLevelRank 应返回稳定排序权重', () => {
    assert.strictEqual(getRiskLevelRank('low'), 0);
    assert.strictEqual(getRiskLevelRank('medium'), 1);
    assert.strictEqual(getRiskLevelRank('high'), 2);
    assert.strictEqual(getRiskLevelRank('critical'), 3);
    assert.strictEqual(getRiskLevelRank('unknown'), 0);
  });

  // --- P4.8: topRisks 排序 ---
  console.log('\ntopRisks 排序:');

  test('topRisks 应按 critical / high / medium / low 排序', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'policy_denied', severity: 'warn' }),
      makeEvent({ eventType: 'security.risk', severity: 'blocking' }),
      makeEvent({ eventType: 'agent.tool_denied', severity: 'info' })
    ]);
    const summary = rb.getRiskSummary();
    assert.ok(summary.topRisks.length >= 2);
    // security_risk (blocking→critical) 应排在最前
    const firstRisk = summary.topRisks[0];
    assert.strictEqual(firstRisk.riskLevel, 'critical');
    // 后续 riskLevel rank 应递减或相等
    for (let i = 1; i < summary.topRisks.length; i++) {
      assert.ok(
        getRiskLevelRank(summary.topRisks[i - 1].riskLevel) >= getRiskLevelRank(summary.topRisks[i].riskLevel)
      );
    }
  });

  // --- P4.8: getRiskSummary 统一输出 ---
  console.log('\ngetRiskSummary 统一输出:');

  test('getRiskSummary 应返回统一 riskLevel', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'security.risk', severity: 'error' })
    ]);
    const summary = rb.getRiskSummary();
    assert.strictEqual(summary.riskLevel, 'high');
    assert.ok(RISK_LEVELS.includes(summary.riskLevel));
  });

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
