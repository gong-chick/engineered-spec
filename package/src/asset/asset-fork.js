/**
 * AssetFork — 资产 Fork/Override/继承管理
 *
 * 支持企业级资产的 Fork（团队/项目级别）、项目级 Override、
 * 继承树构建、冲突检测和上游合并。
 * 支持 NDJSON 持久化 Fork 记录。
 */

const fs = require('fs');
const path = require('path');
const { createAssetRegistry, AssetRegistry } = require('./asset-registry');

// ============================================================
// AssetFork 类
// ============================================================

class AssetFork {
  /**
   * @param {object} [options]
   * @param {string} [options.storageDir] - NDJSON 持久化目录
   */
  constructor(options = {}) {
    const storageDir = options.storageDir || null;

    /** @type {AssetRegistry} */
    this.registry = createAssetRegistry({
      storagePath: storageDir ? path.join(storageDir, 'fork-registry.ndjson') : undefined,
    });

    /** @type {Map<string, object>} forkKey(assetId:projectId) → ForkRecord */
    this._forks = new Map();

    /** @type {Array<{line: number, raw: string, error: string}>} */
    this.loadErrors = [];

    /** @type {string|null} */
    this._storagePath = storageDir ? path.join(storageDir, 'forks.ndjson') : null;

    if (this._storagePath) {
      this._loadFromFile();
    }
  }

  // ============================================================
  // NDJSON 持久化
  // ============================================================

  _loadFromFile() {
    if (!this._storagePath) return;

    try {
      if (!fs.existsSync(this._storagePath)) return;
    } catch {
      return;
    }

    let content;
    try {
      content = fs.readFileSync(this._storagePath, 'utf-8');
    } catch {
      return;
    }

    if (!content || !content.trim()) return;

    const lines = content.split('\n');
    this._forks.clear();

    for (let i = 0; i < lines.length; i++) {
      const trimmed = lines[i].trim();
      if (!trimmed) continue;
      try {
        const entry = JSON.parse(trimmed);
        if (entry.assetId && entry.projectId) {
          const key = this._key(entry.assetId, entry.projectId);
          this._forks.set(key, entry);
        }
      } catch (err) {
        this.loadErrors.push({ line: i + 1, raw: trimmed, error: err.message });
      }
    }
  }

  _appendToFile(entry) {
    if (!this._storagePath) return;

    const dir = path.dirname(this._storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.appendFileSync(this._storagePath, JSON.stringify(entry) + '\n', 'utf-8');
  }

  _key(assetId, projectId) {
    return `${assetId}:${projectId}`;
  }

  /**
   * 获取加载坏行错误列表
   * @returns {Array<{line: number, raw: string, error: string}>}
   */
  getLoadErrors() {
    return [...this.loadErrors];
  }

  // ============================================================
  // forkAsset — Fork 资产
  // ============================================================

  /**
   * Fork 资产到目标项目/团队
   * @param {string} assetId
   * @param {string} projectId
   * @param {object} [options]
   * @param {string} [options.forkType] - fork 类型：enterprise/team/project
   * @param {string} [options.parentId] - 父 Fork ID
   * @param {string} [options.upstreamVersion] - Fork 时的上游版本
   * @returns {object} Fork 记录
   */
  forkAsset(assetId, projectId, options = {}) {
    const asset = this.registry.get(assetId);
    if (!asset) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    const key = this._key(assetId, projectId);
    if (this._forks.has(key)) {
      throw new Error(`已 Fork: ${assetId} → ${projectId}`);
    }

    const now = new Date().toISOString();
    const record = {
      forkId: `fork-${assetId}-${projectId}-${Date.now()}`,
      assetId,
      projectId,
      parentId: options.parentId || null,
      forkType: options.forkType || 'project',
      overrides: {},
      forkedAt: now,
      upstreamVersion: options.upstreamVersion || asset.currentVersion,
    };

    this._forks.set(key, record);
    this._appendToFile(record);

    return { ...record, overrides: { ...record.overrides } };
  }

  // ============================================================
  // override — 项目级 Override
  // ============================================================

  /**
   * 设置项目级 Override
   * @param {string} assetId
   * @param {string} projectId
   * @param {object} overrides
   * @returns {object} 更新后的 Fork 记录
   */
  override(assetId, projectId, overrides) {
    const key = this._key(assetId, projectId);
    const existing = this._forks.get(key);
    if (!existing) {
      throw new Error(`未找到 Fork 记录: ${assetId} → ${projectId}`);
    }

    const updated = {
      ...existing,
      overrides: { ...existing.overrides, ...overrides },
    };

    this._forks.set(key, updated);
    this._appendToFile(updated);

    return { ...updated, overrides: { ...updated.overrides } };
  }

  // ============================================================
  // getInheritanceTree — 继承树
  // ============================================================

  /**
   * 获取资产的继承树
   * @param {string} assetId
   * @returns {object[]}
   */
  getInheritanceTree(assetId) {
    const result = [];
    for (const record of this._forks.values()) {
      if (record.assetId === assetId) {
        result.push({ ...record, overrides: { ...record.overrides } });
      }
    }
    return result;
  }

  // ============================================================
  // getForkRecord — 获取 Fork 记录
  // ============================================================

  /**
   * 获取 Fork 记录
   * @param {string} assetId
   * @param {string} projectId
   * @returns {object|null}
   */
  getForkRecord(assetId, projectId) {
    const key = this._key(assetId, projectId);
    const record = this._forks.get(key);
    if (!record) return null;
    return { ...record, overrides: { ...record.overrides } };
  }

  // ============================================================
  // detectConflicts — 冲突检测
  // ============================================================

  /**
   * 检测继承冲突
   * @param {string} assetId
   * @param {string} projectId
   * @returns {{ hasConflict: boolean, conflicts: object[] }}
   */
  detectConflicts(assetId, projectId) {
    const key = this._key(assetId, projectId);
    const record = this._forks.get(key);
    if (!record) {
      return { hasConflict: false, conflicts: [] };
    }

    const asset = this.registry.get(assetId);
    const conflicts = [];

    // 版本漂移检测
    if (asset && record.upstreamVersion !== asset.currentVersion) {
      conflicts.push({
        type: 'version_drift',
        message: `上游版本已从 ${record.upstreamVersion} 更新到 ${asset.currentVersion}`,
        forkVersion: record.upstreamVersion,
        currentVersion: asset.currentVersion,
      });
    }

    return {
      hasConflict: conflicts.length > 0,
      conflicts,
    };
  }

  // ============================================================
  // mergeUpstream — 合并上游
  // ============================================================

  /**
   * 合并上游更新
   * @param {string} assetId
   * @param {string} projectId
   * @returns {object} 更新后的 Fork 记录
   */
  mergeUpstream(assetId, projectId) {
    const key = this._key(assetId, projectId);
    const existing = this._forks.get(key);
    if (!existing) {
      throw new Error(`未找到 Fork 记录: ${assetId} → ${projectId}`);
    }

    const asset = this.registry.get(assetId);
    if (!asset) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    const updated = {
      ...existing,
      upstreamVersion: asset.currentVersion,
    };

    this._forks.set(key, updated);
    this._appendToFile(updated);

    return { ...updated, overrides: { ...updated.overrides } };
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建资产 Fork 管理器
 * @param {object} [options]
 * @returns {AssetFork}
 */
function createAssetFork(options) {
  return new AssetFork(options);
}

module.exports = {
  createAssetFork,
  AssetFork,
};
