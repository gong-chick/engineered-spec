/**
 * P3.2 Asset Review Workflow
 *
 * 资产生命周期状态机：草稿→提交审核→审核通过→发布→拒绝→废弃
 */

// ============================================================
// 状态与转换规则
// ============================================================

const REVIEW_STATES = Object.freeze({
  DRAFT: 'draft',
  SUBMITTED: 'submitted',
  APPROVED: 'approved',
  PUBLISHED: 'published',
  REJECTED: 'rejected',
  DEPRECATED: 'deprecated',
  WITHDRAWN: 'withdrawn',
});

const STATE_TRANSITIONS = Object.freeze({
  draft: ['submitted'],
  submitted: ['approved', 'rejected', 'withdrawn'],
  approved: ['published'],
  published: ['deprecated'],
  rejected: ['draft'],
  withdrawn: ['draft'],
  deprecated: [],
});

// ============================================================
// 资产审核工作流
// ============================================================

class AssetReviewWorkflow {
  constructor() {
    /** @type {Map<string, object>} */
    this.reviews = new Map();
    /** @type {Map<string, object[]>} */
    this.reviewHistory = new Map(); // assetId → reviews[]
    /** @type {Map<string, object>} */
    this.releaseCandidates = new Map();
    /** @type {number} */
    this._nextReviewId = 1;
  }

  /**
   * 创建审核记录
   * @param {object} params
   * @returns {object} 审核记录
   */
  createReview({ assetId, version, submitterId, metadata = {} }) {
    if (!assetId || !version || !submitterId) {
      throw new Error('assetId, version, submitterId 必填');
    }

    const reviewId = `review-${this._nextReviewId++}`;
    const now = new Date().toISOString();

    const review = {
      reviewId,
      assetId,
      version,
      submitterId,
      status: REVIEW_STATES.DRAFT,
      reviewerId: null,
      comment: null,
      issues: [],
      metadata,
      createdAt: now,
      updatedAt: now,
    };

    this.reviews.set(reviewId, review);
    this._appendHistory(assetId, review);

    return { ...review };
  }

  /**
   * 提交审核
   * @param {string} reviewId
   * @returns {object} { ok, review?, error? }
   */
  submitReview(reviewId) {
    return this._transition(reviewId, 'submitted');
  }

  /**
   * 审核通过
   * @param {string} reviewId
   * @param {string} reviewerId
   * @param {string} [comment]
   * @returns {object} { ok, review?, error? }
   */
  approveReview(reviewId, reviewerId, comment) {
    const review = this.reviews.get(reviewId);
    if (!review) return { ok: false, error: `审核记录 ${reviewId} 不存在` };
    if (!reviewerId) return { ok: false, error: 'reviewerId 必填' };

    const transResult = this._transition(reviewId, 'approved');
    if (!transResult.ok) return transResult;

    const updated = this.reviews.get(reviewId);
    updated.reviewerId = reviewerId;
    updated.comment = comment || null;
    updated.updatedAt = new Date().toISOString();

    return { ok: true, review: { ...updated } };
  }

  /**
   * 审核拒绝
   * @param {string} reviewId
   * @param {string} reviewerId
   * @param {string} comment
   * @param {string[]} issues
   * @returns {object} { ok, review?, error? }
   */
  rejectReview(reviewId, reviewerId, comment, issues = []) {
    const review = this.reviews.get(reviewId);
    if (!review) return { ok: false, error: `审核记录 ${reviewId} 不存在` };
    if (!reviewerId) return { ok: false, error: 'reviewerId 必填' };
    if (!comment) return { ok: false, error: '拒绝时 comment 必填' };

    const transResult = this._transition(reviewId, 'rejected');
    if (!transResult.ok) return transResult;

    const updated = this.reviews.get(reviewId);
    updated.reviewerId = reviewerId;
    updated.comment = comment;
    updated.issues = issues;
    updated.updatedAt = new Date().toISOString();

    return { ok: true, review: { ...updated } };
  }

  /**
   * 撤回审核
   * @param {string} reviewId
   * @returns {object} { ok, review?, error? }
   */
  withdrawReview(reviewId) {
    return this._transition(reviewId, 'withdrawn');
  }

  /**
   * 发布资产
   * @param {string} reviewId
   * @param {string} publisherId
   * @returns {object} { ok, review?, rc?, error? }
   */
  publishAsset(reviewId, publisherId) {
    const review = this.reviews.get(reviewId);
    if (!review) return { ok: false, error: `审核记录 ${reviewId} 不存在` };
    if (!publisherId) return { ok: false, error: 'publisherId 必填' };

    const transResult = this._transition(reviewId, 'published');
    if (!transResult.ok) return transResult;

    const updated = this.reviews.get(reviewId);
    updated.updatedAt = new Date().toISOString();

    // 创建 Release Candidate
    const rc = this._createRC(review.assetId, review.version, review);

    return { ok: true, review: { ...updated }, rc: { ...rc } };
  }

