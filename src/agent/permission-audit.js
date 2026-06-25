/**
 * Permission Audit — 权限审计日志
 *
 * 记录每次权限检查的结果，支持查询和导出。
 */

// ============================================================
// PermissionAuditLog
// ============================================================

class PermissionAuditLog {
  constructor() {
    /** @type {Array<PermissionAuditEntry>} */
    this.entries = [];
  }

  /**
   * 记录权限检查结果
   * @param {Object} params
   * @param {string} params.agentId - Agent ID
   * @param {string} params.checkType - 检查类型 (tool/file)
   * @param {string} params.target - 被检查的目标（工具名或文件路径）
   * @param {boolean} params.allowed - 是否允许
   * @param {string} params.reason - 原因
   */
  record({ agentId, checkType, target, allowed, reason }) {
    this.entries.push({
      agentId,
      checkType,
      target,
      allowed,
      reason,
      timestamp: new Date().toISOString(),
    });
  }

  /**
   * 记录工具权限检查
   * @param {string} agentId
   * @param {string} toolName
   * @param {{ allowed: boolean, reason: string }} result
   */
  recordToolCheck(agentId, toolName, result) {
    this.record({
      agentId,
      checkType: 'tool',
      target: toolName,
      allowed: result.allowed,
      reason: result.reason,
    });
  }

  /**
   * 记录文件权限检查
   * @param {string} agentId
   * @param {string} filePath
   * @param {{ allowed: boolean, reason: string }} result
   */
  recordFileCheck(agentId, filePath, result) {
    this.record({
      agentId,
      checkType: 'file',
      target: filePath,
      allowed: result.allowed,
      reason: result.reason,
    });
  }

  /**
   * 查询指定 Agent 的所有审计记录
   * @param {string} agentId
   * @returns {Array<PermissionAuditEntry>}
   */
  getByAgent(agentId) {
    return this.entries.filter((e) => e.agentId === agentId);
  }

  /**
   * 查询被拒绝的记录
   * @param {string} [agentId] - 可选，按 Agent 过滤
   * @returns {Array<PermissionAuditEntry>}
   */
  getDenied(agentId) {
    return this.entries.filter((e) => !e.allowed && (!agentId || e.agentId === agentId));
  }

  /**
   * 获取审计统计
   * @param {string} [agentId] - 可选，按 Agent 过滤
   * @returns {{ total: number, allowed: number, denied: number, byType: Record<string, number> }}
   */
  getStats(agentId) {
    const filtered = agentId ? this.getByAgent(agentId) : this.entries;

    const stats = {
      total: filtered.length,
      allowed: 0,
      denied: 0,
      byType: {},
    };

    for (const entry of filtered) {
      if (entry.allowed) {
        stats.allowed++;
      } else {
        stats.denied++;
      }

      stats.byType[entry.checkType] = (stats.byType[entry.checkType] || 0) + 1;
    }

    return stats;
  }

  /**
   * 清空审计日志
   */
  clear() {
    this.entries = [];
  }

  /**
   * 获取日志条目数量
   * @returns {number}
   */
  get size() {
    return this.entries.length;
  }

  /**
   * 导出为 JSON
   * @returns {Array<PermissionAuditEntry>}
   */
  toJSON() {
    return [...this.entries];
  }
}

/**
 * @typedef {Object} PermissionAuditEntry
 * @property {string} agentId
 * @property {string} checkType - 'tool' | 'file'
 * @property {string} target
 * @property {boolean} allowed
 * @property {string} reason
 * @property {string} timestamp
 */

module.exports = {
  PermissionAuditLog,
};
