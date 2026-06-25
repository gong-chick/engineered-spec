/**
 * P3.4 灰度发布测试
 */

const assert = require('assert');

const {
  GRAY_SCOPE_TYPES,
  GRAY_STATUS,
  GrayReleaseEngine,
  createGrayReleaseEngine,
} = require('../../src/governance/gray-release');

// ============================================================
// 常量测试
// ============================================================

async function testConstantsExist() {
  console.log('  TC01: 灰度常量存在且冻结');
  assert.ok(GRAY_SCOPE_TYPES);
  assert.ok(GRAY_STATUS);
  assert.strictEqual(Object.isFrozen(GRAY_SCOPE_TYPES), true);
  assert.strictEqual(Object.isFrozen(GRAY_STATUS), true);
  assert.strictEqual(GRAY_SCOPE_TYPES.ORG, 'org');
  assert.strictEqual(GRAY_SCOPE_TYPES.PERCENTAGE, 'percentage');
  assert.strictEqual(GRAY_STATUS.ACTIVE, 'active');
  assert.strictEqual(GRAY_STATUS.RECLAIMED, 'reclaimed');
}

// ============================================================
// 创建灰度规则
// ============================================================

async function testCreateGrayRule() {
  console.log('  TC02: 创建灰度规则');
  const engine = createGrayReleaseEngine();
  const rule = engine.createGrayRule({
    assetId: 'asset-1',
    version: '1.0.0',
    scope: 'org',
    scopeValue: 'org-a',
  });

  assert.ok(rule.ruleId);
  assert.strictEqual(rule.assetId, 'asset-1');
  assert.strictEqual(rule.version, '1.0.0');
  assert.strictEqual(rule.scope, 'org');
  assert.strictEqual(rule.scopeValue, 'org-a');
  assert.strictEqual(rule.percentage, null);
}

async function testCreateGrayRulePercentage() {
  console.log('  TC03: 创建百分比灰度规则');
  const engine = createGrayReleaseEngine();
  const rule = engine.createGrayRule({
    assetId: 'asset-1',
    version: '1.0.0',
    scope: 'percentage',
    percentage: 30,
    rollbackVersion: '0.9.0',
  });

  assert.strictEqual(rule.scope, 'percentage');
  assert.strictEqual(rule.percentage, 30);
  assert.strictEqual(rule.rollbackVersion, '0.9.0');
}

async function testCreateGrayRuleInvalidScope() {
  console.log('  TC04: 无效范围类型报错');
  const engine = createGrayReleaseEngine();
  assert.throws(
    () => engine.createGrayRule({ assetId: 'a', version: '1', scope: 'invalid' }),
    /无效范围类型/
  );
}

async function testCreateGrayRuleMissingFields() {
  console.log('  TC05: 缺少必填字段报错');
  const engine = createGrayReleaseEngine();
  assert.throws(() => engine.createGrayRule({}), /必填/);
  assert.throws(() => engine.createGrayRule({ assetId: 'a' }), /必填/);
}

async function testCreateGrayRulePercentageValidation() {
  console.log('  TC06: 百分比范围校验');
  const engine = createGrayReleaseEngine();
  assert.throws(
    () => engine.createGrayRule({ assetId: 'a', version: '1', scope: 'percentage', percentage: 150 }),
    /百分比/
  );
  assert.throws(
    () => engine.createGrayRule({ assetId: 'a', version: '1', scope: 'percentage', percentage: -1 }),
    /百分比/
  );
}

async function testCreateGrayRuleNonPercentageRequiresScopeValue() {
  console.log('  TC07: 非百分比范围必须提供 scopeValue');
  const engine = createGrayReleaseEngine();
  assert.throws(
    () => engine.createGrayRule({ assetId: 'a', version: '1', scope: 'org' }),
    /scopeValue/
  );
}

// ============================================================
// 创建灰度发布
// ============================================================

