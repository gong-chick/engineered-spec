'use strict';

/**
 * MetricsEngine — 质量指标与趋势分析
 * 统计任务成功率、首次通过率、修复成功率、Hook 失败率、Rule 命中率
 */

const VALID_WINDOWS = ['daily', 'weekly'];

class MetricsEngine {
  constructor(options = {}) {
    this._metrics = null;
    this._computedAt = null;
    this._totalRuns = 0;
    this._totalEvents = 0;
  }

  /**
   * 从全量事件计算指标
   * @param {object[]} allEvents
   * @returns {object}
   */
  compute(allEvents) {
    if (!Array.isArray(allEvents) || allEvents.length === 0) {
      this._metrics = {
        taskSuccessRate: 0,
        firstPassRate: 0,
        repairSuccessRate: 0,
        hookFailureRate: 0,
        ruleHitRate: 0,
        computedAt: new Date().toISOString(),
        totalRuns: 0,
        totalEvents: 0
      };
      this._computedAt = this._metrics.computedAt;
      this._totalRuns = 0;
      this._totalEvents = 0;
      return this._metrics;
    }

    this._totalEvents = allEvents.length;

    // 按 runId 分组
    const runs = new Map();
    for (const e of allEvents) {
      const runId = e.runId || 'unknown';
      if (!runs.has(runId)) runs.set(runId, []);
      runs.get(runId).push(e);
    }
    this._totalRuns = runs.size;

    // 任务成功率：最终状态为 success 的 run 占比
    let successRuns = 0;
    for (const [, events] of runs) {
      const lastEvent = events[events.length - 1];
      if (lastEvent.status === 'success') successRuns++;
    }
    const taskSuccessRate = runs.size > 0
      ? Math.round((successRuns / runs.size) * 10000) / 10000
      : 0;

    // 首次通过率：无 repair 事件直接成功的 run 占比
    let firstPassRuns = 0;
    for (const [runId, events] of runs) {
      const hasRepair = events.some(e =>
        e.eventType === 'repair.attempt' ||
        e.eventType === 'repair.success' ||
        e.eventType === 'repair.failed'
      );
      const lastEvent = events[events.length - 1];
      if (!hasRepair && lastEvent.status === 'success') firstPassRuns++;
    }
    const firstPassRate = runs.size > 0
      ? Math.round((firstPassRuns / runs.size) * 10000) / 10000
      : 0;

    // 修复成功率：有 repair 事件最终成功的 run 占比
    let repairRuns = 0;
    let repairSuccessRuns = 0;
    for (const [, events] of runs) {
      const hasRepair = events.some(e =>
        e.eventType === 'repair.attempt' ||
        e.eventType === 'repair.success' ||
        e.eventType === 'repair.failed'
      );
      if (hasRepair) {
        repairRuns++;
        const lastEvent = events[events.length - 1];
        if (lastEvent.status === 'success') repairSuccessRuns++;
      }
    }
    const repairSuccessRate = repairRuns > 0
      ? Math.round((repairSuccessRuns / repairRuns) * 10000) / 10000
      : 0;

    // Hook 失败率：hook.failed 事件占总 hook 事件比例
    const hookEvents = allEvents.filter(e =>
      e.eventType === 'hook.passed' ||
      e.eventType === 'hook.failed' ||
      e.eventType === 'hook.skipped'
    );
    const hookFailures = hookEvents.filter(e => e.eventType === 'hook.failed');
    const hookFailureRate = hookEvents.length > 0
      ? Math.round((hookFailures.length / hookEvents.length) * 10000) / 10000
      : 0;

    // Rule 命中率：policy_denied 事件占总事件比例
    const policyDenied = allEvents.filter(e => e.eventType === 'policy_denied');
    const ruleHitRate = allEvents.length > 0
      ? Math.round((policyDenied.length / allEvents.length) * 10000) / 10000
      : 0;

    this._metrics = {
      taskSuccessRate,
      firstPassRate,
      repairSuccessRate,
      hookFailureRate,
      ruleHitRate,
      computedAt: new Date().toISOString(),
      totalRuns: runs.size,
      totalEvents: allEvents.length
    };
    this._computedAt = this._metrics.computedAt;

    return this._metrics;
  }

  getTaskSuccessRate() {
    return this._metrics?.taskSuccessRate ?? 0;
  }

  getFirstPassRate() {
    return this._metrics?.firstPassRate ?? 0;
  }

  getRepairSuccessRate() {
    return this._metrics?.repairSuccessRate ?? 0;
  }

  getHookFailureRate() {
    return this._metrics?.hookFailureRate ?? 0;
  }

