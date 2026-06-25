const fs = require('fs');
const path = require('path');
const { IdeRegistryBuilder } = require('./registry/ide-registry-builder');
const { MarkdownAnchorWriter } = require('./anchors/markdown-anchor-writer');
const { CursorAdapter } = require('./adapters/cursor-adapter');
const { ClaudeAdapter } = require('./adapters/claude-adapter');
const { LinkModeResolver } = require('./links/link-mode-resolver');
const { IDE_TYPES, LINK_MODES, PROFILES, DOCTOR_CHECKLIST } = require('./ide-types');

class IdeService {
  constructor(options = {}) {
    this.registryBuilder = options.registryBuilder || new IdeRegistryBuilder();
    this.anchorWriter = options.anchorWriter || new MarkdownAnchorWriter();
    this.cursorAdapter = options.cursorAdapter || new CursorAdapter();
    this.claudeAdapter = options.claudeAdapter || new ClaudeAdapter();
    this.linkResolver = options.linkResolver || new LinkModeResolver();
  }

  /**
   * 同步 IDE 指针文件到目标项目
   * @param {string} rootDir
   * @param {{
   *   ide?: string[],
   *   profile?: string,
   *   linkMode?: string,
   *   writeMemoryAnchor?: boolean,
   *   writeAgentAnchor?: boolean,
   *   dryRun?: boolean,
   * }} options
   * @returns {Promise<{
   *   writtenFiles: Array<{ path: string, action: string }>,
   *   skippedFiles: string[],
   *   repairedFiles: string[],
   *   linkModeUsed: string,
   *   warnings: string[]
   * }>}
   */
  async sync(rootDir, options = {}) {
    const ideList = this._parseIdeList(options.ide);
    const profile = options.profile || PROFILES.AUTO;
    const linkMode = options.linkMode || LINK_MODES.AUTO;
    const writtenFiles = [];
    const skippedFiles = [];
    const allWarnings = [];

    // 1. 校验项目是否已 init
    const projectJsonPath = path.join(rootDir, '.ai-spec', 'project.json');
    if (!fs.existsSync(projectJsonPath)) {
      throw new Error('目标项目尚未初始化，请先运行 init --recommend --yes');
    }

    // 2. 生成 ide-registry.json
    const registryResult = this.registryBuilder.write(rootDir, {
      profile,
      ide: ideList,
      linkMode,
      writeAgentAnchor: options.writeAgentAnchor,
      writeMemoryAnchor: options.writeMemoryAnchor,
      dryRun: options.dryRun,
    });
    writtenFiles.push({ path: registryResult.path, action: registryResult.action });
    allWarnings.push(...(registryResult.warnings || []));

    // 3. 生成 ide-integration.json
    const integrationResult = this.registryBuilder.writeIntegrationConfig(rootDir, {
      profile,
      ide: ideList,
      linkMode,
      writeAgentAnchor: options.writeAgentAnchor,
      writeMemoryAnchor: options.writeMemoryAnchor,
      dryRun: options.dryRun,
    });
    writtenFiles.push({ path: integrationResult.path, action: integrationResult.action });

    // 4. 生成 Cursor 指针文件
    let linkModeUsed = LINK_MODES.COPY;
    if (ideList.includes(IDE_TYPES.CURSOR)) {
      const cursorOutput = this.cursorAdapter.generateFiles({ profile });
      for (const file of cursorOutput.files) {
        try {
          const result = this.linkResolver.write(rootDir, file.relativePath, file.content, {
            mode: linkMode,
            dryRun: options.dryRun,
          });
          writtenFiles.push({ path: result.path, action: result.action });
          linkModeUsed = result.modeUsed;
          allWarnings.push(...(result.warnings || []));
        } catch (error) {
          allWarnings.push(`Cursor 文件 ${file.relativePath} 写入失败：${error.message}`);
          skippedFiles.push(file.relativePath);
        }
      }
    }

    // 5. 生成 Claude 指针文件
    if (ideList.includes(IDE_TYPES.CLAUDE)) {
      const claudeOutput = this.claudeAdapter.generateFiles({ profile });
      for (const file of claudeOutput.files) {
        try {
          const result = this.linkResolver.write(rootDir, file.relativePath, file.content, {
            mode: linkMode,
            dryRun: options.dryRun,
          });
          writtenFiles.push({ path: result.path, action: result.action });
          linkModeUsed = result.modeUsed;
          allWarnings.push(...(result.warnings || []));
        } catch (error) {
          allWarnings.push(`Claude 文件 ${file.relativePath} 写入失败：${error.message}`);
          skippedFiles.push(file.relativePath);
        }
      }
    }

    // 6. 注入 markdown 锚点
    if (options.writeAgentAnchor !== false) {
      ['AGENTS.md', 'CLAUDE.md'].forEach((fileName) => {
        try {
          const result = this.anchorWriter.write(rootDir, fileName, { dryRun: options.dryRun });
          writtenFiles.push({ path: result.path, action: result.action });
        } catch (error) {
          allWarnings.push(`${fileName} 锚点写入失败：${error.message}`);
        }
      });
    }
    if (options.writeMemoryAnchor !== false) {
      try {
        const result = this.anchorWriter.write(rootDir, 'memory.md', { dryRun: options.dryRun });
        writtenFiles.push({ path: result.path, action: result.action });
      } catch (error) {
        allWarnings.push(`memory.md 锚点写入失败：${error.message}`);
      }
    }

    return {
      writtenFiles,
      skippedFiles,
      repairedFiles: [],
      linkModeUsed,
      warnings: allWarnings,
    };
  }

