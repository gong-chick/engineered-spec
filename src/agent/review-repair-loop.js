/**
 * Review/Repair Loop — Review → Repair → Re-test 闭环
 *
 * 管理 Agent 的审查-修复循环，控制最大修复次数和升级策略。
 */

const { AGENT_STATES, ESCALATION_POLICIES } = require('./agent-types');

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_LOOP_CONFIG = Object.freeze({
  /** 最大修复次数 */
  maxRepairAttempts: 2,
  /** 最大审查次数 */
  maxReviewAttempts: 3,
  /** 超时时间（毫秒） */
  timeout: 600000,
  /** 超时后的升级策略 */
  timeoutPolicy: ESCALATION_POLICIES.BLOCK,
  /** 修复失败后的升级策略 */
  repairFailurePolicy: ESCALATION_POLICIES.BLOCK,
});

// ============================================================
// ReviewRepairLoop
// ============================================================

class ReviewRepairLoop {
  /**
   * @param {Object} [config] - 配置覆盖
   */
  constructor(config = {}) {
    this.config = { ...DEFAULT_LOOP_CONFIG, ...config };

    /** 当前修复次数 */
    this.repairCount = 0;
    /** 当前审查次数 */
    this.reviewCount = 0;
    /** 循环是否已完成 */
    this.completed = false;
    /** 循环是否已失败 */
    this.failed = false;
    /** 最终状态 */
    this.finalStatus = null;
    /** 事件日志 */
    this.events = [];
    /** 开始时间 */
    this.startedAt = new Date().toISOString();
  }

  // ============================================================
  // 事件记录
  // ============================================================

  /**
   * 记录事件
   * @param {string} type - 事件类型
   * @param {Object} data - 事件数据
   */
  recordEvent(type, data = {}) {
    this.events.push({
      type,
      data,
      timestamp: new Date().toISOString(),
      repairCount: this.repairCount,
      reviewCount: this.reviewCount,
    });
  }

  // ============================================================
  // Review 阶段
  // ============================================================

  /**
   * 开始审查
   * @returns {{ ok: boolean, state: string, error?: string }}
   */
  startReview() {
    if (this.completed || this.failed) {
      return { ok: false, state: this.completed ? 'completed' : 'failed', error: '循环已结束' };
    }

    if (this.reviewCount >= this.config.maxReviewAttempts) {
      this.fail('超过最大审查次数');
      return { ok: false, state: 'failed', error: '超过最大审查次数' };
    }

    this.reviewCount++;
    this.recordEvent('review_start', { reviewCount: this.reviewCount });

    return { ok: true, state: AGENT_STATES.REVIEWING };
  }

  /**
   * 审查通过
   * @param {Object} [reviewResult] - 审查结果
   * @returns {{ ok: boolean, state: string }}
   */
  approveReview(reviewResult = {}) {
    this.completed = true;
    this.finalStatus = 'approved';
    this.recordEvent('review_approved', reviewResult);
    return { ok: true, state: AGENT_STATES.COMPLETED };
  }

  /**
   * 审查不通过，需要修复
   * @param {Object} [reviewResult] - 审查结果（含问题列表）
   * @returns {{ ok: boolean, state: string, needsRepair: boolean, error?: string }}
   */
  rejectReview(reviewResult = {}) {
    if (this.completed || this.failed) {
      return { ok: false, state: this.completed ? 'completed' : 'failed', needsRepair: false, error: '循环已结束' };
    }

    this.recordEvent('review_rejected', reviewResult);
    return { ok: true, state: AGENT_STATES.REPAIRING, needsRepair: true };
  }

  // ============================================================
  // Repair 阶段
  // ============================================================

