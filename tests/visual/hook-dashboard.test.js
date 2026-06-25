'use strict';

const assert = require('node:assert');
const {
  HOOK_EVENT_TYPES,
  TEST_EVENT_TYPES,
  REPAIR_EVENT_TYPES,
  HookDashboard,
  createHookDashboard
} = require('../../src/visual/hook-dashboard');

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
    eventType: 'hook.passed',
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
  console.log('\n=== Hook Dashboard 测试 ===\n');

  // --- Hook 结果分析 ---
  console.log('Hook 结果分析:');

  test('analyzeHookResults 应统计通过/失败/跳过', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'hook.passed', status: 'success', metadata: { hookId: 'lint-hook' } }),
      makeEvent({ eventType: 'hook.passed', status: 'success', metadata: { hookId: 'lint-hook' } }),
      makeEvent({ eventType: 'hook.failed', status: 'failed', message: 'lint error', metadata: { hookId: 'lint-hook' } }),
      makeEvent({ eventType: 'hook.skipped', status: 'skipped', metadata: { hookId: 'lint-hook' } })
    ];
    const results = hd.analyzeHookResults(events);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].passCount, 2);
    assert.strictEqual(results[0].failCount, 1);
    assert.strictEqual(results[0].skipCount, 1);
    assert.strictEqual(results[0].totalRuns, 4);
  });

  test('hook.failed 应提取失败原因', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'hook.failed', status: 'failed', message: 'ESLint 报错' })
    ];
    const results = hd.analyzeHookResults(events);
    assert.strictEqual(results[0].failures.length, 1);
    assert.strictEqual(results[0].failures[0].reason, 'ESLint 报错');
  });

  test('不同 hookId 应分组统计', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'hook.passed', metadata: { hookId: 'lint-hook' } }),
      makeEvent({ eventType: 'hook.failed', metadata: { hookId: 'test-hook' }, status: 'failed' })
    ];
    const results = hd.analyzeHookResults(events);
    assert.strictEqual(results.length, 2);
    assert.strictEqual(results[0].hookId, 'lint-hook');
    assert.strictEqual(results[1].hookId, 'test-hook');
  });

  test('avgDurationMs 应正确计算', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'hook.passed', metadata: { durationMs: 100 } }),
      makeEvent({ eventType: 'hook.passed', metadata: { durationMs: 200 } }),
      makeEvent({ eventType: 'hook.passed', metadata: { durationMs: 300 } })
    ];
    const results = hd.analyzeHookResults(events);
    assert.strictEqual(results[0].avgDurationMs, 200);
  });

  test('无 durationMs 时 avgDurationMs 应为 0', () => {
    const hd = createHookDashboard();
    const events = [makeEvent({ eventType: 'hook.passed' })];
    const results = hd.analyzeHookResults(events);
    assert.strictEqual(results[0].avgDurationMs, 0);
  });

  test('过滤非 Hook 事件', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'test.passed' }),
      makeEvent({ eventType: 'hook.passed' })
    ];
    const results = hd.analyzeHookResults(events);
    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].hookId, 'hook.passed');
  });

  // --- Test 结果分析 ---
  console.log('\nTest 结果分析:');

  test('analyzeTestResults 应统计通过率', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'test.passed', status: 'success' }),
      makeEvent({ eventType: 'test.passed', status: 'success' }),
      makeEvent({ eventType: 'test.failed', status: 'failed' }),
      makeEvent({ eventType: 'test.skipped', status: 'skipped' })
    ];
    const result = hd.analyzeTestResults(events);
    assert.strictEqual(result.totalTests, 4);
    assert.strictEqual(result.passed, 2);
    assert.strictEqual(result.failed, 1);
    assert.strictEqual(result.skipped, 1);
    assert.strictEqual(result.passRate, 50);
  });

  test('test.failed 应提取失败列表', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'test.failed', status: 'failed', message: '断言失败', metadata: { testName: 'TC01' } })
    ];
    const result = hd.analyzeTestResults(events);
    assert.strictEqual(result.failures.length, 1);
    assert.strictEqual(result.failures[0].testName, 'TC01');
    assert.strictEqual(result.failures[0].reason, '断言失败');
  });

  test('全部通过时 passRate 应为 100', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'test.passed' }),
      makeEvent({ eventType: 'test.passed' })
    ];
    const result = hd.analyzeTestResults(events);
    assert.strictEqual(result.passRate, 100);
  });

  test('无测试事件时应返回零值', () => {
    const hd = createHookDashboard();
    const result = hd.analyzeTestResults([]);
    assert.strictEqual(result.totalTests, 0);
    assert.strictEqual(result.passRate, 0);
  });

  test('null 输入应返回零值', () => {
    const hd = createHookDashboard();
    const result = hd.analyzeTestResults(null);
    assert.strictEqual(result.totalTests, 0);
  });

  // --- Repair 结果分析 ---
  console.log('\nRepair 结果分析:');

  test('analyzeRepairResults 应统计修复成功率', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'repair.attempt', runId: 'run-1' }),
      makeEvent({ eventType: 'repair.attempt', runId: 'run-1' }),
      makeEvent({ eventType: 'repair.success', runId: 'run-1' }),
      makeEvent({ eventType: 'repair.attempt', runId: 'run-2' }),
      makeEvent({ eventType: 'repair.failed', runId: 'run-2', message: '修复超时' })
    ];
    const result = hd.analyzeRepairResults(events);
    assert.strictEqual(result.totalRepairs, 2);
    assert.strictEqual(result.successful, 1);
    assert.strictEqual(result.failed, 1);
  });

  test('avgAttempts 应正确计算', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'repair.attempt', runId: 'run-1' }),
      makeEvent({ eventType: 'repair.attempt', runId: 'run-1' }),
      makeEvent({ eventType: 'repair.success', runId: 'run-1' }),
      makeEvent({ eventType: 'repair.attempt', runId: 'run-2' }),
      makeEvent({ eventType: 'repair.success', runId: 'run-2' })
    ];
    const result = hd.analyzeRepairResults(events);
    assert.strictEqual(result.avgAttempts, 1.5);
  });

  test('无修复事件时应返回零值', () => {
    const hd = createHookDashboard();
    const result = hd.analyzeRepairResults([]);
    assert.strictEqual(result.totalRepairs, 0);
    assert.strictEqual(result.avgAttempts, 0);
  });

  test('repair.failed 应记录失败原因', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'repair.attempt', runId: 'run-1' }),
      makeEvent({ eventType: 'repair.failed', runId: 'run-1', message: '无法自动修复' })
    ];
    const result = hd.analyzeRepairResults(events);
    assert.strictEqual(result.repairs[0].reason, '无法自动修复');
    assert.strictEqual(result.repairs[0].finalStatus, 'failed');
  });

  // --- 失败摘要 ---
  console.log('\n失败摘要:');

  test('getFailureSummary 应分类失败原因', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ status: 'failed', message: 'lint-error', stage: 'post-test' }),
      makeEvent({ status: 'failed', message: 'lint-error', stage: 'post-test' }),
      makeEvent({ status: 'failed', message: 'test-timeout', stage: 'post-test' }),
      makeEvent({ status: 'success', message: 'ok', stage: 'pre-test' })
    ];
    const summary = hd.getFailureSummary(events);
    assert.strictEqual(summary.totalFailures, 3);
    assert.strictEqual(summary.byReason['lint-error'], 2);
    assert.strictEqual(summary.byReason['test-timeout'], 1);
    assert.strictEqual(summary.topFailureReason, 'lint-error');
  });

  test('getFailureSummary 应按阶段统计', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ status: 'failed', stage: 'post-test' }),
      makeEvent({ status: 'failed', stage: 'repair' })
    ];
    const summary = hd.getFailureSummary(events);
    assert.strictEqual(summary.byStage['post-test'], 1);
    assert.strictEqual(summary.byStage['repair'], 1);
  });

  test('repairSuccessRate 应正确计算', () => {
    const hd = createHookDashboard();
    const events = [
      makeEvent({ eventType: 'repair.success', status: 'success' }),
      makeEvent({ eventType: 'repair.success', status: 'success' }),
      makeEvent({ eventType: 'repair.failed', status: 'failed' }),
      makeEvent({ eventType: 'repair.failed', status: 'failed' })
    ];
    const summary = hd.getFailureSummary(events);
    assert.strictEqual(summary.repairSuccessRate, 50);
  });

  test('无失败事件时应返回零值', () => {
    const hd = createHookDashboard();
    const summary = hd.getFailureSummary([]);
    assert.strictEqual(summary.totalFailures, 0);
    assert.strictEqual(summary.topFailureReason, null);
  });

  // --- 工厂函数 ---
  console.log('\n工厂函数:');

  test('createHookDashboard 应返回 HookDashboard 实例', () => {
    const hd = createHookDashboard();
    assert.ok(hd instanceof HookDashboard);
  });

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
