'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { redactSensitive, redactObject } = require('../governance/audit-log');

/**
 * Run Event 标准化 Schema
 * eventId: 自增 ID
 * runId: 运行 ID
 * projectId: 项目 ID
 * eventType: 事件类型 (hook.failed / test.passed / repair.attempt / agent.handoff / ...)
 * stage: 阶段 (pre-task / pre-edit / post-edit / pre-test / post-test / repair / archive)
 * status: 状态 (success / failed / blocked / skipped)
 * severity: 严重级别 (info / warn / error / blocking)
 * message: 脱敏后消息
 * timestamp: ISO 时间
 * metadata: 脱敏后元数据
 */

const VALID_SEVERITY = ['info', 'warn', 'error', 'blocking'];
const VALID_STATUS = ['success', 'failed', 'blocked', 'skipped'];
const VALID_STAGES = [
  'pre-task', 'pre-edit', 'post-edit', 'pre-test', 'post-test', 'repair', 'archive'
];

const REQUIRED_FIELDS = ['eventType', 'stage', 'status', 'severity'];

/**
 * 校验单条原始事件
 * @param {object} raw
 * @returns {{ valid: boolean, errors: string[] }}
 */
function validateEvent(raw) {
  const errors = [];
  if (!raw || typeof raw !== 'object') {
    return { valid: false, errors: ['事件必须是非空对象'] };
  }
  for (const field of REQUIRED_FIELDS) {
    if (!raw[field] || typeof raw[field] !== 'string') {
      errors.push(`缺少必填字段: ${field}`);
    }
  }
  if (raw.severity && !VALID_SEVERITY.includes(raw.severity)) {
    errors.push(`非法 severity: ${raw.severity}，允许值: ${VALID_SEVERITY.join(', ')}`);
  }
  if (raw.status && !VALID_STATUS.includes(raw.status)) {
    errors.push(`非法 status: ${raw.status}，允许值: ${VALID_STATUS.join(', ')}`);
  }
  if (raw.stage && !VALID_STAGES.includes(raw.stage)) {
    errors.push(`非法 stage: ${raw.stage}，允许值: ${VALID_STAGES.join(', ')}`);
  }
  return { valid: errors.length === 0, errors };
}

/**
 * 对事件消息和元数据进行红脱
 * @param {object} raw
 * @returns {object}
 */
function redactEvent(raw) {
  const message = raw.message ? redactSensitive(String(raw.message)) : '';
  const metadata = raw.metadata ? redactObject(raw.metadata) : {};
  return { ...raw, message, metadata };
}

/**
 * EventGateway — 本地事件网关
 * 负责事件接收、校验、脱敏、NDJSON 持久化、查询和统计
 */
class EventGateway {
  /**
   * @param {object} options
   * @param {string} [options.storagePath] — NDJSON 存储路径
   * @param {number} [options.maxEvents] — 最大事件数（内存）
   * @param {string} [options.projectId] — 项目 ID
   * @param {boolean} [options.throwOnWriteError] — 写入失败时是否抛出异常
   */
  constructor(options = {}) {
    const { storagePath, maxEvents = 10000, projectId = 'default', throwOnWriteError = false } = options;
    this._projectId = projectId;
    this._maxEvents = maxEvents;
    this._events = [];
    this._nextId = 1;
    this._loadErrors = [];
    this._writeErrors = [];
    this._throwOnWriteError = throwOnWriteError === true;

    if (storagePath) {
      this._storagePath = path.resolve(storagePath);
      this._storageDir = path.dirname(this._storagePath);
      this._ensureStorageDir();
      this._loadFromFile();
    } else {
      this._storagePath = null;
      this._storageDir = null;
    }
  }

  /**
   * 确保存储目录存在
   */
  _ensureStorageDir() {
    if (this._storageDir && !fs.existsSync(this._storageDir)) {
      fs.mkdirSync(this._storageDir, { recursive: true });
    }
  }

  /**
   * 从 NDJSON 文件加载已有事件
   */
  _loadFromFile() {
    if (!this._storagePath || !fs.existsSync(this._storagePath)) {
      return;
    }
    try {
      const content = fs.readFileSync(this._storagePath, 'utf8');
      const lines = content.split('\n').filter(line => line.trim());
      lines.forEach((line, index) => {
        try {
          const event = JSON.parse(line);
          this._events.push(event);
          // 恢复自增 ID
          const idNum = parseInt(event.eventId?.replace('evt-', ''), 10);
          if (!isNaN(idNum) && idNum >= this._nextId) {
            this._nextId = idNum + 1;
          }
        } catch (err) {
          this._loadErrors.push({
            type: 'parse_error',
            message: err.message || 'JSON 解析失败',
            timestamp: new Date().toISOString(),
            lineNumber: index + 1,
            line: line.length > 200 ? line.slice(0, 200) + '...' : line
          });
        }
      });
    } catch (err) {
      this._loadErrors.push({
        type: 'file_read_error',
        message: err.message || '文件读取失败',
        timestamp: new Date().toISOString(),
        lineNumber: 0,
        line: ''
      });
    }
  }

