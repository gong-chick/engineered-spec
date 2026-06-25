/**
 * P3.5 版本回滚测试
 */

const assert = require('assert');

const {
  ROLLBACK_STATUS,
  RollbackManager,
  createRollbackManager,
} = require('../../src/governance/rollback');

// ============================================================
// 常量测试
// ============================================================

async function testConstantsExist() {
  console.log('  TC01: 回滚常量存在且冻结');
  assert.ok(ROLLBACK_STATUS);
  assert.strictEqual(Object.isFrozen(ROLLBACK_STATUS), true);
  assert.strictEqual(ROLLBACK_STATUS.PENDING, 'pending');
  assert.strictEqual(ROLLBACK_STATUS.COMPLETED, 'completed');
  assert.strictEqual(ROLLBACK_STATUS.VERIFIED, 'verified');
}

// ============================================================
// 注册版本
// ============================================================

async function testRegisterVersion() {
  console.log('  TC02: 注册资产版本');
  const rm = createRollbackManager();
  const v = rm.registerVersion({ assetId: 'asset-1', version: '1.0.0', content: { data: 'v1' } });

  assert.ok(v.versionId);
  assert.strictEqual(v.assetId, 'asset-1');
  assert.strictEqual(v.version, '1.0.0');
  assert.deepStrictEqual(v.content, { data: 'v1' });
}

async function testRegisterVersionMissingFields() {
  console.log('  TC03: 注册版本缺少必填字段');
  const rm = createRollbackManager();
  assert.throws(() => rm.registerVersion({}), /必填/);
  assert.throws(() => rm.registerVersion({ assetId: 'a' }), /必填/);
}

async function testListVersions() {
  console.log('  TC04: 列出资产版本');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0' });
  rm.registerVersion({ assetId: 'a', version: '1.1.0' });
  rm.registerVersion({ assetId: 'b', version: '1.0.0' });

  assert.strictEqual(rm.listVersions('a').length, 2);
  assert.strictEqual(rm.listVersions('b').length, 1);
  assert.strictEqual(rm.listVersions('c').length, 0);
}

// ============================================================
// 注册锁版本
// ============================================================

async function testRegisterLockVersion() {
  console.log('  TC05: 注册锁版本');
  const rm = createRollbackManager();
  const lock = rm.registerLockVersion({ projectId: 'proj-1', lockVersion: '1.0.0', lockData: { deps: ['a'] } });

  assert.ok(lock.lockVersionId);
  assert.strictEqual(lock.projectId, 'proj-1');
  assert.strictEqual(lock.lockVersion, '1.0.0');
}

async function testRegisterLockVersionMissingFields() {
  console.log('  TC06: 注册锁版本缺少必填字段');
  const rm = createRollbackManager();
  assert.throws(() => rm.registerLockVersion({}), /必填/);
}

// ============================================================
// 回滚资产版本
// ============================================================

async function testRollbackAssetVersion() {
  console.log('  TC07: 回滚资产版本');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0', content: { data: 'v1' } });
  rm.registerVersion({ assetId: 'a', version: '1.1.0', content: { data: 'v2' } });

  const result = rm.rollbackAssetVersion('a', '1.0.0', 'operator-1');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.rollback.status, 'completed');
  assert.strictEqual(result.rollback.targetVersion, '1.0.0');
  assert.strictEqual(result.rollback.operatorId, 'operator-1');
  assert.ok(result.rollback.newVersionId);
}

async function testRollbackAssetVersionNotFound() {
  console.log('  TC08: 回滚不存在的版本');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0' });

  const result = rm.rollbackAssetVersion('a', '9.9.9', 'op');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('没有版本'));
}

async function testRollbackAssetVersionMissingFields() {
  console.log('  TC09: 回滚资产缺少必填字段');
  const rm = createRollbackManager();
  assert.strictEqual(rm.rollbackAssetVersion('', '1', 'op').ok, false);
  assert.strictEqual(rm.rollbackAssetVersion('a', '', 'op').ok, false);
  assert.strictEqual(rm.rollbackAssetVersion('a', '1', '').ok, false);
}

async function testRollbackPreservesOldVersions() {
  console.log('  TC10: 回滚不删除旧版本');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0' });
  rm.registerVersion({ assetId: 'a', version: '1.1.0' });

  rm.rollbackAssetVersion('a', '1.0.0', 'op');
  const versions = rm.listVersions('a');
  assert.strictEqual(versions.length, 3); // 1.0.0 + 1.1.0 + rollback-xxx
}

// ============================================================
// 回滚锁
// ============================================================

async function testRollbackLock() {
  console.log('  TC11: 回滚项目锁');
  const rm = createRollbackManager();
  rm.registerLockVersion({ projectId: 'p1', lockVersion: '1.0.0', lockData: { x: 1 } });
  rm.registerLockVersion({ projectId: 'p1', lockVersion: '1.1.0', lockData: { x: 2 } });

  const result = rm.rollbackLock('p1', '1.0.0', 'op');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.rollback.type, 'lock');
  assert.strictEqual(result.rollback.targetLockVersion, '1.0.0');
}

