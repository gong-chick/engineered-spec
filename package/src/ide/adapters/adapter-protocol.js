const fs = require('fs');
const path = require('path');
const { SYNC_ACTIONS } = require('../ide-types');

// ============================================================
// AdapterInput — 适配器统一输入
// ============================================================

/**
 * @typedef {Object} AdapterInput
 * @property {string} rootDir - 项目根目录
 * @property {string} profile - 技术栈标识（react/vue/auto）
 * @property {Object} [projectConfig] - 项目配置（.ai-spec/config.json）
 * @property {Object} [manifest] - 资产清单（.ai-spec/manifest.json）
 * @property {Object} [options] - 附加选项
 * @property {boolean} [options.dryRun] - 是否仅预览
 * @property {boolean} [options.force] - 是否强制覆盖
 */

/**
 * 构建默认 AdapterInput
 * @param {string} rootDir
 * @param {Object} [overrides]
 * @returns {AdapterInput}
 */
function createAdapterInput(rootDir, overrides = {}) {
  return {
    rootDir: path.resolve(rootDir),
    profile: 'auto',
    projectConfig: null,
    manifest: null,
    options: {},
    ...overrides,
  };
}

// ============================================================
// AdapterOutput — 适配器统一输出
// ============================================================

/**
 * @typedef {Object} AdapterOutput
 * @property {string} adapterId - 适配器标识（cursor/claude/codex）
 * @property {Array<AdapterFileOutput>} files - 输出文件列表
 * @property {Array<string>} warnings - 警告信息
 * @property {string} generatedAt - 生成时间 ISO 格式
 */

/**
 * @typedef {Object} AdapterFileOutput
 * @property {string} relativePath - 相对路径
 * @property {string} content - 文件内容
 * @property {string} type - 文件类型（rule/command/agent/config/pointer-rule/pointer-entry）
 * @property {string} action - 操作类型（create/update/skip）
 */

/**
 * 构建 AdapterOutput
 * @param {string} adapterId
 * @param {Array<AdapterFileOutput>} files
 * @param {Array<string>} [warnings]
 * @returns {AdapterOutput}
 */
function createAdapterOutput(adapterId, files, warnings = []) {
  return {
    adapterId,
    files,
    warnings,
    generatedAt: new Date().toISOString(),
  };
}

// ============================================================
// ValidationResult — 校验结果
// ============================================================

/**
 * @typedef {Object} ValidationResult
 * @property {boolean} ok - 是否通过
 * @property {Array<ValidationIssue>} issues - 问题列表
 * @property {number} errorCount - 错误数量
 * @property {number} warningCount - 警告数量
 */

/**
 * @typedef {Object} ValidationIssue
 * @property {'error'|'warning'|'info'} severity - 严重程度
 * @property {string} path - 相关文件路径
 * @property {string} message - 问题描述
 * @property {string} [rule] - 触发的规则名称
 */

/**
 * 构建 ValidationResult
 * @param {Array<ValidationIssue>} issues
 * @returns {ValidationResult}
 */
function createValidationResult(issues = []) {
  const errorCount = issues.filter((i) => i.severity === 'error').length;
  const warningCount = issues.filter((i) => i.severity === 'warning').length;
  return {
    ok: errorCount === 0,
    issues,
    errorCount,
    warningCount,
  };
}

// ============================================================
// DiffResult — 文件差异
// ============================================================

/**
 * @typedef {Object} DiffResult
 * @property {string} relativePath - 文件路径
 * @property {'same'|'changed'|'missing'|'extra'} status - 差异状态
 * @property {string} [expectedContent] - 期望内容（changed/missing 时）
 * @property {string} [actualContent] - 实际内容（changed/extra 时）
 */

// ============================================================
// IDEAdapter — 统一适配器基类
// ============================================================

class IDEAdapter {
  /**
   * 适配器唯一标识
   * @returns {string}
   */
  get adapterId() {
    throw new Error('adapterId 必须由子类实现');
  }

  /**
   * 检测当前项目是否适用于本适配器
   * @param {AdapterInput} input
   * @returns {{ applicable: boolean, reason: string }}
   */
  detect(input) {
    return { applicable: true, reason: '基类默认适用' };
  }

  /**
   * 生成适配文件列表
   * @param {AdapterInput} input
   * @returns {AdapterOutput}
   */
  generateFiles(input) {
    throw new Error('generateFiles 必须由子类实现');
  }

  /**
   * 校验目标目录中已有文件是否与期望一致
   * @param {string} rootDir
   * @param {{ profile?: string }} [options]
   * @returns {ValidationResult}
   */
  validate(rootDir, options = {}) {
    const issues = [];
    const input = createAdapterInput(rootDir, { profile: options.profile });
    const files = this.generateFiles(input);

    for (const file of files.files) {
      const filePath = path.join(rootDir, file.relativePath);
      if (!fs.existsSync(filePath)) {
        issues.push({
          severity: 'error',
          path: file.relativePath,
          message: '文件缺失',
          rule: 'file-exists',
        });
        continue;
      }

      const actual = fs.readFileSync(filePath, 'utf8').replace(/\n$/, '');
      const expected = file.content.replace(/\n$/, '');
      if (actual !== expected) {
        issues.push({
          severity: 'warning',
          path: file.relativePath,
          message: '文件内容与期望不一致',
          rule: 'content-match',
        });
      }
    }

    return createValidationResult(issues);
  }

