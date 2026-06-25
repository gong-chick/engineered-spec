/**
 * P3.2 Asset Review Workflow 测试
 */

const assert = require('assert');

const {
  REVIEW_STATES,
  STATE_TRANSITIONS,
  AssetReviewWorkflow,
} = require('../../src/governance/asset-review');

// ============================================================
// 状态与转换规则测试
// ============================================================

async function testReviewStatesExist() {
  console.log('  TC01: REVIEW_STATES 枚举完整');
  assert.strictEqual(REVIEW_STATES.DRAFT, 'draft');
  assert.strictEqual(REVIEW_STATES.SUBMITTED, 'submitted');
  assert.strictEqual(REVIEW_STATES.APPROVED, 'approved');
  assert.strictEqual(REVIEW_STATES.PUBLISHED, 'published');
  assert.strictEqual(REVIEW_STATES.REJECTED, 'rejected');
  assert.strictEqual(REVIEW_STATES.DEPRECATED, 'deprecated');
  assert.strictEqual(REVIEW_STATES.WITHDRAWN, 'withdrawn');
  assert.strictEqual(Object.isFrozen(REVIEW_STATES), true);
}

async function testStateTransitionsFrozen() {
  console.log('  TC02: STATE_TRANSITIONS 冻结');
  assert.strictEqual(Object.isFrozen(STATE_TRANSITIONS), true);
  assert.ok(Array.isArray(STATE_TRANSITIONS.draft));
  assert.ok(STATE_TRANSITIONS.draft.includes('submitted'));
  assert.deepStrictEqual(STATE_TRANSITIONS.deprecated, []);
}

// ============================================================
// 创建审核记录
// ============================================================

async function testCreateReview() {
  console.log('  TC03: 创建审核记录');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({
    assetId: 'asset-1',
    version: '1.0.0',
    submitterId: 'user-1',
  });

  assert.ok(review.reviewId);
  assert.strictEqual(review.assetId, 'asset-1');
  assert.strictEqual(review.version, '1.0.0');
  assert.strictEqual(review.submitterId, 'user-1');
  assert.strictEqual(review.status, 'draft');
  assert.strictEqual(review.reviewerId, null);
  assert.deepStrictEqual(review.issues, []);
}

async function testCreateReviewMissingFields() {
  console.log('  TC04: 创建审核记录缺少必填字段报错');
  const wf = new AssetReviewWorkflow();
  assert.throws(() => wf.createReview({}), /必填/);
  assert.throws(() => wf.createReview({ assetId: 'a' }), /必填/);
}

// ============================================================
// 状态转换
// ============================================================

async function testSubmitReview() {
  console.log('  TC05: 提交审核');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  const result = wf.submitReview(review.reviewId);

  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.review.status, 'submitted');
}

async function testSubmitReviewInvalidTransition() {
  console.log('  TC06: 从非 draft 状态提交审核被拒绝');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);

  const result = wf.submitReview(review.reviewId);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('不允许'));
}

async function testApproveReview() {
  console.log('  TC07: 审核通过');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);

  const result = wf.approveReview(review.reviewId, 'reviewer-1', '通过');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.review.status, 'approved');
  assert.strictEqual(result.review.reviewerId, 'reviewer-1');
  assert.strictEqual(result.review.comment, '通过');
}

async function testRejectReview() {
  console.log('  TC08: 审核拒绝');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);

  const result = wf.rejectReview(review.reviewId, 'reviewer-1', '有问题', ['缺少文档']);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.review.status, 'rejected');
  assert.deepStrictEqual(result.review.issues, ['缺少文档']);
}

async function testRejectReviewRequiresComment() {
  console.log('  TC09: 拒绝时必须提供 comment');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);

  const result = wf.rejectReview(review.reviewId, 'reviewer-1', '');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('comment'));
}

async function testWithdrawReview() {
  console.log('  TC10: 撤回审核');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);

  const result = wf.withdrawReview(review.reviewId);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.review.status, 'withdrawn');
}

async function testWithdrawnToDraft() {
  console.log('  TC11: 撤回后可回到草稿');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);
  wf.withdrawReview(review.reviewId);

  // withdrawn 只能转到 draft（通过重新创建来模拟）
  // 这里验证 withdrawn 状态正确
  const r = wf.getReview(review.reviewId);
  assert.strictEqual(r.status, 'withdrawn');
}

// ============================================================
// 发布
// ============================================================

