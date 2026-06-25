/**
 * Review/Repair Loop 测试
 */

const assert = require('assert');

const { AGENT_STATES, ESCALATION_POLICIES } = require('../../src/agent/agent-types');
const { ReviewRepairLoop, DEFAULT_LOOP_CONFIG } = require('../../src/agent/review-repair-loop');

// ============================================================
// 测试用例
// ============================================================

async function testLoopInitialState() {
  console.log('  TC01: 初始状态正确');
  const loop = new ReviewRepairLoop();
  assert.strictEqual(loop.completed, false);
  assert.strictEqual(loop.failed, false);
  assert.strictEqual(loop.repairCount, 0);
  assert.strictEqual(loop.reviewCount, 0);
  assert.strictEqual(loop.config.maxRepairAttempts, 2);
}

async function testLoopCustomConfig() {
  console.log('  TC02: 自定义配置');
  const loop = new ReviewRepairLoop({ maxRepairAttempts: 5 });
  assert.strictEqual(loop.config.maxRepairAttempts, 5);
  assert.strictEqual(loop.config.maxReviewAttempts, 3); // 默认值保留
}

async function testStartReview() {
  console.log('  TC03: 开始审查');
  const loop = new ReviewRepairLoop();
  const result = loop.startReview();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state, AGENT_STATES.REVIEWING);
  assert.strictEqual(loop.reviewCount, 1);
}

async function testApproveReview() {
  console.log('  TC04: 审查通过');
  const loop = new ReviewRepairLoop();
  loop.startReview();
  const result = loop.approveReview({ issues: [] });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state, AGENT_STATES.COMPLETED);
  assert.strictEqual(loop.completed, true);
  assert.strictEqual(loop.finalStatus, 'approved');
}

async function testRejectReview() {
  console.log('  TC05: 审查不通过');
  const loop = new ReviewRepairLoop();
  loop.startReview();
  const result = loop.rejectReview({ issues: ['bug-1', 'bug-2'] });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.needsRepair, true);
  assert.strictEqual(result.state, AGENT_STATES.REPAIRING);
}

async function testStartRepair() {
  console.log('  TC06: 开始修复');
  const loop = new ReviewRepairLoop();
  const result = loop.startRepair();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state, AGENT_STATES.REPAIRING);
  assert.strictEqual(loop.repairCount, 1);
}

async function testCompleteRepair() {
  console.log('  TC07: 修复完成，进入审查');
  const loop = new ReviewRepairLoop();
  loop.startRepair();
  const result = loop.completeRepair({ fixed: ['bug-1'] });
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state, AGENT_STATES.REVIEWING);
}

async function testFailRepairBlockPolicy() {
  console.log('  TC08: 修复失败，BLOCK 策略');
  const loop = new ReviewRepairLoop({ repairFailurePolicy: ESCALATION_POLICIES.BLOCK });
  loop.startRepair();
  const result = loop.failRepair();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state, AGENT_STATES.FAILED);
  assert.strictEqual(result.escalation, ESCALATION_POLICIES.BLOCK);
  assert.strictEqual(loop.failed, true);
}

async function testFailRepairSkipPolicy() {
  console.log('  TC09: 修复失败，SKIP 策略');
  const loop = new ReviewRepairLoop({ repairFailurePolicy: ESCALATION_POLICIES.SKIP });
  loop.startRepair();
  const result = loop.failRepair();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state, AGENT_STATES.COMPLETED);
  assert.strictEqual(result.escalation, 'skip');
  assert.strictEqual(loop.finalStatus, 'skipped');
}

async function testFailRepairRetryPolicy() {
  console.log('  TC10: 修复失败，RETRY 策略');
  const loop = new ReviewRepairLoop({ maxRepairAttempts: 3, repairFailurePolicy: ESCALATION_POLICIES.RETRY });
  loop.startRepair();
  const result = loop.failRepair();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.state, AGENT_STATES.REPAIRING);
  assert.strictEqual(result.escalation, 'retry');
}

async function testMaxRepairAttempts() {
  console.log('  TC11: 超过最大修复次数');
  const loop = new ReviewRepairLoop({ maxRepairAttempts: 2 });
  loop.startRepair();
  loop.startRepair();
  const result = loop.startRepair();
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.state, 'failed');
  assert.strictEqual(loop.failed, true);
}

