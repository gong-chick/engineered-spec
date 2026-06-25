/**
 * AssetPackage — 资产包 schema 定义与校验
 *
 * 统一资产包的类型、身份标识和校验规则，
 * 解决 local-init 与 hub-install 两套系统资产形状不一致的问题。
 */

const { createChecksum } = require('../project/json-utils');

// ============================================================
// 常量
// ============================================================

const ASSET_PACKAGE_VERSION = '1.0.0';

/** 资产类型枚举 */
const ASSET_TYPES = Object.freeze({
  RULE: 'rule',
  SKILL: 'skill',
  AGENT_PROFILE: 'agentProfile',
  COMMAND: 'command',
  HOOK: 'hook',
  MEMORY: 'memory',
  CONFIG: 'config',
  ADAPTER: 'adapter',
  OTHER: 'other',
});

/** 资产来源枚举 */
const ASSET_SOURCES = Object.freeze({
  LOCAL: 'local',
  HUB: 'hub',
  TEMPLATE: 'template',
});

/** 所有合法资产类型值 */
const VALID_ASSET_TYPES = new Set(Object.values(ASSET_TYPES));

/** 所有合法来源值 */
const VALID_ASSET_SOURCES = new Set(Object.values(ASSET_SOURCES));

// ============================================================
// createAssetPackage — 工厂函数
// ============================================================

/**
 * 构建标准化的 AssetPackage 对象
 * @param {Object} overrides - 覆盖字段
 * @returns {AssetPackage}
 */
function createAssetPackage(overrides = {}) {
  const now = new Date().toISOString();
  return {
    assetId: '',
    assetType: ASSET_TYPES.OTHER,
    version: '0.1.0',
    source: ASSET_SOURCES.LOCAL,
    checksum: '',
    lockedAt: now,
    generatedFiles: [],
    ...overrides,
  };
}

// ============================================================
// validateAssetPackage — 校验函数
// ============================================================

/**
 * 校验 AssetPackage 是否合法
 * @param {AssetPackage} pkg
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateAssetPackage(pkg) {
  const errors = [];

  if (!pkg || typeof pkg !== 'object') {
    return { ok: false, errors: ['asset package 必须是对象'] };
  }

  if (!pkg.assetId || typeof pkg.assetId !== 'string') {
    errors.push('assetId 必须为非空字符串');
  }

  if (!VALID_ASSET_TYPES.has(pkg.assetType)) {
    errors.push(`assetType 必须为 ${[...VALID_ASSET_TYPES].join('/')} 之一，当前值: ${pkg.assetType}`);
  }

  if (!pkg.version || typeof pkg.version !== 'string') {
    errors.push('version 必须为非空字符串');
  }

  if (!VALID_ASSET_SOURCES.has(pkg.source)) {
    errors.push(`source 必须为 ${[...VALID_ASSET_SOURCES].join('/')} 之一，当前值: ${pkg.source}`);
  }

  if (!pkg.checksum || typeof pkg.checksum !== 'string') {
    errors.push('checksum 必须为非空字符串');
  }

  if (!Array.isArray(pkg.generatedFiles)) {
    errors.push('generatedFiles 必须为数组');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

// ============================================================
// computeAssetChecksum — 基于内容计算 checksum
// ============================================================

/**
 * 根据资产内容计算 checksum
 * @param {string} content - 资产文件内容
 * @returns {string}
 */
function computeAssetChecksum(content) {
  return createChecksum(content);
}

// ============================================================
// guessAssetType — 从路径推断资产类型
// ============================================================

/**
 * 根据文件路径推断资产类型
 * @param {string} filePath
 * @returns {string}
 */
function guessAssetType(filePath) {
  if (filePath.startsWith('.agents/rules/')) return ASSET_TYPES.RULE;
  if (filePath.startsWith('.agents/skills/')) return ASSET_TYPES.SKILL;
  if (filePath.startsWith('.agents/roles/') || filePath.startsWith('.agents/profiles/')) return ASSET_TYPES.AGENT_PROFILE;
  if (filePath.startsWith('.agents/commands/')) return ASSET_TYPES.COMMAND;
  if (filePath.startsWith('.harness/')) return ASSET_TYPES.HOOK;
  if (filePath.startsWith('.memory/')) return ASSET_TYPES.MEMORY;
  if (filePath.startsWith('.ai-spec/')) return ASSET_TYPES.CONFIG;
  if (filePath.startsWith('.cursor/') || filePath.startsWith('.claude/') || filePath.startsWith('.codex/')) return ASSET_TYPES.ADAPTER;
  return ASSET_TYPES.OTHER;
}

// ============================================================
// buildAssetIdentity — 标准化资产身份标识
// ============================================================

/**
 * 构建资产唯一身份标识
 * @param {string} assetType
 * @param {string} assetId
 * @param {string} version
 * @returns {string} 格式: type:id@version
 */
function buildAssetIdentity(assetType, assetId, version) {
  return `${assetType}:${assetId}@${version}`;
}

// ============================================================
// 类型定义 (JSDoc)
// ============================================================

/**
 * @typedef {Object} AssetPackage
 * @property {string} assetId - 资产唯一标识
 * @property {string} assetType - 资产类型 (rule/skill/agentProfile/command/hook/memory/config/adapter/other)
 * @property {string} version - 资产版本
 * @property {string} source - 资产来源 (local/hub/template)
 * @property {string} checksum - 资产内容摘要
 * @property {string} lockedAt - 锁定时间 ISO 格式
 * @property {string[]} generatedFiles - 生成的文件列表
 */

module.exports = {
  ASSET_PACKAGE_VERSION,
  ASSET_TYPES,
  ASSET_SOURCES,
  VALID_ASSET_TYPES,
  VALID_ASSET_SOURCES,
  createAssetPackage,
  validateAssetPackage,
  computeAssetChecksum,
  guessAssetType,
  buildAssetIdentity,
};
