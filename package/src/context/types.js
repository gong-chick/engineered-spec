const CONTEXT_SCHEMA_VERSION = '1.0.0';

const CONTEXT_STAGES = [
  'planning',
  'implementation',
  'verification',
  'review',
  'diagnosing',
  'recovering',
];

const DEFAULT_TOKEN_BUDGET = {
  maxInputTokens: 80000,
  warningThreshold: 60000,
};

const DEFAULT_STAGE_LOAD_RULES = [
  {
    stage: 'planning',
    loadKinds: ['role', 'flow'],
    maxAssets: 5,
  },
  {
    stage: 'implementation',
    loadKinds: ['rule', 'skill', 'agent-profile'],
    maxAssets: 8,
  },
  {
    stage: 'verification',
    loadKinds: ['rule', 'flow'],
    maxAssets: 6,
  },
  {
    stage: 'review',
    loadKinds: ['rule'],
    maxAssets: 6,
  },
  {
    stage: 'diagnosing',
    loadKinds: ['rule', 'skill', 'agent-profile'],
    requiredAgents: ['diagnostic-agent'],
    maxAssets: 6,
  },
  {
    stage: 'recovering',
    loadKinds: ['rule', 'skill', 'agent-profile'],
    maxAssets: 6,
  },
];

const CONTEXT_PRIVACY_FLAGS = {
  sourceCodeIncluded: false,
  rawPromptIncluded: false,
  rawResponseIncluded: false,
  absolutePathIncluded: false,
};

function normalizeTokenBudget(tokenBudget = {}) {
  return {
    maxInputTokens: Number.isFinite(tokenBudget.maxInputTokens)
      ? tokenBudget.maxInputTokens
      : DEFAULT_TOKEN_BUDGET.maxInputTokens,
    warningThreshold: Number.isFinite(tokenBudget.warningThreshold)
      ? tokenBudget.warningThreshold
      : DEFAULT_TOKEN_BUDGET.warningThreshold,
  };
}

function normalizeContextOptions(options = {}) {
  return {
    explain: Boolean(options.explain),
    allowMissingOptionalAssets: options.allowMissingOptionalAssets !== false,
  };
}

function assertValidStage(stage) {
  if (!CONTEXT_STAGES.includes(stage)) {
    throw new Error(`非法 Context stage：${stage || '未提供'}，允许值：${CONTEXT_STAGES.join(', ')}`);
  }
}

function createIssue(level, code, message, suggestion) {
  return { level, code, message, suggestion };
}

module.exports = {
  CONTEXT_PRIVACY_FLAGS,
  CONTEXT_SCHEMA_VERSION,
  CONTEXT_STAGES,
  DEFAULT_STAGE_LOAD_RULES,
  DEFAULT_TOKEN_BUDGET,
  assertValidStage,
  createIssue,
  normalizeContextOptions,
  normalizeTokenBudget,
};
