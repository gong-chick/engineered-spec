/**
 * AssetManager — 统一资产管理器
 *
 * 协调 AssetRegistry、AssetVersion、AssetDependency 三个基础模型，
 * 提供资产的 CRUD、版本快照、依赖声明和详情查询能力。
 * 支持通过 storageDir 选项启用 NDJSON 持久化。
 */

const path = require('path');
const { AssetRegistry, createAssetRegistry } = require('./asset-registry');
const { AssetVersion, createAssetVersion } = require('./asset-version');
const { AssetDependency, createAssetDependency } = require('./asset-dependency');

// ============================================================
// 校验
// ============================================================

function validateAssetSpec(spec) {
  const errors = [];

  if (!spec.assetId || typeof spec.assetId !== 'string') {
    errors.push('assetId 必须为非空字符串');
  }
  if (!spec.assetType || typeof spec.assetType !== 'string') {
    errors.push('assetType 必须为非空字符串');
  }
  if (!spec.name || typeof spec.name !== 'string') {
    errors.push('name 必须为非空字符串');
  }
  if (!spec.currentVersion || typeof spec.currentVersion !== 'string') {
    errors.push('currentVersion 必须为非空字符串');
  }

  return { ok: errors.length === 0, errors };
}

// ============================================================
// AssetManager 类
// ============================================================

class AssetManager {
  /**
   * @param {object} [options]
   * @param {string} [options.storageDir] - NDJSON 持久化目录
   */
  constructor(options = {}) {
    const storageDir = options.storageDir || null;

    /** @type {AssetRegistry} */
    this.registry = createAssetRegistry({
      storagePath: storageDir ? path.join(storageDir, 'registry.ndjson') : undefined,
    });

    /** @type {AssetVersion} */
    this._version = createAssetVersion({
      storagePath: storageDir ? path.join(storageDir, 'versions.ndjson') : undefined,
    });

    /** @type {AssetDependency} */
    this._dependency = createAssetDependency({
      storagePath: storageDir ? path.join(storageDir, 'dependencies.ndjson') : undefined,
    });
  }

  // ============================================================
  // createAsset — 创建资产
  // ============================================================

  /**
   * 创建资产（注册 + 初始版本）
   * @param {object} spec
   * @returns {{ asset: object, version: object }}
   */
  createAsset(spec) {
    const validation = validateAssetSpec(spec);
    if (!validation.ok) {
      throw new Error(`资产校验失败: ${validation.errors.join('; ')}`);
    }

    // 检查是否已存在
    const existing = this.registry.get(spec.assetId);
    if (existing) {
      throw new Error(`资产已存在: ${spec.assetId}`);
    }

    // 注册到 Registry
    const asset = this.registry.register({
      assetId: spec.assetId,
      assetType: spec.assetType,
      name: spec.name,
      description: spec.description || '',
      source: spec.source || 'local',
      currentVersion: spec.currentVersion,
      status: spec.status || 'active',
      tags: spec.tags || [],
      owner: spec.owner || '',
      metadata: spec.metadata || {},
    });

    // 创建初始版本
    const version = this._version.create(spec.assetId, {
      version: spec.currentVersion,
      changelog: spec.changelog || '初始版本',
      checksum: spec.checksum || '',
      fileMap: spec.fileMap || {},
      dependencies: spec.dependencies || [],
      createdBy: spec.createdBy || '',
    });

    return { asset, version };
  }

  // ============================================================
  // editAsset — 编辑资产元数据
  // ============================================================

  /**
   * 编辑资产元数据
   * @param {string} assetId
   * @param {object} patch
   * @returns {object} 更新后的资产记录
   */
  editAsset(assetId, patch) {
    const existing = this.registry.get(assetId);
    if (!existing) {
      throw new Error(`资产不存在: ${assetId}`);
    }
    return this.registry.update(assetId, patch);
  }

  // ============================================================
  // getAsset — 查看资产详情
  // ============================================================

  /**
   * 查看资产详情
   * @param {string} assetId
   * @returns {object|null}
   */
  getAsset(assetId) {
    return this.registry.get(assetId);
  }

  // ============================================================
  // listAssets — 列表查询
  // ============================================================

  /**
   * 列表查询
   * @param {object} [filters]
   * @returns {object[]}
   */
  listAssets(filters) {
    return this.registry.list(filters);
  }

  // ============================================================
  // createVersion — 创建版本快照
  // ============================================================

  /**
   * 创建版本快照
   * @param {string} assetId
   * @param {object} versionSpec
   * @returns {object} 版本记录
   */
  createVersion(assetId, versionSpec) {
    const existing = this.registry.get(assetId);
    if (!existing) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    const version = this._version.create(assetId, {
      version: versionSpec.version,
      changelog: versionSpec.changelog || '',
      checksum: versionSpec.checksum || '',
      fileMap: versionSpec.fileMap || {},
      dependencies: versionSpec.dependencies || [],
      createdBy: versionSpec.createdBy || '',
    });

    // 更新 Registry 中的 currentVersion
    this.registry.update(assetId, { currentVersion: versionSpec.version });

    return version;
  }

  // ============================================================
  // declareDependency — 声明依赖
  // ============================================================

  /**
   * 声明依赖
   * @param {string} assetId
   * @param {string} dependsOn
   * @param {string} [constraint]
   * @returns {object} 依赖记录
   */
  declareDependency(assetId, dependsOn, constraint) {
    const existing = this.registry.get(assetId);
    if (!existing) {
      throw new Error(`资产不存在: ${assetId}`);
    }
    return this._dependency.add(assetId, dependsOn, constraint || '*');
  }

  // ============================================================
  // getAssetWithDeps — 获取资产及其依赖树
  // ============================================================

  /**
   * 获取资产及其依赖树
   * @param {string} assetId
   * @returns {{ asset: object, dependencies: object[], versions: object[] }}
   */
  getAssetWithDeps(assetId) {
    const asset = this.registry.get(assetId);
    if (!asset) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    const dependencies = this._dependency.getDependencies(assetId);
    const versions = this._version.list(assetId);

    return { asset, dependencies, versions };
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建统一资产管理器
 * @param {object} [options]
 * @returns {AssetManager}
 */
function createAssetManager(options) {
  return new AssetManager(options);
}

module.exports = {
  createAssetManager,
  AssetManager,
};