  /**
   * 追加写入单条事件到 NDJSON 文件
   * @param {object} event
   */
  _appendToFile(event) {
    if (!this._storagePath) return;
    try {
      this._ensureStorageDir();
      fs.appendFileSync(this._storagePath, JSON.stringify(event) + '\n', 'utf8');
    } catch (err) {
      const writeError = {
        type: 'write_error',
        message: err.message || '写入失败',
        timestamp: new Date().toISOString()
      };
      this._writeErrors.push(writeError);
      if (this._throwOnWriteError) {
        throw err;
      }
    }
  }

  /**
   * 接收原始事件 → 校验 → 脱敏 → 存储 → 返回标准化事件
   * @param {object} rawEvent
   * @returns {{ success: boolean, event?: object, errors?: string[] }}
   */
  ingest(rawEvent) {
    const { valid, errors } = validateEvent(rawEvent);
    if (!valid) {
      return { success: false, errors };
    }

    const redacted = redactEvent(rawEvent);
    const event = {
      eventId: `evt-${this._nextId++}`,
      runId: redacted.runId || '',
      projectId: redacted.projectId || this._projectId,
      eventType: redacted.eventType,
      stage: redacted.stage,
      status: redacted.status,
      severity: redacted.severity,
      message: redacted.message,
      timestamp: redacted.timestamp || new Date().toISOString(),
      metadata: redacted.metadata
    };

    this._events.push(event);
    this._appendToFile(event);

    // 超过最大事件数时裁剪内存（文件保留完整）
    if (this._events.length > this._maxEvents) {
      this._events = this._events.slice(-this._maxEvents);
    }

    return { success: true, event };
  }

  /**
   * 多维查询
   * @param {object} [filters]
   * @param {string} [filters.eventType]
   * @param {string} [filters.stage]
   * @param {string} [filters.severity]
   * @param {string} [filters.runId]
   * @param {string} [filters.from] — ISO 时间下限
   * @param {string} [filters.to] — ISO 时间上限
   * @param {number} [filters.limit]
   * @returns {object[]}
   */
  query(filters = {}) {
    let results = [...this._events];

    if (filters.eventType) {
      results = results.filter(e => e.eventType === filters.eventType);
    }
    if (filters.stage) {
      results = results.filter(e => e.stage === filters.stage);
    }
    if (filters.severity) {
      results = results.filter(e => e.severity === filters.severity);
    }
    if (filters.runId) {
      results = results.filter(e => e.runId === filters.runId);
    }
    if (filters.from) {
      results = results.filter(e => e.timestamp >= filters.from);
    }
    if (filters.to) {
      results = results.filter(e => e.timestamp <= filters.to);
    }
    if (typeof filters.limit === 'number' && filters.limit > 0) {
      results = results.slice(-filters.limit);
    }

    return results;
  }

  /**
   * 统计：按 type / stage / severity 分组计数
   * @returns {object}
   */
  getStats() {
    const byType = {};
    const byStage = {};
    const bySeverity = {};
    const byStatus = {};

    for (const e of this._events) {
      byType[e.eventType] = (byType[e.eventType] || 0) + 1;
      byStage[e.stage] = (byStage[e.stage] || 0) + 1;
      bySeverity[e.severity] = (bySeverity[e.severity] || 0) + 1;
      byStatus[e.status] = (byStatus[e.status] || 0) + 1;
    }

    return {
      total: this._events.length,
      byType,
      byStage,
      bySeverity,
      byStatus
    };
  }

  /**
   * 导出为 JSON 或 NDJSON
   * @param {'json'|'ndjson'} [format='json']
   * @returns {string}
   */
  export(format = 'json') {
    if (format === 'ndjson') {
      return this._events.map(e => JSON.stringify(e)).join('\n');
    }
    return JSON.stringify(this._events, null, 2);
  }

  /**
   * 清空事件
   * @param {object} [options]
   * @param {boolean} [options.clearFile] — 是否同时清空持久化文件
   */
  clear(options = {}) {
    this._events = [];
    this._nextId = 1;
    if (options.clearFile && this._storagePath) {
      try {
        fs.writeFileSync(this._storagePath, '', 'utf8');
      } catch (err) {
        const writeError = {
          type: 'clear_file_error',
          message: err.message || '清空文件失败',
          timestamp: new Date().toISOString()
        };
        this._writeErrors.push(writeError);
        if (this._throwOnWriteError) {
          throw err;
        }
      }
    }
  }

  /**
   * 获取加载错误列表（副本）
   * @returns {object[]}
   */
  getLoadErrors() {
    return [...this._loadErrors];
  }

  /**
   * 获取写入错误列表（副本）
   * @returns {object[]}
   */
  getWriteErrors() {
    return [...this._writeErrors];
  }

  /**
   * 当前事件数量
   * @returns {number}
   */
  get size() {
    return this._events.length;
  }
}

/**
 * 工厂函数
 * @param {object} [options]
 * @param {string} [options.storagePath]
 * @param {number} [options.maxEvents]
 * @param {string} [options.projectId]
 * @returns {EventGateway}
 */
function createEventGateway(options) {
  return new EventGateway(options);
}

module.exports = {
  VALID_SEVERITY,
  VALID_STATUS,
  VALID_STAGES,
  REQUIRED_FIELDS,
  validateEvent,
  redactEvent,
  EventGateway,
  createEventGateway
};
