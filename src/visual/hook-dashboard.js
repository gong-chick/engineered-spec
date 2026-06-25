'use strict';

/**
 * HookDashboard — Hook/Test/Repair 结果分析与可视化
 * 支持 Hook 通过率、Test 通过率、Repair 成功率、失败原因分类
 */

const HOOK_EVENT_TYPES = ['hook.passed', 'hook.failed', 'hook.skipped'];
const TEST_EVENT_TYPES = ['test.passed', 'test.failed', 'test.skipped'];
const REPAIR_EVENT_TYPES = ['repair.attempt', 'repair.success', 'repair.failed'];

class HookDashboard {
  /**
   * 分析 Hook 事件 → 返回 hook 视图
   * @param {object[]} events
   * @returns {object[]}
   */
  analyzeHookResults(events) {
    const hookEvents = (events || []).filter(e => HOOK_EVENT_TYPES.includes(e.eventType));
    const byHookId = new Map();

    for (const e of hookEvents) {
      const hookId = e.metadata?.hookId || e.eventType;
      if (!byHookId.has(hookId)) {
        byHookId.set(hookId, {
          hookId,
          hookType: e.stage || 'unknown',
          totalRuns: 0,
          passCount: 0,
          failCount: 0,
          skipCount: 0,
          failures: [],
          durations: []
        });
      }
      const hook = byHookId.get(hookId);
      hook.totalRuns++;

      if (e.eventType === 'hook.passed') hook.passCount++;
      else if (e.eventType === 'hook.failed') {
        hook.failCount++;
        hook.failures.push({
          eventId: e.eventId,
          reason: e.message,
          timestamp: e.timestamp
        });
      }
      else if (e.eventType === 'hook.skipped') hook.skipCount++;

      if (e.metadata?.durationMs) {
        hook.durations.push(e.metadata.durationMs);
      }
    }

    return Array.from(byHookId.values()).map(h => ({
      hookId: h.hookId,
      hookType: h.hookType,
      totalRuns: h.totalRuns,
      passCount: h.passCount,
      failCount: h.failCount,
      skipCount: h.skipCount,
      failures: h.failures,
      avgDurationMs: h.durations.length > 0
        ? Math.round(h.durations.reduce((a, b) => a + b, 0) / h.durations.length)
        : 0
    }));
  }

  /**
   * 分析 Test 事件 → 返回 test 视图
   * @param {object[]} events
   * @returns {object}
   */
  analyzeTestResults(events) {
    const testEvents = (events || []).filter(e => TEST_EVENT_TYPES.includes(e.eventType));
    let passed = 0;
    let failed = 0;
    let skipped = 0;
    const failures = [];

    for (const e of testEvents) {
      if (e.eventType === 'test.passed') passed++;
      else if (e.eventType === 'test.failed') {
        failed++;
        failures.push({
          eventId: e.eventId,
          testName: e.metadata?.testName || e.message,
          reason: e.message,
          timestamp: e.timestamp
        });
      }
      else if (e.eventType === 'test.skipped') skipped++;
    }

    const total = passed + failed + skipped;
    return {
      totalTests: total,
      passed,
      failed,
      skipped,
      passRate: total > 0 ? Math.round((passed / total) * 10000) / 100 : 0,
      failures
    };
  }

  /**
   * 分析 Repair 事件 → 返回 repair 视图
   * @param {object[]} events
   * @returns {object}
   */
  analyzeRepairResults(events) {
    const repairEvents = (events || []).filter(e => REPAIR_EVENT_TYPES.includes(e.eventType));
    let totalRepairs = 0;
    let successful = 0;
    let failed = 0;
    const repairs = [];
    const byRunId = new Map();

    for (const e of repairEvents) {
      const runId = e.runId || 'unknown';
      if (!byRunId.has(runId)) {
        byRunId.set(runId, { attempts: 0, finalStatus: 'unknown', reason: null });
      }
      const run = byRunId.get(runId);

      if (e.eventType === 'repair.attempt') run.attempts++;
      if (e.eventType === 'repair.success') run.finalStatus = 'success';
      if (e.eventType === 'repair.failed') {
        run.finalStatus = 'failed';
        run.reason = e.message;
      }
    }

    for (const [runId, run] of byRunId) {
      totalRepairs++;
      if (run.finalStatus === 'success') successful++;
      else failed++;

      repairs.push({
        runId,
        attempts: run.attempts,
        finalStatus: run.finalStatus,
        reason: run.reason
      });
    }

    const totalAttempts = repairs.reduce((sum, r) => sum + r.attempts, 0);
    return {
      totalRepairs,
      successful,
      failed,
      avgAttempts: totalRepairs > 0 ? Math.round((totalAttempts / totalRepairs) * 100) / 100 : 0,
      repairs
    };
  }

  /**
   * 失败摘要：失败原因分类 + 修复次数统计
   * @param {object[]} events
   * @returns {object}
   */
  getFailureSummary(events) {
    const all = events || [];
    const failures = all.filter(e => e.status === 'failed' || e.status === 'blocked');

    const byReason = {};
    const byStage = {};

    for (const e of failures) {
      const reason = e.message || e.eventType || 'unknown';
      byReason[reason] = (byReason[reason] || 0) + 1;
      const stage = e.stage || 'unknown';
      byStage[stage] = (byStage[stage] || 0) + 1;
    }

    // 最高频失败原因
    let topFailureReason = null;
    let maxCount = 0;
    for (const [reason, count] of Object.entries(byReason)) {
      if (count > maxCount) {
        maxCount = count;
        topFailureReason = reason;
      }
    }

    // 修复成功率
    const repairEvents = all.filter(e => REPAIR_EVENT_TYPES.includes(e.eventType));
    const repairSuccesses = repairEvents.filter(e => e.eventType === 'repair.success').length;
    const repairTotal = repairEvents.filter(e => e.eventType === 'repair.success' || e.eventType === 'repair.failed').length;

    return {
      totalFailures: failures.length,
      byReason,
      byStage,
      topFailureReason,
      repairSuccessRate: repairTotal > 0 ? Math.round((repairSuccesses / repairTotal) * 10000) / 100 : 0
    };
  }
}

/**
 * 工厂函数
 * @param {object} [options]
 * @returns {HookDashboard}
 */
function createHookDashboard(options = {}) {
  return new HookDashboard(options);
}

module.exports = {
  HOOK_EVENT_TYPES,
  TEST_EVENT_TYPES,
  REPAIR_EVENT_TYPES,
  HookDashboard,
  createHookDashboard
};