async function testCreateGrayRelease() {
  console.log('  TC08: 创建灰度发布');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'asset-1',
    version: '1.0.0',
    rules: [
      { scope: 'org', scopeValue: 'org-a' },
      { scope: 'percentage', percentage: 20, rollbackVersion: '0.9.0' },
    ],
    createdBy: 'admin',
  });

  assert.ok(release.releaseId);
  assert.strictEqual(release.assetId, 'asset-1');
  assert.strictEqual(release.version, '1.0.0');
  assert.strictEqual(release.status, 'active');
  assert.strictEqual(release.rules.length, 2);
  assert.strictEqual(release.createdBy, 'admin');
}

async function testCreateGrayReleaseMissingFields() {
  console.log('  TC09: 创建灰度发布缺少必填字段');
  const engine = createGrayReleaseEngine();
  assert.throws(() => engine.createGrayRelease({}), /必填/);
  assert.throws(() => engine.createGrayRelease({ assetId: 'a', version: '1', rules: [] }), /必填/);
}

async function testCreateGrayReleaseFullPercentageNoRollback() {
  console.log('  TC10: 无 rollbackVersion 不允许 100% 灰度');
  const engine = createGrayReleaseEngine();
  assert.throws(
    () => engine.createGrayRelease({
      assetId: 'a',
      version: '1',
      rules: [{ scope: 'percentage', percentage: 100 }],
      createdBy: 'admin',
    }),
    /rollbackVersion/
  );
}

async function testCreateGrayReleaseFullPercentageWithRollback() {
  console.log('  TC11: 有 rollbackVersion 允许 100% 灰度');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'percentage', percentage: 100, rollbackVersion: '0.9.0' }],
    createdBy: 'admin',
  });
  assert.strictEqual(release.status, 'active');
}

// ============================================================
// 评估范围
// ============================================================

async function testEvaluateScopeOrgMatch() {
  console.log('  TC12: 按组织评估命中');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });

  const result = engine.evaluateScope(release.releaseId, { org: 'org-a' });
  assert.strictEqual(result.matched, true);
  assert.ok(result.matchedRule);
}

async function testEvaluateScopeOrgNoMatch() {
  console.log('  TC13: 按组织评估未命中');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });

  const result = engine.evaluateScope(release.releaseId, { org: 'org-b' });
  assert.strictEqual(result.matched, false);
}

async function testEvaluateScopeTeamMatch() {
  console.log('  TC14: 按团队评估命中');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'team', scopeValue: 'team-alpha' }],
    createdBy: 'admin',
  });

  const result = engine.evaluateScope(release.releaseId, { team: 'team-alpha' });
  assert.strictEqual(result.matched, true);
}

async function testEvaluateScopeProjectMatch() {
  console.log('  TC15: 按项目评估命中');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'project', scopeValue: 'proj-1' }],
    createdBy: 'admin',
  });

  const result = engine.evaluateScope(release.releaseId, { project: 'proj-1' });
  assert.strictEqual(result.matched, true);
}

async function testEvaluateScopeMultipleRules() {
  console.log('  TC16: 多规则评估——命中第一个匹配的');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [
      { scope: 'org', scopeValue: 'org-a' },
      { scope: 'team', scopeValue: 'team-alpha' },
    ],
    createdBy: 'admin',
  });

  const result = engine.evaluateScope(release.releaseId, { team: 'team-alpha' });
  assert.strictEqual(result.matched, true);
}

async function testEvaluateScopeNonexistent() {
  console.log('  TC17: 不存在的灰度发布返回错误');
  const engine = createGrayReleaseEngine();
  const result = engine.evaluateScope('nonexistent', {});
  assert.strictEqual(result.matched, false);
  assert.ok(result.reason.includes('不存在'));
}

async function testEvaluateScopeReclaimed() {
  console.log('  TC18: 已回收的灰度不可评估');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });
  engine.reclaimGrayRelease(release.releaseId, '测试回收');

  const result = engine.evaluateScope(release.releaseId, { org: 'org-a' });
  assert.strictEqual(result.matched, false);
  assert.ok(result.reason.includes('reclaimed'));
}

// ============================================================
// 回收灰度
// ============================================================

