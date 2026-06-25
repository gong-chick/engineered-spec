/**
 * AssetRegistry — 资产注册表
 *
 * 管理资产元数据的注册、查询、更新和注销，
 * 支持 NDJSON 文件持久化与坏行容错。
 */

const fs = require('fs');
const path = require('path');
const { VALID_ASSET_TYPES } = require('./asset-package');
const { redactObject } = require('../governance/audit-log');

// ============================================================
// 常量
// ============================================================

/** 资产注册状态枚举 */
const ASSET_REGISTRY_STATUSES = Object.freeze({
  ACTIVE: 'active',
  DEPRECATED: 'deprecated',
  ARCHIVED: 'archived',
});

/** 合法状态值 */
const VALID_REGISTRY_STATUSES = new Set(Object.values(ASSET_REGISTRY_STATUSES));

// ============================================================
// 必填字段与校验
// ============================================================

const REQUIRED_FIELDS = ['assetId', 'assetType', 'name', 'currentVersion'];

function validateRegistration(meta) {
  const errors = [];

  for (const field of REQUIRED_FIELDS) {
    if (!meta[field] || typeof meta[field] !== 'string') {
      errors.push(`${field} 必须为非空字符串`);
    }
  }

  if (meta.assetType && !VALID_ASSET_TYPES.has(meta.assetType)) {
    errors.push(`assetType 必须为 ${[...VALID_ASSET_TYPES].join('/')} 之一，当前值: ${meta.assetType}`);
  }

  if (meta.status && !VALID_REGISTRY_STATUSES.has(meta.status)) {
    errors.push(`status 必须为 ${[...VALID_REGISTRY_STATUSES].join('/')} 之一，当前值: ${meta.status}`);
  }

  return { ok: errors.length === 0, errors };
}

// ============================================================
// AssetRegistry 类
// ============================================================

class AssetRegistry {
  /**
   * @param {object} [options]
   * @param {string} [options.storagePath] - NDJSON 持久化路径
   * @param {number} [options.maxAssets] - 最大资产数
   */
  constructor(options = {}) {
    /** @type {Map<string, object>} */
    this._assets = new Map();
    /** @type {number} */
    this._nextId = 1;
    /** @type {string|null} */
    this.storagePath = options.storagePath || null;
    /** @type {number} */
    this._maxAssets = options.maxAssets || 10000;
    /** @type {object[]} */
    this.loadErrors = [];

    if (this.storagePath) {
      this._loadFromFile();
    }
  }

  // ============================================================
  // NDJSON 持久化
  // ============================================================

