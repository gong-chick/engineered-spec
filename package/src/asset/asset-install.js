/**
 * AssetInstall — 资产安装记录模型
 *
 * 管理资产安装记录的创建、查询和状态更新，
 * 支持 NDJSON 文件持久化。
 */

const fs = require('fs');
const path = require('path');
const { redactObject } = require('../governance/audit-log');

// ============================================================
// 常量
// ============================================================

/** 安装状态枚举 */
const INSTALL_STATUSES = Object.freeze({
  INSTALLED: 'installed',
  FAILED: 'failed',
  ROLLED_BACK: 'rolled_back',
  UPGRADED: 'upgraded',
});

/** 合法状态值 */
const VALID_INSTALL_STATUSES = new Set(Object.values(INSTALL_STATUSES));

// ============================================================
// 校验
// ============================================================

const REQUIRED_FIELDS = ['assetId', 'version', 'projectId'];

function validateInstallSpec(spec) {
  const errors = [];
  for (const field of REQUIRED_FIELDS) {
    if (!spec[field] || typeof spec[field] !== 'string') {
      errors.push(`${field} 必须为非空字符串`);
    }
  }
  return { ok: errors.length === 0, errors };
}

// ============================================================
// AssetInstall 类
// ============================================================

class AssetInstall {
  /**
   * @param {object} [options]
   * @param {string} [options.storagePath] - NDJSON 持久化路径
   */
  constructor(options = {}) {
    /** @type {Map<string, object>} installId -> record */
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
        if (entry.installId) {
          this._records.set(entry.installId, entry);

          // 恢复 ID 编号
          const match = String(entry.installId).match(/^inst-(\d+)$/);
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
  // record — 记录安装
  // ============================================================

  /**
   * 记录一次安装
   * @param {object} spec
   * @returns {object} 安装记录
   */
  record(spec) {
    const validation = validateInstallSpec(spec);
    if (!validation.ok) {
      throw new Error(`安装记录校验失败: ${validation.errors.join('; ')}`);
    }

    const record = {
      installId: `inst-${this._nextId++}`,
      assetId: spec.assetId,
      version: spec.version,
      projectId: spec.projectId,
      status: spec.status || 'installed',
      installedAt: new Date().toISOString(),
      installedFiles: Array.isArray(spec.installedFiles) ? [...spec.installedFiles] : [],
      checksum: spec.checksum || '',
      metadata: redactObject(spec.metadata || {}),
    };

    this._records.set(record.installId, record);
    this._appendToFile(record);

    return { ...record, installedFiles: [...record.installedFiles], metadata: { ...record.metadata } };
  }

  // ============================================================
  // get — 获取安装记录
  // ============================================================

  /**
   * 获取安装记录
   * @param {string} installId
   * @returns {object|null}
   */
  get(installId) {
    const record = this._records.get(installId);
    if (!record) return null;
    return { ...record, installedFiles: [...record.installedFiles], metadata: { ...record.metadata } };
  }

  // ============================================================
  // list — 查询
  // ============================================================

  /**
   * 查询安装记录
   * @param {object} [filters]
   * @param {string} [filters.assetId]
   * @param {string} [filters.projectId]
   * @param {string} [filters.status]
   * @returns {object[]}
   */
  list(filters = {}) {
    let results = [...this._records.values()];

    if (filters.assetId) {
      results = results.filter(r => r.assetId === filters.assetId);
    }
    if (filters.projectId) {
      results = results.filter(r => r.projectId === filters.projectId);
    }
    if (filters.status) {
      results = results.filter(r => r.status === filters.status);
    }

    return results.map(r => ({ ...r, installedFiles: [...r.installedFiles], metadata: { ...r.metadata } }));
  }

  // ============================================================
  // updateStatus — 更新安装状态
  // ============================================================

  /**
   * 更新安装状态
   * @param {string} installId
   * @param {string} status
   * @returns {object} 更新后的记录
   */
  updateStatus(installId, status) {
    if (!VALID_INSTALL_STATUSES.has(status)) {
      throw new Error(`无效的安装状态: ${status}，必须是 ${[...VALID_INSTALL_STATUSES].join('/')} 之一`);
    }

    const existing = this._records.get(installId);
    if (!existing) {
      throw new Error(`安装记录不存在: ${installId}`);
    }

    const updated = { ...existing, status };
    this._records.set(installId, updated);
    this._appendToFile(updated);

    return { ...updated, installedFiles: [...updated.installedFiles], metadata: { ...updated.metadata } };
  }

  // ============================================================
  // getInstalledAssets — 获取项目已安装资产
  // ============================================================

  /**
   * 获取项目已安装的资产列表
   * @param {string} projectId
   * @returns {object[]}
   */
  getInstalledAssets(projectId) {
    return [...this._records.values()]
      .filter(r => r.projectId === projectId && r.status === 'installed')
      .map(r => ({ ...r, installedFiles: [...r.installedFiles], metadata: { ...r.metadata } }));
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
 * 创建资产安装记录管理器
 * @param {object} [options]
 * @returns {AssetInstall}
 */
function createAssetInstall(options) {
  return new AssetInstall(options);
}

module.exports = {
  INSTALL_STATUSES,
  VALID_INSTALL_STATUSES,
  createAssetInstall,
  AssetInstall,
};