async function testReclaimGrayRelease() {
  console.log('  TC19: 回收灰度发布');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });

  const result = engine.reclaimGrayRelease(release.releaseId, '发现问题');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.release.status, 'reclaimed');
  assert.strictEqual(result.release.reclaimReason, '发现问题');
  assert.ok(result.release.reclaimedAt);
}

async function testReclaimRequiresReason() {
  console.log('  TC20: 回收必须提供原因');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });

  const result = engine.reclaimGrayRelease(release.releaseId, '');
  assert.strictEqual(result.ok, false);
}

async function testReclaimNonexistent() {
  console.log('  TC21: 回收不存在的灰度发布');
  const engine = createGrayReleaseEngine();
  const result = engine.reclaimGrayRelease('nonexistent', '原因');
  assert.strictEqual(result.ok, false);
}

async function testReclaimAlreadyReclaimed() {
  console.log('  TC22: 重复回收被拒绝');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });
  engine.reclaimGrayRelease(release.releaseId, '第一次');

  const result = engine.reclaimGrayRelease(release.releaseId, '第二次');
  assert.strictEqual(result.ok, false);
}

// ============================================================
// 扩大灰度
// ============================================================

async function testExpandGrayRelease() {
  console.log('  TC23: 扩大灰度范围');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'percentage', percentage: 20, rollbackVersion: '0.9.0' }],
    createdBy: 'admin',
  });

  const result = engine.expandGrayRelease(release.releaseId, 50);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.release.status, 'expanded');
}

async function testExpandToFullRelease() {
  console.log('  TC24: 扩大到 100% 变为 fully_released');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'percentage', percentage: 50, rollbackVersion: '0.9.0' }],
    createdBy: 'admin',
  });

  const result = engine.expandGrayRelease(release.releaseId, 100);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.release.status, 'fully_released');
}

async function testExpandCannotShrink() {
  console.log('  TC25: 不能缩小灰度范围');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'percentage', percentage: 50, rollbackVersion: '0.9.0' }],
    createdBy: 'admin',
  });

  const result = engine.expandGrayRelease(release.releaseId, 30);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('不能小于'));
}

async function testExpandInvalidPercentage() {
  console.log('  TC26: 扩展时百分比校验');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'percentage', percentage: 20 }],
    createdBy: 'admin',
  });

  assert.strictEqual(engine.expandGrayRelease(release.releaseId, -1).ok, false);
  assert.strictEqual(engine.expandGrayRelease(release.releaseId, 150).ok, false);
}

async function testExpandNonexistent() {
  console.log('  TC27: 扩展不存在的灰度发布');
  const engine = createGrayReleaseEngine();
  const result = engine.expandGrayRelease('nonexistent', 50);
  assert.strictEqual(result.ok, false);
}

async function testExpandNoPercentageRule() {
  console.log('  TC28: 没有百分比规则时扩展失败');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });

  const result = engine.expandGrayRelease(release.releaseId, 50);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('百分比'));
}

// ============================================================
// 查询
// ============================================================

async function testGetGrayStatus() {
  console.log('  TC29: 获取灰度状态');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });

  const status = engine.getGrayStatus(release.releaseId);
  assert.ok(status);
  assert.strictEqual(status.status, 'active');

  assert.strictEqual(engine.getGrayStatus('nonexistent'), null);
}

async function testListGrayReleases() {
  console.log('  TC30: 列出灰度发布');
  const engine = createGrayReleaseEngine();
  engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });
  engine.createGrayRelease({
    assetId: 'b',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });

  assert.strictEqual(engine.listGrayReleases().length, 2);
  assert.strictEqual(engine.listGrayReleases('a').length, 1);
  assert.strictEqual(engine.listGrayReleases('c').length, 0);
}

// ============================================================
// 统计与重置
// ============================================================

async function testGetStats() {
  console.log('  TC31: 获取统计');
  const engine = createGrayReleaseEngine();
  engine.createGrayRule({ assetId: 'a', version: '1', scope: 'org', scopeValue: 'org-a' });
  engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });

  const stats = engine.getStats();
  assert.strictEqual(stats.totalReleases, 1);
  assert.strictEqual(stats.totalRules, 1);
  assert.strictEqual(stats.byStatus.active, 1);
}

