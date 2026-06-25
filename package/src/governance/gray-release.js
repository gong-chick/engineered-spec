/**
 * P3.4 灰度发布
 *
 * 灰度规则引擎：按组织/团队/项目/百分比发布资产版本
 */

// ============================================================
// 常量
// ============================================================

const GRAY_SCOPE_TYPES = Object.freeze({
  ORG: 'org',
  TEAM: 'team',
  PROJECT: 'project',
  PERCENTAGE: 'percentage',
});

const GRAY_STATUS = Object.freeze({
  ACTIVE: 'active',
  RECLAIMED: 'reclaimed',
  EXPANDED: 'expanded',
  FULLY_RELEASED: 'fully_released',
});

const VALID_SCOPE_TYPES = new Set(Object.values(GRAY_SCOPE_TYPES));
const VALID_GRAY_STATUS = new Set(Object.values(GRAY_STATUS));

// ============================================================
// 灰度发布引擎
// ============================================================

class GrayReleaseEngine {
  constructor() {
    /** @type {Map<string, object>} grayReleaseId → 灰度发布记录 */
    this.releases = new Map();
    /** @type {Map<string, object[]>} assetId → 灰度规则[] */
    this.rules = new Map();
    /** @type {number} */
    this._nextRuleId = 1;
    /** @type {number} */
    this._nextReleaseId = 1;
  }

  /**
   * 创建灰度规则
   * @param {object} params
   * @returns {object} 灰度规则
   */
  createGrayRule({ assetId, version, scope, scopeValue, percentage, rollbackVersion = null }) {
    if (!assetId || !version || !scope) {
      throw new Error('assetId, version, scope 必填');
    }
    if (!VALID_SCOPE_TYPES.has(scope)) {
      throw new Error(`无效范围类型: ${scope}，必须是 ${[...VALID_SCOPE_TYPES].join(', ')} 之一`);
    }
    if (scope === 'percentage') {
      if (typeof percentage !== 'number' || percentage < 0 || percentage > 100) {
        throw new Error('百分比范围必须是 0-100 的数字');
      }
    } else {
      if (!scopeValue) {
        throw new Error('非百分比范围必须提供 scopeValue');
      }
    }

    const ruleId = `gray-rule-${this._nextRuleId++}`;
    const rule = {
      ruleId,
      assetId,
      version,
      scope,
      scopeValue: scopeValue || null,
      percentage: scope === 'percentage' ? percentage : null,
      rollbackVersion,
      createdAt: new Date().toISOString(),
    };

    if (!this.rules.has(assetId)) {
      this.rules.set(assetId, []);
    }
    this.rules.get(assetId).push(rule);

    return { ...rule };
  }

  /**
   * 创建灰度发布
   * @param {object} params
   * @returns {object} 灰度发布记录
   */
  createGrayRelease({ assetId, version, rules, createdBy, metadata = {} }) {
    if (!assetId || !version || !createdBy) {
      throw new Error('assetId, version, createdBy 必填');
    }
    if (!rules || !Array.isArray(rules) || rules.length === 0) {
      throw new Error('rules 必填且不能为空');
    }

    // 检查约束：无 rollbackVersion 时不允许 100% 灰度
    const hasFullPercentage = rules.some(r => r.scope === 'percentage' && r.percentage === 100);
    if (hasFullPercentage) {
      const hasRollback = rules.some(r => r.rollbackVersion);
      if (!hasRollback) {
        throw new Error('无 rollbackVersion 的资产不允许 100% 灰度发布');
      }
    }

    const releaseId = `gray-${this._nextReleaseId++}`;
    const now = new Date().toISOString();

    const release = {
      releaseId,
      assetId,
      version,
      rules: rules.map(r => ({ ...r })),
      status: GRAY_STATUS.ACTIVE,
      createdBy,
      metadata,
      createdAt: now,
      updatedAt: now,
      reclaimedAt: null,
      reclaimReason: null,
    };

    this.releases.set(releaseId, release);

    return { ...release, rules: release.rules.map(r => ({ ...r })) };
  }

  /**
   * 评估上下文是否命中灰度
   * @param {string} releaseId
   * @param {object} context - { org?, team?, project?, userId? }
   * @returns {object} { matched: boolean, matchedRule?, reason? }
   */
  evaluateScope(releaseId, context) {
    const release = this.releases.get(releaseId);
    if (!release) return { matched: false, reason: `灰度发布 ${releaseId} 不存在` };
    if (release.status !== GRAY_STATUS.ACTIVE) {
      return { matched: false, reason: `灰度发布状态为 ${release.status}，不可评估` };
    }

    for (const rule of release.rules) {
      if (this._matchRule(rule, context)) {
        return { matched: true, matchedRule: { ...rule } };
      }
    }

    return { matched: false, reason: '未命中任何灰度规则' };
  }

