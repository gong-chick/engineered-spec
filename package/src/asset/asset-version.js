/**
 * AssetVersion — 资产版本模型
 *
 * 管理资产版本快照的创建、查询、比较和递增，
 * 支持 NDJSON 文件持久化。
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// semver 工具函数
// ============================================================

const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

/**
 * 解析 semver 字符串
 * @param {string} version
 * @returns {{ major: number, minor: number, patch: number }}
 */
function parseSemver(version) {
  const match = SEMVER_RE.exec(version);
  if (!match) {
    throw new Error(`无效的 semver 格式: ${version}，期望 x.y.z`);
  }
  return {
    major: parseInt(match[1], 10),
    minor: parseInt(match[2], 10),
    patch: parseInt(match[3], 10),
  };
}

/**
 * 比较两个 semver 版本
 * @param {string} v1
 * @param {string} v2
 * @returns {number} -1 / 0 / 1
 */
function compareSemver(v1, v2) {
  const a = parseSemver(v1);
  const b = parseSemver(v2);

  if (a.major !== b.major) return a.major < b.major ? -1 : 1;
  if (a.minor !== b.minor) return a.minor < b.minor ? -1 : 1;
  if (a.patch !== b.patch) return a.patch < b.patch ? -1 : 1;
  return 0;
}

/**
 * 版本号递增
 * @param {string} current - 当前版本
 * @param {'major'|'minor'|'patch'} type
 * @returns {string} 新版本
 */
function bumpVersion(current, type) {
  const v = parseSemver(current);

  if (type === 'major') return `${v.major + 1}.0.0`;
  if (type === 'minor') return `${v.major}.${v.minor + 1}.0`;
  if (type === 'patch') return `${v.major}.${v.minor}.${v.patch + 1}`;

  throw new Error(`无效的递增类型: ${type}，期望 major/minor/patch`);
}

// ============================================================
// AssetVersion 类
// ============================================================

class AssetVersion {
  /**
   * @param {object} [options]
   * @param {string} [options.storagePath] - NDJSON 持久化路径
   * @param {number} [options.maxRecords] - 最大记录数
   */
  constructor(options = {}) {
    /** @type {Map<string, object[]>} assetId -> version records */
    this._versions = new Map();
    /** @type {number} */
    this._nextId = 1;
    /** @type {string|null} */
    this.storagePath = options.storagePath || null;
    /** @type {number} */
    this._maxRecords = options.maxRecords || 50000;
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
    this._versions.clear();

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);
        if (!entry.assetId) continue;

        if (!this._versions.has(entry.assetId)) {
          this._versions.set(entry.assetId, []);
        }
        this._versions.get(entry.assetId).push(entry);

        // 恢复 ID 编号
        if (entry.versionId) {
          const match = String(entry.versionId).match(/^ver-(\d+)$/);
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
  // create — 创建版本快照
  // ============================================================

  /**
   * 创建版本快照
   * @param {string} assetId
   * @param {object} spec
   * @returns {object} 版本记录
   */
  create(assetId, spec) {
    if (!assetId || typeof assetId !== 'string') {
      throw new Error('assetId 必须为非空字符串');
    }
    if (!spec || !spec.version || typeof spec.version !== 'string') {
      throw new Error('version 必须为非空字符串');
    }

    // 校验 semver 格式
    parseSemver(spec.version);

    const record = {
      versionId: `ver-${this._nextId++}`,
      assetId,
      version: spec.version,
      changelog: spec.changelog || '',
      checksum: spec.checksum || '',
      fileMap: spec.fileMap || {},
      dependencies: Array.isArray(spec.dependencies) ? [...spec.dependencies] : [],
      createdAt: new Date().toISOString(),
      createdBy: spec.createdBy || 'system',
    };

    if (!this._versions.has(assetId)) {
      this._versions.set(assetId, []);
    }
    this._versions.get(assetId).push(record);

    this._appendToFile(record);

    return { ...record, fileMap: { ...record.fileMap }, dependencies: [...record.dependencies] };
  }

  // ============================================================
  // get — 获取指定版本
  // ============================================================

  /**
   * 获取指定版本
   * @param {string} assetId
   * @param {string} version
   * @returns {object|null}
   */
  get(assetId, version) {
    const list = this._versions.get(assetId);
    if (!list) return null;

    const record = list.find(r => r.version === version);
    if (!record) return null;

    return { ...record, fileMap: { ...record.fileMap }, dependencies: [...record.dependencies] };
  }

  // ============================================================
  // list — 列出所有版本
  // ============================================================

  /**
   * 列出资产的所有版本
   * @param {string} assetId
   * @returns {object[]}
   */
  list(assetId) {
    const list = this._versions.get(assetId);
    if (!list) return [];

    return list.map(r => ({ ...r, fileMap: { ...r.fileMap }, dependencies: [...r.dependencies] }));
  }

  // ============================================================
  // latest — 获取最新版本
  // ============================================================

  /**
   * 获取最新版本（按 semver 排序）
   * @param {string} assetId
   * @returns {object|null}
   */
  latest(assetId) {
    const list = this._versions.get(assetId);
    if (!list || list.length === 0) return null;

    let max = list[0];
    for (let i = 1; i < list.length; i++) {
      if (compareSemver(list[i].version, max.version) > 0) {
        max = list[i];
      }
    }

    return { ...max, fileMap: { ...max.fileMap }, dependencies: [...max.dependencies] };
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
 * 创建资产版本管理器
 * @param {object} [options]
 * @returns {AssetVersion}
 */
function createAssetVersion(options) {
  return new AssetVersion(options);
}

module.exports = {
  createAssetVersion,
  AssetVersion,
  compareSemver,
  bumpVersion,
};