async function testReset() {
  console.log('  TC32: 重置');
  const engine = createGrayReleaseEngine();
  engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });
  engine.reset();

  assert.strictEqual(engine.releases.size, 0);
  assert.strictEqual(engine.rules.size, 0);
}

// ============================================================
// 完整场景
// ============================================================

async function testFullGrayReleaseScenario() {
  console.log('  TC33: 完整灰度发布场景');
  const engine = createGrayReleaseEngine();

  // 创建灰度规则（仅组织范围，避免百分比规则干扰评估）
  const rule1 = engine.createGrayRule({ assetId: 'login-module', version: '2.0.0', scope: 'org', scopeValue: 'org-beta' });
  const rule2 = engine.createGrayRule({ assetId: 'login-module', version: '2.0.0', scope: 'team', scopeValue: 'team-alpha' });

  // 创建灰度发布
  const release = engine.createGrayRelease({
    assetId: 'login-module',
    version: '2.0.0',
    rules: [rule1, rule2],
    createdBy: 'admin',
  });
  assert.strictEqual(release.status, 'active');

  // 评估——组织命中
  const eval1 = engine.evaluateScope(release.releaseId, { org: 'org-beta' });
  assert.strictEqual(eval1.matched, true);

  // 评估——未命中
  const eval2 = engine.evaluateScope(release.releaseId, { org: 'org-prod', team: 'team-beta' });
  assert.strictEqual(eval2.matched, false);

  // 回收
  const reclaimed = engine.reclaimGrayRelease(release.releaseId, '发现性能问题');
  assert.strictEqual(reclaimed.ok, true);
  assert.strictEqual(reclaimed.release.status, 'reclaimed');

  // 统计
  const stats = engine.getStats();
  assert.strictEqual(stats.totalReleases, 1);
  assert.strictEqual(stats.byStatus.reclaimed, 1);
}

// ============================================================
// 返回副本
// ============================================================

async function testReturnCopyNotReference() {
  console.log('  TC34: 返回副本而非引用');
  const engine = createGrayReleaseEngine();
  const release = engine.createGrayRelease({
    assetId: 'a',
    version: '1',
    rules: [{ scope: 'org', scopeValue: 'org-a' }],
    createdBy: 'admin',
  });

  const s1 = engine.getGrayStatus(release.releaseId);
  s1.assetId = 'modified';

  const s2 = engine.getGrayStatus(release.releaseId);
  assert.strictEqual(s2.assetId, 'a');
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== gray-release.test.js ===');

  const tests = [
    testConstantsExist,
    testCreateGrayRule,
    testCreateGrayRulePercentage,
    testCreateGrayRuleInvalidScope,
    testCreateGrayRuleMissingFields,
    testCreateGrayRulePercentageValidation,
    testCreateGrayRuleNonPercentageRequiresScopeValue,
    testCreateGrayRelease,
    testCreateGrayReleaseMissingFields,
    testCreateGrayReleaseFullPercentageNoRollback,
    testCreateGrayReleaseFullPercentageWithRollback,
    testEvaluateScopeOrgMatch,
    testEvaluateScopeOrgNoMatch,
    testEvaluateScopeTeamMatch,
    testEvaluateScopeProjectMatch,
    testEvaluateScopeMultipleRules,
    testEvaluateScopeNonexistent,
    testEvaluateScopeReclaimed,
    testReclaimGrayRelease,
    testReclaimRequiresReason,
    testReclaimNonexistent,
    testReclaimAlreadyReclaimed,
    testExpandGrayRelease,
    testExpandToFullRelease,
    testExpandCannotShrink,
    testExpandInvalidPercentage,
    testExpandNonexistent,
    testExpandNoPercentageRule,
    testGetGrayStatus,
    testListGrayReleases,
    testGetStats,
    testReset,
    testFullGrayReleaseScenario,
    testReturnCopyNotReference,
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