async function testRollbackLockNotFound() {
  console.log('  TC12: 回滚不存在的锁版本');
  const rm = createRollbackManager();
  rm.registerLockVersion({ projectId: 'p1', lockVersion: '1.0.0' });

  const result = rm.rollbackLock('p1', '9.9.9', 'op');
  assert.strictEqual(result.ok, false);
}

async function testRollbackLockMissingFields() {
  console.log('  TC13: 回滚锁缺少必填字段');
  const rm = createRollbackManager();
  assert.strictEqual(rm.rollbackLock('', '1', 'op').ok, false);
  assert.strictEqual(rm.rollbackLock('p1', '', 'op').ok, false);
  assert.strictEqual(rm.rollbackLock('p1', '1', '').ok, false);
}

// ============================================================
// 适配器回滚
// ============================================================

async function testRollbackAdapters() {
  console.log('  TC14: 重新生成适配器');
  const rm = createRollbackManager();

  const result = rm.rollbackAdapters('proj-1', '1.0.0', ['cursor', 'claude-code']);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.rollback.type, 'adapter');
  assert.strictEqual(result.rollback.adapterNames.length, 2);
  assert.strictEqual(result.rollback.adapterResults.length, 2);
  assert.strictEqual(result.rollback.adapterResults[0].adapter, 'cursor');
  assert.strictEqual(result.rollback.adapterResults[0].status, 'regenerated');
}

async function testRollbackAdaptersMissingFields() {
  console.log('  TC15: 适配器回滚缺少必填字段');
  const rm = createRollbackManager();
  assert.strictEqual(rm.rollbackAdapters('', '1', ['a']).ok, false);
  assert.strictEqual(rm.rollbackAdapters('p', '', ['a']).ok, false);
  assert.strictEqual(rm.rollbackAdapters('p', '1', []).ok, false);
  assert.strictEqual(rm.rollbackAdapters('p', '1', null).ok, false);
}

// ============================================================
// 验证回滚
// ============================================================

async function testVerifyRollback() {
  console.log('  TC16: 验证回滚结果');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0' });
  rm.registerVersion({ assetId: 'a', version: '1.1.0' });
  const rb = rm.rollbackAssetVersion('a', '1.0.0', 'op');

  const result = rm.verifyRollback('a', rb.rollback.rollbackId);
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.verified.status, 'verified');
  assert.ok(result.verified.verificationResult.passed);
  assert.ok(result.verified.verifiedAt);
}

async function testVerifyRollbackNotFound() {
  console.log('  TC17: 验证不存在的回滚');
  const rm = createRollbackManager();
  const result = rm.verifyRollback('a', 'nonexistent');
  assert.strictEqual(result.ok, false);
}

async function testVerifyRollbackAlreadyVerified() {
  console.log('  TC18: 重复验证被拒绝');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0' });
  rm.registerVersion({ assetId: 'a', version: '1.1.0' });
  const rb = rm.rollbackAssetVersion('a', '1.0.0', 'op');
  rm.verifyRollback('a', rb.rollback.rollbackId);

  const result = rm.verifyRollback('a', rb.rollback.rollbackId);
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('已验证'));
}

// ============================================================
// 查询
// ============================================================

async function testGetRollbackHistory() {
  console.log('  TC19: 获取回滚历史');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0' });
  rm.registerVersion({ assetId: 'a', version: '1.1.0' });
  rm.rollbackAssetVersion('a', '1.0.0', 'op');

  const history = rm.getRollbackHistory('a');
  assert.strictEqual(history.length, 1);

  assert.strictEqual(rm.getRollbackHistory('b').length, 0);
  assert.strictEqual(rm.getRollbackHistory().length, 1); // 全部
}

async function testGetRollback() {
  console.log('  TC20: 获取单个回滚记录');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0' });
  rm.registerVersion({ assetId: 'a', version: '1.1.0' });
  const rb = rm.rollbackAssetVersion('a', '1.0.0', 'op');

  const r = rm.getRollback(rb.rollback.rollbackId);
  assert.ok(r);
  assert.strictEqual(r.type, 'asset_version');

  assert.strictEqual(rm.getRollback('nonexistent'), null);
}

// ============================================================
// 审计回调
// ============================================================

async function testAuditCallback() {
  console.log('  TC21: 审计回调触发');
  const auditEvents = [];
  const rm = createRollbackManager({
    onAudit: (event) => auditEvents.push(event),
  });
  rm.registerVersion({ assetId: 'a', version: '1.0.0' });
  rm.registerVersion({ assetId: 'a', version: '1.1.0' });
  rm.rollbackAssetVersion('a', '1.0.0', 'op');

  assert.strictEqual(auditEvents.length, 1);
  assert.strictEqual(auditEvents[0].eventType, 'rollback');
  assert.strictEqual(auditEvents[0].actor, 'op');
}

