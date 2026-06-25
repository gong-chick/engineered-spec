'use strict';

function safeCall(fn, fallback) {
  try {
    return fn();
  } catch (_error) {
    return fallback;
  }
}

async function safeCallAsync(fn, fallback) {
  try {
    return await fn();
  } catch (_error) {
    return fallback;
  }
}

function safeRequire(name) {
  try {
    // eslint-disable-next-line global-require
    return require(name);
  } catch (_error) {
    return null;
  }
}

function debugLog() {
  if (process.env.AI_SPEC_TELEMETRY_DEBUG === '1') {
    try {
      // eslint-disable-next-line no-console
      console.debug.apply(console, ['[ai-spec-telemetry]'].concat(Array.from(arguments)));
    } catch (_error) {
      /* ignore */
    }
  }
}

module.exports = { safeCall, safeCallAsync, safeRequire, debugLog };
