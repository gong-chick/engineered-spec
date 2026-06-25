/**
 * P3.6 Security Policy Engine
 *
 * 密钥保护、源码不外泄、敏感信息红脱、命令白名单、Prompt 注入防护
 */

const {
  POLICY_TYPES,
  POLICY_SEVERITY,
  VALID_POLICY_TYPES,
  VALID_POLICY_SEVERITY,
  DEFAULT_SECRET_PATTERNS,
  DEFAULT_INJECTION_PATTERNS,
} = require('./policy-types');

// ============================================================
// 安全策略引擎
// ============================================================

class SecurityPolicyEngine {
  constructor(policies = []) {
    /** @type {Map<string, object>} policyId → policy */
    this.policies = new Map();
    /** @type {number} */
    this._nextPolicyId = 1;

    // 注册默认策略
    this._registerDefaults();

    // 注册用户自定义策略
    for (const policy of policies) {
      this.addPolicy(policy);
    }
  }

  /**
   * 添加策略
   * @param {object} policy
   * @returns {object} 完整策略
   */
  addPolicy({ name, type, enabled = true, severity = 'warn', config = {} }) {
    if (!name || !type) {
      throw new Error('name, type 必填');
    }
    if (!VALID_POLICY_TYPES.has(type)) {
      throw new Error(`无效策略类型: ${type}，必须是 ${[...VALID_POLICY_TYPES].join(', ')} 之一`);
    }
    if (!VALID_POLICY_SEVERITY.has(severity)) {
      throw new Error(`无效严重级别: ${severity}，必须是 ${[...VALID_POLICY_SEVERITY].join(', ')} 之一`);
    }

    const policyId = `policy-${this._nextPolicyId++}`;
    const policy = {
      policyId,
      name,
      type,
      enabled,
      severity,
      config: { ...config },
      createdAt: new Date().toISOString(),
    };

    this.policies.set(policyId, policy);
    return { ...policy };
  }

  /**
   * 移除策略
   * @param {string} policyId
   * @returns {boolean}
   */
  removePolicy(policyId) {
    return this.policies.delete(policyId);
  }

  /**
   * 获取策略
   * @param {string} policyId
   * @returns {object|null}
   */
  getPolicy(policyId) {
    const p = this.policies.get(policyId);
    return p ? { ...p } : null;
  }

  /**
   * 列出所有策略
   * @returns {object[]}
   */
  listPolicies() {
    return [...this.policies.values()].map(p => ({ ...p }));
  }

