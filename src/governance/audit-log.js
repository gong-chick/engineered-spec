/**
 * P3.3 审计日志 — 内存模型 + NDJSON 最小文件持久化
 *
 * 审计事件 schema、写入、查询、红脱策略、NDJSON 文件持久化
 */

const fs = require('fs');
const path = require('path');

// ============================================================
// 审计事件类型
// ============================================================

const AUDIT_EVENT_TYPES = Object.freeze({
  ASSET_CHANGE: 'asset_change',
  PERMISSION_CHANGE: 'permission_change',
  POLICY_DENIED: 'policy_denied',
  GRAY_RELEASE: 'gray_release',
  ROLLBACK: 'rollback',
  REVIEW_ACTION: 'review_action',
  SECURITY_SCAN: 'security_scan',
});

const AUDIT_SEVERITY = Object.freeze({
  INFO: 'info',
  WARN: 'warn',
  ERROR: 'error',
  BLOCKING: 'blocking',
});

const AUDIT_RESULT = Object.freeze({
  SUCCESS: 'success',
  DENIED: 'denied',
  ERROR: 'error',
});

const VALID_EVENT_TYPES = new Set(Object.values(AUDIT_EVENT_TYPES));
const VALID_SEVERITY = new Set(Object.values(AUDIT_SEVERITY));
const VALID_RESULT = new Set(Object.values(AUDIT_RESULT));

// ============================================================
// 敏感信息红脱（复用 P2 模式）
// ============================================================

const SENSITIVE_PATTERNS = [
  { pattern: /password\s*[=:]\s*["'][^"']*["']/gi, replacement: 'password=[REDACTED]' },
  { pattern: /password\s*[=:]\s*\S+/gi, replacement: 'password=[REDACTED]' },
  { pattern: /api[_-]?key\s*[=:]\s*["'][^"']*["']/gi, replacement: 'api_key=[REDACTED]' },
  { pattern: /api[_-]?key\s*[=:]\s*\S+/gi, replacement: 'api_key=[REDACTED]' },
  { pattern: /secret\s*[=:]\s*["'][^"']*["']/gi, replacement: 'secret=[REDACTED]' },
  { pattern: /secret\s*[=:]\s*\S+/gi, replacement: 'secret=[REDACTED]' },
  { pattern: /token\s*[=:]\s*["'][^"']*["']/gi, replacement: 'token=[REDACTED]' },
  { pattern: /token\s*[=:]\s*\S+/gi, replacement: 'token=[REDACTED]' },
  { pattern: /access[_-]?key\s*[=:]\s*["'][^"']*["']/gi, replacement: 'access_key=[REDACTED]' },
  { pattern: /access[_-]?key\s*[=:]\s*\S+/gi, replacement: 'access_key=[REDACTED]' },
  { pattern: /private[_-]?key\s*[=:]\s*["'][^"']*["']/gi, replacement: 'private_key=[REDACTED]' },
  { pattern: /private[_-]?key\s*[=:]\s*\S+/gi, replacement: 'private_key=[REDACTED]' },
];

function redactSensitive(text) {
  if (typeof text !== 'string') return text;
  let result = text;
  for (const { pattern, replacement } of SENSITIVE_PATTERNS) {
    result = result.replace(pattern, replacement);
  }
  return result;
}

const SENSITIVE_KEY_PATTERNS = /^(password|api[_-]?key|secret|token|access[_-]?key|private[_-]?key|raw[_-]?prompt)$/i;

