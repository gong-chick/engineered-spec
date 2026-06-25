const fs = require('fs');
const path = require('path');
const { LINK_MODES, SYNC_ACTIONS } = require('../ide-types');
const { ensureDir } = require('../../project/json-utils');

class LinkModeResolver {
  /**
   * 按指定模式写入文件
   * @param {string} rootDir - 项目根目录
   * @param {string} relativePath - 相对路径
   * @param {string} content - 文件内容（copy 模式使用）
   * @param {{ mode: string, dryRun?: boolean }} options
   * @returns {{ path: string, action: string, modeUsed: string, warnings: string[] }}
   */
  write(rootDir, relativePath, content, options = {}) {
    const mode = options.mode || LINK_MODES.AUTO;
    const dryRun = options.dryRun || false;
    const filePath = path.join(rootDir, relativePath);
    const warnings = [];
    let modeUsed = mode;

    if (dryRun) {
      const exists = fs.existsSync(filePath);
      return {
        path: relativePath,
        action: exists ? SYNC_ACTIONS.UPDATE : SYNC_ACTIONS.CREATE,
        modeUsed: mode,
        warnings: [],
      };
    }

    if (mode === LINK_MODES.SYMLINK) {
      return this._symlinkWrite(rootDir, relativePath, content, warnings);
    }

    if (mode === LINK_MODES.COPY) {
      return this._copyWrite(rootDir, relativePath, content, warnings);
    }

    // auto 模式：优先 symlink，失败降级 copy
    const symlinkResult = this._trySymlink(rootDir, relativePath);
    if (symlinkResult.success) {
      modeUsed = LINK_MODES.SYMLINK;
      return {
        path: relativePath,
        action: symlinkResult.action,
        modeUsed,
        warnings: [],
      };
    }

    warnings.push(`symlink 失败，自动降级为 copy：${symlinkResult.error}`);
    modeUsed = LINK_MODES.COPY;
    return this._copyWrite(rootDir, relativePath, content, warnings);
  }

  _symlinkWrite(rootDir, relativePath, content, warnings) {
    const result = this._trySymlink(rootDir, relativePath);
    if (!result.success) {
      throw new Error(`symlink 写入失败：${result.error}`);
    }
    return {
      path: relativePath,
      action: result.action,
      modeUsed: LINK_MODES.SYMLINK,
      warnings,
    };
  }

  _copyWrite(rootDir, relativePath, content, warnings) {
    const filePath = path.join(rootDir, relativePath);
    const exists = fs.existsSync(filePath);

    ensureDir(path.dirname(filePath));
    fs.writeFileSync(filePath, `${content}\n`, 'utf8');

    return {
      path: relativePath,
      action: exists ? SYNC_ACTIONS.UPDATE : SYNC_ACTIONS.CREATE,
      modeUsed: LINK_MODES.COPY,
      warnings,
    };
  }

  _trySymlink(rootDir, relativePath) {
    try {
      const filePath = path.join(rootDir, relativePath);
      const exists = fs.existsSync(filePath);

      // 查找源文件（在 br-ai-spec 项目自身中）
      // 指针文件的源内容由 adapters 提供，symlink 模式指向 .agents/ 下的真实资产
      // 由于 IDE 指针文件是轻量内容文件而非目录链接，symlink 模式在此场景下
      // 主要用于 .cursor/commands/ 和 .claude/commands/ 指向 .agents/commands/
      // 对于单个文件，我们使用 copy 作为 fallback
      ensureDir(path.dirname(filePath));

      // 尝试 symlink: 对于 commands 目录，可以 symlink 整个目录
      // 对于单个 pointer 文件，直接写入文件内容
      if (relativePath.includes('commands/')) {
        // commands 目录尝试 symlink 到 .agents/commands/
        return this._symlinkCommandsDir(rootDir, relativePath, exists);
      }

      // 单个文件无法 symlink（没有合适的源），报错
      return {
        success: false,
        error: `单个文件 ${relativePath} 没有可 symlink 的源，请使用 copy 模式`,
      };
    } catch (error) {
      return { success: false, error: error.message };
    }
  }

  _symlinkCommandsDir(rootDir, relativePath, exists) {
    const filePath = path.join(rootDir, relativePath);
    const targetDir = path.dirname(filePath);

    // 尝试找到对应的源目录
    const sourceCandidates = [
      path.join(rootDir, '.agents', 'commands', 'common'),
      path.join(rootDir, '.agents', 'commands', path.basename(path.dirname(relativePath))),
    ];

    for (const source of sourceCandidates) {
      if (fs.existsSync(source)) {
        if (exists) {
          try { fs.unlinkSync(filePath); } catch (_) { /* ignore */ }
        }
        ensureDir(targetDir);
        fs.symlinkSync(path.relative(targetDir, source), filePath, 'dir');
        return {
          success: true,
          action: exists ? SYNC_ACTIONS.UPDATE : SYNC_ACTIONS.CREATE,
        };
      }
    }

    return {
      success: false,
      error: `找不到 commands 源目录（尝试了 ${sourceCandidates.join(', ')}）`,
    };
  }

  /**
   * 判断给定路径在当前系统中推荐使用的模式
   * @returns {'copy' | 'symlink'}
   */
  static recommendMode() {
    // macOS / Linux 上 symlink 通常可用
    // Windows 或受限环境推荐 copy
    if (process.platform === 'win32') {
      return LINK_MODES.COPY;
    }
    return LINK_MODES.AUTO;
  }
}

module.exports = {
  LinkModeResolver,
};