  /** 从 NDJSON 文件加载 */
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
    this._assets.clear();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);

        // tombstone 记录（注销标记）
        if (entry._action === 'unregister' && entry.assetId) {
          this._assets.delete(entry.assetId);
          continue;
        }

        // 正常记录
        if (entry.assetId) {
          this._assets.set(entry.assetId, entry);
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

  /** 追加记录到 NDJSON 文件 */
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
  // register — 注册资产
  // ============================================================

  /**
   * 注册资产元数据
   * @param {object} meta - 资产元数据
   * @returns {object} 标准化记录
   */
  register(meta) {
    const validation = validateRegistration(meta);
    if (!validation.ok) {
      throw new Error(`注册校验失败: ${validation.errors.join('; ')}`);
    }

    if (this._assets.has(meta.assetId)) {
      throw new Error(`资产已存在: ${meta.assetId}`);
    }

    if (this._assets.size >= this._maxAssets) {
      throw new Error(`注册表已满，最大资产数: ${this._maxAssets}`);
    }

    const now = new Date().toISOString();
    const record = {
      assetId: meta.assetId,
      assetType: meta.assetType,
      name: meta.name,
      description: meta.description || '',
      source: meta.source || 'local',
      currentVersion: meta.currentVersion,
      status: meta.status || 'active',
      tags: Array.isArray(meta.tags) ? [...meta.tags] : [],
      owner: meta.owner || '',
      createdAt: now,
      updatedAt: now,
      metadata: redactObject(meta.metadata || {}),
    };

    this._assets.set(record.assetId, record);
    this._appendToFile(record);

    return { ...record, metadata: { ...record.metadata } };
  }

  // ============================================================
  // unregister — 注销资产
  // ============================================================

  /**
   * 注销资产
   * @param {string} assetId
   * @returns {boolean}
   */
  unregister(assetId) {
    if (!this._assets.has(assetId)) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    this._assets.delete(assetId);

    // 写入 tombstone 记录
    this._appendToFile({ _action: 'unregister', assetId, timestamp: new Date().toISOString() });

    return true;
  }

  // ============================================================
  // get — 获取单个资产
  // ============================================================

  /**
   * 获取资产记录
   * @param {string} assetId
   * @returns {object|null}
   */
  get(assetId) {
    const record = this._assets.get(assetId);
    if (!record) return null;
    return { ...record, metadata: { ...record.metadata } };
  }

  // ============================================================
  // list — 多维查询
  // ============================================================

  /**
   * 查询资产列表
   * @param {object} [filters]
   * @param {string} [filters.assetType]
   * @param {string} [filters.source]
   * @param {string} [filters.status]
   * @param {string} [filters.keyword] - 匹配 name 和 description
   * @param {number} [filters.limit]
   * @returns {object[]}
   */
  list(filters = {}) {
    let results = [...this._assets.values()];

    if (filters.assetType) {
      results = results.filter(r => r.assetType === filters.assetType);
    }
    if (filters.source) {
      results = results.filter(r => r.source === filters.source);
    }
    if (filters.status) {
      results = results.filter(r => r.status === filters.status);
    }
    if (filters.keyword) {
      const kw = filters.keyword.toLowerCase();
      results = results.filter(r =>
        r.name.toLowerCase().includes(kw) ||
        (r.description && r.description.toLowerCase().includes(kw))
      );
    }

    if (filters.limit && filters.limit > 0) {
      results = results.slice(0, filters.limit);
    }

    return results.map(r => ({ ...r, metadata: { ...r.metadata } }));
  }

  // ============================================================
  // update — 更新资产元数据
  // ============================================================

  /**
   * 更新资产元数据
   * @param {string} assetId
   * @param {object} patch - 更新字段
   * @returns {object} 更新后的记录
   */
  update(assetId, patch) {
    const existing = this._assets.get(assetId);
    if (!existing) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    if (patch.assetId && patch.assetId !== assetId) {
      throw new Error('不允许修改 assetId');
    }

    if (patch.status && !VALID_REGISTRY_STATUSES.has(patch.status)) {
      throw new Error(`status 必须为 ${[...VALID_REGISTRY_STATUSES].join('/')} 之一，当前值: ${patch.status}`);
    }

    if (patch.assetType && !VALID_ASSET_TYPES.has(patch.assetType)) {
      throw new Error(`assetType 必须为 ${[...VALID_ASSET_TYPES].join('/')} 之一，当前值: ${patch.assetType}`);
    }

    const updated = {
      ...existing,
      ...patch,
      assetId: existing.assetId, // 不可变
      createdAt: existing.createdAt, // 不可变
      updatedAt: new Date().toISOString(),
      metadata: patch.metadata ? redactObject(patch.metadata) : existing.metadata,
    };

    if (patch.tags) {
      updated.tags = Array.isArray(patch.tags) ? [...patch.tags] : existing.tags;
    }

    this._assets.set(assetId, updated);
    this._appendToFile(updated);

    return { ...updated, metadata: { ...updated.metadata } };
  }

  // ============================================================
  // clear — 清空
  // ============================================================

  /** 清空注册表 */
  clear() {
    this._assets.clear();

    if (this.storagePath) {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, '', 'utf-8');
    }
  }

  // ============================================================
  // export — 导出
  // ============================================================

  /**
   * 导出注册表
   * @param {string} format - 'json' | 'ndjson'
   * @returns {string}
   */
  export(format = 'json') {
    const entries = [...this._assets.values()].map(r => ({ ...r, metadata: { ...r.metadata } }));
    if (format === 'ndjson') {
      return entries.map(e => JSON.stringify(e)).join('\n');
    }
    return JSON.stringify(entries, null, 2);
  }

  // ============================================================
  // getLoadErrors — 坏行信息
  // ============================================================

  /** @returns {object[]} */
  getLoadErrors() {
    return this.loadErrors.map(e => ({ ...e }));
  }

  // ============================================================
  // size getter
  // ============================================================

  /** @returns {number} */
  get size() {
    return this._assets.size;
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建资产注册表
 * @param {object} [options]
 * @returns {AssetRegistry}
 */
function createAssetRegistry(options) {
  return new AssetRegistry(options);
}

module.exports = {
  ASSET_REGISTRY_STATUSES,
  VALID_REGISTRY_STATUSES,
  AssetRegistry,
  createAssetRegistry,
};
