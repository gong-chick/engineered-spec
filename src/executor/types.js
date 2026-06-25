const ExecutorType = {
  CODEX: 'codex',
  CURSOR: 'cursor',
  CLAUDE_CODE: 'claude-code',
  CUSTOM: 'custom',
};

const ExecutorCapability = {
  READ: 'read',
  WRITE: 'write',
  SHELL: 'shell',
  TEST: 'test',
  INTERACTIVE: 'interactive',
  HEADLESS: 'headless',
  LONG_RUNNING: 'long-running',
  STRUCTURED_OUTPUT: 'structured-output',
};

const ExecutorStatus = {
  SUCCEEDED: 'succeeded',
  FAILED: 'failed',
  TIMEOUT: 'timeout',
  SKIPPED: 'skipped',
  HUMAN_REVIEW_REQUIRED: 'human_review_required',
};

const DEFAULT_EXECUTOR_TIMEOUT_MS = 10 * 60 * 1000;

class ExecutorError extends Error {
  constructor(code, message, suggestion) {
    super(message);
    this.name = 'ExecutorError';
    this.code = code;
    this.suggestion = suggestion || '';
  }
}

class IExecutorProvider {
  get name() {
    throw new ExecutorError('EXECUTOR_PROVIDER_NOT_IMPLEMENTED', '执行器 Provider 未实现 name。');
  }

  get displayName() {
    throw new ExecutorError('EXECUTOR_PROVIDER_NOT_IMPLEMENTED', '执行器 Provider 未实现 displayName。');
  }

  get capabilities() {
    throw new ExecutorError('EXECUTOR_PROVIDER_NOT_IMPLEMENTED', '执行器 Provider 未实现 capabilities。');
  }

  async checkAvailability() {
    throw new ExecutorError('EXECUTOR_PROVIDER_NOT_IMPLEMENTED', '执行器 Provider 未实现 checkAvailability。');
  }

  async prepare() {
    throw new ExecutorError('EXECUTOR_PROVIDER_NOT_IMPLEMENTED', '执行器 Provider 未实现 prepare。');
  }

  async execute() {
    throw new ExecutorError('EXECUTOR_PROVIDER_NOT_IMPLEMENTED', '执行器 Provider 未实现 execute。');
  }

  async verify() {
    throw new ExecutorError('EXECUTOR_PROVIDER_NOT_IMPLEMENTED', '执行器 Provider 未实现 verify。');
  }

  async cleanup() {
    throw new ExecutorError('EXECUTOR_PROVIDER_NOT_IMPLEMENTED', '执行器 Provider 未实现 cleanup。');
  }
}

function createEmptyVerification() {
  return {
    executed: false,
    passed: null,
    command: null,
    summary: null,
  };
}

function createEmptyTokenUsage() {
  return {
    inputTokens: 0,
    outputTokens: 0,
    totalTokens: 0,
  };
}

function createExecutionResult(overrides = {}) {
  return {
    success: false,
    status: ExecutorStatus.FAILED,
    summary: '',
    changedFiles: [],
    verification: createEmptyVerification(),
    tokenUsage: createEmptyTokenUsage(),
    riskList: [],
    error: null,
    ...overrides,
    verification: {
      ...createEmptyVerification(),
      ...(overrides.verification || {}),
    },
    tokenUsage: {
      ...createEmptyTokenUsage(),
      ...(overrides.tokenUsage || {}),
    },
    changedFiles: Array.isArray(overrides.changedFiles) ? overrides.changedFiles : [],
    riskList: Array.isArray(overrides.riskList) ? overrides.riskList : [],
  };
}

function createExecutorErrorResult(code, message, suggestion, status = ExecutorStatus.FAILED) {
  return createExecutionResult({
    success: false,
    status,
    summary: message,
    error: {
      code,
      message,
      suggestion: suggestion || '',
    },
  });
}

module.exports = {
  DEFAULT_EXECUTOR_TIMEOUT_MS,
  ExecutorCapability,
  ExecutorError,
  ExecutorStatus,
  ExecutorType,
  IExecutorProvider,
  createEmptyTokenUsage,
  createEmptyVerification,
  createExecutionResult,
  createExecutorErrorResult,
};
