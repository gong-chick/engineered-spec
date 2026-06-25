/**
 * AssetLifecycle — 资产审核/发布/废弃生命周期管理
 *
 * 协调 AssetRegistry 和 AssetReviewWorkflow，
 * 提供资产的审核、批准、拒绝、发布、废弃和变更记录。
 * 支持 NDJSON 持久化变更日志。
 */

const fs = require('fs');
const path = require('path');
const { createAssetRegistry, AssetRegistry } = require('./asset-registry');
const { AssetReviewWorkflow } = require('../governance/asset-review');

// ============================================================
// AssetLifecycle 类
// ============================================================

class AssetLifecycle {
  /**
   * @param {object} [options]
   * @param {string} [options.storageDir] - NDJSON 持久化目录
   */
  constructor(options = {}) {
    const storageDir = options.storageDir || null;

    /** @type {AssetRegistry} */
    this.registry = createAssetRegistry({
      storagePath: storageDir ? path.join(storageDir, 'lifecycle-registry.ndjson') : undefined,
    });

    /** @type {AssetReviewWorkflow} */
    this._workflow = new AssetReviewWorkflow();

    /** @type {object[]} 变更日志 */
    this._changeLog = [];

    /** @type {string|null} */
    this._changelogPath = storageDir ? path.join(storageDir, 'changelog.ndjson') : null;

    if (this._changelogPath) {
      this._loadChangeLog();
    }
  }

  // ============================================================
  // NDJSON 持久化 — 变更日志
  // ============================================================

  _loadChangeLog() {
    if (!this._changelogPath) return;

    try {
      if (!fs.existsSync(this._changelogPath)) return;
    } catch {
      return;
    }

    let content;
    try {
      content = fs.readFileSync(this._changelogPath, 'utf-8');
    } catch {
      return;
    }

    if (!content || !content.trim()) return;

    const lines = content.split('\n');
    this._changeLog = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      try {
        this._changeLog.push(JSON.parse(trimmed));
      } catch {
        // 坏行容错
      }
    }
  }

  _appendChangeLog(entry) {
    this._changeLog.push(entry);

    if (this._changelogPath) {
      const dir = path.dirname(this._changelogPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.appendFileSync(this._changelogPath, JSON.stringify(entry) + '\n', 'utf-8');
    }
  }

  // ============================================================
  // submitForReview — 提交审核
  // ============================================================

  /**
   * 提交资产审核
   * @param {string} assetId
   * @param {string} version
   * @returns {object} 审核记录
   */
  submitForReview(assetId, version) {
    const asset = this.registry.get(assetId);
    if (!asset) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    const review = this._workflow.createReview({
      assetId,
      version,
      submitterId: asset.owner || 'system',
    });

    const result = this._workflow.submitReview(review.reviewId);
    if (!result.ok) {
      throw new Error(result.error);
    }

    this._appendChangeLog({
      assetId,
      version,
      action: 'submitted',
      reviewId: review.reviewId,
      timestamp: new Date().toISOString(),
    });

    return result.review;
  }

  // ============================================================
  // approve — 批准
  // ============================================================

  /**
   * 批准资产审核
   * @param {string} assetId
   * @param {string} version
   * @param {string} [comment]
   * @returns {object} 审核记录
   */
  approve(assetId, version, comment) {
    const reviewId = this._findReviewId(assetId, version);
    if (!reviewId) {
      throw new Error(`未找到审核记录: ${assetId}@${version}`);
    }

    const result = this._workflow.approveReview(reviewId, 'reviewer', comment);
    if (!result.ok) {
      throw new Error(result.error);
    }

    this._appendChangeLog({
      assetId,
      version,
      action: 'approved',
      reviewId,
      comment: comment || '',
      timestamp: new Date().toISOString(),
    });

    return result.review;
  }

  // ============================================================
  // reject — 拒绝
  // ============================================================

  /**
   * 拒绝资产审核
   * @param {string} assetId
   * @param {string} version
   * @param {string} reason
   * @returns {object} 审核记录
   */
  reject(assetId, version, reason) {
    const reviewId = this._findReviewId(assetId, version);
    if (!reviewId) {
      throw new Error(`未找到审核记录: ${assetId}@${version}`);
    }

    const result = this._workflow.rejectReview(reviewId, 'reviewer', reason);
    if (!result.ok) {
      throw new Error(result.error);
    }

    this._appendChangeLog({
      assetId,
      version,
      action: 'rejected',
      reviewId,
      reason,
      timestamp: new Date().toISOString(),
    });

    return { ...result.review, reason };
  }

  // ============================================================
  // publish — 发布
  // ============================================================

  /**
   * 发布资产
   * @param {string} assetId
   * @param {string} version
   * @returns {object} 审核记录
   */
  publish(assetId, version) {
    const reviewId = this._findReviewId(assetId, version);
    if (!reviewId) {
      throw new Error(`未找到审核记录: ${assetId}@${version}`);
    }

    const result = this._workflow.publishAsset(reviewId, 'publisher');
    if (!result.ok) {
      throw new Error(result.error);
    }

    this._appendChangeLog({
      assetId,
      version,
      action: 'published',
      reviewId,
      timestamp: new Date().toISOString(),
    });

    return result.review;
  }

  // ============================================================
  // deprecate — 废弃
  // ============================================================

  /**
   * 废弃资产
   * @param {string} assetId
   * @param {string} reason
   * @returns {object} 审核记录
   */
  deprecate(assetId, reason) {
    const result = this._workflow.deprecateAsset(assetId, reason);
    if (!result.ok) {
      throw new Error(result.error);
    }

    this._appendChangeLog({
      assetId,
      version: result.deprecated.version,
      action: 'deprecated',
      reason,
      timestamp: new Date().toISOString(),
    });

    return result.deprecated;
  }

  // ============================================================
  // getReviewHistory — 审核历史
  // ============================================================

  /**
   * 获取资产审核历史
   * @param {string} assetId
   * @returns {object[]}
   */
  getReviewHistory(assetId) {
    return this._workflow.getReviewHistory(assetId);
  }

  // ============================================================
  // getChangeLog — 变更记录
  // ============================================================

  /**
   * 获取资产变更记录
   * @param {string} assetId
   * @returns {object[]}
   */
  getChangeLog(assetId) {
    return this._changeLog
      .filter(e => e.assetId === assetId)
      .map(e => ({ ...e }));
  }

  // ============================================================
  // 内部方法
  // ============================================================

  /**
   * 查找资产最新审核记录的 reviewId
   * @param {string} assetId
   * @param {string} version
   * @returns {string|null}
   */
  _findReviewId(assetId, version) {
    const history = this._workflow.getReviewHistory(assetId);
    // 从后往前找匹配版本的记录
    for (let i = history.length - 1; i >= 0; i--) {
      if (history[i].version === version) {
        return history[i].reviewId;
      }
    }
    return null;
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建资产生命周期管理器
 * @param {object} [options]
 * @returns {AssetLifecycle}
 */
function createAssetLifecycle(options) {
  return new AssetLifecycle(options);
}

module.exports = {
  createAssetLifecycle,
  AssetLifecycle,
};