  /**
   * 检查 IDE 指针文件完整性
   * @param {string} rootDir
   * @returns {{
   *   ok: boolean,
   *   items: Array<{ path: string, exists: boolean, hasAnchor?: boolean, category: string, required: boolean }>,
   *   missingCount: number,
   *   suggestions: string[]
   * }}
   */
  doctor(rootDir) {
    const items = [];
    const suggestions = [];

    for (const check of DOCTOR_CHECKLIST) {
      const filePath = path.join(rootDir, check.path);
      const exists = fs.existsSync(filePath);

      const item = {
        path: check.path,
        exists,
        category: check.category,
        required: check.required,
      };

      // 检查锚点完整性（针对 markdown 文件）
      if (exists && check.path.endsWith('.md') && !check.path.includes('commands/')) {
        try {
          const content = fs.readFileSync(filePath, 'utf8');
          item.hasAnchor = content.includes('AI-SPEC-AUTO');
        } catch (_) {
          item.hasAnchor = false;
        }
      }

      items.push(item);

      if (!exists && check.required) {
        suggestions.push(`缺少必要文件：${check.path}（${check.category}），请运行 ide repair 修复`);
      } else if (!exists && !check.required) {
        suggestions.push(`可选文件缺失：${check.path}（${check.category}），建议运行 ide sync 补齐`);
      }
    }

    // 额外检查锚点完整性
    ['AGENTS.md', 'CLAUDE.md', 'memory.md'].forEach((fileName) => {
      const result = this.anchorWriter.check(rootDir, fileName);
      if (result.exists && !result.hasAnchor) {
        suggestions.push(`${fileName} 存在但缺少 AI-SPEC-AUTO 锚点，请运行 ide repair 修复`);
      }
    });

    const missingCount = items.filter((item) => !item.exists && item.required).length;

    return {
      ok: missingCount === 0 && suggestions.length === 0,
      items,
      missingCount,
      suggestions,
    };
  }

  /**
   * 修复缺失的 IDE 指针文件
   * @param {string} rootDir
   * @param {{ dryRun?: boolean }} options
   * @returns {Promise<{
   *   repairedFiles: Array<{ path: string, action: string }>,
   *   doctorResult: object
   * }>}
   */
  async repair(rootDir, options = {}) {
    const doctorResult = this.doctor(rootDir);
    const repairedFiles = [];

    // 如果已全部正常，无需修复
    if (doctorResult.ok && doctorResult.suggestions.length === 0) {
      return { repairedFiles, doctorResult };
    }

    // 补齐缺失文件：使用 sync 的 dry-run 先看看哪些需要修复
    const syncResult = await this.sync(rootDir, {
      ide: ['cursor', 'claude'],
      profile: PROFILES.AUTO,
      linkMode: LINK_MODES.COPY,
      writeMemoryAnchor: true,
      writeAgentAnchor: true,
      dryRun: false,
    });

    // 只标记实际修复的文件
    const doctorMissing = new Set(
      doctorResult.items
        .filter((item) => !item.exists)
        .map((item) => item.path)
    );

    for (const file of syncResult.writtenFiles) {
      if (doctorMissing.has(file.path)) {
        repairedFiles.push({ path: file.path, action: file.action });
      }
    }

    // 修复锚点（重新注入）
    ['AGENTS.md', 'CLAUDE.md', 'memory.md'].forEach((fileName) => {
      const checkResult = this.anchorWriter.check(rootDir, fileName);
      if (checkResult.exists && !checkResult.hasAnchor) {
        const result = this.anchorWriter.write(rootDir, fileName, { dryRun: false });
        repairedFiles.push({ path: result.path, action: 'update' });
      }
    });

    return { repairedFiles, doctorResult };
  }

  _parseIdeList(ide) {
    if (!ide || ide.length === 0) return [IDE_TYPES.CURSOR, IDE_TYPES.CLAUDE];
    if (Array.isArray(ide)) return ide.filter((item) => IDE_TYPES[item.toUpperCase()] || Object.values(IDE_TYPES).includes(item));
    if (typeof ide === 'string') {
      return ide.split(',').map((item) => item.trim()).filter((item) => Object.values(IDE_TYPES).includes(item));
    }
    return [IDE_TYPES.CURSOR, IDE_TYPES.CLAUDE];
  }
}

module.exports = {
  IdeService,
};
