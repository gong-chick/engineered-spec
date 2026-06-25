'use strict';

/**
 * RiskBoard — 风险与审计看板
 * 展示策略拒绝、安全风险、越权尝试、审计操作
 */

const POLICY_DENIAL_TYPES = ['policy_denied'];
const SECURITY_RISK_TYPES = ['security.risk', 'security.violation', 'security.alert'];
const PRIVILEGE_ESCALATION_TYPES = ['agent.tool_denied', 'agent.file_scope', 'agent.max_iterations'];
const AUDIT_OPERATION_TYPES = ['audit.operation', 'audit.approval', 'audit.rollback'];

const RISK_LEVELS = ['low', 'medium', 'high', 'critical'];

const SEVERITY_TO_RISK_LEVEL = {
  info: 'low',
  warn: 'medium',
  error: 'high',
  blocking: 'critical',
  low: 'low',
  medium: 'medium',
  high: 'high',
  critical: 'critical'
};

const RISK_LEVEL_RANK = { low: 0, medium: 1, high: 2, critical: 3 };

/**
 * 将 severity 映射为 riskLevel
 * @param {string} severity
 * @returns {string}
 */
function mapSeverityToRiskLevel(severity) {
  return SEVERITY_TO_RISK_LEVEL[severity] || 'low';
}

/**
 * 获取 riskLevel 排序权重
 * @param {string} riskLevel
 * @returns {number}
 */
function getRiskLevelRank(riskLevel) {
  return RISK_LEVEL_RANK[riskLevel] ?? 0;
}

class RiskBoard {
  constructor(options = {}) {
    this._events = [];
  }

  /**
   * 导入事件进行分析
   * @param {object[]} events
   */
  ingestEvents(events) {
    if (!Array.isArray(events)) return;
    this._events = events;
  }

  /**
   * 获取策略拒绝列表
   * @returns {object[]}
   */
  getPolicyDenials() {
    return this._events
      .filter(e => POLICY_DENIAL_TYPES.includes(e.eventType))
      .map(e => ({
        eventId: e.eventId,
        message: e.message,
        severity: e.severity,
        timestamp: e.timestamp,
        metadata: e.metadata
      }));
  }

  /**
   * 获取安全风险列表
   * @returns {object[]}
   */
  getSecurityRisks() {
    return this._events
      .filter(e => SECURITY_RISK_TYPES.includes(e.eventType))
      .map(e => ({
        eventId: e.eventId,
        type: e.eventType,
        message: e.message,
        severity: e.severity,
        timestamp: e.timestamp,
        metadata: e.metadata
      }));
  }

  /**
   * 获取越权尝试列表
   * @returns {object[]}
   */
  getPrivilegeEscalations() {
    return this._events
      .filter(e => PRIVILEGE_ESCALATION_TYPES.includes(e.eventType))
      .map(e => ({
        eventId: e.eventId,
        type: e.eventType.replace('agent.', ''),
        agentId: e.metadata?.agentId || 'unknown',
        message: e.message,
        severity: e.severity,
        timestamp: e.timestamp
      }));
  }

  /**
   * 获取审计操作列表
   * @returns {object[]}
   */
  getAuditOperations() {
    return this._events
      .filter(e => AUDIT_OPERATION_TYPES.includes(e.eventType))
      .map(e => ({
        eventId: e.eventId,
        type: e.eventType,
        message: e.message,
        severity: e.severity,
        timestamp: e.timestamp,
        metadata: e.metadata
      }));
  }

  /**
   * 风险摘要
   * @returns {object}
   */
  getRiskSummary() {
    const denials = this.getPolicyDenials();
    const risks = this.getSecurityRisks();
    const escalations = this.getPrivilegeEscalations();
    const audits = this.getAuditOperations();

    // 风险等级判定
    const riskLevel = this._computeRiskLevel(denials, risks, escalations);

    // 顶级风险
    const topRisks = this._computeTopRisks(denials, risks, escalations);

    return {
      totalPolicyDenials: denials.length,
      totalSecurityRisks: risks.length,
      totalPrivilegeEscalations: escalations.length,
      totalAuditOperations: audits.length,
      riskLevel,
      topRisks,
      computedAt: new Date().toISOString()
    };
  }

  /**
   * 计算风险等级
   * - critical: 有 blocking 级别的安全事件
   * - high: 有 error 级别的安全事件或 >5 次策略拒绝
   * - medium: 有 warn 级别的安全事件
   * - low: 无安全事件
   */
  _computeRiskLevel(denials, risks, escalations) {
    const allSecurity = [...risks, ...escalations];

    // blocking → critical
    if (allSecurity.some(e => e.severity === 'blocking')) {
      return 'critical';
    }

    // error 或 >5 次拒绝 → high
    if (allSecurity.some(e => e.severity === 'error') || denials.length > 5) {
      return 'high';
    }

    // warn → medium
    if (allSecurity.some(e => e.severity === 'warn')) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * 计算顶级风险
   */
  _computeTopRisks(denials, risks, escalations) {
    const riskMap = new Map();

    const addRisk = (type, count, severity) => {
      if (count > 0) {
        const riskLevel = mapSeverityToRiskLevel(severity);
        riskMap.set(type, { type, count, severity, riskLevel });
      }
    };

    addRisk('policy_denied', denials.length, denials.length > 5 ? 'error' : 'warn');
    addRisk('security_risk', risks.length, risks.length > 0 ? risks[0].severity : 'info');
    addRisk('privilege_escalation', escalations.length, escalations.length > 0 ? escalations[0].severity : 'info');

    return Array.from(riskMap.values()).sort((a, b) => {
      return getRiskLevelRank(b.riskLevel) - getRiskLevelRank(a.riskLevel);
    });
  }

  /**
   * 多维过滤
   * @param {object} [filters]
   * @param {string} [filters.severity]
   * @param {string} [filters.type]
   * @param {string} [filters.from]
   * @param {string} [filters.to]
   * @returns {object[]}
   */
  filter(filters = {}) {
    let results = [...this._events];

    if (filters.severity) {
      results = results.filter(e => e.severity === filters.severity);
    }
    if (filters.type) {
      results = results.filter(e =>
        e.eventType === filters.type ||
        e.eventType.startsWith(filters.type + '.')
      );
    }
    if (filters.from) {
      results = results.filter(e => e.timestamp >= filters.from);
    }
    if (filters.to) {
      results = results.filter(e => e.timestamp <= filters.to);
    }

    return results;
  }
}

function createRiskBoard(options) {
  return new RiskBoard(options);
}

module.exports = {
  POLICY_DENIAL_TYPES,
  SECURITY_RISK_TYPES,
  PRIVILEGE_ESCALATION_TYPES,
  AUDIT_OPERATION_TYPES,
  RISK_LEVELS,
  SEVERITY_TO_RISK_LEVEL,
  RISK_LEVEL_RANK,
  mapSeverityToRiskLevel,
  getRiskLevelRank,
  RiskBoard,
  createRiskBoard
};