async function testMaxReviewAttempts() {
  console.log('  TC12: 超过最大审查次数');
  const loop = new ReviewRepairLoop({ maxReviewAttempts: 2 });
  loop.startReview();
  loop.startReview();
  const result = loop.startReview();
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.state, 'failed');
  assert.strictEqual(loop.failed, true);
}

async function testFullCycleApprove() {
  console.log('  TC13: 完整循环 — 审查→修复→审查→通过');
  const loop = new ReviewRepairLoop();
  loop.startReview();
  loop.rejectReview({ issues: ['bug-1'] });
  loop.startRepair();
  loop.completeRepair();
  loop.startReview();
  const result = loop.approveReview();
  assert.strictEqual(result.ok, true);
  assert.strictEqual(loop.completed, true);
  assert.strictEqual(loop.repairCount, 1);
  assert.strictEqual(loop.reviewCount, 2);
}

async function testFullCycleFail() {
  console.log('  TC14: 完整循环 — 审查→修复→审查→修复→失败');
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

async function testStartReviewAfterComplete() {
  console.log('  TC15: 完成后不能开始审查');
  const loop = new ReviewRepairLoop();
  loop.startReview();
  loop.approveReview();
  const result = loop.startReview();
  assert.strictEqual(result.ok, false);
}

async function testStartRepairAfterFail() {
  console.log('  TC16: 失败后不能开始修复');
  const loop = new ReviewRepairLoop();
  loop.fail('test');
  const result = loop.startRepair();
  assert.strictEqual(result.ok, false);
}

async function testCanRepair() {
  console.log('  TC17: canRepair 判断');
  const loop = new ReviewRepairLoop({ maxRepairAttempts: 2 });
  assert.strictEqual(loop.canRepair(), true);
  loop.startRepair();
  assert.strictEqual(loop.canRepair(), true);
  loop.startRepair();
  assert.strictEqual(loop.canRepair(), false);
}

async function testCanReview() {
  console.log('  TC18: canReview 判断');
  const loop = new ReviewRepairLoop({ maxReviewAttempts: 2 });
  assert.strictEqual(loop.canReview(), true);
  loop.startReview();
  assert.strictEqual(loop.canReview(), true);
  loop.startReview();
  assert.strictEqual(loop.canReview(), false);
}

async function testGetSummary() {
  console.log('  TC19: 循环摘要');
  const loop = new ReviewRepairLoop();
  loop.startReview();
  loop.rejectReview();
  loop.startRepair();
  const summary = loop.getSummary();
  assert.strictEqual(summary.repairCount, 1);
  assert.strictEqual(summary.reviewCount, 1);
  assert.strictEqual(summary.completed, false);
  assert.strictEqual(summary.failed, false);
  assert.ok(summary.eventCount > 0);
}

async function testEventsRecorded() {
  console.log('  TC20: 事件记录完整');
  const loop = new ReviewRepairLoop();
  loop.startReview();
  loop.rejectReview();
  loop.startRepair();
  loop.completeRepair();
  loop.startReview();
  loop.approveReview();
  assert.strictEqual(loop.events.length, 6);
  assert.strictEqual(loop.events[0].type, 'review_start');
  assert.strictEqual(loop.events[1].type, 'review_rejected');
  assert.strictEqual(loop.events[2].type, 'repair_start');
  assert.strictEqual(loop.events[3].type, 'repair_complete');
  assert.strictEqual(loop.events[4].type, 'review_start');
  assert.strictEqual(loop.events[5].type, 'review_approved');
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== review-repair-loop.test.js ===');

  const tests = [
    testLoopInitialState,
    testLoopCustomConfig,
    testStartReview,
    testApproveReview,
    testRejectReview,
    testStartRepair,
    testCompleteRepair,
    testFailRepairBlockPolicy,
    testFailRepairSkipPolicy,
    testFailRepairRetryPolicy,
    testMaxRepairAttempts,
    testMaxReviewAttempts,
    testFullCycleApprove,
    testFullCycleFail,
    testStartReviewAfterComplete,
    testStartRepairAfterFail,
    testCanRepair,
    testCanReview,
    testGetSummary,
    testEventsRecorded,
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
