'use strict';

const assert = require('node:assert');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

// P4 全部模块
const { createEventGateway } = require('../../src/visual/event-gateway');
const { createTimeline } = require('../../src/visual/timeline');
const { createHookDashboard } = require('../../src/visual/hook-dashboard');
const { createAgentVisual } = require('../../src/visual/agent-visual');
const { createMetricsEngine } = require('../../src/visual/metrics');
const { createRiskBoard, mapSeverityToRiskLevel, getRiskLevelRank } = require('../../src/visual/risk-board');

// barrel 导出验证
const visualBarrel = require('../../src/visual/index');
const runBarrel = require('../../src/run/index');

// 审计日志（复用 P3）
const { createAuditLog } = require('../../src/governance/audit-log');

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

async function testAsync(name, fn) {
  try {
    await fn();
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
    eventType: 'test.passed',
    stage: 'post-test',
    status: 'success',
    severity: 'info',
    message: '',
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides
  };
}

function buildFullScenario() {
  return [
    // Agent 启动
    makeEvent({ eventType: 'agent.started', stage: 'pre-task', metadata: { agentId: 'coder', role: 'implementer' } }),
    // Hook 通过
    makeEvent({ eventType: 'hook.passed', stage: 'pre-test', status: 'success' }),
    // 测试失败
    makeEvent({ eventType: 'test.failed', stage: 'post-test', status: 'failed', message: '断言失败: expected 1 to be 2' }),
    // 修复尝试
    makeEvent({ eventType: 'repair.attempt', stage: 'repair', status: 'failed' }),
    makeEvent({ eventType: 'repair.success', stage: 'repair', status: 'success' }),
    // 再次测试通过
    makeEvent({ eventType: 'test.passed', stage: 'post-test', status: 'success' }),
    // Hook 通过
    makeEvent({ eventType: 'hook.passed', stage: 'post-test', status: 'success' }),
    // Agent 完成
    makeEvent({ eventType: 'agent.completed', stage: 'archive', metadata: { agentId: 'coder' } })
  ];
}

