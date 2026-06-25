const path = require('path');

const FORBIDDEN_KEYS = new Set([
  'sourceCode',
  'sourceContent',
  'fileContent',
  'rawPrompt',
  'rawResponse',
  'absolutePath',
  'userName',
  'apiKey',
  'password',
  'token',
  'secret',
]);

const SECRET_TEXT_RE = /(^|\b)(api[_-]?key|password|token|secret)\s*[:=]/i;
const ENV_TEXT_RE = /(^|\n)\s*[A-Z0-9_]{3,}\s*=\s*.+/;

class PrivacyPolicyError extends Error {
  constructor(message = '上报数据包含不允许采集的敏感字段。') {
    super(message);
    this.name = 'PrivacyPolicyError';
    this.code = 'PRIVACY_POLICY_VIOLATED';
    this.suggestion = '请移除源码、原始提示词、原始响应、绝对路径或密钥信息后重试。';
  }
}

function isAbsolutePathText(value) {
  const text = String(value || '');
  return path.isAbsolute(text) || /^[A-Za-z]:[\\/]/.test(text) || text.includes('/Users/');
}

function createPrivacy() {
  return {
    sourceCodeIncluded: false,
    rawPromptIncluded: false,
    rawResponseIncluded: false,
    absolutePathIncluded: false,
  };
}

function visit(value, fieldPath = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => visit(item, `${fieldPath}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string') {
      if (isAbsolutePathText(value) || SECRET_TEXT_RE.test(value) || ENV_TEXT_RE.test(value) || value.includes('.env')) {
        throw new PrivacyPolicyError(`上报字段 ${fieldPath || '<root>'} 包含敏感内容。`);
      }
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) {
      throw new PrivacyPolicyError(`上报数据不允许包含 ${key}。`);
    }
    visit(child, fieldPath ? `${fieldPath}.${key}` : key);
  }
}

class PrivacyFilter {
  filter(payload = {}) {
    const next = {
      ...payload,
      privacy: createPrivacy(),
    };
    this.assertSafe(next);
    return next;
  }

  assertSafe(payload = {}) {
    if (payload.privacy && typeof payload.privacy === 'object') {
      const flags = payload.privacy;
      if (flags.sourceCodeIncluded || flags.rawPromptIncluded || flags.rawResponseIncluded || flags.absolutePathIncluded) {
        throw new PrivacyPolicyError();
      }
    }
    visit(payload);
  }

  assertRelativeChangedFiles(changedFiles = []) {
    for (const file of changedFiles || []) {
      if (!file || typeof file !== 'object') continue;
      const filePath = String(file.path || '');
      if (!filePath || isAbsolutePathText(filePath)) {
        throw new PrivacyPolicyError('changedFiles 只能包含相对路径。');
      }
    }
  }
}

module.exports = {
  PrivacyFilter,
  PrivacyPolicyError,
  createPrivacy,
  isAbsolutePathText,
};
