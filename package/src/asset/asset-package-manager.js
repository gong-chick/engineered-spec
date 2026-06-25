/**
 * AssetPackageManager — 资产包生命周期管理
 *
 * 统一管理资产包的安装、升级、回滚、checksum 校验和 generatedFiles 追踪。
 * 在现有 local-init 和 hub-install 之上提供标准化抽象层。
 */

const fs = require('fs');
const path = require('path');
const { createChecksum, readJsonIfExists, writeJson, ensureDir, toPosixPath } = require('../project/json-utils');
const {
  ASSET_TYPES,
  ASSET_SOURCES,
  createAssetPackage,
  validateAssetPackage,
  computeAssetChecksum,
  guessAssetType,
  buildAssetIdentity,
} = require('./asset-package');

// ============================================================
// 包级 checksum 计算
// ============================================================

/**
 * 基于 generatedFiles 计算包级 checksum
 * 规则：对文件排序后，拼接 "相对路径 + 分隔符 + 文件内容"，整体计算 sha256
 * 使用 posix 路径分隔符保证跨平台一致性
 * @param {string} rootDir
 * @param {string[]} generatedFiles
 * @returns {string}
 */
function computePackageChecksumFromFiles(rootDir, generatedFiles) {
  const sorted = [...generatedFiles].sort();
  const parts = [];
  for (const filePath of sorted) {
    const posixPath = toPosixPath(filePath);
    const fullPath = path.join(rootDir, filePath);
    const content = fs.readFileSync(fullPath, 'utf8');
    parts.push(`${posixPath}\n---AI_SPEC_FILE_CONTENT---\n${content}`);
  }
  return createChecksum(parts.join('\n'));
}

// ============================================================
// AssetPackageManager
// ============================================================

class AssetPackageManager {
  /**
   * @param {string} rootDir - 项目根目录
   * @param {Object} [options]
   * @param {string} [options.backupDir] - 备份目录，默认 .ai-spec/backups
   */
  constructor(rootDir, options = {}) {
    this.rootDir = rootDir;
    this.backupDir = options.backupDir || path.join(rootDir, '.ai-spec/backups');
  }

  // ============================================================
  // install — 安装资产包
  // ============================================================

  /**
   * 安装资产包到项目
   * @param {AssetPackage} pkg - 资产包
   * @param {Object} fileMap - { relativePath: content } 的文件映射
   * @returns {{ ok: boolean, installedFiles: string[], errors: string[] }}
   */
  install(pkg, fileMap = {}) {
    const errors = [];

    // 校验资产包
    const validation = validateAssetPackage(pkg);
    if (!validation.ok) {
      return { ok: false, installedFiles: [], errors: validation.errors };
    }

    const installedFiles = [];

    try {
      for (const [relativePath, content] of Object.entries(fileMap)) {
        const fullPath = path.join(this.rootDir, relativePath);
        ensureDir(path.dirname(fullPath));
        fs.writeFileSync(fullPath, content, 'utf8');
        installedFiles.push(relativePath);
      }

      return { ok: true, installedFiles, errors: [] };
    } catch (error) {
      // 安装失败时回滚已写入文件
      for (const filePath of installedFiles) {
        try {
          const fullPath = path.join(this.rootDir, filePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
          }
        } catch {
          // 回滚失败记录但不阻断
          errors.push(`回滚失败: ${filePath}`);
        }
      }
      errors.push(`安装失败: ${error.message}`);
      return { ok: false, installedFiles: [], errors };
    }
  }

  // ============================================================
  // upgrade — 升级资产包
  // ============================================================

  /**
   * 升级资产包：备份旧版本、写入新版本
   * @param {AssetPackage} oldPkg - 旧资产包
   * @param {AssetPackage} newPkg - 新资产包
   * @param {Object} newFileMap - 新版本的文件映射
   * @returns {{ ok: boolean, upgradedFiles: string[], backupId: string, errors: string[] }}
   */
  upgrade(oldPkg, newPkg, newFileMap = {}) {
    const errors = [];

    // 校验新资产包
    const validation = validateAssetPackage(newPkg);
    if (!validation.ok) {
      return { ok: false, upgradedFiles: [], backupId: '', errors: validation.errors };
    }

    // 备份旧文件
    const backupId = `${oldPkg.assetId}@${oldPkg.version}-${Date.now()}`;
    const backupPath = path.join(this.backupDir, backupId);

    try {
      ensureDir(backupPath);

      // 备份旧资产生成的文件
      for (const filePath of oldPkg.generatedFiles) {
        const fullPath = path.join(this.rootDir, filePath);
        if (fs.existsSync(fullPath)) {
          const backupFilePath = path.join(backupPath, filePath);
          ensureDir(path.dirname(backupFilePath));
          fs.copyFileSync(fullPath, backupFilePath);
        }
      }

      // 保存旧资产包元数据
      writeJson(path.join(backupPath, '.asset-package.json'), oldPkg);

      // 安装新版本
      const installResult = this.install(newPkg, newFileMap);
      if (!installResult.ok) {
        return { ok: false, upgradedFiles: [], backupId, errors: installResult.errors };
      }

      return { ok: true, upgradedFiles: installResult.installedFiles, backupId, errors: [] };
    } catch (error) {
      errors.push(`升级失败: ${error.message}`);
      return { ok: false, upgradedFiles: [], backupId, errors };
    }
  }

  // ============================================================
  // rollback — 回滚资产包
  // ============================================================