  getRuleHitRate() {
    return this._metrics?.ruleHitRate ?? 0;
  }

  /**
   * 趋势：按时间窗口聚合
   * @param {string} metricName
   * @param {string} window — 'daily' | 'weekly'
   * @param {object[]} allEvents
   * @returns {object}
   */
  getTrend(metricName, window, allEvents) {
    if (!VALID_WINDOWS.includes(window)) {
      return { metricName, window, dataPoints: [], error: `非法 window: ${window}` };
    }
    if (!Array.isArray(allEvents) || allEvents.length === 0) {
      return { metricName, window, dataPoints: [] };
    }

    // 按时间窗口分桶
    const buckets = new Map();
    for (const e of allEvents) {
      if (!e.timestamp) continue;
      const d = new Date(e.timestamp);
      if (isNaN(d.getTime())) continue;

      let key;
      if (window === 'daily') {
        key = d.toISOString().slice(0, 10);
      } else {
        // weekly: ISO 周一所在日期
        const day = d.getUTCDay();
        const diff = day === 0 ? 6 : day - 1;
        const monday = new Date(d);
        monday.setUTCDate(d.getUTCDate() - diff);
        key = monday.toISOString().slice(0, 10);
      }

      if (!buckets.has(key)) buckets.set(key, []);
      buckets.get(key).push(e);
    }

    // 每个桶计算指标
    const sortedKeys = Array.from(buckets.keys()).sort();
    const dataPoints = sortedKeys.map(period => {
      const events = buckets.get(period);
      const value = this._computeMetric(metricName, events);
      return { period, value, sampleSize: events.length };
    });

    return { metricName, window, dataPoints };
  }

  /**
   * 在单个桶内计算指定指标
   * @param {string} metricName
   * @param {object[]} events
   * @returns {number}
   */
  _computeMetric(metricName, events) {
    const runs = new Map();
    for (const e of events) {
      const runId = e.runId || 'unknown';
      if (!runs.has(runId)) runs.set(runId, []);
      runs.get(runId).push(e);
    }

    switch (metricName) {
      case 'taskSuccessRate': {
        let success = 0;
        for (const [, evts] of runs) {
          if (evts[evts.length - 1].status === 'success') success++;
        }
        return runs.size > 0 ? Math.round((success / runs.size) * 10000) / 10000 : 0;
      }
      case 'firstPassRate': {
        let firstPass = 0;
        for (const [, evts] of runs) {
          const hasRepair = evts.some(e =>
            e.eventType === 'repair.attempt' ||
            e.eventType === 'repair.success' ||
            e.eventType === 'repair.failed'
          );
          if (!hasRepair && evts[evts.length - 1].status === 'success') firstPass++;
        }
        return runs.size > 0 ? Math.round((firstPass / runs.size) * 10000) / 10000 : 0;
      }
      case 'repairSuccessRate': {
        let repairRuns = 0;
        let repairSuccess = 0;
        for (const [, evts] of runs) {
          const hasRepair = evts.some(e =>
            e.eventType === 'repair.attempt' ||
            e.eventType === 'repair.success' ||
            e.eventType === 'repair.failed'
          );
          if (hasRepair) {
            repairRuns++;
            if (evts[evts.length - 1].status === 'success') repairSuccess++;
          }
        }
        return repairRuns > 0 ? Math.round((repairSuccess / repairRuns) * 10000) / 10000 : 0;
      }
      case 'hookFailureRate': {
        const hookEvents = events.filter(e =>
          e.eventType === 'hook.passed' ||
          e.eventType === 'hook.failed' ||
          e.eventType === 'hook.skipped'
        );
        const failures = hookEvents.filter(e => e.eventType === 'hook.failed');
        return hookEvents.length > 0 ? Math.round((failures.length / hookEvents.length) * 10000) / 10000 : 0;
      }
      case 'ruleHitRate': {
        const denied = events.filter(e => e.eventType === 'policy_denied');
        return events.length > 0 ? Math.round((denied.length / events.length) * 10000) / 10000 : 0;
      }
      default:
        return 0;
    }
  }

  toJSON() {
    return this._metrics || {
      taskSuccessRate: 0,
      firstPassRate: 0,
      repairSuccessRate: 0,
      hookFailureRate: 0,
      ruleHitRate: 0,
      computedAt: null,
      totalRuns: 0,
      totalEvents: 0
    };
  }
}

function createMetricsEngine(options) {
  return new MetricsEngine(options);
}

module.exports = {
  VALID_WINDOWS,
  MetricsEngine,
  createMetricsEngine
};