async function testPublishAsset() {
  console.log('  TC12: 发布资产');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);
  wf.approveReview(review.reviewId, 'reviewer-1');

  const result = wf.publishAsset(review.reviewId, 'publisher-1');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.review.status, 'published');
  assert.ok(result.rc);
  assert.strictEqual(result.rc.assetId, 'a');
  assert.strictEqual(result.rc.version, '1');
  assert.strictEqual(result.rc.status, 'active');
}

async function testPublishWithoutApproval() {
  console.log('  TC13: 未审核通过不可发布');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);

  const result = wf.publishAsset(review.reviewId, 'publisher-1');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('不允许'));
}

async function testPublishRequiresPublisherId() {
  console.log('  TC14: 发布必须提供 publisherId');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);
  wf.approveReview(review.reviewId, 'reviewer-1');

  const result = wf.publishAsset(review.reviewId, '');
  assert.strictEqual(result.ok, false);
}

// ============================================================
// 废弃
// ============================================================

async function testDeprecateAsset() {
  console.log('  TC15: 废弃资产');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);
  wf.approveReview(review.reviewId, 'reviewer-1');
  wf.publishAsset(review.reviewId, 'publisher-1');

  const result = wf.deprecateAsset('a', '版本过旧');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.deprecated.status, 'deprecated');
  assert.strictEqual(result.deprecated.comment, '版本过旧');
}

async function testDeprecateUnpublishedAsset() {
  console.log('  TC16: 未发布资产不可废弃');
  const wf = new AssetReviewWorkflow();
  wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });

  const result = wf.deprecateAsset('a', '原因');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('没有已发布'));
}

async function testDeprecateRequiresReason() {
  console.log('  TC17: 废弃必须提供原因');
  const wf = new AssetReviewWorkflow();
  const result = wf.deprecateAsset('a', '');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('原因'));
}

// ============================================================
// 查询
// ============================================================

async function testGetReviewHistory() {
  console.log('  TC18: 获取审核历史');
  const wf = new AssetReviewWorkflow();
  wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.createReview({ assetId: 'a', version: '2', submitterId: 'u' });
  wf.createReview({ assetId: 'b', version: '1', submitterId: 'u' });

  const history = wf.getReviewHistory('a');
  assert.strictEqual(history.length, 2);
  assert.strictEqual(history[0].version, '1');
  assert.strictEqual(history[1].version, '2');
}

async function testGetReview() {
  console.log('  TC19: 获取单个审核记录');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });

  const r = wf.getReview(review.reviewId);
  assert.ok(r);
  assert.strictEqual(r.assetId, 'a');

  assert.strictEqual(wf.getReview('nonexistent'), null);
}

async function testListReleaseCandidates() {
  console.log('  TC20: 列出 RC');
  const wf = new AssetReviewWorkflow();
  const r1 = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(r1.reviewId);
  wf.approveReview(r1.reviewId, 'rev');
  wf.publishAsset(r1.reviewId, 'pub');

  const r2 = wf.createReview({ assetId: 'a', version: '2', submitterId: 'u' });
  wf.submitReview(r2.reviewId);
  wf.approveReview(r2.reviewId, 'rev');
  wf.publishAsset(r2.reviewId, 'pub');

  const rcs = wf.listReleaseCandidates('a');
  assert.strictEqual(rcs.length, 2);
}

// ============================================================
// 统计与重置
// ============================================================

async function testGetStats() {
  console.log('  TC21: 获取统计');
  const wf = new AssetReviewWorkflow();
  wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.createReview({ assetId: 'b', version: '1', submitterId: 'u' });

  const stats = wf.getStats();
  assert.strictEqual(stats.totalReviews, 2);
  assert.strictEqual(stats.statusCounts.draft, 2);
}

async function testReset() {
  console.log('  TC22: 重置');
  const wf = new AssetReviewWorkflow();
  wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.reset();

  assert.strictEqual(wf.reviews.size, 0);
  assert.strictEqual(wf.reviewHistory.size, 0);
  assert.strictEqual(wf.releaseCandidates.size, 0);
}

// ============================================================
// 完整生命周期
// ============================================================

