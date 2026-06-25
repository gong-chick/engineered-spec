/**
 * AssetFeedback — 资产反馈模型
 *
 * 管理资产反馈的提交、查询、状态更新和摘要统计，
 * 支持 NDJSON 文件持久化。
 */

const fs = require('fs');
const path = require('path');
const { redactObject } = require('../governance/audit-log');

// ============================================================
// 常量
// ============================================================

/** 反馈类别枚举 */
const FEEDBACK_CATEGORIES = Object.freeze({
  QUALITY: 'quality',
  USABILITY: 'usability',
  PERFORMANCE: 'performance',
  BUG: 'bug',
});

/** 合法类别值 */
const VALID_FEEDBACK_CATEGORIES = new Set(Object.values(FEEDBACK_CATEGORIES));

/** 反馈状态枚举 */
const FEEDBACK_STATUSES = Object.freeze({
  PENDING: 'pending',
  REVIEWED: 'reviewed',
  RESOLVED: 'resolved',
});

/** 合法状态值 */
const VALID_FEEDBACK_STATUSES = new Set(Object.values(FEEDBACK_STATUSES));

// ============================================================
// 校验
// ============================================================

function validateFeedbackSpec(spec) {
  const errors = [];

  if (!spec.assetId || typeof spec.assetId !== 'string') {
    errors.push('assetId 必须为非空字符串');
  }
  if (!spec.version || typeof spec.version !== 'string') {
    errors.push('version 必须为非空字符串');
  }
  if (spec.rating !== undefined && spec.rating !== 0) {
    if (typeof spec.rating !== 'number' || spec.rating < 1 || spec.rating > 5) {
      errors.push('rating 必须为 1-5 的整数');
    }
  }
  if (spec.category && !VALID_FEEDBACK_CATEGORIES.has(spec.category)) {
    errors.push(`category 必须为 ${[...VALID_FEEDBACK_CATEGORIES].join('/')} 之一，当前值: ${spec.category}`);
  }

  return { ok: errors.length === 0, errors };
}

// ============================================================
// AssetFeedback 类
// ============================================================

class AssetFeedback {
  /**
   * @param {object} [options]
   * @param {string} [options.storagePath] - NDJSON 持久化路径
   */
  constructor(options = {}) {
    /** @type {Map<string, object>} feedbackId -> record */
    this._records = new Map();
    /** @type {number} */
    this._nextId = 1;
    /** @type {string|null} */
    this.storagePath = options.storagePath || null;
    /** @type {object[]} */
    this.loadErrors = [];

    if (this.storagePath) {
      this._loadFromFile();
    }
  }

  // ============================================================
  // NDJSON 持久化
  // ============================================================

