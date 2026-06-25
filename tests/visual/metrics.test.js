'use strict';

const assert = require('node:assert');
const {
  VALID_WINDOWS,
  MetricsEngine,
  createMetricsEngine
} = require('../../src/visual/metrics');

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

async function main() {
  console.log('\n=== Metrics Engine 测试 ===\n');

  // --- 空数据 ---
  console.log('空数据:');

  test('compute 空数组应返回零值', () => {
    const m = createMetricsEngine();
    const result = m.compute([]);
    assert.strictEqual(result.taskSuccessRate, 0);
    assert.strictEqual(result.totalRuns, 0);
    assert.strictEqual(result.totalEvents, 0);
  });

  test('compute null 应返回零值', () => {
    const m = createMetricsEngine();
    const result = m.compute(null);
    assert.strictEqual(result.taskSuccessRate, 0);
  });

  test('未 compute 时 getter 应返回 0', () => {
    const m = createMetricsEngine();
    assert.strictEqual(m.getTaskSuccessRate(), 0);
    assert.strictEqual(m.getFirstPassRate(), 0);
    assert.strictEqual(m.getRepairSuccessRate(), 0);
    assert.strictEqual(m.getHookFailureRate(), 0);
    assert.strictEqual(m.getRuleHitRate(), 0);
  });

  test('toJSON 未 compute 时应返回零值结构', () => {
    const m = createMetricsEngine();
    const json = m.toJSON();
    assert.strictEqual(json.taskSuccessRate, 0);
    assert.strictEqual(json.computedAt, null);
  });

  // --- taskSuccessRate ---
  console.log('\ntaskSuccessRate:');

  test('全部成功时应为 1', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ runId: 'r1', status: 'success' }),
      makeEvent({ runId: 'r2', status: 'success' })
    ]);
    assert.strictEqual(m.getTaskSuccessRate(), 1);
  });

  test('全部失败时应为 0', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ runId: 'r1', status: 'failed' }),
      makeEvent({ runId: 'r2', status: 'failed' })
    ]);
    assert.strictEqual(m.getTaskSuccessRate(), 0);
  });

  test('混合状态应正确计算', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ runId: 'r1', status: 'success' }),
      makeEvent({ runId: 'r2', status: 'failed' }),
      makeEvent({ runId: 'r3', status: 'success' }),
      makeEvent({ runId: 'r4', status: 'failed' })
    ]);
    assert.strictEqual(m.getTaskSuccessRate(), 0.5);
  });

  // --- firstPassRate ---
  console.log('\nfirstPassRate:');

  test('无 repair 直接成功的 run 应计入首次通过', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ runId: 'r1', status: 'success' })
    ]);
    assert.strictEqual(m.getFirstPassRate(), 1);
  });

  test('有 repair 的 run 不应计入首次通过', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ runId: 'r1', status: 'success', eventType: 'repair.success' })
    ]);
    assert.strictEqual(m.getFirstPassRate(), 0);
  });

  // --- repairSuccessRate ---
  console.log('\nrepairSuccessRate:');

  test('有 repair 成功时应正确计算', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ runId: 'r1', eventType: 'repair.attempt', status: 'failed' }),
      makeEvent({ runId: 'r1', eventType: 'repair.success', status: 'success' }),
      makeEvent({ runId: 'r2', eventType: 'repair.attempt', status: 'failed' }),
      makeEvent({ runId: 'r2', eventType: 'repair.failed', status: 'failed' })
    ]);
    assert.strictEqual(m.getRepairSuccessRate(), 0.5);
  });

  test('无 repair 事件时应为 0', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ runId: 'r1', status: 'success' })
    ]);
    assert.strictEqual(m.getRepairSuccessRate(), 0);
  });

  // --- hookFailureRate ---
  console.log('\nhookFailureRate:');

  test('hook 事件应正确计算失败率', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ eventType: 'hook.passed' }),
      makeEvent({ eventType: 'hook.passed' }),
      makeEvent({ eventType: 'hook.failed' }),
      makeEvent({ eventType: 'hook.skipped' })
    ]);
    assert.strictEqual(m.getHookFailureRate(), 0.25);
  });

  test('无 hook 事件时应为 0', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ eventType: 'test.passed' })
    ]);
    assert.strictEqual(m.getHookFailureRate(), 0);
  });

  // --- ruleHitRate ---
  console.log('\nruleHitRate:');

  test('policy_denied 事件应正确计算', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ eventType: 'test.passed' }),
      makeEvent({ eventType: 'test.passed' }),
      makeEvent({ eventType: 'policy_denied' }),
      makeEvent({ eventType: 'test.passed' })
    ]);
    assert.strictEqual(m.getRuleHitRate(), 0.25);
  });

  test('无 policy_denied 时应为 0', () => {
    const m = createMetricsEngine();
    m.compute([
      makeEvent({ eventType: 'test.passed' })
    ]);
    assert.strictEqual(m.getRuleHitRate(), 0);
  });

  // --- toJSON ---
  console.log('\ntoJSON:');

  test('compute 后 toJSON 应包含所有字段', () => {
    const m = createMetricsEngine();
    m.compute([makeEvent()]);
    const json = m.toJSON();
    assert.ok(json.computedAt);
    assert.strictEqual(json.totalEvents, 1);
    assert.strictEqual(json.totalRuns, 1);
    assert.ok('taskSuccessRate' in json);
    assert.ok('firstPassRate' in json);
    assert.ok('repairSuccessRate' in json);
    assert.ok('hookFailureRate' in json);
    assert.ok('ruleHitRate' in json);
  });

  // --- 趋势 ---
  console.log('\n趋势:');

  test('daily 趋势应按日期聚合', () => {
    const m = createMetricsEngine();
    const events = [
      makeEvent({ runId: 'r1', status: 'success', timestamp: '2026-05-01T10:00:00.000Z' }),
      makeEvent({ runId: 'r2', status: 'failed', timestamp: '2026-05-01T11:00:00.000Z' }),
      makeEvent({ runId: 'r3', status: 'success', timestamp: '2026-05-02T10:00:00.000Z' })
    ];
    const trend = m.getTrend('taskSuccessRate', 'daily', events);
    assert.strictEqual(trend.window, 'daily');
    assert.strictEqual(trend.dataPoints.length, 2);
    assert.strictEqual(trend.dataPoints[0].period, '2026-05-01');
    assert.strictEqual(trend.dataPoints[0].value, 0.5);
    assert.strictEqual(trend.dataPoints[1].period, '2026-05-02');
    assert.strictEqual(trend.dataPoints[1].value, 1);
  });

  test('weekly 趋势应按 ISO 周聚合', () => {
    const m = createMetricsEngine();
    // 2026-05-04 是周一
    const events = [
      makeEvent({ runId: 'r1', status: 'success', timestamp: '2026-05-04T10:00:00.000Z' }),
      makeEvent({ runId: 'r2', status: 'success', timestamp: '2026-05-05T10:00:00.000Z' }),
      makeEvent({ runId: 'r3', status: 'success', timestamp: '2026-05-11T10:00:00.000Z' })
    ];
    const trend = m.getTrend('taskSuccessRate', 'weekly', events);
    assert.strictEqual(trend.window, 'weekly');
    assert.strictEqual(trend.dataPoints.length, 2);
  });

  test('非法 window 应返回错误', () => {
    const m = createMetricsEngine();
    const trend = m.getTrend('taskSuccessRate', 'monthly', []);
    assert.ok(trend.error);
  });

  test('空事件趋势应返回空数据点', () => {
    const m = createMetricsEngine();
    const trend = m.getTrend('taskSuccessRate', 'daily', []);
    assert.deepStrictEqual(trend.dataPoints, []);
  });

  test('hookFailureRate 趋势应正确计算', () => {
    const m = createMetricsEngine();
    const events = [
      makeEvent({ eventType: 'hook.passed', timestamp: '2026-05-01T10:00:00.000Z' }),
      makeEvent({ eventType: 'hook.failed', timestamp: '2026-05-01T11:00:00.000Z' }),
      makeEvent({ eventType: 'hook.passed', timestamp: '2026-05-02T10:00:00.000Z' })
    ];
    const trend = m.getTrend('hookFailureRate', 'daily', events);
    assert.strictEqual(trend.dataPoints[0].value, 0.5);
    assert.strictEqual(trend.dataPoints[1].value, 0);
  });

  // --- 幂等性 ---
  console.log('\n幂等性:');

  test('重复 compute 应覆盖旧值', () => {
    const m = createMetricsEngine();
    m.compute([makeEvent({ status: 'success' })]);
    assert.strictEqual(m.getTaskSuccessRate(), 1);
    m.compute([makeEvent({ status: 'failed' })]);
    assert.strictEqual(m.getTaskSuccessRate(), 0);
  });

  // --- 工厂函数 ---
  console.log('\n工厂函数:');

  test('createMetricsEngine 应返回 MetricsEngine 实例', () => {
    const m = createMetricsEngine();
    assert.ok(m instanceof MetricsEngine);
  });

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