  /**
   * 废弃资产
   * @param {string} assetId
   * @param {string} reason
   * @returns {object} { ok, deprecated?, error? }
   */
  deprecateAsset(assetId, reason) {
    if (!reason) return { ok: false, error: '废弃原因必填' };

    // 找到最新已发布的审核记录
    const published = this._findLatestByStatus(assetId, 'published');
    if (!published) {
      return { ok: false, error: `资产 ${assetId} 没有已发布的版本` };
    }

    const transResult = this._transition(published.reviewId, 'deprecated');
    if (!transResult.ok) return transResult;

    const updated = this.reviews.get(published.reviewId);
    updated.comment = reason;
    updated.updatedAt = new Date().toISOString();

    return { ok: true, deprecated: { ...updated } };
  }

  /**
   * 获取审核历史
   * @param {string} assetId
   * @returns {object[]}
   */
  getReviewHistory(assetId) {
    const history = this.reviewHistory.get(assetId) || [];
    return history.map(r => ({ ...r }));
  }

  /**
   * 获取单个审核记录
   * @param {string} reviewId
   * @returns {object|null}
   */
  getReview(reviewId) {
    const review = this.reviews.get(reviewId);
    return review ? { ...review } : null;
  }

  /**
   * 创建 Release Candidate
   * @param {string} assetId
   * @param {string} version
   * @param {object} scope
   * @returns {object}
   */
  createReleaseCandidate(assetId, version, scope = {}) {
    if (!assetId || !version) {
      throw new Error('assetId, version 必填');
    }
    return this._createRC(assetId, version, scope);
  }

  /**
   * 获取 RC
   * @param {string} rcId
   * @returns {object|null}
   */
  getReleaseCandidate(rcId) {
    const rc = this.releaseCandidates.get(rcId);
    return rc ? { ...rc } : null;
  }

  /**
   * 列出资产的所有 RC
   * @param {string} assetId
   * @returns {object[]}
   */
  listReleaseCandidates(assetId) {
    const result = [];
    for (const rc of this.releaseCandidates.values()) {
      if (rc.assetId === assetId) {
        result.push({ ...rc });
      }
    }
    return result;
  }

  /**
   * 获取统计
   * @returns {object}
   */
  getStats() {
    const statusCounts = {};
    for (const review of this.reviews.values()) {
      statusCounts[review.status] = (statusCounts[review.status] || 0) + 1;
    }

    return {
      totalReviews: this.reviews.size,
      totalRCs: this.releaseCandidates.size,
      statusCounts,
    };
  }

  /**
   * 重置
   */
  reset() {
    this.reviews.clear();
    this.reviewHistory.clear();
    this.releaseCandidates.clear();
    this._nextReviewId = 1;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  _transition(reviewId, targetState) {
    const review = this.reviews.get(reviewId);
    if (!review) return { ok: false, error: `审核记录 ${reviewId} 不存在` };

    const allowed = STATE_TRANSITIONS[review.status];
    if (!allowed || !allowed.includes(targetState)) {
      return {
        ok: false,
        error: `不允许从 ${review.status} 转换到 ${targetState}`,
      };
    }

    review.status = targetState;
    review.updatedAt = new Date().toISOString();
    this._updateHistory(review.assetId, review);

    return { ok: true, review: { ...review } };
  }

  _appendHistory(assetId, review) {
    if (!this.reviewHistory.has(assetId)) {
      this.reviewHistory.set(assetId, []);
    }
    this.reviewHistory.get(assetId).push({ ...review });
  }

  _updateHistory(assetId, review) {
    const history = this.reviewHistory.get(assetId);
    if (!history) return;

    const idx = history.findIndex(r => r.reviewId === review.reviewId);
    if (idx >= 0) {
      history[idx] = { ...review };
    }
  }

  _findLatestByStatus(assetId, status) {
    const history = this.reviewHistory.get(assetId) || [];
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].status === status) return history[i];
    }
    return null;
  }

  _createRC(assetId, version, scope) {
    const rcId = `rc-${assetId}-${version}-${Date.now()}`;
    const now = new Date().toISOString();

    const rc = {
      rcId,
      assetId,
      version,
      status: 'active',
      scope,
      createdAt: now,
    };

    this.releaseCandidates.set(rcId, rc);
    return rc;
  }
}

module.exports = {
  REVIEW_STATES,
  STATE_TRANSITIONS,
  AssetReviewWorkflow,
};
