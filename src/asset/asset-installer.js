/**
 * AssetInstaller — 资产搜索/安装/升级/回滚
 *
 * 协调 AssetRegistry、AssetInstall、AssetPackageManager，
 * 提供资产的搜索、真实文件安装、升级、回滚和 lock 文件管理。
 */

const fs = require('fs');
const path = require('path');
const { createAssetRegistry, AssetRegistry } = require('./asset-registry');
const { createAssetInstall, AssetInstall } = require('./asset-install');
const { AssetPackageManager } = require('./asset-package-manager');
const { createAssetPackage, validateAssetPackage } = require('./asset-package');
const { createChecksum } = require('../project/json-utils');

// ============================================================
// AssetInstaller 类
// ============================================================

class AssetInstaller {
  /**
   * @param {object} [options]
   * @param {string} [options.storageDir] - NDJSON 持久化目录
   * @param {string} [options.lockPath] - lock 文件路径
   * @param {string} [options.projectRoot] - 目标项目根目录
   * @param {string} [options.packagesDir] - 资产包目录
   * @param {string} [options.backupDir] - 备份目录
   */
  constructor(options = {}) {
    const storageDir = options.storageDir || null;

    /** @type {AssetRegistry} */
    this.registry = createAssetRegistry({
      storagePath: storageDir ? path.join(storageDir, 'installer-registry.ndjson') : undefined,
    });

    /** @type {AssetInstall} */
    this.installTracker = createAssetInstall({
      storagePath: storageDir ? path.join(storageDir, 'installs.ndjson') : undefined,
    });

    /** @type {string|null} */
    this.lockPath = options.lockPath || null;

    /** @type {string} */
    this.projectRoot = options.projectRoot || process.cwd();

    /** @type {string|null} */
    this.packagesDir = options.packagesDir || null;

    /** @type {AssetPackageManager} */
    this.packageManager = new AssetPackageManager(this.projectRoot, {
      backupDir: options.backupDir || path.join(this.projectRoot, '.ai-spec/backups'),
    });
  }

  // ============================================================
  // _resolvePackage — 从 packagesDir 读取资产包
  // ============================================================

  /**
   * 从 packagesDir 解析资产包
   * @param {string} assetId
   * @param {string} version
   * @returns {{ pkg: object, fileMap: object }}
   */
  _resolvePackage(assetId, version) {
    if (!this.packagesDir) {
      throw new Error('未配置资产包目录 (packagesDir)');
    }

    const pkgDir = path.join(this.packagesDir, assetId, version);
    if (!fs.existsSync(pkgDir)) {
      throw new Error(`资产包不存在: ${assetId}@${version}`);
    }

    const manifestPath = path.join(pkgDir, 'manifest.json');
    if (!fs.existsSync(manifestPath)) {
      throw new Error(`资产包 manifest 不存在: ${manifestPath}`);
    }

    const pkg = JSON.parse(fs.readFileSync(manifestPath, 'utf-8'));

    const fileMap = {};
    if (pkg.generatedFiles && Array.isArray(pkg.generatedFiles)) {
      for (const relPath of pkg.generatedFiles) {
        const filePath = path.join(pkgDir, relPath);
        if (fs.existsSync(filePath)) {
          fileMap[relPath] = fs.readFileSync(filePath, 'utf-8');
        }
      }
    }

    return { pkg, fileMap };
  }

  // ============================================================
  // search — 搜索资产
  // ============================================================

  /**
   * 搜索资产（关键词 + 类型 + 标签过滤）
   * @param {object} query
   * @param {string} [query.keyword] - 关键词（匹配 name 和 description）
   * @param {string} [query.assetType] - 资产类型过滤
   * @param {string[]} [query.tags] - 标签过滤（任一匹配）
   * @returns {object[]}
   */
  search(query) {
    const filters = {};
    if (query.assetType) {
      filters.assetType = query.assetType;
    }

    let results = this.registry.list(filters);

    if (query.keyword) {
      const kw = query.keyword.toLowerCase();
      results = results.filter(r =>
        (r.name && r.name.toLowerCase().includes(kw)) ||
        (r.description && r.description.toLowerCase().includes(kw))
      );
    }

    if (query.tags && query.tags.length > 0) {
      results = results.filter(r => {
        if (!r.tags || !Array.isArray(r.tags)) return false;
        return query.tags.some(t => r.tags.includes(t));
      });
    }

    return results;
  }

  // ============================================================
  // install — 安装资产到项目
  // ============================================================