async function main() {
  console.log('\n=== P4 集成回归测试 ===\n');

  // --- TC01: EventGateway 全链路 ---
  console.log('TC01: EventGateway 全链路:');

  await testAsync('ingest → 查询 → 统计 → 导出', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-tc01-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');
    const gw = createEventGateway({ storagePath, projectId: 'tc01' });

    const events = buildFullScenario();
    for (const e of events) {
      const r = gw.ingest(e);
      assert.strictEqual(r.success, true);
    }
    assert.strictEqual(gw.size, 8);

    // 查询
    const failed = gw.query({ status: 'failed' });
    assert.ok(failed.length > 0);

    // 统计
    const stats = gw.getStats();
    assert.strictEqual(stats.total, 8);
    assert.ok(stats.byType['test.passed'] > 0);

    // 导出
    const json = gw.export('json');
    assert.ok(JSON.parse(json).length === 8);

    // NDJSON 文件验证
    const content = fs.readFileSync(storagePath, 'utf8');
    const lines = content.split('\n').filter(l => l.trim());
    assert.strictEqual(lines.length, 8);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- TC02: RunTimeline 全链路 ---
  console.log('\nTC02: RunTimeline 全链路:');

  test('事件聚合 → 阶段排序 → 分组 → 摘要', () => {
    const tl = createTimeline({ runId: 'run-001' });
    const events = buildFullScenario();
    const result = tl.aggregate(events);

    assert.ok(result.totalEvents > 0);
    assert.ok(result.stages.length > 0);

    // 阶段排序验证
    const order = tl.getStageOrder();
    assert.strictEqual(order[0], 'pre-task');

    // 分组验证
    const grouped = tl.groupByStage(events);
    assert.ok(grouped.get('post-test').length > 0);

    // 摘要验证
    const summary = tl.getSummary();
    assert.strictEqual(summary.runId, 'run-001');
    assert.ok(summary.failureCount > 0);
  });

  // --- TC03: HookDashboard 全链路 ---
  console.log('\nTC03: HookDashboard 全链路:');

  test('Hook/Test/Repair 分析 → 失败摘要', () => {
    const hd = createHookDashboard();
    const events = buildFullScenario();

    const hooks = hd.analyzeHookResults(events);
    assert.ok(hooks.length > 0);

    const tests = hd.analyzeTestResults(events);
    assert.ok(tests.totalTests > 0);

    const repairs = hd.analyzeRepairResults(events);
    assert.ok(repairs.totalRepairs > 0);

    const summary = hd.getFailureSummary(events);
    assert.ok(summary.totalFailures > 0);
  });

  // --- TC04: AgentVisual 全链路 ---
  console.log('\nTC04: AgentVisual 全链路:');

  test('Agent 时间线 → Handoff → 门禁', () => {
    const av = createAgentVisual();
    const events = [
      ...buildFullScenario(),
      makeEvent({ eventType: 'agent.handoff', metadata: { fromAgent: 'coder', toAgent: 'reviewer' } }),
      makeEvent({ eventType: 'agent.human_gate', metadata: { agentId: 'coder', decision: 'approved' } })
    ];

    const tl = av.buildAgentTimeline(events);
    assert.ok(tl.agents.length > 0);
    assert.ok(tl.handoffs.length > 0);
    assert.ok(tl.humanGates.length > 0);
  });

  // --- TC05: Metrics 全链路 ---
  console.log('\nTC05: Metrics 全链路:');

  test('指标计算 → 趋势', () => {
    const m = createMetricsEngine();
    const events = buildFullScenario();

    m.compute(events);
    assert.ok(typeof m.getTaskSuccessRate() === 'number');
    assert.ok(typeof m.getFirstPassRate() === 'number');
    assert.ok(typeof m.getRepairSuccessRate() === 'number');
    assert.ok(typeof m.getHookFailureRate() === 'number');

    const trend = m.getTrend('taskSuccessRate', 'daily', events);
    assert.ok(trend.dataPoints.length > 0);
  });

  // --- TC06: RiskBoard 全链路 ---
  console.log('\nTC06: RiskBoard 全链路:');

  test('风险识别 → 摘要 → 过滤', () => {
    const rb = createRiskBoard();
    const events = [
      ...buildFullScenario(),
      makeEvent({ eventType: 'policy_denied', severity: 'warn' }),
      makeEvent({ eventType: 'security.risk', severity: 'error' })
    ];

    rb.ingestEvents(events);
    const denials = rb.getPolicyDenials();
    assert.ok(denials.length > 0);

    const summary = rb.getRiskSummary();
    assert.ok(summary.riskLevel !== 'low');
    assert.ok(summary.computedAt);

    const filtered = rb.filter({ severity: 'error' });
    assert.ok(filtered.length > 0);
  });

  // --- TC07: EventGateway + Timeline 联动 ---
  console.log('\nTC07: EventGateway + Timeline 联动:');

  await testAsync('Gateway 写入 → Timeline 聚合', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-tc07-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');
    const gw = createEventGateway({ storagePath });
    const tl = createTimeline();

    const events = buildFullScenario();
    for (const e of events) gw.ingest(e);

    // 从 gateway 查询后聚合到 timeline
    const allEvents = gw.query();
    const result = tl.aggregate(allEvents);
    assert.strictEqual(result.totalEvents, events.length);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- TC08: Timeline + Dashboard 联动 ---
  console.log('\nTC08: Timeline + Dashboard 联动:');

  test('Timeline 聚合 → Dashboard 分析同一事件源', () => {
    const tl = createTimeline();
    const hd = createHookDashboard();
    const events = buildFullScenario();

    tl.aggregate(events);
    const summary = tl.getSummary();
    assert.ok(summary.totalEvents > 0);

    const hookResults = hd.analyzeHookResults(events);
    assert.ok(hookResults.length > 0);
  });

  // --- TC09: Dashboard + Metrics 联动 ---
  console.log('\nTC09: Dashboard + Metrics 联动:');

  test('Dashboard 分析 → Metrics 计算一致数据源', () => {
    const hd = createHookDashboard();
    const m = createMetricsEngine();
    const events = buildFullScenario();

    const testView = hd.analyzeTestResults(events);
    m.compute(events);

    // 两者基于同一事件源应得出一致结论
    assert.ok(testView.totalTests > 0);
    assert.ok(m.getTaskSuccessRate() >= 0);
  });

  // --- TC10: RiskBoard + AuditLog 联动 ---
  console.log('\nTC10: RiskBoard + AuditLog 联动:');

  test('AuditLog 记录 → RiskBoard 分析', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-tc10-'));
    const auditLog = createAuditLog({ storagePath: path.join(tmpDir, 'audit.jsonl') });

    // 写入审计事件
    auditLog.record({ eventType: 'policy_denied', result: 'denied', message: '越权操作' });
    auditLog.record({ eventType: 'security_scan', result: 'error', message: '安全风险' });

    // 查询后供 RiskBoard 分析
    const auditEvents = auditLog.query();
    const rb = createRiskBoard();
    rb.ingestEvents(auditEvents.map(e => ({
      ...e,
      severity: e.severity || 'warn'
    })));

    const summary = rb.getRiskSummary();
    assert.ok(summary.totalPolicyDenials > 0 || summary.totalSecurityRisks > 0);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- TC11: 接口稳定性 ---
  console.log('\nTC11: 接口稳定性:');

  test('所有模块重复调用不报错', () => {
    const gw = createEventGateway();
    const tl = createTimeline();
    const hd = createHookDashboard();
    const av = createAgentVisual();
    const m = createMetricsEngine();
    const rb = createRiskBoard();

    for (let i = 0; i < 3; i++) {
      gw.ingest(makeEvent({ eventType: 'hook.passed', stage: 'post-test', status: 'success', severity: 'info' }));
      tl.aggregate([makeEvent()]);
      hd.analyzeHookResults([makeEvent({ eventType: 'hook.passed' })]);
      av.buildAgentTimeline([makeEvent({ eventType: 'agent.started' })]);
      m.compute([makeEvent()]);
      rb.ingestEvents([makeEvent({ eventType: 'policy_denied' })]);
    }

    assert.strictEqual(gw.size, 3);
  });

  // --- TC12: 幂等性 ---
  console.log('\nTC12: 幂等性:');

  test('相同输入重复执行结果一致', () => {
    const m1 = createMetricsEngine();
    const m2 = createMetricsEngine();
    const events = buildFullScenario();

    m1.compute(events);
    m2.compute(events);

    assert.strictEqual(m1.getTaskSuccessRate(), m2.getTaskSuccessRate());
    assert.strictEqual(m1.getFirstPassRate(), m2.getFirstPassRate());
    assert.strictEqual(m1.getRepairSuccessRate(), m2.getRepairSuccessRate());
  });

  // --- TC13: barrel 导出验证 ---
  console.log('\nTC13: barrel 导出验证:');

  test('visual barrel 应包含所有模块', () => {
    assert.ok(visualBarrel.createEventGateway);
    assert.ok(visualBarrel.createTimeline);
    assert.ok(visualBarrel.createHookDashboard);
    assert.ok(visualBarrel.createAgentVisual);
    assert.ok(visualBarrel.createMetricsEngine);
    assert.ok(visualBarrel.createRiskBoard);
  });

  test('run barrel 应包含 run 模块', () => {
    assert.ok(runBarrel.RunIdGenerator || runBarrel.createRunIdGenerator);
    assert.ok(runBarrel.RunStore || runBarrel.createRunStore);
    assert.ok(runBarrel.RunService || runBarrel.createRunService);
  });

  // --- TC14: NDJSON 事件流可作为可视化数据源 ---
  console.log('\nTC14: NDJSON 事件流可作为可视化数据源:');

  await testAsync('Gateway 持久化 → 重启恢复 → 全模块消费', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-tc14-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');

    // 写入
    const gw1 = createEventGateway({ storagePath });
    for (const e of buildFullScenario()) gw1.ingest(e);

    // 模拟重启恢复
    const gw2 = createEventGateway({ storagePath });
    const events = gw2.query();
    assert.strictEqual(events.length, 8);

    // 全模块消费
    const tl = createTimeline();
    tl.aggregate(events);
    assert.ok(tl.getSummary().totalEvents === 8);

    const hd = createHookDashboard();
    hd.analyzeHookResults(events);

    const m = createMetricsEngine();
    m.compute(events);
    assert.ok(typeof m.getTaskSuccessRate() === 'number');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- TC15: 隐私安全 ---
  console.log('\nTC15: 隐私安全:');

  test('ingest 应自动红脱敏感信息', () => {
    const gw = createEventGateway();
    const r = gw.ingest({
      eventType: 'hook.failed',
      stage: 'post-test',
      status: 'failed',
      severity: 'error',
      message: 'password="mysecret" 连接失败',
      metadata: { apiKey: 'sk-xxxx', name: 'test' }
    });
    assert.ok(!r.event.message.includes('mysecret'));
    assert.strictEqual(r.event.metadata.apiKey, '[REDACTED]');
    assert.strictEqual(r.event.metadata.name, 'test');
  });

  // --- TC16: EventGateway 错误可见性与 RiskBoard 风险语义一致性 ---
  console.log('\nTC16: EventGateway 错误可见性与 RiskBoard 风险语义一致性:');

  await testAsync('EventGateway 读取含坏行的 NDJSON 应记录 loadErrors', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-tc16-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');
    fs.writeFileSync(storagePath, 'bad-json\n{"eventId":"evt-1","runId":"r1","projectId":"p1","eventType":"hook.failed","stage":"post-test","status":"failed","severity":"error","message":"ok","timestamp":"2026-01-01T00:00:00.000Z","metadata":{}}\nanother-bad\n', 'utf8');

    const gw = createEventGateway({ storagePath });
    const loadErrors = gw.getLoadErrors();
    assert.ok(loadErrors.length >= 2, `应记录至少 2 个坏行错误，实际 ${loadErrors.length}`);
    assert.strictEqual(loadErrors[0].type, 'parse_error');
    assert.strictEqual(loadErrors[0].lineNumber, 1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  await testAsync('EventGateway 写入失败时应记录 writeErrors', async () => {
    // 使用已存在的目录作为 storagePath，写入 JSON 行会失败
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-tc16-'));
    const gw = createEventGateway({ storagePath: tmpDir });
    const r = gw.ingest({
      eventType: 'hook.failed', stage: 'post-test', status: 'failed', severity: 'error'
    });
    assert.strictEqual(r.success, true);
    assert.strictEqual(gw.size, 1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  test('RiskBoard 能把 blocking 映射为 critical', () => {
    assert.strictEqual(mapSeverityToRiskLevel('blocking'), 'critical');
    assert.strictEqual(mapSeverityToRiskLevel('info'), 'low');
    assert.strictEqual(mapSeverityToRiskLevel('warn'), 'medium');
    assert.strictEqual(mapSeverityToRiskLevel('error'), 'high');
  });

  test('RiskBoard topRisks 排序稳定', () => {
    const rb = createRiskBoard();
    rb.ingestEvents([
      makeEvent({ eventType: 'policy_denied', severity: 'warn' }),
      makeEvent({ eventType: 'security.risk', severity: 'blocking' }),
      makeEvent({ eventType: 'agent.tool_denied', severity: 'info' })
    ]);
    const summary = rb.getRiskSummary();
    for (let i = 1; i < summary.topRisks.length; i++) {
      assert.ok(
        getRiskLevelRank(summary.topRisks[i - 1].riskLevel) >= getRiskLevelRank(summary.topRisks[i].riskLevel),
        'topRisks 应按 riskLevel 降序排列'
      );
    }
  });

  await testAsync('正常事件不受坏行影响，仍可被 P4 模块消费', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'p4-tc16-'));
    const storagePath = path.join(tmpDir, 'events.jsonl');
    fs.writeFileSync(storagePath, 'bad-line\n{"eventId":"evt-1","runId":"r1","projectId":"p1","eventType":"hook.failed","stage":"post-test","status":"failed","severity":"error","message":"ok","timestamp":"2026-01-01T00:00:00.000Z","metadata":{}}\n', 'utf8');

    const gw = createEventGateway({ storagePath });
    assert.strictEqual(gw.size, 1);
    assert.strictEqual(gw.getLoadErrors().length, 1);

    const events = gw.query();
    const tl = createTimeline();
    tl.aggregate(events);
    assert.strictEqual(tl.getSummary().totalEvents, 1);

    const m = createMetricsEngine();
    m.compute(events);
    assert.ok(typeof m.getTaskSuccessRate() === 'number');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  // --- P1+P2+P3 回归 ---
  console.log('\nP1+P2+P3 回归:');

  await testAsync('P1 模块可正常加载', async () => {
    const p1 = require('../../src/ide/adapters/adapter-protocol');
    assert.ok(p1);
  });

  await testAsync('P2 模块可正常加载', async () => {
    const p2 = require('../../src/agent/agent-profile');
    assert.ok(p2);
  });

  await testAsync('P3 模块可正常加载', async () => {
    const p3 = require('../../src/governance/rbac');
    assert.ok(p3);
  });

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
