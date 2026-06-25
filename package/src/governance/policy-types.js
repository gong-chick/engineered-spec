/**
 * P3.6 安全策略类型定义
 */

const POLICY_TYPES = Object.freeze({
  SECRET_SCANNER: 'secret-scanner',
  REDACTION: 'redaction',
  COMMAND_ALLOWLIST: 'command-allowlist',
  INJECTION_GUARD: 'injection-guard',
});

const POLICY_SEVERITY = Object.freeze({
  BLOCK: 'block',
  WARN: 'warn',
  LOG: 'log',
});

const VALID_POLICY_TYPES = new Set(Object.values(POLICY_TYPES));
const VALID_POLICY_SEVERITY = new Set(Object.values(POLICY_SEVERITY));

// 默认密钥扫描模式
const DEFAULT_SECRET_PATTERNS = [
  { name: 'AWS Access Key', pattern: /AKIA[0-9A-Z]{16}/g },
  { name: 'GitHub Token', pattern: /gh[ps]_[A-Za-z0-9_]{36,}/g },
  { name: 'Generic API Key', pattern: /api[_-]?key\s*[=:]\s*['"][^'"]+['"]/gi },
  { name: 'Private Key', pattern: /-----BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY-----/g },
  { name: 'JWT Token', pattern: /eyJ[A-Za-z0-9-_]+\.eyJ[A-Za-z0-9-_]+\.[A-Za-z0-9-_.+/=]+/g },
  { name: 'Password Assignment', pattern: /password\s*[=:]\s*['"][^'"]+['"]/gi },
  { name: 'Secret Assignment', pattern: /secret\s*[=:]\s*['"][^'"]+['"]/gi },
  { name: 'Token Assignment', pattern: /token\s*[=:]\s*['"][^'"]+['"]/gi },
];

// 默认注入检测模式
const DEFAULT_INJECTION_PATTERNS = [
  // 角色覆盖
  { name: 'role-override', pattern: /ignore\s+(all\s+)?previous\s+instructions/gi },
  { name: 'role-override', pattern: /you\s+are\s+now\s+(a|an)\s+/gi },
  { name: 'role-override', pattern: /system\s+prompt\s*[=:]/gi },
  // 信息泄露
  { name: 'info-leak', pattern: /reveal\s+(your|the)\s+prompt/gi },
  { name: 'info-leak', pattern: /show\s+(system|your)\s+(message|instructions|prompt)/gi },
  { name: 'info-leak', pattern: /print\s+(your|the)\s+instructions/gi },
  // 越权执行
  { name: 'privilege-escalation', pattern: /execute\s+as\s+admin/gi },
  { name: 'privilege-escalation', pattern: /bypass\s+(all\s+)?security/gi },
  { name: 'privilege-escalation', pattern: /run\s+without\s+restrictions/gi },
];

module.exports = {
  POLICY_TYPES,
  POLICY_SEVERITY,
  VALID_POLICY_TYPES,
  VALID_POLICY_SEVERITY,
  DEFAULT_SECRET_PATTERNS,
  DEFAULT_INJECTION_PATTERNS,
};
