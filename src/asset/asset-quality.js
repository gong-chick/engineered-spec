/**
 * AssetQuality — 资产质量评分与排名
 *
 * 基于反馈和使用数据计算资产质量评分、使用指标、
 * 反馈聚合、推荐依据和资产排名。
 */

const { createAssetFeedback, AssetFeedback } = require('./asset-feedback');
const { createAssetInstall, AssetInstall } = require('./asset-install');

// ============================================================
// 评分权重
// ============================================================

const DEFAULT_WEIGHTS = {
  averageRating: 0.4,
  adoptionRate: 0.3,
  failureRate: 0.2,
  sampleSize: 0.1,
};

// ============================================================
// AssetQuality 类
// ============================================================

class AssetQuality {
  /**
   * @param {object} [options]
   * @param {string} [options.storageDir] - NDJSON 持久化目录
   */
  constructor(options = {}) {
    const storageDir = options.storageDir || null;
    const path = require('path');

    /** @type {AssetFeedback} */
    this.feedback = createAssetFeedback({
      storagePath: storageDir ? path.join(storageDir, 'quality-feedback.ndjson') : undefined,
    });

    /** @type {AssetInstall} */
    this.installTracker = createAssetInstall({
      storagePath: storageDir ? path.join(storageDir, 'quality-installs.ndjson') : undefined,
    });
  }

  // ============================================================
  // computeScore — 计算质量评分
  // ============================================================

  /**
   * 计算资产质量评分
   * @param {string} assetId
   * @returns {object} QualityScore
   */
  computeScore(assetId) {
    const feedbackSummary = this.feedback.getAssetSummary(assetId);
    const usageMetrics = this.getUsageMetrics(assetId);
    const avgRating = this.feedback.getAverageRating(assetId);

    const dimensions = {
      hitRate: this._computeHitRate(assetId),
      failureRate: this._computeFailureRate(assetId),
      repairRate: this._computeRepairRate(assetId),
      adoptionRate: this._computeAdoptionRate(usageMetrics),
      averageRating: avgRating,
    };

    const sampleSize = feedbackSummary.totalFeedbacks + usageMetrics.totalInstalls;
    const overallScore = this._computeOverallScore(dimensions, sampleSize);

    return {
      assetId,
      overallScore,
      dimensions,
      sampleSize,
      computedAt: new Date().toISOString(),
    };
  }

  // ============================================================
  // getUsageMetrics — 使用指标
  // ============================================================

  /**
   * 获取资产使用指标
   * @param {string} assetId
   * @returns {object}
   */
  getUsageMetrics(assetId) {
    const installs = this.installTracker.list({ assetId });

    const projects = new Set();
    let upgradeCount = 0;
    let failCount = 0;

    for (const inst of installs) {
      projects.add(inst.projectId);
      if (inst.status === 'upgraded') upgradeCount++;
      if (inst.status === 'failed') failCount++;
    }

    return {
      totalInstalls: installs.length,
      projectCount: projects.size,
      upgradeCount,
      failCount,
    };
  }

  // ============================================================
  // getFeedbackAggregation — 反馈聚合
  // ============================================================

  /**
   * 获取反馈聚合
   * @param {string} assetId
   * @returns {object}
   */
  getFeedbackAggregation(assetId) {
    return this.feedback.getAssetSummary(assetId);
  }

  // ============================================================
  // getRecommendationBasis — 推荐依据
  // ============================================================

  /**
   * 获取推荐依据
   * @param {string} assetId
   * @returns {object}
   */
  getRecommendationBasis(assetId) {
    const score = this.computeScore(assetId);
    const usage = this.getUsageMetrics(assetId);

    let recommendationStrength = 'weak';
    if (score.overallScore >= 80) {
      recommendationStrength = 'strong';
    } else if (score.overallScore >= 50) {
      recommendationStrength = 'moderate';
    }

    return {
      qualityScore: score.overallScore,
      usageCount: usage.totalInstalls,
      averageRating: score.dimensions.averageRating,
      recommendationStrength,
    };
  }

  // ============================================================
  // rankAssets — 资产排名
  // ============================================================

  /**
   * 资产排名
   * @param {object} [filters]
   * @param {number} [filters.limit] - 返回数量限制
   * @returns {object[]}
   */
  rankAssets(filters = {}) {
    // 收集所有有数据的资产 ID
    const assetIds = new Set();
    for (const record of this.feedback.list()) {
      assetIds.add(record.assetId);
    }
    for (const record of this.installTracker.list()) {
      assetIds.add(record.assetId);
    }

    // 计算每个资产的评分
    const scored = [];
    for (const assetId of assetIds) {
      const score = this.computeScore(assetId);
      scored.push(score);
    }

    // 按综合评分降序排列
    scored.sort((a, b) => b.overallScore - a.overallScore);

    if (filters.limit && filters.limit > 0) {
      return scored.slice(0, filters.limit);
    }

    return scored;
  }

  // ============================================================
  // 内部评分计算
  // ============================================================

  _computeOverallScore(dimensions, sampleSize) {
    if (sampleSize === 0) return 0;

    // 评分维度归一化到 0-100
    const ratingScore = (dimensions.averageRating / 5) * 100;
    const adoptionScore = Math.min(dimensions.adoptionRate * 100, 100);
    const failureScore = Math.max(100 - dimensions.failureRate * 100, 0);
    const sampleScore = Math.min(sampleSize * 2, 100); // 每个样本 2 分，上限 100

    const weighted =
      ratingScore * DEFAULT_WEIGHTS.averageRating +
      adoptionScore * DEFAULT_WEIGHTS.adoptionRate +
      failureScore * DEFAULT_WEIGHTS.failureRate +
      sampleScore * DEFAULT_WEIGHTS.sampleSize;

    return Math.round(weighted);
  }

  _computeHitRate(assetId) {
    // 命中率 = 有反馈的安装数 / 总安装数
    const installs = this.installTracker.list({ assetId });
    if (installs.length === 0) return 0;
    const feedbacks = this.feedback.list({ assetId });
    const feedbackProjects = new Set(feedbacks.map(f => f.projectId));
    const installProjects = new Set(installs.map(i => i.projectId));
    let hits = 0;
    for (const pid of installProjects) {
      if (feedbackProjects.has(pid)) hits++;
    }
    return hits / installProjects.size;
  }

  _computeFailureRate(assetId) {
    const installs = this.installTracker.list({ assetId });
    if (installs.length === 0) return 0;
    const failures = installs.filter(i => i.status === 'failed').length;
    return failures / installs.length;
  }

  _computeRepairRate(assetId) {
    // 修复率 = 已解决反馈 / 总反馈
    const feedbacks = this.feedback.list({ assetId });
    if (feedbacks.length === 0) return 0;
    const resolved = feedbacks.filter(f => f.status === 'resolved').length;
    return resolved / feedbacks.length;
  }

  _computeAdoptionRate(usageMetrics) {
    // 采纳率 = 升级数 / 总安装数
    if (usageMetrics.totalInstalls === 0) return 0;
    return usageMetrics.upgradeCount / usageMetrics.totalInstalls;
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建资产质量评分器
 * @param {object} [options]
 * @returns {AssetQuality}
 */
function createAssetQuality(options) {
  return new AssetQuality(options);
}

module.exports = {
  createAssetQuality,
  AssetQuality,
};
