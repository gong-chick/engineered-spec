'use strict';

const path = require('path');
const { collectCommon } = require('./collect');
const { getConfig, markNoticeShown } = require('./config');
const { resolveInstallationId } = require('./identity');
const { fireAndForget } = require('./reporter');
const { debugLog, safeCall, safeRequire } = require('./safe');

const healthcheck = safeRequire('./healthcheck');

const PKG_ROOT = path.join(__dirname, '..', '..');

function maybePrintFirstNotice(config) {
  if (!config.enabled) return;
  safeCall(function () {
    if (markNoticeShown()) {
      process.stderr.write(
        '[ai-spec-auto] 已开启匿名使用统计（可通过 AI_SPEC_TELEMETRY_DISABLED=1 关闭）\n',
      );
    }
  });
}

function buildPayload(command, status, extra) {
  const base = collectCommon({ cwd: process.cwd(), pkgRoot: PKG_ROOT });
  const payload = {
    installationId: resolveInstallationId(),
    command: String(command || 'unknown').slice(0, 64),
    status: String(status).slice(0, 32),
    hostname: base.hostname,
    username: base.username,
    platform: base.platform,
    arch: base.arch,
    osRelease: base.osRelease,
    nodeVersion: base.nodeVersion,
    cliVersion: base.cliVersion,
    profile: base.profile,
    ides: base.ides,
    level: base.level,
    projectHash: base.projectHash,
    projectName: base.projectName,
    occurredAt: new Date().toISOString(),
  };
  if (extra && typeof extra === 'object') {
    if (typeof extra.durationMs === 'number') payload.durationMs = extra.durationMs;
    if (typeof extra.errorMessage === 'string') {
      payload.errorMessage = extra.errorMessage.slice(0, 2000);
    }
  }
  return payload;
}

function wrap(command, fn) {
  if (typeof fn !== 'function') {
    throw new TypeError('telemetry.wrap: fn must be a function');
  }
  const config = getConfig();
  if (!config.enabled) {
    debugLog('wrap: telemetry disabled, pass-through');
    return fn();
  }

  safeCall(function () {
    maybePrintFirstNotice(config);
  });

  // 预热健康探测（不 await，结果会被 reporter 里的 ensureReachable 复用）。
  // 这样 reporter 发 POST 前的健康查询要么已完成、要么已在进行中。
  safeCall(function () {
    if (healthcheck && typeof healthcheck.ensureReachable === 'function') {
      const p = healthcheck.ensureReachable(config.visualUrl);
      if (p && typeof p.catch === 'function') p.catch(function () {});
    }
  });

  const pending = [];
  function track(p) {
    if (p && typeof p.then === 'function') pending.push(p);
  }
  function flushPending() {
    if (pending.length === 0) return Promise.resolve();
    const all = Promise.allSettled(pending.splice(0, pending.length));
    // 上限 1500ms：覆盖 HEAD 健康探测（最多 500ms）+ POST 落地（一般 <500ms）
    // 的组合路径，同时保证即使网络故障也不会明显拖慢 CLI 退出。
    const env = process.env || {};
    const raw = env.AI_SPEC_TELEMETRY_FLUSH_MS;
    const parsed = raw ? parseInt(raw, 10) : NaN;
    const cap = Number.isFinite(parsed) && parsed >= 100 && parsed <= 5000 ? parsed : 1500;
    return Promise.race([
      all,
      new Promise(function (resolve) {
        const t = setTimeout(resolve, cap);
        if (typeof t.unref === 'function') t.unref();
      }),
    ]);
  }

  safeCall(function () {
    track(fireAndForget(buildPayload(command, 'started')));
  });

  const startedAt = Date.now();
  let result;
  try {
    result = fn();
  } catch (error) {
    safeCall(function () {
      track(fireAndForget(
        buildPayload(command, 'failed', {
          durationMs: Date.now() - startedAt,
          errorMessage: error && error.message ? String(error.message) : String(error),
        }),
      ));
    });
    return flushPending().then(function () { throw error; });
  }

  if (result && typeof result.then === 'function') {
    return result.then(
      function (value) {
        safeCall(function () {
          track(fireAndForget(
            buildPayload(command, 'success', {
              durationMs: Date.now() - startedAt,
            }),
          ));
        });
        return flushPending().then(function () { return value; });
      },
      function (error) {
        safeCall(function () {
          track(fireAndForget(
            buildPayload(command, 'failed', {
              durationMs: Date.now() - startedAt,
              errorMessage: error && error.message ? String(error.message) : String(error),
            }),
          ));
        });
        return flushPending().then(function () { throw error; });
      },
    );
  }

  safeCall(function () {
    track(fireAndForget(
      buildPayload(command, 'success', { durationMs: Date.now() - startedAt }),
    ));
  });
  return flushPending().then(function () { return result; });
}

module.exports = { wrap };