  _loadFromFile() {
    if (!this.storagePath) return;

    try {
      if (!fs.existsSync(this.storagePath)) return;
    } catch {
      return;
    }

    let content;
    try {
      content = fs.readFileSync(this.storagePath, 'utf-8');
    } catch {
      return;
    }

    if (!content || !content.trim()) return;

    const lines = content.split('\n');
    this._records.clear();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);
        if (entry.feedbackId) {
          this._records.set(entry.feedbackId, entry);

          // 恢复 ID 编号
          const match = String(entry.feedbackId).match(/^fb-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= this._nextId) {
              this._nextId = num + 1;
            }
          }
        }
      } catch (err) {
        this.loadErrors.push({
          lineNumber: i + 1,
          line: line.substring(0, 200),
          message: err.message || 'JSON 解析失败',
        });
      }
    }
  }

  _appendToFile(entry) {
    if (!this.storagePath) return;

    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.storagePath, line, 'utf-8');
  }

  // ============================================================
  // submit — 提交反馈
  // ============================================================

  /**
   * 提交反馈
   * @param {object} spec
   * @returns {object} 反馈记录
   */
  submit(spec) {
    const validation = validateFeedbackSpec(spec);
    if (!validation.ok) {
      throw new Error(`反馈校验失败: ${validation.errors.join('; ')}`);
    }

    const record = {
      feedbackId: `fb-${this._nextId++}`,
      assetId: spec.assetId,
      version: spec.version,
      projectId: spec.projectId || '',
      rating: spec.rating || 0,
      comment: spec.comment || '',
      category: spec.category || 'quality',
      status: 'pending',
      createdAt: new Date().toISOString(),
      metadata: redactObject(spec.metadata || {}),
    };

    this._records.set(record.feedbackId, record);
    this._appendToFile(record);

    return { ...record, metadata: { ...record.metadata } };
  }

  // ============================================================
  // get — 获取反馈
  // ============================================================

  /**
   * 获取反馈记录
   * @param {string} feedbackId
   * @returns {object|null}
   */
  get(feedbackId) {
    const record = this._records.get(feedbackId);
    if (!record) return null;
    return { ...record, metadata: { ...record.metadata } };
  }

  // ============================================================
  // list — 查询
  // ============================================================

  /**
   * 查询反馈列表
   * @param {object} [filters]
   * @param {string} [filters.assetId]
   * @param {number} [filters.rating]
   * @param {string} [filters.status]
   * @param {number} [filters.limit]
   * @returns {object[]}
   */
  list(filters = {}) {
    let results = [...this._records.values()];

    if (filters.assetId) {
      results = results.filter(r => r.assetId === filters.assetId);
    }
    if (filters.rating) {
      results = results.filter(r => r.rating === filters.rating);
    }
    if (filters.status) {
      results = results.filter(r => r.status === filters.status);
    }
    if (filters.limit && filters.limit > 0) {
      results = results.slice(0, filters.limit);
    }

    return results.map(r => ({ ...r, metadata: { ...r.metadata } }));
  }

  // ============================================================
  // updateStatus — 更新反馈状态
  // ============================================================

  /**
   * 更新反馈状态
   * @param {string} feedbackId
   * @param {string} status
   * @returns {object} 更新后的记录
   */
  updateStatus(feedbackId, status) {
    if (!VALID_FEEDBACK_STATUSES.has(status)) {
      throw new Error(`无效的 feedback status: ${status}，必须是 ${[...VALID_FEEDBACK_STATUSES].join('/')} 之一`);
    }

    const existing = this._records.get(feedbackId);
    if (!existing) {
      throw new Error(`反馈不存在: ${feedbackId}`);
    }

    const updated = { ...existing, status };
    this._records.set(feedbackId, updated);
    this._appendToFile(updated);

    return { ...updated, metadata: { ...updated.metadata } };
  }

  // ============================================================
  // getAssetSummary — 资产反馈摘要
  // ============================================================

  /**
   * 获取资产反馈摘要
   * @param {string} assetId
   * @returns {object}
   */
  getAssetSummary(assetId) {
    const records = [...this._records.values()].filter(r => r.assetId === assetId);

    if (records.length === 0) {
      return {
        totalFeedbacks: 0,
        averageRating: 0,
        byCategory: {},
        byStatus: {},
      };
    }

    const byCategory = {};
    const byStatus = {};
    let ratingSum = 0;
    let ratingCount = 0;

    for (const r of records) {
      if (r.rating > 0) {
        ratingSum += r.rating;
        ratingCount++;
      }
      byCategory[r.category] = (byCategory[r.category] || 0) + 1;
      byStatus[r.status] = (byStatus[r.status] || 0) + 1;
    }

    return {
      totalFeedbacks: records.length,
      averageRating: ratingCount > 0 ? Math.round(ratingSum / ratingCount) : 0,
      byCategory,
      byStatus,
    };
  }

  // ============================================================
  // getAverageRating — 平均评分
  // ============================================================

  /**
   * 获取资产平均评分（忽略 rating=0 的记录）
   * @param {string} assetId
   * @returns {number}
   */
  getAverageRating(assetId) {
    const records = [...this._records.values()].filter(r => r.assetId === assetId && r.rating > 0);

    if (records.length === 0) return 0;

    const sum = records.reduce((acc, r) => acc + r.rating, 0);
    return Math.round(sum / records.length);
  }

  // ============================================================
  // getLoadErrors
  // ============================================================

  /** @returns {object[]} */
  getLoadErrors() {
    return this.loadErrors.map(e => ({ ...e }));
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建资产反馈管理器
 * @param {object} [options]
 * @returns {AssetFeedback}
 */
function createAssetFeedback(options) {
  return new AssetFeedback(options);
}

module.exports = {
  FEEDBACK_CATEGORIES,
  VALID_FEEDBACK_CATEGORIES,
  FEEDBACK_STATUSES,
  VALID_FEEDBACK_STATUSES,
  createAssetFeedback,
  AssetFeedback,
};
