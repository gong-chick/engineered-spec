const fs = require('fs');
const path = require('path');

const DEFAULT_IDES = ['claude', 'cursor'];

/**
 * 为目标项目的 .claude/ 和 .cursor/ 创建到 .agents/ 的符号链接，
 * 并同步命令文件和配置文件。
 */
class IdeLinker {
  constructor(options = {}) {
    this.pkgRoot = options.pkgRoot || path.join(__dirname, '..', '..');
  }

  /**
   * 为目标项目创建所有 IDE 链接
   * @param {string} targetDir 目标项目根目录
   * @param {string[]} ides 要配置的 IDE 列表
   */
  link(targetDir, ides = DEFAULT_IDES) {
    const agentsDir = path.join(targetDir, '.agents');

    for (const ide of ides) {
      const ideDir = path.join(targetDir, `.${ide}`);
      this._ensureIdeDir(ideDir);

      // rules symlink
      this._createSymlink(
        path.join(agentsDir, 'rules'),
        path.join(ideDir, 'rules'),
      );

      // skills per-skill symlinks
      this._linkSkills(ideDir, agentsDir);

      // commands: copy from .agents/commands/common + .agents/commands/<ide>
      this._syncCommands(targetDir, ide);
    }

    // cursor-specific: copy mcp.json
    if (ides.includes('cursor')) {
      this._copyMcpJson(targetDir);
    }
  }

  _ensureIdeDir(ideDir) {
    fs.mkdirSync(ideDir, { recursive: true });
  }

  _createSymlink(target, linkPath) {
    // 如果已存在且是正确指向的 symlink，跳过
    try {
      if (fs.lstatSync(linkPath).isSymbolicLink()) {
        const current = fs.readlinkSync(linkPath);
        const expected = path.relative(path.dirname(linkPath), target);
        if (current === expected) return;
      }
    } catch (_) {
      // 不存在或不是 symlink
    }

    // 删除已存在的文件/目录/错误 symlink
    try { fs.rmSync(linkPath, { recursive: true, force: true }); } catch (_) {}

    const rel = path.relative(path.dirname(linkPath), target);
    fs.symlinkSync(rel, linkPath);
  }

  _linkSkills(ideDir, agentsDir) {
    const ideSkillsDir = path.join(ideDir, 'skills');
    const agentsSkillsDir = path.join(agentsDir, 'skills');

    // 确保 IDE skills 目录存在
    fs.mkdirSync(ideSkillsDir, { recursive: true });

    if (!fs.existsSync(agentsSkillsDir)) return;

    for (const entry of fs.readdirSync(agentsSkillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const skillName = entry.name;
      const linkPath = path.join(ideSkillsDir, skillName);
      const target = path.join(agentsSkillsDir, skillName);
      this._createSymlink(target, linkPath);
    }
  }

  _syncCommands(targetDir, ide) {
    const agentsCommandsDir = path.join(targetDir, '.agents', 'commands');
    const destDir = path.join(targetDir, `.${ide}`, 'commands');

    // 收集所有命令文件
    const commandFiles = new Map(); // filename -> sourcePath

    for (const subdir of ['common', ide]) {
      const srcDir = path.join(agentsCommandsDir, subdir);
      if (!fs.existsSync(srcDir)) continue;
      for (const entry of fs.readdirSync(srcDir)) {
        if (!entry.endsWith('.md')) continue;
        // ide 特定命令优先（覆盖同名 common 命令）
        commandFiles.set(entry, path.join(srcDir, entry));
      }
    }

    if (commandFiles.size === 0) return;

    // 确保目标目录存在
    fs.mkdirSync(destDir, { recursive: true });

    for (const [filename, srcPath] of commandFiles) {
      const destPath = path.join(destDir, filename);
      fs.copyFileSync(srcPath, destPath);
    }
  }

  _copyMcpJson(targetDir) {
    const mcpDest = path.join(targetDir, '.cursor', 'mcp.json');
    if (fs.existsSync(mcpDest)) return; // 已存在则保留

    const mcpSrc = path.join(this.pkgRoot, '.cursor', 'mcp.json');
    if (fs.existsSync(mcpSrc)) {
      fs.copyFileSync(mcpSrc, mcpDest);
    }
  }
}

module.exports = { IdeLinker, DEFAULT_IDES };