function redactObject(obj) {
  if (obj === null || obj === undefined) return obj;
  if (typeof obj === 'string') return redactSensitive(obj);
  if (typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(redactObject);

  const result = {};
  for (const [key, value] of Object.entries(obj)) {
    if (SENSITIVE_KEY_PATTERNS.test(key)) {
      result[key] = '[REDACTED]';
    } else if (typeof value === 'string') {
      result[key] = redactSensitive(value);
    } else if (typeof value === 'object' && value !== null) {
      result[key] = redactObject(value);
    } else {
      result[key] = value;
    }
  }
  return result;
}

// ============================================================
// 审计日志类
// ============================================================

class AuditLog {
  constructor(options = {}) {
    /** @type {object[]} */
    this.entries = [];
    /** @type {number} */
    this._nextEventId = 1;
    /** @type {number} */
    this._maxEntries = options.maxEntries || 10000;
    /** @type {string|null} */
    this.storagePath = options.storagePath || null;
    /** @type {boolean} */
    this.loadExisting = options.loadExisting !== false;
    /** @type {boolean} */
    this.appendOnRecord = options.appendOnRecord !== false;
    /** @type {object[]} */
    this.loadErrors = [];

    // 指定 storagePath 且 loadExisting 不为 false 时，加载历史记录
    if (this.storagePath && this.loadExisting) {
      this.loadFromFile();
    }
  }

  /**
   * 从 NDJSON 文件加载历史记录
   * @returns {object[]} 加载的记录
   */
  loadFromFile() {
    if (!this.storagePath) return [];

    try {
      if (!fs.existsSync(this.storagePath)) return [];
    } catch {
      return [];
    }

    let content;
    try {
      content = fs.readFileSync(this.storagePath, 'utf-8');
    } catch {
      return [];
    }

    if (!content || !content.trim()) return [];

    const lines = content.split('\n');
    const loaded = [];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;

      try {
        const entry = JSON.parse(line);
        loaded.push(entry);

        // 恢复 eventId 编号
        if (entry.eventId && typeof entry.eventId === 'string') {
          const match = entry.eventId.match(/^audit-(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (num >= this._nextEventId) {
              this._nextEventId = num + 1;
            }
          }
        }
      } catch (err) {
        this.loadErrors.push({
          lineNumber: i + 1,
          line: line.substring(0, 200),
          message: err.message || 'JSON 解析失败',
        });
      }
    }

    // 应用 maxEntries 约束
    this.entries = loaded.length > this._maxEntries
      ? loaded.slice(-this._maxEntries)
      : loaded;

    return this.entries;
  }

  /**
   * 追加一条已红脱的 entry 到 NDJSON 文件
   * @param {object} entry
   */
  appendToFile(entry) {
    if (!this.storagePath) return;
    if (this.appendOnRecord === false) return;

    const dir = path.dirname(this.storagePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }

    const line = JSON.stringify(entry) + '\n';
    fs.appendFileSync(this.storagePath, line, 'utf-8');
  }

  /**
   * 写入审计事件（自动红脱）
   * @param {object} params
   * @returns {object} 审计记录
   */
  record({ eventType, actor, target, action, result, severity = 'info', message = '', metadata = {} }) {
    if (!eventType || !VALID_EVENT_TYPES.has(eventType)) {
      throw new Error(`无效事件类型: ${eventType}，必须是 ${[...VALID_EVENT_TYPES].join(', ')} 之一`);
    }
    if (!VALID_SEVERITY.has(severity)) {
      throw new Error(`无效严重级别: ${severity}，必须是 ${[...VALID_SEVERITY].join(', ')} 之一`);
    }
    if (result && !VALID_RESULT.has(result)) {
      throw new Error(`无效结果: ${result}，必须是 ${[...VALID_RESULT].join(', ')} 之一`);
    }

    const entry = {
      eventId: `audit-${this._nextEventId++}`,
      eventType,
      actor: actor || 'system',
      target: target || '',
      action: action || '',
      result: result || 'success',
      severity,
      message: redactSensitive(message || ''),
      metadata: redactObject(metadata || {}),
      timestamp: new Date().toISOString(),
    };

    this.entries.push(entry);

    // 超出上限时移除最旧的
    if (this.entries.length > this._maxEntries) {
      this.entries = this.entries.slice(-this._maxEntries);
    }

    // 追加到文件（使用已红脱的 entry）
    this.appendToFile(entry);

    return { ...entry, metadata: { ...entry.metadata } };
  }

  /**
   * 查询审计日志
   * @param {object} filters
   * @returns {object[]}
   */
  query({ eventType, actor, target, result, severity, from, to, limit = 100 } = {}) {
    let filtered = this.entries;

    if (eventType) {
      filtered = filtered.filter(e => e.eventType === eventType);
    }
    if (actor) {
      filtered = filtered.filter(e => e.actor === actor);
    }
    if (target) {
      filtered = filtered.filter(e => e.target === target);
    }
    if (result) {
      filtered = filtered.filter(e => e.result === result);
    }
    if (severity) {
      filtered = filtered.filter(e => e.severity === severity);
    }
    if (from) {
      filtered = filtered.filter(e => e.timestamp >= from);
    }
    if (to) {
      filtered = filtered.filter(e => e.timestamp <= to);
    }

    return filtered.slice(-limit).map(e => ({ ...e, metadata: { ...e.metadata } }));
  }

  /**
   * 按事件类型统计
   * @returns {object}
   */
  getStats() {
    const byType = {};
    const bySeverity = {};
    const byResult = {};

    for (const entry of this.entries) {
      byType[entry.eventType] = (byType[entry.eventType] || 0) + 1;
      bySeverity[entry.severity] = (bySeverity[entry.severity] || 0) + 1;
      byResult[entry.result] = (byResult[entry.result] || 0) + 1;
    }

    return {
      total: this.entries.length,
      byType,
      bySeverity,
      byResult,
    };
  }

  /**
   * 导出审计日志
   * @param {string} format - 'json' | 'ndjson'
   * @returns {string}
   */
  export(format = 'json') {
    if (format === 'ndjson') {
      return this.entries.map(e => JSON.stringify(e)).join('\n');
    }
    return JSON.stringify(this.entries, null, 2);
  }

  /**
   * 清空审计日志（同时清空内存和持久化文件）
   */
  clear() {
    this.entries = [];
    this._nextEventId = 1;
    this.loadErrors = [];

    if (this.storagePath) {
      const dir = path.dirname(this.storagePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(this.storagePath, '', 'utf-8');
    }
  }

  /**
   * 获取坏行加载错误
   * @returns {object[]}
   */
  getLoadErrors() {
    return this.loadErrors.map(e => ({ ...e }));
  }

  /**
   * 条目数量
   * @returns {number}
   */
  get size() {
    return this.entries.length;
  }

  /**
   * 导出为 JSON
   * @returns {object[]}
   */
  toJSON() {
    return this.entries.map(e => ({ ...e, metadata: { ...e.metadata } }));
  }
}

/**
 * 工厂函数
 * @param {object} [options]
 * @returns {AuditLog}
 */
function createAuditLog(options) {
  return new AuditLog(options);
}

module.exports = {
  AUDIT_EVENT_TYPES,
  AUDIT_SEVERITY,
  AUDIT_RESULT,
  VALID_EVENT_TYPES,
  VALID_SEVERITY,
  VALID_RESULT,
  AuditLog,
  createAuditLog,
  redactSensitive,
  redactObject,
};
