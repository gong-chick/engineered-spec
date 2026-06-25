'use strict';

const { getConfig } = require('./config');
const { debugLog, safeCallAsync, safeRequire } = require('./safe');

// health check 是兜底能力，加载失败时走"直接上报"的旧行为，不影响主流程
const healthcheck = safeRequire('./healthcheck');

function buildUrl(base) {
  const trimmed = base.replace(/\/+$/, '');
  return trimmed + '/api/public/installations/report';
}

async function sendReport(payload) {
  const config = getConfig();
  if (!config.enabled) {
    debugLog('telemetry disabled or AI_SPEC_VISUAL_URL not set');
    return { ok: false, reason: 'disabled' };
  }

  if (typeof fetch !== 'function') {
    debugLog('global fetch unavailable; skipping');
    return { ok: false, reason: 'no-fetch' };
  }

  // 兜底：读取已完成的健康探测结果（aspect 入口已预热，这里只是快速复用）。
  // 注意：ensureReachable 内部是进程内缓存的，若 aspect 未预热则会现场发起一次 HEAD。
  if (healthcheck && typeof healthcheck.ensureReachable === 'function') {
    try {
      const reachable = await healthcheck.ensureReachable(config.visualUrl);
      if (!reachable) {
        debugLog('visual unreachable, skip report');
        return { ok: false, reason: 'unreachable' };
      }
    } catch (_error) {
      // 探测本身不应该抛，这里只是防御：抛了就按"可达"处理，让下面的 fetch 自己决定
    }
  }

  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timeoutMs = 2000;
  const timer = controller
    ? setTimeout(function () {
        controller.abort();
      }, timeoutMs)
    : null;
  if (timer && typeof timer.unref === 'function') timer.unref();

  const headers = { 'content-type': 'application/json' };
  if (config.secret) headers['x-telemetry-secret'] = config.secret;

  const result = await safeCallAsync(async function () {
    const response = await fetch(buildUrl(config.visualUrl), {
      method: 'POST',
      headers: headers,
      body: JSON.stringify(payload),
      signal: controller ? controller.signal : undefined,
    });
    debugLog('telemetry http status', response.status);
    return { ok: response.ok, status: response.status };
  }, { ok: false, reason: 'error' });

  if (timer) clearTimeout(timer);
  return result;
}

function fireAndForget(payload) {
  try {
    // 立即发起请求（不 await），这样即使紧接着 process.exit()，
    // 底层 socket 已把字节写入内核发送缓冲区。异常始终吞掉。
    const promise = sendReport(payload);
    if (promise && typeof promise.catch === 'function') {
      promise.catch(function () {
        /* swallow */
      });
    }
    return promise;
  } catch (_error) {
    return null;
  }
}

module.exports = { sendReport, fireAndForget };
