const DEFAULT_CONFIG = Object.freeze({
  execution: {
    mode: 'local-assisted',
    executor: 'codex',
    fallbackExecutors: ['cursor', 'claude-code'],
  },
  branchPolicy: {
    autoCreateBranch: false,
    autoCreateWorktree: false,
    branchPrefix: 'ai/',
    worktreeRoot: '.ai-spec/worktrees',
    dirtyStrategy: 'block',
  },
  approvalPolicy: {
    beforeCodeChange: false,
    beforeTestRun: false,
    beforeCommit: true,
    beforePush: true,
    beforeMerge: true,
    highRiskAlwaysManual: true,
  },
  privacyPolicy: {
    uploadSourceCode: false,
    uploadAbsolutePath: false,
    uploadUserName: false,
    uploadRawPrompt: false,
    uploadRawResponse: false,
    uploadFileContent: false,
    allowRelativePath: true,
    allowFailureSummary: true,
    allowTestSummary: true,
  },
  tokenBudget: {
    enabled: true,
    maxInputTokens: 120000,
    maxOutputTokens: 16000,
    maxTotalTokens: 150000,
    warningThreshold: 0.8,
  },
  scanPolicy: {
    maxDepth: 5,
    includeLockfileFacts: false,
    explain: false,
  },
});

module.exports = {
  DEFAULT_CONFIG,
};