  /**
   * 安装资产到项目
   * @param {string} assetId
   * @param {string} version
   * @param {string} projectId
   * @param {object} [options]
   * @param {boolean} [options.dryRun] - 仅预览，不实际写入文件
   * @returns {object} 安装记录
   */
  install(assetId, version, projectId, options = {}) {
    const asset = this.registry.get(assetId);
    if (!asset) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    const { pkg, fileMap } = this._resolvePackage(assetId, version);

    if (options.dryRun) {
      return {
        installId: 'dry-run',
        assetId,
        version,
        projectId,
        status: 'dry_run',
        installedAt: new Date().toISOString(),
        installedFiles: Object.keys(fileMap).map(p => ({
          source: p,
          target: p,
          checksum: '',
          action: 'would_create',
        })),
        checksum: '',
        metadata: {},
      };
    }

    let installResult;
    try {
      installResult = this.packageManager.install(pkg, fileMap);
    } catch (err) {
      const record = this.installTracker.record({
        assetId,
        version,
        projectId,
        status: 'failed',
        installedFiles: [],
        checksum: '',
        metadata: { error: err.message },
      });
      return record;
    }

    if (!installResult.ok) {
      const record = this.installTracker.record({
        assetId,
        version,
        projectId,
        status: 'failed',
        installedFiles: [],
        checksum: '',
        metadata: { errors: installResult.errors },
      });
      return record;
    }

    const installedFiles = installResult.installedFiles.map(p => ({
      source: p,
      target: p,
      checksum: this._computeFileChecksum(p),
      action: 'created',
    }));

    const checksum = this._computeAggregateChecksum(installedFiles);

    const record = this.installTracker.record({
      assetId,
      version,
      projectId,
      status: 'installed',
      installedFiles,
      checksum,
      metadata: {},
    });

    return record;
  }

  // ============================================================
  // upgrade — 升级资产
  // ============================================================

  /**
   * 升级资产到新版本
   * @param {string} assetId
   * @param {string} newVersion
   * @param {string} projectId
   * @param {object} [options]
   * @param {boolean} [options.dryRun]
   * @returns {object} 安装记录
   */
  upgrade(assetId, newVersion, projectId, options = {}) {
    const asset = this.registry.get(assetId);
    if (!asset) {
      throw new Error(`资产不存在: ${assetId}`);
    }

    const history = this.installTracker.list({ assetId, projectId });
    const sorted = history
      .filter(r => r.status === 'installed' || r.status === 'upgraded')
      .sort((a, b) => {
        const cmp = b.installedAt.localeCompare(a.installedAt);
        return cmp !== 0 ? cmp : b.installId.localeCompare(a.installId);
      });
    const previousVersion = sorted.length > 0 ? sorted[0].version : null;

    const { pkg: newPkg, fileMap: newFileMap } = this._resolvePackage(assetId, newVersion);

    if (options.dryRun) {
      return {
        installId: 'dry-run',
        assetId,
        version: newVersion,
        projectId,
        status: 'dry_run',
        installedAt: new Date().toISOString(),
        installedFiles: Object.keys(newFileMap).map(p => ({
          source: p,
          target: p,
          checksum: '',
          action: 'would_update',
        })),
        checksum: '',
        metadata: { previousVersion },
      };
    }

    let upgradeResult;
    try {
      const oldPkg = previousVersion
        ? this._resolvePackage(assetId, previousVersion).pkg
        : createAssetPackage({ assetId, version: '0.0.0', generatedFiles: [] });
      upgradeResult = this.packageManager.upgrade(oldPkg, newPkg, newFileMap);
    } catch (err) {
      const record = this.installTracker.record({
        assetId,
        version: newVersion,
        projectId,
        status: 'failed',
        installedFiles: [],
        checksum: '',
        metadata: { error: err.message, previousVersion },
      });
      return record;
    }

    if (!upgradeResult.ok) {
      const record = this.installTracker.record({
        assetId,
        version: newVersion,
        projectId,
        status: 'failed',
        installedFiles: [],
        checksum: '',
        metadata: { errors: upgradeResult.errors, previousVersion },
      });
      return record;
    }

    const installedFiles = upgradeResult.upgradedFiles.map(p => ({
      source: p,
      target: p,
      checksum: this._computeFileChecksum(p),
      action: 'updated',
    }));

    const checksum = this._computeAggregateChecksum(installedFiles);

    const record = this.installTracker.record({
      assetId,
      version: newVersion,
      projectId,
      status: 'upgraded',
      installedFiles,
      checksum,
      metadata: { previousVersion, newVersion, backupId: upgradeResult.backupId || '' },
    });

    return record;
  }

