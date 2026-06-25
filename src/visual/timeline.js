'use strict';

/**
 * RunTimeline — 单次 Run 的时间线聚合与展示
 * 从事件列表聚合出阶段时间线，支持按阶段/事件类型分组、摘要生成
 */

const STAGE_ORDER = [
  'pre-task', 'pre-edit', 'post-edit', 'pre-test', 'post-test', 'repair', 'archive'
];

const SEVERITY_RANK = { info: 0, warn: 1, error: 2, blocking: 3 };
const STATUS_SEVERITY = {
  success: 'info',
  skipped: 'info',
  failed: 'error',
  blocked: 'blocking'
};

/**
 * 取阶段内最严重的状态
 * @param {object[]} events
 * @returns {string}
 */
function resolveStageStatus(events) {
  let worst = 'success';
  let worstRank = -1;
  for (const e of events) {
    const sev = e.severity || STATUS_SEVERITY[e.status] || 'info';
    const rank = SEVERITY_RANK[sev] ?? 0;
    if (rank > worstRank) {
      worstRank = rank;
      worst = e.status || 'success';
    }
  }
  return worst;
}

/**
 * 提取失败原因
 * @param {object[]} events
 * @returns {string|null}
 */
function extractFailureReason(events) {
  const failed = events.filter(e => e.status === 'failed' || e.status === 'blocked');
  if (failed.length === 0) return null;
  return failed[failed.length - 1].message || failed[failed.length - 1].eventType;
}

class RunTimeline {
  constructor(options = {}) {
    this._runId = options.runId || '';
    this._stages = [];
    this._totalDurationMs = 0;
    this._totalEvents = 0;
    this._failureCount = 0;
    this._groupedByType = {};
  }

  /**
   * 固定阶段排序列表
   * @returns {string[]}
   */
  getStageOrder() {
    return [...STAGE_ORDER];
  }

  /**
   * 按阶段分组
   * @param {object[]} events
   * @returns {Map<string, object[]>}
   */
  groupByStage(events) {
    const map = new Map();
    for (const stage of STAGE_ORDER) {
      map.set(stage, []);
    }
    for (const e of events) {
      const stage = e.stage || 'pre-task';
      if (!map.has(stage)) map.set(stage, []);
      map.get(stage).push(e);
    }
    return map;
  }

  /**
   * 按事件类型分组
   * @param {object[]} events
   * @returns {Map<string, object[]>}
   */
  groupByEventType(events) {
    const map = new Map();
    for (const e of events) {
      const type = e.eventType || 'unknown';
      if (!map.has(type)) map.set(type, []);
      map.get(type).push(e);
    }
    return map;
  }

  /**
   * 获取某阶段详情
   * @param {string} stageName
   * @returns {object|null}
   */
  getStageDetail(stageName) {
    return this._stages.find(s => s.name === stageName) || null;
  }

  /**
   * 从事件列表聚合出时间线
   * @param {object[]} events
   * @returns {object}
   */
  aggregate(events) {
    if (!Array.isArray(events) || events.length === 0) {
      this._stages = [];
      this._totalDurationMs = 0;
      this._totalEvents = 0;
      this._failureCount = 0;
      this._groupedByType = {};
      return this.toJSON();
    }

    // 推断 runId
    if (!this._runId && events[0].runId) {
      this._runId = events[0].runId;
    }

    const grouped = this.groupByStage(events);
    const typeGrouped = this.groupByEventType(events);
    this._groupedByType = {};
    for (const [type, evts] of typeGrouped) {
      this._groupedByType[type] = evts;
    }

    const stages = [];
    let totalDurationMs = 0;
    let failureCount = 0;

    for (const stageName of STAGE_ORDER) {
      const stageEvents = grouped.get(stageName) || [];
      if (stageEvents.length === 0) continue;

      const timestamps = stageEvents
        .map(e => e.timestamp ? new Date(e.timestamp).getTime() : 0)
        .filter(t => t > 0)
        .sort((a, b) => a - b);

      const startedAt = timestamps.length > 0 ? new Date(timestamps[0]).toISOString() : null;
      const completedAt = timestamps.length > 0 ? new Date(timestamps[timestamps.length - 1]).toISOString() : null;
      const durationMs = timestamps.length > 1
        ? timestamps[timestamps.length - 1] - timestamps[0]
        : 0;

      const status = resolveStageStatus(stageEvents);
      const failureReason = extractFailureReason(stageEvents);

      if (status === 'failed' || status === 'blocked') {
        failureCount++;
      }

      stages.push({
        name: stageName,
        status,
        events: stageEvents,
        startedAt,
        completedAt,
        durationMs,
        failureReason
      });

      totalDurationMs += durationMs;
    }

    this._stages = stages;
    this._totalDurationMs = totalDurationMs;
    this._totalEvents = events.length;
    this._failureCount = failureCount;

    return this.toJSON();
  }

  /**
   * 摘要
   * @returns {object}
   */
  getSummary() {
    return {
      runId: this._runId,
      totalEvents: this._totalEvents,
      totalDurationMs: this._totalDurationMs,
      failureCount: this._failureCount,
      stageCount: this._stages.length,
      stages: this._stages.map(s => ({
        name: s.name,
        status: s.status,
        eventCount: s.events.length,
        durationMs: s.durationMs,
        failureReason: s.failureReason
      }))
    };
  }

  /**
   * 序列化（剥离 events 详情，只保留数量）
   * @returns {object}
   */
  toJSON() {
    return {
      runId: this._runId,
      stages: this._stages.map(s => ({
        name: s.name,
        status: s.status,
        eventCount: s.events.length,
        startedAt: s.startedAt,
        completedAt: s.completedAt,
        durationMs: s.durationMs,
        failureReason: s.failureReason
      })),
      totalDurationMs: this._totalDurationMs,
      totalEvents: this._totalEvents,
      failureCount: this._failureCount
    };
  }
}

/**
 * 工厂函数
 * @param {object} [options]
 * @returns {RunTimeline}
 */
function createTimeline(options) {
  return new RunTimeline(options);
}

module.exports = {
  STAGE_ORDER,
  SEVERITY_RANK,
  STATUS_SEVERITY,
  resolveStageStatus,
  extractFailureReason,
  RunTimeline,
  createTimeline
};
