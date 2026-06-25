const path = require('path');
const { mergeMissing, readJsonIfExists, writeJson } = require('./json-utils');

const FORCED_PRIVACY_FALSE_FIELDS = [
  'uploadSourceCode',
  'uploadAbsolutePath',
  'uploadUserName',
  'uploadRawPrompt',
  'uploadRawResponse',
  'uploadFileContent',
];

function createDefaultPolicy() {
  return {
    schemaVersion: '1.0.0',
    execution: {
      mode: 'local-assisted',
      defaultExecutor: 'cursor',
      fallbackExecutors: ['claude-code', 'codex'],
      executorSelectionStrategy: 'policy-first',
    },
    branchPolicy: {
      autoCreateBranch: true,
      autoCreateWorktree: true,
      baseBranch: 'develop',
      branchPrefix: 'ai',
      worktreeRoot: '../.ai-worktrees',
      dirtyStrategy: 'block',
      cleanupAfterMerge: false,
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
    scanPolicy: {
      readonly: true,
      maxDepth: 5,
      useCache: true,
      confidenceAutoSelectThreshold: 80,
      confidenceRequireConfirmThreshold: 60,
    },
    hub: {
      url: '',
      enabled: false,
      fallbackToLocal: true,
    },
    visual: {
      url: '',
      enabled: false,
      nonBlocking: true,
    },
  };
}

class PolicyConfigWriter {
  write(rootDir, _plan, options = {}) {
    const filePath = path.join(rootDir, '.ai-spec/policy.json');
    const existing = readJsonIfExists(filePath);
    const nextDoc = mergeMissing(createDefaultPolicy(), existing || {});
    nextDoc.schemaVersion = nextDoc.schemaVersion || '1.0.0';
    nextDoc.privacyPolicy = nextDoc.privacyPolicy || {};
    for (const field of FORCED_PRIVACY_FALSE_FIELDS) {
      nextDoc.privacyPolicy[field] = false;
    }
    if (options.visualUrl) {
      nextDoc.visual = nextDoc.visual || {};
      nextDoc.visual.url = options.visualUrl;
      nextDoc.visual.enabled = true;
    }
    writeJson(filePath, nextDoc);
    return {
      path: '.ai-spec/policy.json',
      fullPath: filePath,
      action: existing ? 'update' : 'create',
      data: nextDoc,
    };
  }
}

module.exports = {
  FORCED_PRIVACY_FALSE_FIELDS,
  PolicyConfigWriter,
  createDefaultPolicy,
};
