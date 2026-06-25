const os = require('os');
const path = require('path');
const { DEFAULT_CONFIG } = require('./defaults');
const {
  mergeConfigs,
  loadEnterpriseConfig,
  loadTeamConfig,
  readJsonIfExists,
} = require('./config-layer');

function normalizeCliOptions(cliOptions = {}) {
  const normalized = { ...cliOptions };
  if (cliOptions.executor && !normalized.execution) {
    normalized.execution = { executor: cliOptions.executor };
    delete normalized.executor;
  }
  if (cliOptions.mode && !normalized.execution?.mode) {
    normalized.execution = { ...(normalized.execution || {}), mode: cliOptions.mode };
    delete normalized.mode;
  }
  return normalized;
}

class ConfigLoader {
  async load(input = {}) {
    const rootDir = path.resolve(input.rootDir || process.cwd());
    const globalConfigPath =
      input.globalConfigPath || path.join(os.homedir(), '.ai-spec-auto', 'config.json');

    const enterpriseConfig = loadEnterpriseConfig(rootDir);
    const globalConfig = readJsonIfExists(globalConfigPath);
    const workspaceConfig = readJsonIfExists(path.join(rootDir, '.ai-spec', 'workspace.json'));
    const projectConfig = readJsonIfExists(path.join(rootDir, '.ai-spec', 'project.json'));
    const teamConfig = loadTeamConfig(rootDir);
    const policyConfig = readJsonIfExists(path.join(rootDir, '.ai-spec', 'policy.json'));
    const cliOptions = normalizeCliOptions(input.cliOptions || {});

    const result = mergeConfigs({
      default: DEFAULT_CONFIG,
      enterprise: enterpriseConfig,
      global: globalConfig,
      manifest: input.manifestConfig,
      agentProfile: input.agentProfile,
      workspace: workspaceConfig,
      project: projectConfig,
      team: teamConfig,
      policy: policyConfig,
      run: input.runConfig,
      cli: cliOptions,
    });

    return result.config;
  }
}

module.exports = {
  ConfigLoader,
  deepMerge: require('./config-layer').deepMerge,
  readJsonIfExists,
};
