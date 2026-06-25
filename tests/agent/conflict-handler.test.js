/**
 * Conflict Handler 测试
 */

const assert = require('assert');

const {
  FileLockManager,
  ApprovalQueue,
  ConflictHandler,
  detectConflicts,
} = require('../../src/agent/conflict-handler');

// ============================================================
// FileLockManager 测试
// ============================================================

async function testLockAcquire() {
  console.log('  TC01: 获取文件锁');
  const manager = new FileLockManager();
  const result = manager.acquire('src/main.js', 'agent-1');
  assert.strictEqual(result.ok, true);
  assert.ok(manager.getLock('src/main.js'));
}

async function testLockConflict() {
  console.log('  TC02: 文件锁冲突');
  const manager = new FileLockManager();
  manager.acquire('src/main.js', 'agent-1');
  const result = manager.acquire('src/main.js', 'agent-2');
  assert.strictEqual(result.ok, false);
  assert.ok(result.error.includes('agent-1'));
}

async function testLockReacquire() {
  console.log('  TC03: 同一 Agent 重复获取锁');
  const manager = new FileLockManager();
  manager.acquire('src/main.js', 'agent-1');
  const result = manager.acquire('src/main.js', 'agent-1');
  assert.strictEqual(result.ok, true);
}

async function testLockRelease() {
  console.log('  TC04: 释放文件锁');
  const manager = new FileLockManager();
  manager.acquire('src/main.js', 'agent-1');
  const result = manager.release('src/main.js', 'agent-1');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(manager.getLock('src/main.js'), null);
}

async function testLockReleaseByWrongAgent() {
  console.log('  TC05: 非锁持有者释放被拒绝');
  const manager = new FileLockManager();
  manager.acquire('src/main.js', 'agent-1');
  const result = manager.release('src/main.js', 'agent-2');
  assert.strictEqual(result.ok, false);
}

async function testLockForceRelease() {
  console.log('  TC06: 强制释放锁');
  const manager = new FileLockManager();
  manager.acquire('src/main.js', 'agent-1');
  manager.forceRelease('src/main.js');
  assert.strictEqual(manager.getLock('src/main.js'), null);
}

async function testLockReleaseAll() {
  console.log('  TC07: 释放 Agent 所有锁');
  const manager = new FileLockManager();
  manager.acquire('a.js', 'agent-1');
  manager.acquire('b.js', 'agent-1');
  manager.acquire('c.js', 'agent-2');
  const released = manager.releaseAll('agent-1');
  assert.strictEqual(released.length, 2);
  assert.ok(released.includes('a.js'));
  assert.ok(released.includes('b.js'));
  assert.ok(manager.getLock('c.js'));
}

async function testGetAgentLocks() {
  console.log('  TC08: 获取 Agent 锁列表');
  const manager = new FileLockManager();
  manager.acquire('a.js', 'agent-1');
  manager.acquire('b.js', 'agent-1');
  manager.acquire('c.js', 'agent-2');
  const locks = manager.getAgentLocks('agent-1');
  assert.strictEqual(locks.length, 2);
  assert.ok(locks.includes('a.js'));
  assert.ok(locks.includes('b.js'));
}

async function testGetAllLocks() {
  console.log('  TC09: 获取所有锁');
  const manager = new FileLockManager();
  manager.acquire('a.js', 'agent-1');
  manager.acquire('b.js', 'agent-2');
  assert.strictEqual(manager.getAllLocks().length, 2);
}

// ============================================================
// detectConflicts 测试
// ============================================================

async function testDetectNoConflict() {
  console.log('  TC10: 无冲突');
  const conflicts = detectConflicts([
    { agentId: 'agent-1', files: ['a.js', 'b.js'] },
    { agentId: 'agent-2', files: ['c.js', 'd.js'] },
  ]);
  assert.strictEqual(conflicts.length, 0);
}

async function testDetectConflict() {
  console.log('  TC11: 检测到冲突');
  const conflicts = detectConflicts([
    { agentId: 'agent-1', files: ['a.js', 'b.js'] },
    { agentId: 'agent-2', files: ['b.js', 'c.js'] },
  ]);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].filePath, 'b.js');
  assert.ok(conflicts[0].agents.includes('agent-1'));
  assert.ok(conflicts[0].agents.includes('agent-2'));
}

async function testDetectMultipleConflicts() {
  console.log('  TC12: 多文件冲突');
  const conflicts = detectConflicts([
    { agentId: 'agent-1', files: ['a.js', 'b.js'] },
    { agentId: 'agent-2', files: ['a.js', 'b.js'] },
  ]);
  assert.strictEqual(conflicts.length, 2);
}

async function testDetectThreeWayConflict() {
  console.log('  TC13: 三方冲突');
  const conflicts = detectConflicts([
    { agentId: 'agent-1', files: ['a.js'] },
    { agentId: 'agent-2', files: ['a.js'] },
    { agentId: 'agent-3', files: ['a.js'] },
  ]);
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].agents.length, 3);
}

