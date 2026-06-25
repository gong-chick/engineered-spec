/**
 * Agent Profile — Agent 配置文件 schema 定义与校验
 *
 * 标准化 Agent Profile 的数据结构，提供创建、校验和身份标识能力。
 * 参考 asset-package.js 的模式设计。
 */

const { createChecksum } = require('../project/json-utils');
const {
  AGENT_PROFILE_VERSION,
  VALID_AGENT_ROLES,
  VALID_ESCALATION_POLICIES,
  VALID_MEMORY_ACCESS_LEVELS,
  AGENT_ROLES,
  ESCALATION_POLICIES,
  MEMORY_ACCESS_LEVELS,
} = require('./agent-types');

// ============================================================
// createAgentProfile — 工厂函数
// ============================================================

/**
 * 构建标准化的 AgentProfile 对象
 * @param {Object} overrides - 覆盖字段
 * @returns {AgentProfile}
 */
function createAgentProfile(overrides = {}) {
  const now = new Date().toISOString();
  return {
    agentId: '',
    name: '',
    role: AGENT_ROLES.CUSTOM,
    version: '0.1.0',
    description: '',
    responsibilities: [],
    allowedTools: [],
    deniedTools: [],
    allowedFileScopes: ['**'],
    deniedFileScopes: [],
    memoryAccess: MEMORY_ACCESS_LEVELS.READ,
    maxIterations: 10,
    escalationPolicy: ESCALATION_POLICIES.BLOCK,
    timeout: 300000,
    tags: [],
    createdAt: now,
    updatedAt: now,
    ...overrides,
  };
}

// ============================================================
// validateAgentProfile — 校验函数
// ============================================================

/**
 * 校验 AgentProfile 是否合法
 * @param {AgentProfile} profile
 * @returns {{ ok: boolean, errors: string[] }}
 */
function validateAgentProfile(profile) {
  const errors = [];

  if (!profile || typeof profile !== 'object') {
    return { ok: false, errors: ['agent profile 必须是对象'] };
  }

  if (!profile.agentId || typeof profile.agentId !== 'string') {
    errors.push('agentId 必须为非空字符串');
  }

  if (!profile.name || typeof profile.name !== 'string') {
    errors.push('name 必须为非空字符串');
  }

  if (!VALID_AGENT_ROLES.has(profile.role)) {
    errors.push(`role 必须为 ${[...VALID_AGENT_ROLES].join('/')} 之一，当前值: ${profile.role}`);
  }

  if (!profile.version || typeof profile.version !== 'string') {
    errors.push('version 必须为非空字符串');
  }

  if (!Array.isArray(profile.responsibilities)) {
    errors.push('responsibilities 必须为数组');
  }

  if (!Array.isArray(profile.allowedTools)) {
    errors.push('allowedTools 必须为数组');
  }

  if (!Array.isArray(profile.deniedTools)) {
    errors.push('deniedTools 必须为数组');
  }

  if (!Array.isArray(profile.allowedFileScopes)) {
    errors.push('allowedFileScopes 必须为数组');
  }

  if (!Array.isArray(profile.deniedFileScopes)) {
    errors.push('deniedFileScopes 必须为数组');
  }

  if (!VALID_MEMORY_ACCESS_LEVELS.has(profile.memoryAccess)) {
    errors.push(`memoryAccess 必须为 ${[...VALID_MEMORY_ACCESS_LEVELS].join('/')} 之一，当前值: ${profile.memoryAccess}`);
  }

  if (typeof profile.maxIterations !== 'number' || profile.maxIterations < 1) {
    errors.push('maxIterations 必须为正整数');
  }

  if (!VALID_ESCALATION_POLICIES.has(profile.escalationPolicy)) {
    errors.push(`escalationPolicy 必须为 ${[...VALID_ESCALATION_POLICIES].join('/')} 之一，当前值: ${profile.escalationPolicy}`);
  }

  if (typeof profile.timeout !== 'number' || profile.timeout < 1000) {
    errors.push('timeout 必须为 >= 1000 的数字（毫秒）');
  }

  return {
    ok: errors.length === 0,
    errors,
  };
}

// ============================================================
// buildAgentIdentity — 标准化 Agent 身份标识
// ============================================================

/**
 * 构建 Agent 唯一身份标识
 * @param {string} role
 * @param {string} agentId
 * @param {string} version
 * @returns {string} 格式: role:agentId@version
 */
function buildAgentIdentity(role, agentId, version) {
  return `${role}:${agentId}@${version}`;
}

// ============================================================
// computeAgentChecksum — 基于 Profile 内容计算 checksum
// ============================================================

/**
 * 根据 AgentProfile 内容计算 checksum（排除时间戳字段）
 * @param {AgentProfile} profile
 * @returns {string}
 */
function computeAgentChecksum(profile) {
  const { createdAt, updatedAt, ...stableFields } = profile;
  return createChecksum(JSON.stringify(stableFields));
}

// ============================================================
// JSDoc 类型定义
// ============================================================

/**
 * @typedef {Object} AgentProfile
 * @property {string} agentId - Agent 唯一标识
 * @property {string} name - Agent 显示名称
 * @property {string} role - Agent 角色类型
 * @property {string} version - Profile 版本
 * @property {string} description - 描述
 * @property {string[]} responsibilities - 职责列表
 * @property {string[]} allowedTools - 允许使用的工具列表（空数组表示全部允许）
 * @property {string[]} deniedTools - 禁止使用的工具列表（优先级高于 allowedTools）
 * @property {string[]} allowedFileScopes - 允许访问的文件 glob 范围
 * @property {string[]} deniedFileScopes - 禁止访问的文件 glob 范围（优先级高于 allowedFileScopes）
 * @property {string} memoryAccess - 内存访问级别
 * @property {number} maxIterations - 最大迭代次数
 * @property {string} escalationPolicy - 升级策略
 * @property {number} timeout - 超时时间（毫秒）
 * @property {string[]} tags - 标签
 * @property {string} createdAt - 创建时间 ISO 格式
 * @property {string} updatedAt - 更新时间 ISO 格式
 */

module.exports = {
  createAgentProfile,
  validateAgentProfile,
  buildAgentIdentity,
  computeAgentChecksum,
};
