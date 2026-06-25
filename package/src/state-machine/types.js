const RUN_STATES = [
  'initialized',
  'planning',
  'branch_preparing',
  'context_building',
  'executing',
  'verifying',
  'diagnosing',
  'recovering',
  'human_review',
  'suspended',
  'completed',
  'archived',
  'failed',
  'cancelled',
];

const DEFAULT_CIRCUIT_BREAKER_POLICY = {
  maxTotalTokens: 80000,
  maxSameFileModificationCount: 3,
  maxStageFailureCount: 2,
  maxExecutorTimeoutCount: 1,
  maxAutoFixAttempts: 2,
};

class StateMachineError extends Error {
  constructor(code, message) {
    super(message);
    this.code = code;
  }
}

module.exports = {
  DEFAULT_CIRCUIT_BREAKER_POLICY,
  RUN_STATES,
  StateMachineError,
};
