'use strict';

// Visual 健康探测兜底。
// 目的：当目标不可达/配置错误/服务未部署时，避免每条事件都去等 2 秒超时，
//      也避免在 Visual 日志里刷一堆无意义的失败上报。
//
// 设计约束：
//   - 进程内单例（同一次 CLI 调用只探一次），不要多次网络往返
//   - 先发 HEAD（默认 1500ms 超时）；若超时/网络错/405/5xx，再用 GET 重试一次
//     （超时翻倍，最长到 DEFAULT_TIMEOUT_MS * 2）。原因：
//       * Next.js dev 模式对 /api/health 首次访问会触发冷编译，500ms 远远不够；
//       * 部分反向代理（nginx 无 `proxy_method HEAD` 等配置）不支持 HEAD。
//   - 任何异常都必须被吞掉；探测模块本身绝不能让主流程挂掉
//   - 本地缓存（~/.ai-spec-auto/telemetry.json）里记录"最近一次失败时间"，
//     下次 CLI 启动时若距失败不足 N 秒则直接跳过探测，进一步降低噪声

const { debugLog } = require('./safe');
const { readCache, writeCache } = require('./config');

// 同一进程内的探测结果缓存（null=未探过，true/false=已探过的可用性）
let probed = null;
let probing = null; // 并发保护：多条事件同时 wrap 时，共享同一个探测 Promise

// 跨进程短时间冷却：避免 CI 里连续多次 CLI 调用都去探已知宕机的服务
const COOLDOWN_MS = 60 * 1000; // 失败后 60 秒内不再探测

function buildHealthUrl(base) {
  const trimmed = String(base || '').replace(/\/+$/, '');
  return trimmed + '/api/health';
}

function shouldSkipByCooldown() {
  try {
    const cache = readCache();
    if (!cache || !cache.lastHealthFailAt) return false;
    const last = Date.parse(cache.lastHealthFailAt);
    if (!Number.isFinite(last)) return false;
    const elapsed = Date.now() - last;
    return elapsed >= 0 && elapsed < COOLDOWN_MS;
  } catch (_error) {
    return false;
  }
}

function recordFailure() {
  try {
    const cache = readCache() || {};
    cache.lastHealthFailAt = new Date().toISOString();
    writeCache(cache);
  } catch (_error) {
    /* ignore */
  }
}

function recordSuccess() {
  try {
    const cache = readCache() || {};
    if (cache.lastHealthFailAt) {
      delete cache.lastHealthFailAt;
      writeCache(cache);
    }
  } catch (_error) {
    /* ignore */
  }
}

// 默认 1500ms，单位毫秒。选这个值的原因：
//   - 生产/容器内实际健康探测通常 <100ms，留一个 15 倍冗余仍很保守
//   - Next.js dev 冷编译 /api/health 普遍 800~1200ms，500ms 会在 dev 场景
//     命中率接近 0，1500ms 能覆盖 95% 以上首次冷启动
//   - 上限仍由 AI_SPEC_TELEMETRY_HEALTH_TIMEOUT_MS 控制（最大 10s），
//     CI / 远程部署可按需调大
const DEFAULT_TIMEOUT_MS = 1500;
const MIN_TIMEOUT_MS = 100;
const MAX_TIMEOUT_MS = 10000;

function getProbeTimeoutMs() {
  const env = process.env || {};
  const raw = env.AI_SPEC_TELEMETRY_HEALTH_TIMEOUT_MS;
  const parsed = raw ? parseInt(raw, 10) : NaN;
  if (Number.isFinite(parsed) && parsed >= MIN_TIMEOUT_MS && parsed <= MAX_TIMEOUT_MS) {
    return parsed;
  }
  return DEFAULT_TIMEOUT_MS;
}

// 判定 HEAD 的结果是否"足以说明服务可达"。405 / 501 / 超时 / 网络错等都不算，
// 需要继续用 GET 兜底再试一次。
function isHeadConclusive(response) {
  if (!response) return false;
  // 2xx/3xx 及大多数 4xx 足以证明服务在线、有业务处理能力；
  // 405/501 是"方法不被支持"，需要换方法再试一次。
  if (response.status === 405 || response.status === 501) return false;
  return response.status >= 200 && response.status < 500;
}

async function sendProbe(url, method, timeoutMs) {
  const controller = typeof AbortController === 'function' ? new AbortController() : null;
  const timer = controller
    ? setTimeout(function () {
        controller.abort();
      }, timeoutMs)
    : null;
  if (timer && typeof timer.unref === 'function') timer.unref();

  try {
    debugLog('healthcheck:', method, url, 'timeoutMs=', timeoutMs);
    const response = await fetch(url, {
      method: method,
      signal: controller ? controller.signal : undefined,
    });
    debugLog('healthcheck:', method, 'status=', response.status);
    return { response: response, error: null };
  } catch (error) {
    debugLog(
      'healthcheck:',
      method,
      'failed',
      error && error.message ? error.message : error,
    );
    return { response: null, error: error };
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function doProbe(baseUrl) {
  if (typeof fetch !== 'function') {
    debugLog('healthcheck: global fetch unavailable, assume reachable');
    return true; // 旧 Node 没 fetch 时不阻拦，让 reporter 自己去超时
  }

  const url = buildHealthUrl(baseUrl);
  const firstTimeoutMs = getProbeTimeoutMs();

  // Round 1: HEAD —— 轻量、快，生产路径 >99% 会在这里返回
  const head = await sendProbe(url, 'HEAD', firstTimeoutMs);
  if (isHeadConclusive(head.response)) {
    recordSuccess();
    return true;
  }

  // Round 2: GET 兜底 —— 针对 Next.js dev 冷编译、不接受 HEAD 的反代等情况，
  // 允许一次"更长超时 + 真实 GET"的重试。超时 ×2，封顶 MAX_TIMEOUT_MS。
  const secondTimeoutMs = Math.min(firstTimeoutMs * 2, MAX_TIMEOUT_MS);
  debugLog('healthcheck: HEAD inconclusive, retry with GET');
  const get = await sendProbe(url, 'GET', secondTimeoutMs);
  if (get.response && get.response.status >= 200 && get.response.status < 500) {
    recordSuccess();
    return true;
  }

  recordFailure();
  return false;
}

// 主入口：返回 Promise<boolean>。true=可上报；false=本次会话禁用上报。
function ensureReachable(baseUrl) {
  if (probed !== null) return Promise.resolve(probed);
  if (probing) return probing;

  if (!baseUrl) {
    probed = false;
    return Promise.resolve(false);
  }

  if (shouldSkipByCooldown()) {
    debugLog('healthcheck: in cooldown window, skip reporting this session');
    probed = false;
    return Promise.resolve(false);
  }

  probing = doProbe(baseUrl)
    .then(function (ok) {
      probed = ok;
      return ok;
    })
    .catch(function () {
      probed = false;
      return false;
    })
    .finally(function () {
      probing = null;
    });

  return probing;
}

// 供测试复位
function __resetForTests() {
  probed = null;
  probing = null;
}

module.exports = { ensureReachable, __resetForTests };