  /**
   * 回滚资产包到指定备份
   * @param {string} backupId - 备份 ID
   * @param {AssetPackage} currentPkg - 当前资产包
   * @returns {{ ok: boolean, restoredFiles: string[], deletedFiles: string[], errors: string[] }}
   */
  rollback(backupId, currentPkg) {
    const backupPath = path.join(this.backupDir, backupId);
    const errors = [];
    const restoredFiles = [];
    const deletedFiles = [];

    if (!fs.existsSync(backupPath)) {
      return { ok: false, restoredFiles, deletedFiles, errors: [`备份不存在: ${backupId}`] };
    }

    try {
      // 读取备份的资产包元数据
      const backupPkg = readJsonIfExists(path.join(backupPath, '.asset-package.json'));

      // 删除当前版本新增的文件（备份中不存在的）
      for (const filePath of currentPkg.generatedFiles) {
        const backupFilePath = path.join(backupPath, filePath);
        if (!fs.existsSync(backupFilePath)) {
          const fullPath = path.join(this.rootDir, filePath);
          if (fs.existsSync(fullPath)) {
            fs.unlinkSync(fullPath);
            deletedFiles.push(filePath);
          }
        }
      }

      // 恢复备份中的文件
      const filesToRestore = backupPkg ? backupPkg.generatedFiles : [];
      for (const filePath of filesToRestore) {
        const backupFilePath = path.join(backupPath, filePath);
        if (fs.existsSync(backupFilePath)) {
          const fullPath = path.join(this.rootDir, filePath);
          ensureDir(path.dirname(fullPath));
          fs.copyFileSync(backupFilePath, fullPath);
          restoredFiles.push(filePath);
        }
      }

      return { ok: true, restoredFiles, deletedFiles, errors: [] };
    } catch (error) {
      errors.push(`回滚失败: ${error.message}`);
      return { ok: false, restoredFiles, deletedFiles, errors };
    }
  }

  // ============================================================
  // verifyChecksum — checksum 校验
  // ============================================================

  /**
   * 校验资产包的 checksum 是否与文件内容一致
   * @param {AssetPackage} pkg
   * @returns {{ ok: boolean, expected: string, actual: string, errors: string[] }}
   */
  verifyChecksum(pkg) {
    const errors = [];

    if (!pkg.generatedFiles || pkg.generatedFiles.length === 0) {
      return { ok: true, expected: pkg.checksum || '', actual: pkg.checksum || '', errors };
    }

    // 检查所有文件是否存在
    for (const filePath of pkg.generatedFiles) {
      const fullPath = path.join(this.rootDir, filePath);
      if (!fs.existsSync(fullPath)) {
        errors.push(`文件不存在: ${filePath}`);
      }
    }

    if (errors.length > 0) {
      return { ok: false, expected: pkg.checksum, actual: '', errors };
    }

    // 计算包级 checksum 并与 pkg.checksum 比较
    const actual = computePackageChecksumFromFiles(this.rootDir, pkg.generatedFiles);
    const ok = actual === pkg.checksum;

    return { ok, expected: pkg.checksum, actual, errors };
  }

  /**
   * 校验单个文件的 checksum
   * @param {string} relativePath
   * @param {string} expectedChecksum
   * @returns {{ ok: boolean, actual: string }}
   */
  verifyFileChecksum(relativePath, expectedChecksum) {
    const fullPath = path.join(this.rootDir, relativePath);
    if (!fs.existsSync(fullPath)) {
      return { ok: false, actual: '' };
    }

    const content = fs.readFileSync(fullPath, 'utf8');
    const actual = computeAssetChecksum(content);
    return { ok: actual === expectedChecksum, actual };
  }

  // ============================================================
  // generatedFiles — 清单追踪
  // ============================================================

  /**
   * 获取资产包生成的文件列表
   * @param {AssetPackage} pkg
   * @returns {Array<{ path: string, exists: boolean }>}
   */
  getGeneratedFiles(pkg) {
    if (!pkg.generatedFiles || !Array.isArray(pkg.generatedFiles)) {
      return [];
    }

    return pkg.generatedFiles.map((filePath) => ({
      path: filePath,
      exists: fs.existsSync(path.join(this.rootDir, filePath)),
    }));
  }

  /**
   * 清理资产包生成的所有文件
   * @param {AssetPackage} pkg
   * @returns {{ deletedFiles: string[], errors: string[] }}
   */
  cleanupGeneratedFiles(pkg) {
    const deletedFiles = [];
    const errors = [];

    if (!pkg.generatedFiles || !Array.isArray(pkg.generatedFiles)) {
      return { deletedFiles, errors };
    }

    for (const filePath of pkg.generatedFiles) {
      const fullPath = path.join(this.rootDir, filePath);
      try {
        if (fs.existsSync(fullPath)) {
          fs.unlinkSync(fullPath);
          deletedFiles.push(filePath);
        }
      } catch (error) {
        errors.push(`删除失败: ${filePath} - ${error.message}`);
      }
    }

    return { deletedFiles, errors };
  }

  // ============================================================
  // listBackups — 列出备份
  // ============================================================

  /**
   * 列出指定资产的所有备份
   * @param {string} assetId
   * @returns {Array<{ backupId: string, backupPath: string, pkg: AssetPackage|null }>}
   */
  listBackups(assetId) {
    if (!fs.existsSync(this.backupDir)) {
      return [];
    }

    const backups = [];
    const entries = fs.readdirSync(this.backupDir);

    for (const entry of entries) {
      if (!entry.startsWith(assetId)) continue;
      const backupPath = path.join(this.backupDir, entry);
      if (!fs.statSync(backupPath).isDirectory()) continue;

      const pkg = readJsonIfExists(path.join(backupPath, '.asset-package.json'));
      backups.push({ backupId: entry, backupPath, pkg });
    }

    return backups;
  }
}

module.exports = {
  AssetPackageManager,
  computePackageChecksumFromFiles,
};