  /**
   * 开始修复
   * @returns {{ ok: boolean, state: string, error?: string }}
   */
  startRepair() {
    if (this.completed || this.failed) {
      return { ok: false, state: this.completed ? 'completed' : 'failed', error: '循环已结束' };
    }

    if (this.repairCount >= this.config.maxRepairAttempts) {
      this.fail('超过最大修复次数');
      return { ok: false, state: 'failed', error: '超过最大修复次数' };
    }

    this.repairCount++;
    this.recordEvent('repair_start', { repairCount: this.repairCount });

    return { ok: true, state: AGENT_STATES.REPAIRING };
  }

  /**
   * 修复完成，重新进入审查
   * @param {Object} [repairResult] - 修复结果
   * @returns {{ ok: boolean, state: string }}
   */
  completeRepair(repairResult = {}) {
    this.recordEvent('repair_complete', repairResult);
    return { ok: true, state: AGENT_STATES.REVIEWING };
  }

  /**
   * 修复失败
   * @param {Object} [repairResult] - 修复结果
   * @returns {{ ok: boolean, state: string, escalation: string }}
   */
  failRepair(repairResult = {}) {
    this.recordEvent('repair_failed', repairResult);

    const policy = this.config.repairFailurePolicy;

    if (policy === ESCALATION_POLICIES.RETRY && this.repairCount < this.config.maxRepairAttempts) {
      return { ok: true, state: AGENT_STATES.REPAIRING, escalation: 'retry' };
    }

    if (policy === ESCALATION_POLICIES.SKIP) {
      this.completed = true;
      this.finalStatus = 'skipped';
      this.recordEvent('escalation_skip', {});
      return { ok: true, state: AGENT_STATES.COMPLETED, escalation: 'skip' };
    }

    // BLOCK 或 ABORT
    this.fail(`修复失败，升级策略: ${policy}`);
    return { ok: true, state: AGENT_STATES.FAILED, escalation: policy };
  }

  // ============================================================
  // 超时处理
  // ============================================================

  /**
   * 检查是否超时
   * @returns {boolean}
   */
  isTimedOut() {
    const elapsed = Date.now() - new Date(this.startedAt).getTime();
    return elapsed > this.config.timeout;
  }

  /**
   * 处理超时
   * @returns {{ ok: boolean, state: string, escalation: string }}
   */
  handleTimeout() {
    this.recordEvent('timeout', { elapsed: Date.now() - new Date(this.startedAt).getTime() });

    const policy = this.config.timeoutPolicy;

    if (policy === ESCALATION_POLICIES.SKIP) {
      this.completed = true;
      this.finalStatus = 'timeout_skipped';
      return { ok: true, state: AGENT_STATES.COMPLETED, escalation: 'skip' };
    }

    this.fail('超时');
    return { ok: true, state: AGENT_STATES.FAILED, escalation: policy };
  }

  // ============================================================
  // 失败处理
  // ============================================================

  /**
   * 标记循环失败
   * @param {string} reason
   */
  fail(reason) {
    this.failed = true;
    this.finalStatus = 'failed';
    this.recordEvent('loop_failed', { reason });
  }

  // ============================================================
  // 查询
  // ============================================================

  /**
   * 获取循环状态摘要
   * @returns {Object}
   */
  getSummary() {
    return {
      completed: this.completed,
      failed: this.failed,
      finalStatus: this.finalStatus,
      repairCount: this.repairCount,
      reviewCount: this.reviewCount,
      maxRepairAttempts: this.config.maxRepairAttempts,
      maxReviewAttempts: this.config.maxReviewAttempts,
      eventCount: this.events.length,
      startedAt: this.startedAt,
    };
  }

  /**
   * 检查是否可以继续修复
   * @returns {boolean}
   */
  canRepair() {
    return !this.completed && !this.failed && this.repairCount < this.config.maxRepairAttempts;
  }

  /**
   * 检查是否可以继续审查
   * @returns {boolean}
   */
  canReview() {
    return !this.completed && !this.failed && this.reviewCount < this.config.maxReviewAttempts;
  }
}

module.exports = {
  ReviewRepairLoop,
  DEFAULT_LOOP_CONFIG,
};