  // ============================================================
  // rollback — 回滚资产
  // ============================================================

  /**
   * 回滚资产到上一版本
   * @param {string} assetId
   * @param {string} projectId
   * @param {object} [options]
   * @param {boolean} [options.dryRun]
   * @returns {object} 安装记录
   */
  rollback(assetId, projectId, options = {}) {
    const history = this.installTracker.list({ assetId, projectId });
    if (history.length === 0) {
      throw new Error(`未找到安装记录: ${assetId} in ${projectId}`);
    }

    const sorted = history
      .sort((a, b) => {
        const cmp = b.installedAt.localeCompare(a.installedAt);
        return cmp !== 0 ? cmp : b.installId.localeCompare(a.installId);
      });

    const currentRecord = sorted[0];
    const currentVersion = currentRecord.version;

    const previousRecords = sorted.slice(1)
      .filter(r => r.status === 'installed' || r.status === 'upgraded' || r.status === 'rolled_back');
    const previousVersion = previousRecords.length > 0 ? previousRecords[0].version : null;

    if (!previousVersion) {
      throw new Error(`无法回滚: ${assetId} 没有可回滚的版本`);
    }

    if (options.dryRun) {
      return {
        installId: 'dry-run',
        assetId,
        version: previousVersion,
        projectId,
        status: 'dry_run',
        installedAt: new Date().toISOString(),
        installedFiles: [],
        checksum: '',
        metadata: { rolledbackFrom: currentVersion },
      };
    }

    let rollbackOk = true;
    try {
      const { pkg: currentPkg } = this._resolvePackage(assetId, currentVersion);
      const savedBackupId = (currentRecord.metadata && currentRecord.metadata.backupId) || '';
      const backupId = savedBackupId || `${assetId}@${currentVersion}-${Date.now()}`;
      this.packageManager.rollback(backupId, currentPkg);
    } catch {
      rollbackOk = false;
    }

    const record = this.installTracker.record({
      assetId,
      version: previousVersion,
      projectId,
      status: 'rolled_back',
      installedFiles: [],
      checksum: '',
      metadata: { rolledbackFrom: currentVersion, rollbackOk },
    });

    return record;
  }

  // ============================================================
  // updateLock — 更新 lock 文件
  // ============================================================

  /**
   * 更新 ai-spec.lock
   * @param {string} projectId
   * @returns {object} lock 数据
   */
  updateLock(projectId) {
    const history = this.installTracker.list({ projectId });

    const latestMap = new Map();
    for (const record of history) {
      const existing = latestMap.get(record.assetId);
      if (!existing || record.installedAt > existing.installedAt || (record.installedAt === existing.installedAt && record.installId > existing.installId)) {
        latestMap.set(record.assetId, record);
      }
    }

    const assets = [...latestMap.values()].map(r => ({
      assetId: r.assetId,
      version: r.version,
      status: r.status,
      installedAt: r.installedAt,
      checksum: r.checksum || '',
      installedFiles: r.installedFiles || [],
    }));

    const lock = {
      lockVersion: 1,
      projectId,
      assets,
      lockedAt: new Date().toISOString(),
    };

    if (this.lockPath) {
      const dir = path.dirname(this.lockPath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.lockPath, JSON.stringify(lock, null, 2), 'utf-8');
    }

    return lock;
  }

  // ============================================================
  // getInstallHistory — 安装历史
  // ============================================================

  /**
   * 获取项目安装历史
   * @param {string} projectId
   * @returns {object[]}
   */
  getInstallHistory(projectId) {
    return this.installTracker.list({ projectId });
  }

  // ============================================================
  // 内部工具方法
  // ============================================================

  _computeFileChecksum(relativePath) {
    const fullPath = path.join(this.projectRoot, relativePath);
    if (!fs.existsSync(fullPath)) return '';
    const content = fs.readFileSync(fullPath, 'utf-8');
    return createChecksum(content);
  }

  _computeAggregateChecksum(installedFiles) {
    const parts = installedFiles
      .map(f => `${f.target}:${f.checksum}`)
      .sort()
      .join('\n');
    return createChecksum(parts);
  }
}

// ============================================================
// 工厂函数
// ============================================================

/**
 * 创建资产安装器
 * @param {object} [options]
 * @returns {AssetInstaller}
 */
function createAssetInstaller(options) {
  return new AssetInstaller(options);
}

module.exports = {
  createAssetInstaller,
  AssetInstaller,
};
