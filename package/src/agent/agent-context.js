/**
 * Agent Context — Agent 上下文边界管理
 *
 * 为每个 Agent 定义独立的上下文窗口、token 预算和可见文件范围。
 * 支持敏感信息红脱和上下文裁剪。
 */

const { createChecksum } = require('../project/json-utils');

// ============================================================
// 默认配置
// ============================================================

const DEFAULT_CONTEXT_CONFIG = Object.freeze({
  /** 最大 token 预算 */
  maxTokens: 100000,
  /** 预留给系统提示的 token 比例 */
  systemPromptRatio: 0.2,
  /** 预留给历史对话的 token 比例 */
  historyRatio: 0.3,
  /** 预留给当前任务的 token 比比 */
  taskRatio: 0.5,
  /** 是否启用红脱 */
  redactSensitive: true,
  /** 最大可见文件数 */
  maxVisibleFiles: 50,
});

// ============================================================
// 红脱规则
// ============================================================

/** 敏感信息正则模式列表 */
const SENSITIVE_PATTERNS = [
  { pattern: /(?:password|passwd|pwd)\s*[:=]\s*['"]?([^\s'"]+)/gi, replacement: 'password=***' },
  { pattern: /(?:api[_-]?key|apikey)\s*[:=]\s*['"]?([^\s'"]+)/gi, replacement: 'api_key=***' },
  { pattern: /(?:secret|token)\s*[:=]\s*['"]?([^\s'"]+)/gi, replacement: 'secret=***' },
  { pattern: /(?:access[_-]?key|private[_-]?key)\s*[:=]\s*['"]?([^\s'"]+)/gi, replacement: 'access_key=***' },
  { pattern: /-----BEGIN\s+(?:RSA\s+)?PRIVATE\s+KEY-----/g, replacement: '-----BEGIN REDACTED KEY-----' },
];

/**
 * 对文本进行敏感信息红脱
 * @param {string} text
 * @returns {string}
 */
function redactSensitiveInfo(text) {
  if (!text || typeof text !== 'string') return text;

  let result = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    // 重置 lastIndex（因为使用了 g 标志）
    pattern.lastIndex = 0;
    result = result.replace(pattern, replacement);
  }
  return result;
}

// ============================================================
// AgentContext 类
// ============================================================

class AgentContext {
  /**
   * @param {Object} profile - AgentProfile
   * @param {Object} [config] - 上下文配置覆盖
   */
  constructor(profile, config = {}) {
    this.profile = profile;
    this.config = { ...DEFAULT_CONTEXT_CONFIG, ...config };

    /** 已消耗的 token 数量 */
    this.consumedTokens = 0;
    /** 可见文件列表 */
    this.visibleFiles = [];
    /** 上下文片段 */
    this.fragments = [];
  }

  // ============================================================
  // Token 预算
  // ============================================================

  /**
   * 获取系统提示的 token 预算
   * @returns {number}
   */
  getSystemPromptBudget() {
    return Math.floor(this.config.maxTokens * this.config.systemPromptRatio);
  }

  /**
   * 获取历史对话的 token 预算
   * @returns {number}
   */
  getHistoryBudget() {
    return Math.floor(this.config.maxTokens * this.config.historyRatio);
  }

  /**
   * 获取当前任务的 token 预算
   * @returns {number}
   */
  getTaskBudget() {
    return Math.floor(this.config.maxTokens * this.config.taskRatio);
  }

  /**
   * 获取剩余可用 token 数
   * @returns {number}
   */
  getRemainingTokens() {
    return Math.max(0, this.config.maxTokens - this.consumedTokens);
  }

  /**
   * 检查是否有足够 token
   * @param {number} estimatedTokens
   * @returns {boolean}
   */
  hasEnoughTokens(estimatedTokens) {
    return this.getRemainingTokens() >= estimatedTokens;
  }

  /**
   * 消耗 token
   * @param {number} count
   * @returns {boolean} 是否成功
   */
  consumeTokens(count) {
    if (!this.hasEnoughTokens(count)) return false;
    this.consumedTokens += count;
    return true;
  }

  // ============================================================
  // 文件可见性
  // ============================================================

  /**
   * 设置可见文件列表（受 maxVisibleFiles 限制）
   * @param {string[]} files
   */
  setVisibleFiles(files) {
    const maxFiles = this.config.maxVisibleFiles;
    this.visibleFiles = files.slice(0, maxFiles);
  }

  /**
   * 添加可见文件
   * @param {string} filePath
   * @returns {boolean} 是否成功（未超过限制）
   */
  addVisibleFile(filePath) {
    if (this.visibleFiles.length >= this.config.maxVisibleFiles) return false;
    if (!this.visibleFiles.includes(filePath)) {
      this.visibleFiles.push(filePath);
    }
    return true;
  }

  /**
   * 检查文件是否在可见范围内
   * @param {string} filePath
   * @returns {boolean}
   */
  isFileVisible(filePath) {
    return this.visibleFiles.includes(filePath);
  }

  // ============================================================
  // 上下文片段
  // ============================================================

  /**
   * 添加上下文片段
   * @param {Object} params
   * @param {string} params.type - 片段类型 (system/task/file/message)
   * @param {string} params.content - 片段内容
   * @param {number} [params.estimatedTokens] - 预估 token 数
   */
  addFragment({ type, content, estimatedTokens = 0 }) {
    const processedContent = this.config.redactSensitive ? redactSensitiveInfo(content) : content;

    if (estimatedTokens > 0 && !this.hasEnoughTokens(estimatedTokens)) {
      return false;
    }

    this.fragments.push({
      type,
      content: processedContent,
      estimatedTokens,
      addedAt: new Date().toISOString(),
    });

    if (estimatedTokens > 0) {
      this.consumeTokens(estimatedTokens);
    }

    return true;
  }

  /**
   * 获取指定类型的片段
   * @param {string} type
   * @returns {Array}
   */
  getFragmentsByType(type) {
    return this.fragments.filter((f) => f.type === type);
  }

  /**
   * 获取所有片段内容（按添加顺序）
   * @returns {string[]}
   */
  getAllContent() {
    return this.fragments.map((f) => f.content);
  }

  /**
   * 清空上下文
   */
  reset() {
    this.consumedTokens = 0;
    this.visibleFiles = [];
    this.fragments = [];
  }

  // ============================================================
  // 序列化
  // ============================================================

  /**
   * 导出上下文摘要
   * @returns {Object}
   */
  toSummary() {
    return {
      agentId: this.profile.agentId,
      maxTokens: this.config.maxTokens,
      consumedTokens: this.consumedTokens,
      remainingTokens: this.getRemainingTokens(),
      visibleFileCount: this.visibleFiles.length,
      fragmentCount: this.fragments.length,
      budgets: {
        systemPrompt: this.getSystemPromptBudget(),
        history: this.getHistoryBudget(),
        task: this.getTaskBudget(),
      },
    };
  }
}

module.exports = {
  AgentContext,
  redactSensitiveInfo,
  SENSITIVE_PATTERNS,
  DEFAULT_CONTEXT_CONFIG,
};
