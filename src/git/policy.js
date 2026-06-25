const path = require('path');
const { readJsonFile } = require('../project/project-files');
const { DEFAULT_BRANCH_POLICY, normalizeDirtyStrategy } = require('./types');

function readBranchPolicy(rootDir) {
  const policyPath = path.join(rootDir, '.ai-spec/policy.json');
  const policy = readJsonFile(policyPath) || {};
  const branchPolicy = policy.branchPolicy || {};
  const merged = {
    ...DEFAULT_BRANCH_POLICY,
    ...branchPolicy,
  };
  merged.dirtyStrategy = normalizeDirtyStrategy(merged.dirtyStrategy);
  return merged;
}

module.exports = {
  readBranchPolicy,
};
