const { readProjectState } = require('../project/project-files');

function normalizeVisualUrl(value) {
  const text = String(value || '').trim();
  if (!text) return '';
  return text.replace(/\/+$/, '');
}

function resolveVisualConfig(rootDir, options = {}) {
  const state = rootDir ? readProjectState(rootDir) : {};
  const policyVisual = state.policy?.visual || {};
  const source = options.visualUrl ? 'cli' : policyVisual.url ? 'policy' : process.env.AI_SPEC_VISUAL_URL ? 'env' : 'empty';
  const visualUrl = normalizeVisualUrl(
    options.visualUrl ||
      policyVisual.url ||
      process.env.AI_SPEC_VISUAL_URL ||
      '',
  );
  const enabled = options.visualEnabled !== undefined
    ? Boolean(options.visualEnabled)
    : source === 'cli' || source === 'env'
      ? Boolean(visualUrl)
      : source === 'policy'
        ? policyVisual.enabled !== false
        : false;

  return {
    enabled,
    url: visualUrl,
    nonBlocking: options.nonBlocking !== undefined
      ? Boolean(options.nonBlocking)
      : policyVisual.nonBlocking !== false,
    source,
  };
}

module.exports = {
  normalizeVisualUrl,
  resolveVisualConfig,
};
