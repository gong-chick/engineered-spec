const fs = require('fs');
const path = require('path');

const DEFAULT_TIMEOUT_MS = 15000;

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function normalizeOrigin(origin) {
  return String(origin || process.env.AI_SPEC_HUB_ORIGIN || 'http://localhost:3000').replace(/\/+$/, '');
}

async function requestJson(url, options = {}) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), options.timeoutMs || DEFAULT_TIMEOUT_MS);
  const token = options.token || process.env.AI_SPEC_HUB_TOKEN || readHubToken()?.token;
  try {
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers: {
        'Content-Type': 'application/json',
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(options.headers || {}),
      },
      body: options.body === undefined ? undefined : JSON.stringify(options.body),
      signal: controller.signal,
    });
    const text = await response.text();
    let json = null;
    try {
      json = text ? JSON.parse(text) : null;
    } catch (error) {
      throw new Error(`Hub 返回的 JSON 无法解析：${url}`);
    }
    if (!response.ok || json?.success === false) {
      throw new Error(json?.message || `Hub 请求失败：${response.status} ${response.statusText}`);
    }
    return json?.data ?? json;
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Hub 请求超时：${url}`);
    }
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchManifestExport({ origin, manifestId, version }) {
  if (isHttpUrl(manifestId)) {
    return requestJson(manifestId);
  }
  const qs = version ? `?version=${encodeURIComponent(version)}` : '';
  return requestJson(`${normalizeOrigin(origin)}/api/hub/manifests/${encodeURIComponent(manifestId)}/export${qs}`);
}

async function postInstallReport({ origin, report }) {
  return requestJson(`${normalizeOrigin(origin)}/api/hub/install/report`, {
    method: 'POST',
    body: report,
  });
}

async function postRuntimeReport({ origin, report }) {
  return requestJson(`${normalizeOrigin(origin)}/api/hub/runtime/report`, {
    method: 'POST',
    body: report,
  });
}

function readHubToken(homeDir = require('os').homedir()) {
  const filePath = path.join(homeDir, '.ai-spec-auto', 'hub-token.json');
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (_error) {
    return null;
  }
}

function writeHubToken(token, homeDir = require('os').homedir()) {
  const filePath = path.join(homeDir, '.ai-spec-auto', 'hub-token.json');
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify({ token, savedAt: new Date().toISOString() }, null, 2)}\n`, 'utf8');
  return filePath;
}

module.exports = {
  fetchManifestExport,
  isHttpUrl,
  normalizeOrigin,
  postInstallReport,
  postRuntimeReport,
  readHubToken,
  requestJson,
  writeHubToken,
};
