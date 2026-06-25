const fs = require('fs');
const path = require('path');

function shouldDisableRuntimeRefresh(env = process.env) {
  return env.AI_SPEC_DISABLE_RUNTIME_REFRESH === '1';
}

function normalizeRuntimeState(state) {
  const base = state && typeof state === 'object' ? state : {};
  return {
    schema_version: 1,
    active_release: typeof base.active_release === 'string' ? base.active_release : '',
    last_known_good_release: typeof base.last_known_good_release === 'string' ? base.last_known_good_release : '',
    last_checked_at: typeof base.last_checked_at === 'string' ? base.last_checked_at : '',
    last_successful_refresh_at: typeof base.last_successful_refresh_at === 'string' ? base.last_successful_refresh_at : '',
    last_error: typeof base.last_error === 'string' ? base.last_error : '',
  };
}

function resolveReleaseEntry({
  env = process.env,
  state,
  getRuntimePaths,
  getBinName,
}) {
  const normalized = normalizeRuntimeState(state);
  const runtimePaths = getRuntimePaths(env);
  const binName = getBinName();
  const candidates = [
    { releaseId: normalized.active_release, source: 'active-release' },
    { releaseId: normalized.last_known_good_release, source: 'last-known-good' },
  ].filter((item, index, array) => item.releaseId && array.findIndex((entry) => entry.releaseId === item.releaseId) === index);

  for (const item of candidates) {
    const entryPath = path.join(runtimePaths.releasesDir, item.releaseId, 'node_modules', '.bin', binName);
    if (fs.existsSync(entryPath)) {
      return {
        entryPath,
        releaseId: item.releaseId,
        source: item.source,
      };
    }
  }

  return null;
}

function resolveFallbackEntry({
  env = process.env,
  state,
  getRuntimePaths,
  getBinName,
  resolveEmbeddedEntry,
}) {
  const releaseEntry = resolveReleaseEntry({
    env,
    state,
    getRuntimePaths,
    getBinName,
  });
  if (releaseEntry) {
    return releaseEntry;
  }

  const embeddedEntry = resolveEmbeddedEntry(env);
  if (embeddedEntry) {
    return {
      entryPath: embeddedEntry,
      releaseId: 'embedded',
      source: 'embedded-runtime',
    };
  }

  return null;
}

function buildSuccessfulRefreshState(state, releaseId, now) {
  const normalized = normalizeRuntimeState(state);
  const timestamp = new Date(now).toISOString();
  return {
    ...normalized,
    active_release: releaseId,
    last_known_good_release: releaseId,
    last_checked_at: timestamp,
    last_successful_refresh_at: timestamp,
    last_error: '',
  };
}

function buildFailedRefreshState(state, errorMessage, now) {
  const normalized = normalizeRuntimeState(state);
  return {
    ...normalized,
    last_checked_at: new Date(now).toISOString(),
    last_error: errorMessage || '',
  };
}

module.exports = {
  shouldDisableRuntimeRefresh,
  normalizeRuntimeState,
  resolveReleaseEntry,
  resolveFallbackEntry,
  buildSuccessfulRefreshState,
  buildFailedRefreshState,
};