  /**
   * 比较期望输出与目标目录实际状态的差异
   * @param {string} rootDir
   * @param {{ profile?: string }} [options]
   * @returns {Array<DiffResult>}
   */
  diff(rootDir, options = {}) {
    const input = createAdapterInput(rootDir, { profile: options.profile });
    const files = this.generateFiles(input);
    const results = [];

    for (const file of files.files) {
      const filePath = path.join(rootDir, file.relativePath);
      if (!fs.existsSync(filePath)) {
        results.push({
          relativePath: file.relativePath,
          status: 'missing',
          expectedContent: file.content,
        });
        continue;
      }

      const actual = fs.readFileSync(filePath, 'utf8').replace(/\n$/, '');
      const expected = file.content.replace(/\n$/, '');
      if (actual === expected) {
        results.push({
          relativePath: file.relativePath,
          status: 'same',
        });
      } else {
        results.push({
          relativePath: file.relativePath,
          status: 'changed',
          expectedContent: file.content,
          actualContent: fs.readFileSync(filePath, 'utf8'),
        });
      }
    }

    return results;
  }

  /**
   * 回滚：删除本适配器生成的所有文件
   * @param {string} rootDir
   * @returns {{ deletedFiles: string[], errors: string[] }}
   */
  rollback(rootDir) {
    const files = this.generateFiles(createAdapterInput(rootDir));
    const deletedFiles = [];
    const errors = [];

    for (const file of files.files) {
      const filePath = path.join(rootDir, file.relativePath);
      try {
        if (fs.existsSync(filePath)) {
          fs.unlinkSync(filePath);
          deletedFiles.push(file.relativePath);
        }
      } catch (error) {
        errors.push(`${file.relativePath}: ${error.message}`);
      }
    }

    return { deletedFiles, errors };
  }

  /**
   * 写入所有适配文件到目标目录
   * @param {string} rootDir
   * @param {{ dryRun?: boolean, profile?: string }} options
   * @returns {Array<{ path: string, action: string }>}
   */
  write(rootDir, options = {}) {
    const input = createAdapterInput(rootDir, { profile: options.profile });
    const output = this.generateFiles(input);
    const results = [];

    for (const file of output.files) {
      const filePath = path.join(rootDir, file.relativePath);
      const exists = fs.existsSync(filePath);
      const action = exists ? SYNC_ACTIONS.UPDATE : SYNC_ACTIONS.CREATE;

      if (!options.dryRun) {
        const dir = path.dirname(filePath);
        if (!fs.existsSync(dir)) {
          fs.mkdirSync(dir, { recursive: true });
        }
        fs.writeFileSync(filePath, `${file.content}\n`, 'utf8');
      }

      results.push({ path: file.relativePath, action });
    }

    return results;
  }

  /**
   * 检查适配文件是否存在
   * @param {string} rootDir
   * @returns {Array<{ path: string, exists: boolean }>}
   */
  check(rootDir) {
    const input = createAdapterInput(rootDir);
    const output = this.generateFiles(input);
    return output.files.map((file) => ({
      path: file.relativePath,
      exists: fs.existsSync(path.join(rootDir, file.relativePath)),
    }));
  }
}

// ============================================================
// ConsistencyValidator — 适配输出一致性校验
// ============================================================

/**
 * 校验多个适配器输出的语义一致性
 * 检查：命令覆盖度、入口文件存在、类型分布合理性
 * @param {Array<AdapterOutput>} outputs
 * @returns {ValidationResult}
 */
function validateAdapterConsistency(outputs) {
  const issues = [];

  if (outputs.length === 0) {
    issues.push({
      severity: 'warning',
      path: '',
      message: '没有适配器输出可供校验',
      rule: 'non-empty',
    });
    return createValidationResult(issues);
  }

  // 收集每个适配器的命令集
  const commandsByAdapter = {};
  for (const output of outputs) {
    commandsByAdapter[output.adapterId] = new Set(
      output.files
        .filter((f) => f.type === 'command')
        .map((f) => path.basename(f.relativePath, '.md'))
    );
  }

  // 检查核心命令覆盖：所有适配器应共享 spec-start
  const adapterIds = Object.keys(commandsByAdapter);
  for (const id of adapterIds) {
    if (!commandsByAdapter[id].has('spec-start')) {
      issues.push({
        severity: 'error',
        path: `${id}`,
        message: `适配器 ${id} 缺少核心命令 spec-start`,
        rule: 'core-command-coverage',
      });
    }
  }

  // 检查每个适配器至少有一个入口文件
  for (const output of outputs) {
    const hasEntry = output.files.some(
      (f) => f.type === 'pointer-entry' || f.type === 'pointer-rule'
    );
    if (!hasEntry) {
      issues.push({
        severity: 'warning',
        path: output.adapterId,
        message: `适配器 ${output.adapterId} 没有入口文件`,
        rule: 'entry-file-exists',
      });
    }
  }

  // 检查类型分布：每个适配器应至少有 2 种文件类型
  for (const output of outputs) {
    const types = new Set(output.files.map((f) => f.type));
    if (types.size < 2) {
      issues.push({
        severity: 'info',
        path: output.adapterId,
        message: `适配器 ${output.adapterId} 只有 ${types.size} 种文件类型，建议丰富`,
        rule: 'type-diversity',
      });
    }
  }

  return createValidationResult(issues);
}

module.exports = {
  IDEAdapter,
  createAdapterInput,
  createAdapterOutput,
  createValidationResult,
  validateAdapterConsistency,
};