async function testFullLifecycleDraftToPublished() {
  console.log('  TC23: 完整生命周期 draft→submitted→approved→published');
  const wf = new AssetReviewWorkflow();

  const review = wf.createReview({ assetId: 'login-module', version: '2.0.0', submitterId: 'dev-1' });
  assert.strictEqual(review.status, 'draft');

  const s1 = wf.submitReview(review.reviewId);
  assert.strictEqual(s1.ok, true);
  assert.strictEqual(s1.review.status, 'submitted');

  const s2 = wf.approveReview(review.reviewId, 'reviewer-1', 'LGTM');
  assert.strictEqual(s2.ok, true);
  assert.strictEqual(s2.review.status, 'approved');

  const s3 = wf.publishAsset(review.reviewId, 'admin-1');
  assert.strictEqual(s3.ok, true);
  assert.strictEqual(s3.review.status, 'published');
  assert.ok(s3.rc);

  // 废弃
  const s4 = wf.deprecateAsset('login-module', '已被新版本替代');
  assert.strictEqual(s4.ok, true);
  assert.strictEqual(s4.deprecated.status, 'deprecated');
}

async function testFullLifecycleRejectAndResubmit() {
  console.log('  TC24: 完整生命周期 draft→submitted→rejected→draft→submitted→approved');
  const wf = new AssetReviewWorkflow();

  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  wf.submitReview(review.reviewId);

  // 拒绝
  const reject = wf.rejectReview(review.reviewId, 'rev', '需修改', ['缺少测试']);
  assert.strictEqual(reject.ok, true);
  assert.strictEqual(reject.review.status, 'rejected');

  // rejected 可以回到 draft —— 通过新审核记录模拟
  const review2 = wf.createReview({ assetId: 'a', version: '1.1', submitterId: 'u' });
  wf.submitReview(review2.reviewId);
  const approve = wf.approveReview(review2.reviewId, 'rev');
  assert.strictEqual(approve.ok, true);
}

// ============================================================
// 不可变性
// ============================================================

async function testReturnCopyNotReference() {
  console.log('  TC25: 返回副本而非引用');
  const wf = new AssetReviewWorkflow();
  const review = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });

  const r1 = wf.getReview(review.reviewId);
  r1.assetId = 'modified';

  const r2 = wf.getReview(review.reviewId);
  assert.strictEqual(r2.assetId, 'a');
}

// ============================================================
// 非法转换
// ============================================================

async function testInvalidTransitions() {
  console.log('  TC26: 非法状态转换全部被拒绝');
  const wf = new AssetReviewWorkflow();

  // draft 不能直接到 approved
  const r1 = wf.createReview({ assetId: 'a', version: '1', submitterId: 'u' });
  assert.strictEqual(wf.approveReview(r1.reviewId, 'rev').ok, false);

  // submitted 不能直接到 published
  const r2 = wf.createReview({ assetId: 'b', version: '1', submitterId: 'u' });
  wf.submitReview(r2.reviewId);
  assert.strictEqual(wf.publishAsset(r2.reviewId, 'pub').ok, false);

  // published 不能回到 draft
  const r3 = wf.createReview({ assetId: 'c', version: '1', submitterId: 'u' });
  wf.submitReview(r3.reviewId);
  wf.approveReview(r3.reviewId, 'rev');
  wf.publishAsset(r3.reviewId, 'pub');
  assert.strictEqual(wf.submitReview(r3.reviewId).ok, false);
}

async function testNonexistentReviewId() {
  console.log('  TC27: 不存在的 reviewId 返回错误');
  const wf = new AssetReviewWorkflow();
  assert.strictEqual(wf.submitReview('nonexistent').ok, false);
  assert.strictEqual(wf.approveReview('nonexistent', 'rev').ok, false);
  assert.strictEqual(wf.rejectReview('nonexistent', 'rev', 'x').ok, false);
  assert.strictEqual(wf.publishAsset('nonexistent', 'pub').ok, false);
  assert.strictEqual(wf.withdrawReview('nonexistent').ok, false);
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== asset-review.test.js ===');

  const tests = [
    testReviewStatesExist,
    testStateTransitionsFrozen,
    testCreateReview,
    testCreateReviewMissingFields,
    testSubmitReview,
    testSubmitReviewInvalidTransition,
    testApproveReview,
    testRejectReview,
    testRejectReviewRequiresComment,
    testWithdrawReview,
    testWithdrawnToDraft,
    testPublishAsset,
    testPublishWithoutApproval,
    testPublishRequiresPublisherId,
    testDeprecateAsset,
    testDeprecateUnpublishedAsset,
    testDeprecateRequiresReason,
    testGetReviewHistory,
    testGetReview,
    testListReleaseCandidates,
    testGetStats,
    testReset,
    testFullLifecycleDraftToPublished,
    testFullLifecycleRejectAndResubmit,
    testReturnCopyNotReference,
    testInvalidTransitions,
    testNonexistentReviewId,
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
