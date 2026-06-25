'use strict';

const assert = require('node:assert');
const {
  STAGE_ORDER,
  resolveStageStatus,
  extractFailureReason,
  RunTimeline,
  createTimeline
} = require('../../src/visual/timeline');

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
    eventType: 'hook.failed',
    stage: 'post-test',
    status: 'failed',
    severity: 'error',
    message: '测试失败',
    timestamp: new Date().toISOString(),
    metadata: {},
    ...overrides
  };
}

async function main() {
  console.log('\n=== Run Timeline 测试 ===\n');

  // --- 阶段排序 ---
  console.log('阶段排序:');

  test('getStageOrder 应返回 7 个阶段', () => {
    const tl = createTimeline();
    const order = tl.getStageOrder();
    assert.strictEqual(order.length, 7);
    assert.deepStrictEqual(order, STAGE_ORDER);
  });

  test('阶段顺序应为 pre-task → pre-edit → post-edit → pre-test → post-test → repair → archive', () => {
    const tl = createTimeline();
    const order = tl.getStageOrder();
    assert.strictEqual(order[0], 'pre-task');
    assert.strictEqual(order[6], 'archive');
  });

  // --- 按阶段分组 ---
  console.log('\n按阶段分组:');

  test('groupByStage 应按固定阶段分组', () => {
    const tl = createTimeline();
    const events = [
      makeEvent({ stage: 'post-test', eventType: 'test.passed' }),
      makeEvent({ stage: 'pre-test', eventType: 'hook.passed' }),
      makeEvent({ stage: 'post-test', eventType: 'hook.failed' })
    ];
    const grouped = tl.groupByStage(events);
    assert.strictEqual(grouped.get('post-test').length, 2);
    assert.strictEqual(grouped.get('pre-test').length, 1);
    assert.strictEqual(grouped.get('repair').length, 0);
  });

  test('空事件列表应返回所有阶段为空', () => {
    const tl = createTimeline();
    const grouped = tl.groupByStage([]);
    assert.strictEqual(grouped.size, 7);
    for (const [, evts] of grouped) {
      assert.strictEqual(evts.length, 0);
    }
  });

  // --- 按事件类型分组 ---
  console.log('\n按事件类型分组:');

  test('groupByEventType 应按类型分组', () => {
    const tl = createTimeline();
    const events = [
      makeEvent({ eventType: 'hook.failed' }),
      makeEvent({ eventType: 'test.passed' }),
      makeEvent({ eventType: 'hook.failed' })
    ];
    const grouped = tl.groupByEventType(events);
    assert.strictEqual(grouped.get('hook.failed').length, 2);
    assert.strictEqual(grouped.get('test.passed').length, 1);
  });

  // --- 阶段详情 ---
  console.log('\n阶段详情:');

  test('aggregate 后 getStageDetail 应返回阶段信息', () => {
    const tl = createTimeline();
    const ts1 = '2026-01-01T10:00:00.000Z';
    const ts2 = '2026-01-01T10:00:05.000Z';
    tl.aggregate([
      makeEvent({ stage: 'post-test', eventType: 'test.passed', status: 'success', severity: 'info', timestamp: ts1 }),
      makeEvent({ stage: 'post-test', eventType: 'hook.failed', status: 'failed', severity: 'error', timestamp: ts2 })
    ]);

    const detail = tl.getStageDetail('post-test');
    assert.ok(detail);
    assert.strictEqual(detail.name, 'post-test');
    assert.strictEqual(detail.events.length, 2);
    assert.strictEqual(detail.startedAt, ts1);
    assert.strictEqual(detail.completedAt, ts2);
    assert.strictEqual(detail.durationMs, 5000);
    assert.strictEqual(detail.status, 'failed');
  });

  test('不存在的阶段应返回 null', () => {
    const tl = createTimeline();
    tl.aggregate([makeEvent({ stage: 'post-test' })]);
    assert.strictEqual(tl.getStageDetail('nonexistent'), null);
  });

  test('无事件的阶段不应出现在 stages 中', () => {
    const tl = createTimeline();
    tl.aggregate([makeEvent({ stage: 'post-test' })]);
    const detail = tl.getStageDetail('repair');
    assert.strictEqual(detail, null);
  });

  // --- 摘要 ---
  console.log('\n摘要:');

  test('getSummary 应包含正确统计', () => {
    const tl = createTimeline({ runId: 'run-001' });
    tl.aggregate([
      makeEvent({ stage: 'pre-test', eventType: 'hook.passed', status: 'success', severity: 'info' }),
      makeEvent({ stage: 'post-test', eventType: 'test.passed', status: 'success', severity: 'info' }),
      makeEvent({ stage: 'post-test', eventType: 'hook.failed', status: 'failed', severity: 'error' })
    ]);

    const summary = tl.getSummary();
    assert.strictEqual(summary.runId, 'run-001');
    assert.strictEqual(summary.totalEvents, 3);
    assert.strictEqual(summary.failureCount, 1);
    assert.strictEqual(summary.stageCount, 2);
  });

  test('所有事件成功时 failureCount 应为 0', () => {
    const tl = createTimeline();
    tl.aggregate([
      makeEvent({ stage: 'pre-test', status: 'success', severity: 'info' }),
      makeEvent({ stage: 'post-test', status: 'success', severity: 'info' })
    ]);
    assert.strictEqual(tl.getSummary().failureCount, 0);
  });

  // --- 空事件列表 ---
  console.log('\n空事件列表:');

  test('aggregate 空数组应正常处理', () => {
    const tl = createTimeline();
    const result = tl.aggregate([]);
    assert.strictEqual(result.totalEvents, 0);
    assert.strictEqual(result.stages.length, 0);
  });

  test('aggregate 非数组输入应正常处理', () => {
    const tl = createTimeline();
    const result = tl.aggregate(null);
    assert.strictEqual(result.totalEvents, 0);
  });

  // --- 序列化 ---
  console.log('\n序列化:');

  test('toJSON 应返回可序列化结构', () => {
    const tl = createTimeline({ runId: 'run-001' });
    tl.aggregate([
      makeEvent({ stage: 'post-test', timestamp: '2026-01-01T10:00:00.000Z' })
    ]);

    const json = tl.toJSON();
    const str = JSON.stringify(json);
    const parsed = JSON.parse(str);
    assert.strictEqual(parsed.runId, 'run-001');
    assert.strictEqual(parsed.totalEvents, 1);
    assert.ok(Array.isArray(parsed.stages));
  });

  test('toJSON 不应包含 events 详情', () => {
    const tl = createTimeline();
    tl.aggregate([makeEvent({ stage: 'post-test' })]);
    const json = tl.toJSON();
    assert.strictEqual(json.stages[0].events, undefined);
    assert.strictEqual(json.stages[0].eventCount, 1);
  });

  // --- resolveStageStatus ---
  console.log('\nresolveStageStatus:');

  test('全部成功应返回 success', () => {
    const status = resolveStageStatus([
      { status: 'success', severity: 'info' },
      { status: 'success', severity: 'info' }
    ]);
    assert.strictEqual(status, 'success');
  });

  test('有 failed 应返回 failed', () => {
    const status = resolveStageStatus([
      { status: 'success', severity: 'info' },
      { status: 'failed', severity: 'error' }
    ]);
    assert.strictEqual(status, 'failed');
  });

  test('有 blocked 应返回 blocked（最高优先级）', () => {
    const status = resolveStageStatus([
      { status: 'failed', severity: 'error' },
      { status: 'blocked', severity: 'blocking' }
    ]);
    assert.strictEqual(status, 'blocked');
  });

  // --- extractFailureReason ---
  console.log('\nextractFailureReason:');

  test('有失败事件时应返回最后一条失败消息', () => {
    const reason = extractFailureReason([
      { status: 'success', message: 'ok' },
      { status: 'failed', message: 'lint error' },
      { status: 'failed', message: 'test timeout' }
    ]);
    assert.strictEqual(reason, 'test timeout');
  });

  test('无失败事件时应返回 null', () => {
    const reason = extractFailureReason([
      { status: 'success', message: 'ok' }
    ]);
    assert.strictEqual(reason, null);
  });

  // --- runId 推断 ---
  console.log('\nrunId 推断:');

  test('未指定 runId 时应从事件中推断', () => {
    const tl = createTimeline();
    tl.aggregate([
      makeEvent({ runId: 'run-inferred', stage: 'post-test' })
    ]);
    assert.strictEqual(tl.getSummary().runId, 'run-inferred');
  });

  // --- 工厂函数 ---
  console.log('\n工厂函数:');

  test('createTimeline 应返回 RunTimeline 实例', () => {
    const tl = createTimeline();
    assert.ok(tl instanceof RunTimeline);
  });

  console.log(`\n=== 测试结果: ${passed} 通过, ${failed} 失败 ===\n`);
  if (failed > 0) process.exit(1);
}

main().catch(err => {
  console.error('测试运行失败:', err);
  process.exit(1);
});