// ============================================================
// ApprovalQueue 测试
// ============================================================

async function testApprovalSubmit() {
  console.log('  TC14: 提交审批请求');
  const queue = new ApprovalQueue();
  const request = queue.submit({ agentId: 'agent-1', type: 'file-conflict', details: { file: 'a.js' } });
  assert.ok(request.id);
  assert.strictEqual(request.status, 'pending');
  assert.strictEqual(queue.getPending().length, 1);
}

async function testApprovalApprove() {
  console.log('  TC15: 批准请求');
  const queue = new ApprovalQueue();
  const request = queue.submit({ agentId: 'agent-1', type: 'file-conflict', details: {} });
  const result = queue.approve(request.id, 'admin', 'OK');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(queue.getPending().length, 0);
  assert.strictEqual(queue.getProcessed().length, 1);
  assert.strictEqual(queue.getProcessed()[0].status, 'approved');
}

async function testApprovalReject() {
  console.log('  TC16: 拒绝请求');
  const queue = new ApprovalQueue();
  const request = queue.submit({ agentId: 'agent-1', type: 'file-conflict', details: {} });
  const result = queue.reject(request.id, 'admin', '不允许');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(queue.getProcessed()[0].status, 'rejected');
}

async function testApprovalNotFound() {
  console.log('  TC17: 审批请求不存在');
  const queue = new ApprovalQueue();
  assert.strictEqual(queue.approve('nonexistent').ok, false);
  assert.strictEqual(queue.reject('nonexistent').ok, false);
}

async function testApprovalStats() {
  console.log('  TC18: 审批统计');
  const queue = new ApprovalQueue();
  queue.submit({ agentId: 'agent-1', type: 'file-conflict', details: {} });
  queue.submit({ agentId: 'agent-2', type: 'manual-review', details: {} });
  const req3 = queue.submit({ agentId: 'agent-3', type: 'file-conflict', details: {} });
  queue.approve(req3.id);
  const stats = queue.getStats();
  assert.strictEqual(stats.pending, 2);
  assert.strictEqual(stats.approved, 1);
  assert.strictEqual(stats.rejected, 0);
}

async function testApprovalFilterByAgent() {
  console.log('  TC19: 按 Agent 过滤待审批');
  const queue = new ApprovalQueue();
  queue.submit({ agentId: 'agent-1', type: 'file-conflict', details: {} });
  queue.submit({ agentId: 'agent-2', type: 'file-conflict', details: {} });
  assert.strictEqual(queue.getPending('agent-1').length, 1);
  assert.strictEqual(queue.getPending('agent-3').length, 0);
}

// ============================================================
// ConflictHandler 整合测试
// ============================================================

async function testConflictHandlerLockOrQueue() {
  console.log('  TC20: 锁定成功');
  const handler = new ConflictHandler();
  const result = handler.lockOrQueue('a.js', 'agent-1');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.locked, true);
}

async function testConflictHandlerLockConflictQueue() {
  console.log('  TC21: 锁冲突时自动提交审批');
  const handler = new ConflictHandler();
  handler.lockOrQueue('a.js', 'agent-1');
  const result = handler.lockOrQueue('a.js', 'agent-2');
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.locked, false);
  assert.ok(result.approvalId);
  assert.strictEqual(handler.approvalQueue.getPending().length, 1);
}

async function testConflictHandlerReleaseAgent() {
  console.log('  TC22: 释放 Agent 所有资源');
  const handler = new ConflictHandler();
  handler.lockOrQueue('a.js', 'agent-1');
  handler.lockOrQueue('b.js', 'agent-1');
  handler.releaseAgent('agent-1');
  assert.strictEqual(handler.fileLockManager.getAgentLocks('agent-1').length, 0);
}

async function testConflictHandlerGetStatus() {
  console.log('  TC23: 获取状态');
  const handler = new ConflictHandler();
  handler.lockOrQueue('a.js', 'agent-1');
  handler.lockOrQueue('a.js', 'agent-2');
  const status = handler.getStatus();
  assert.strictEqual(status.activeLocks, 1);
  assert.strictEqual(status.pendingApprovals, 1);
}

// ============================================================
// 主测试入口
// ============================================================

async function main() {
  console.log('=== conflict-handler.test.js ===');

  const tests = [
    testLockAcquire,
    testLockConflict,
    testLockReacquire,
    testLockRelease,
    testLockReleaseByWrongAgent,
    testLockForceRelease,
    testLockReleaseAll,
    testGetAgentLocks,
    testGetAllLocks,
    testDetectNoConflict,
    testDetectConflict,
    testDetectMultipleConflicts,
    testDetectThreeWayConflict,
    testApprovalSubmit,
    testApprovalApprove,
    testApprovalReject,
    testApprovalNotFound,
    testApprovalStats,
    testApprovalFilterByAgent,
    testConflictHandlerLockOrQueue,
    testConflictHandlerLockConflictQueue,
    testConflictHandlerReleaseAgent,
    testConflictHandlerGetStatus,
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