// ============================================================
// 统计与重置
// ============================================================

async function testGetStats() {
  console.log('  TC22: 获取统计');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0' });
  rm.registerVersion({ assetId: 'a', version: '1.1.0' });
  rm.rollbackAssetVersion('a', '1.0.0', 'op');

  const stats = rm.getStats();
  assert.strictEqual(stats.totalRollbacks, 1);
  assert.strictEqual(stats.totalVersions, 3); // 2 registered + 1 rollback
  assert.strictEqual(stats.byType.asset_version, 1);
  assert.strictEqual(stats.byStatus.completed, 1);
}

async function testReset() {
  console.log('  TC23: 重置');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0' });
  rm.rollbackAssetVersion('a', '1.0.0', 'op');
  rm.reset();

  assert.strictEqual(rm.versions.size, 0);
  assert.strictEqual(rm.rollbacks.size, 0);
}

// ============================================================
// 完整场景
// ============================================================

async function testFullRollbackScenario() {
  console.log('  TC24: 完整回滚场景');
  const auditEvents = [];
  const rm = createRollbackManager({
    onAudit: (event) => auditEvents.push(event),
  });

  // 注册多个版本
  rm.registerVersion({ assetId: 'login-module', version: '1.0.0', content: { code: 'v1' } });
  rm.registerVersion({ assetId: 'login-module', version: '1.1.0', content: { code: 'v1.1' } });
  rm.registerVersion({ assetId: 'login-module', version: '2.0.0', content: { code: 'v2' } });

  // 注册锁版本
  rm.registerLockVersion({ projectId: 'proj-1', lockVersion: '1.0.0', lockData: { deps: ['a'] } });
  rm.registerLockVersion({ projectId: 'proj-1', lockVersion: '2.0.0', lockData: { deps: ['a', 'b'] } });

  // 回滚资产版本
  const rb1 = rm.rollbackAssetVersion('login-module', '1.1.0', 'admin');
  assert.strictEqual(rb1.ok, true);

  // 回滚锁
  const rb2 = rm.rollbackLock('proj-1', '1.0.0', 'admin');
  assert.strictEqual(rb2.ok, true);

  // 适配器回滚
  const rb3 = rm.rollbackAdapters('proj-1', '1.1.0', ['cursor', 'claude-code']);
  assert.strictEqual(rb3.ok, true);

  // 验证所有回滚
  const v1 = rm.verifyRollback('proj-1', rb1.rollback.rollbackId);
  assert.strictEqual(v1.ok, true);
  const v2 = rm.verifyRollback('proj-1', rb2.rollback.rollbackId);
  assert.strictEqual(v2.ok, true);
  const v3 = rm.verifyRollback('proj-1', rb3.rollback.rollbackId);
  assert.strictEqual(v3.ok, true);

  // 统计
  const stats = rm.getStats();
  assert.strictEqual(stats.totalRollbacks, 3);
  // 版本数 = 3 初始 + 1 资产回滚产生的新版本（锁回滚和适配器回滚不创建资产版本）
  assert.strictEqual(stats.totalVersions, 4);
  assert.strictEqual(stats.byStatus.verified, 3);

  // 审计：3 次回滚 + 3 次验证 = 6 个事件
  assert.strictEqual(auditEvents.length, 6);
  assert.ok(auditEvents.every(e => e.eventType === 'rollback'));
}

// ============================================================
// 返回副本
// ============================================================

async function testReturnCopyNotReference() {
  console.log('  TC25: 返回副本而非引用');
  const rm = createRollbackManager();
  rm.registerVersion({ assetId: 'a', version: '1.0.0', content: { x: 1 } });
  rm.registerVersion({ assetId: 'a', version: '1.1.0', content: { x: 2 } });
  const rb = rm.rollbackAssetVersion('a', '1.0.0', 'op');

  const r1 = rm.getRollback(rb.rollback.rollbackId);
  r1.assetId = 'modified';

  const r2 = rm.getRollback(rb.rollback.rollbackId);
  assert.strictEqual(r2.assetId, 'a');
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== rollback.test.js ===');

  const tests = [
    testConstantsExist,
    testRegisterVersion,
    testRegisterVersionMissingFields,
    testListVersions,
    testRegisterLockVersion,
    testRegisterLockVersionMissingFields,
    testRollbackAssetVersion,
    testRollbackAssetVersionNotFound,
    testRollbackAssetVersionMissingFields,
    testRollbackPreservesOldVersions,
    testRollbackLock,
    testRollbackLockNotFound,
    testRollbackLockMissingFields,
    testRollbackAdapters,
    testRollbackAdaptersMissingFields,
    testVerifyRollback,
    testVerifyRollbackNotFound,
    testVerifyRollbackAlreadyVerified,
    testGetRollbackHistory,
    testGetRollback,
    testAuditCallback,
    testGetStats,
    testReset,
    testFullRollbackScenario,
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