  /**
   * 获取灰度状态
   * @param {string} releaseId
   * @returns {object|null}
   */
  getGrayStatus(releaseId) {
    const release = this.releases.get(releaseId);
    if (!release) return null;
    return { ...release, rules: release.rules.map(r => ({ ...r })) };
  }

  /**
   * 回收灰度发布（回退到 rollbackVersion）
   * @param {string} releaseId
   * @param {string} reason
   * @returns {object} { ok, release?, error? }
   */
  reclaimGrayRelease(releaseId, reason) {
    if (!reason) return { ok: false, error: '回收原因必填' };

    const release = this.releases.get(releaseId);
    if (!release) return { ok: false, error: `灰度发布 ${releaseId} 不存在` };
    if (release.status !== GRAY_STATUS.ACTIVE && release.status !== GRAY_STATUS.EXPANDED) {
      return { ok: false, error: `灰度发布状态为 ${release.status}，不可回收` };
    }

    release.status = GRAY_STATUS.RECLAIMED;
    release.reclaimReason = reason;
    release.reclaimedAt = new Date().toISOString();
    release.updatedAt = new Date().toISOString();

    return { ok: true, release: { ...release, rules: release.rules.map(r => ({ ...r })) } };
  }

  /**
   * 扩大灰度范围
   * @param {string} releaseId
   * @param {number} newPercentage
   * @returns {object} { ok, release?, error? }
   */
  expandGrayRelease(releaseId, newPercentage) {
    if (typeof newPercentage !== 'number' || newPercentage < 0 || newPercentage > 100) {
      return { ok: false, error: '百分比必须是 0-100 的数字' };
    }

    const release = this.releases.get(releaseId);
    if (!release) return { ok: false, error: `灰度发布 ${releaseId} 不存在` };
    if (release.status !== GRAY_STATUS.ACTIVE) {
      return { ok: false, error: `灰度发布状态为 ${release.status}，不可扩展` };
    }

    // 找到百分比规则并更新
    let found = false;
    for (const rule of release.rules) {
      if (rule.scope === 'percentage') {
        if (newPercentage < rule.percentage) {
          return { ok: false, error: '新百分比不能小于当前百分比' };
        }
        rule.percentage = newPercentage;
        found = true;
      }
    }

    if (!found) {
      return { ok: false, error: '未找到百分比类型的灰度规则' };
    }

    release.status = newPercentage === 100 ? GRAY_STATUS.FULLY_RELEASED : GRAY_STATUS.EXPANDED;
    release.updatedAt = new Date().toISOString();

    return { ok: true, release: { ...release, rules: release.rules.map(r => ({ ...r })) } };
  }

  /**
   * 列出灰度发布
   * @param {string} [assetId]
   * @returns {object[]}
   */
  listGrayReleases(assetId) {
    const result = [];
    for (const release of this.releases.values()) {
      if (!assetId || release.assetId === assetId) {
        result.push({ ...release, rules: release.rules.map(r => ({ ...r })) });
      }
    }
    return result;
  }

  /**
   * 获取统计
   * @returns {object}
   */
  getStats() {
    const byStatus = {};
    for (const release of this.releases.values()) {
      byStatus[release.status] = (byStatus[release.status] || 0) + 1;
    }
    return {
      totalReleases: this.releases.size,
      totalRules: [...this.rules.values()].reduce((sum, arr) => sum + arr.length, 0),
      byStatus,
    };
  }

  /**
   * 重置
   */
  reset() {
    this.releases.clear();
    this.rules.clear();
    this._nextRuleId = 1;
    this._nextReleaseId = 1;
  }

  // ============================================================
  // 内部方法
  // ============================================================

  _matchRule(rule, context) {
    switch (rule.scope) {
      case 'org':
        return context.org === rule.scopeValue;
      case 'team':
        return context.team === rule.scopeValue;
      case 'project':
        return context.project === rule.scopeValue;
      case 'percentage': {
        // 基于 userId 的确定性哈希分配
        const hash = this._simpleHash(context.userId || '');
        return (hash % 100) < rule.percentage;
      }
      default:
        return false;
    }
  }

  _simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      hash = ((hash << 5) - hash + str.charCodeAt(i)) | 0;
    }
    return Math.abs(hash);
  }
}

/**
 * 工厂函数
 * @returns {GrayReleaseEngine}
 */
function createGrayReleaseEngine() {
  return new GrayReleaseEngine();
}

module.exports = {
  GRAY_SCOPE_TYPES,
  GRAY_STATUS,
  VALID_SCOPE_TYPES,
  VALID_GRAY_STATUS,
  GrayReleaseEngine,
  createGrayReleaseEngine,
};
