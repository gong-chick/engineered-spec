const { readProjectState } = require('../project/project-files');

function normalizeHubUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\/+$/, '');
}

function resolveHubConfig(rootDir, options = {}) {
  const state = rootDir ? readProjectState(rootDir) : {};
  const policyHub = state.policy?.hub || {};
  const source = options.hubUrl ? 'cli' : policyHub.url ? 'policy' : process.env.AI_SPEC_HUB_URL ? 'env' : 'empty';
  const hubUrl = normalizeHubUrl(
    options.hubUrl ||
      policyHub.url ||
      process.env.AI_SPEC_HUB_URL ||
      '',
  );
  const enabled = options.hubEnabled !== undefined
    ? Boolean(options.hubEnabled)
    : source === 'cli' || source === 'env'
      ? Boolean(hubUrl)
      : source === 'policy'
        ? policyHub.enabled !== false
        : false;
  return {
    enabled,
    url: hubUrl,
    fallbackToLocal: options.fallbackToLocal !== undefined
      ? Boolean(options.fallbackToLocal)
      : policyHub.fallbackToLocal !== false,
    source,
  };
}

module.exports = {
  normalizeHubUrl,
  resolveHubConfig,
};