  /**
   * 扫描内容中的密钥
   * @param {string} content
   * @returns {object} { found: boolean, matches: Array<{name, match, index}> }
   */
  scanForSecrets(content) {
    if (typeof content !== 'string') return { found: false, matches: [] };

    const matches = [];
    const patterns = this._getPatternsByType(POLICY_TYPES.SECRET_SCANNER);

    for (const { name, pattern } of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(content)) !== null) {
        matches.push({
          name,
          match: match[0].substring(0, 20) + '...',
          index: match.index,
        });
      }
    }

    return { found: matches.length > 0, matches };
  }

  /**
   * 红脱敏感信息
   * @param {string} content
   * @returns {string} 红脱后的内容
   */
  redactSensitive(content) {
    if (typeof content !== 'string') return content;

    let result = content;
    const patterns = this._getPatternsByType(POLICY_TYPES.REDACTION);

    for (const { pattern } of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      result = result.replace(regex, '[REDACTED]');
    }

    // 同时应用密钥扫描模式的红脱
    const secretPatterns = this._getPatternsByType(POLICY_TYPES.SECRET_SCANNER);
    for (const { pattern } of secretPatterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      result = result.replace(regex, '[REDACTED]');
    }

    return result;
  }

  /**
   * 检查命令是否在白名单
   * @param {string} command
   * @returns {object} { allowed: boolean, reason? }
   */
  checkCommand(command) {
    if (typeof command !== 'string') return { allowed: false, reason: '命令格式无效' };

    const allowlistPolicies = this._getEnabledPoliciesByType(POLICY_TYPES.COMMAND_ALLOWLIST);
    if (allowlistPolicies.length === 0) {
      return { allowed: true };
    }

    const cmd = command.trim().split(/\s+/)[0];
    for (const policy of allowlistPolicies) {
      const allowed = policy.config.allowedCommands || [];
      if (allowed.includes(cmd) || allowed.includes('*')) {
        return { allowed: true };
      }
    }

    return { allowed: false, reason: `命令 ${cmd} 不在白名单中` };
  }

  /**
   * 检测 prompt 注入
   * @param {string} prompt
   * @returns {object} { detected: boolean, matches: Array<{name, pattern, index}> }
   */
  detectInjection(prompt) {
    if (typeof prompt !== 'string') return { detected: false, matches: [] };

    const matches = [];
    const patterns = this._getPatternsByType(POLICY_TYPES.INJECTION_GUARD);

    for (const { name, pattern } of patterns) {
      const regex = new RegExp(pattern.source, pattern.flags);
      let match;
      while ((match = regex.exec(prompt)) !== null) {
        matches.push({
          name,
          match: match[0],
          index: match.index,
        });
      }
    }

    return { detected: matches.length > 0, matches };
  }

  /**
   * 综合评估（串联所有策略）
   * @param {string} content
   * @param {object} context - { type: 'content'|'command'|'prompt', ... }
   * @returns {object} { passed: boolean, violations: Array<{policyId, name, type, severity, detail}> }
   */
  evaluate(content, context = {}) {
    const violations = [];

    // 密钥扫描
    const secretResult = this.scanForSecrets(content);
    if (secretResult.found) {
      const policy = this._findFirstEnabledPolicy(POLICY_TYPES.SECRET_SCANNER);
      violations.push({
        policyId: policy?.policyId || 'default',
        name: policy?.name || 'secret-scanner',
        type: POLICY_TYPES.SECRET_SCANNER,
        severity: policy?.severity || 'block',
        detail: `发现 ${secretResult.matches.length} 个密钥匹配`,
      });
    }

    // 注入检测
    if (context.type === 'prompt' || !context.type) {
      const injectionResult = this.detectInjection(content);
      if (injectionResult.detected) {
        const policy = this._findFirstEnabledPolicy(POLICY_TYPES.INJECTION_GUARD);
        violations.push({
          policyId: policy?.policyId || 'default',
          name: policy?.name || 'injection-guard',
          type: POLICY_TYPES.INJECTION_GUARD,
          severity: policy?.severity || 'block',
          detail: `检测到 ${injectionResult.matches.length} 个注入模式`,
        });
      }
    }

    // 命令白名单
    if (context.type === 'command') {
      const cmdResult = this.checkCommand(content);
      if (!cmdResult.allowed) {
        const policy = this._findFirstEnabledPolicy(POLICY_TYPES.COMMAND_ALLOWLIST);
        violations.push({
          policyId: policy?.policyId || 'default',
          name: policy?.name || 'command-allowlist',
          type: POLICY_TYPES.COMMAND_ALLOWLIST,
          severity: policy?.severity || 'block',
          detail: cmdResult.reason,
        });
      }
    }

    const hasBlocking = violations.some(v => v.severity === 'block');
    return {
      passed: violations.length === 0,
      blocked: hasBlocking,
      violations,
    };
  }

  /**
   * 获取统计
   * @returns {object}
   */
  getStats() {
    const byType = {};
    const bySeverity = {};
    for (const p of this.policies.values()) {
      byType[p.type] = (byType[p.type] || 0) + 1;
      bySeverity[p.severity] = (bySeverity[p.severity] || 0) + 1;
    }
    return {
      total: this.policies.size,
      byType,
      bySeverity,
    };
  }

  /**
   * 重置为默认策略
   */
  reset() {
    this.policies.clear();
    this._nextPolicyId = 1;
    this._registerDefaults();
  }

  // ============================================================
  // 内部方法
  // ============================================================

  _registerDefaults() {
    // 默认密钥扫描策略
    this.addPolicy({
      name: 'default-secret-scanner',
      type: POLICY_TYPES.SECRET_SCANNER,
      severity: 'block',
      config: { patterns: DEFAULT_SECRET_PATTERNS },
    });

    // 默认红脱策略
    this.addPolicy({
      name: 'default-redaction',
      type: POLICY_TYPES.REDACTION,
      severity: 'warn',
      config: {
        patterns: [
          { pattern: /password\s*[=:]\s*['"][^'"]+['"]/gi },
          { pattern: /api[_-]?key\s*[=:]\s*['"][^'"]+['"]/gi },
          { pattern: /secret\s*[=:]\s*['"][^'"]+['"]/gi },
          { pattern: /token\s*[=:]\s*['"][^'"]+['"]/gi },
        ],
      },
    });

    // 默认注入防护策略
    this.addPolicy({
      name: 'default-injection-guard',
      type: POLICY_TYPES.INJECTION_GUARD,
      severity: 'block',
      config: { patterns: DEFAULT_INJECTION_PATTERNS },
    });
  }

  _getPatternsByType(type) {
    const patterns = [];
    for (const policy of this.policies.values()) {
      if (policy.type === type && policy.enabled && policy.config.patterns) {
        patterns.push(...policy.config.patterns);
      }
    }
    return patterns;
  }

  _getEnabledPoliciesByType(type) {
    return [...this.policies.values()].filter(p => p.type === type && p.enabled);
  }

  _findFirstEnabledPolicy(type) {
    for (const policy of this.policies.values()) {
      if (policy.type === type && policy.enabled) return policy;
    }
    return null;
  }
}

/**
 * 工厂函数
 * @param {object[]} [policies]
 * @returns {SecurityPolicyEngine}
 */
function createSecurityPolicyEngine(policies) {
  return new SecurityPolicyEngine(policies);
}

module.exports = {
  SecurityPolicyEngine,
  createSecurityPolicyEngine,
};
