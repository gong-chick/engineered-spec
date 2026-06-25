const fs = require('fs');
const path = require('path');
const { URL } = require('url');

function readFileUrl(contentUrl) {
  const url = new URL(contentUrl);
  return fs.readFileSync(url, 'utf8');
}

function joinHubUrl(hubUrl, endpoint) {
  if (!hubUrl) return endpoint;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${String(hubUrl).replace(/\/+$/, '')}/${String(endpoint).replace(/^\/+/, '')}`;
}

class HubClientError extends Error {
  constructor(code, message, suggestion, details = {}) {
    super(message);
    this.name = 'HubClientError';
    this.code = code;
    this.suggestion = suggestion || '';
    this.details = details;
  }
}

function assertNoAbsolutePath(value, fieldPath = '') {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoAbsolutePath(item, `${fieldPath}[${index}]`));
    return;
  }
  if (!value || typeof value !== 'object') {
    if (typeof value === 'string' && (path.isAbsolute(value) || /^[A-Za-z]:[\\/]/.test(value))) {
      throw new HubClientError('PRIVACY_VIOLATION', `Hub payload 不允许包含绝对路径：${fieldPath}`, '请只上传相对路径或结构化摘要。');
    }
    return;
  }
  for (const [key, child] of Object.entries(value)) {
    if (['sourceCode', 'fileContent', 'rawPrompt', 'rawResponse'].includes(key)) {
      throw new HubClientError('PRIVACY_VIOLATION', `Hub payload 不允许包含 ${key}`, '请移除源码、文件正文、rawPrompt 或 rawResponse。');
    }
    assertNoAbsolutePath(child, fieldPath ? `${fieldPath}.${key}` : key);
  }
}

async function parseHubResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new HubClientError('HUB_RESPONSE_INVALID', 'Hub 返回不是合法 JSON', '请检查 Hub API 响应格式。', { error: error.message });
  }
  if (!response.ok) {
    const hubError = body?.error || {};
    throw new HubClientError(
      hubError.code || `HTTP_${response.status}`,
      hubError.message || `Hub 请求失败：HTTP ${response.status}`,
      hubError.suggestion || '请检查 Hub 服务状态。',
      { status: response.status },
    );
  }
  if (body && body.success === false) {
    const hubError = body.error || {};
    throw new HubClientError(
      hubError.code || 'HUB_ERROR',
      hubError.message || 'Hub API 返回失败',
      hubError.suggestion || '请检查 Hub 返回错误。',
    );
  }
  if (body && Object.prototype.hasOwnProperty.call(body, 'success')) {
    return body.data;
  }
  return body;
}

async function requestJson(url, options = {}) {
  try {
    const response = await fetch(url, {
      ...options,
      headers: {
        'content-type': 'application/json',
        ...(options.headers || {}),
      },
    });
    return await parseHubResponse(response);
  } catch (error) {
    if (error instanceof HubClientError) throw error;
    throw new HubClientError('HUB_NETWORK_ERROR', `Hub 网络请求失败：${error.message}`, '请检查 Hub URL、网络或服务是否启动。');
  }
}

class HubClient {
  constructor(options = {}) {
    this.hubUrl = options.hubUrl || '';
  }

  resolveHubUrl(inputHubUrl) {
    return String(inputHubUrl || this.hubUrl || '').replace(/\/+$/, '');
  }

  async recommendManifests(input = {}) {
    const hubUrl = this.resolveHubUrl(input.hubUrl);
    if (!hubUrl) {
      throw new HubClientError('HUB_URL_MISSING', '未配置 Hub URL，无法请求 Manifest 推荐', '请传入 --hub-url 或配置 AI_SPEC_HUB_URL。');
    }
    const payload = {
      workspace: input.workspace || {},
      projectFacts: Array.isArray(input.projectFacts) ? input.projectFacts : [],
    };
    assertNoAbsolutePath(payload);
    return requestJson(joinHubUrl(hubUrl, '/api/hub/manifests/recommend'), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async getManifestExport({ slug, version, hubUrl }) {
    if (hubUrl && hubUrl.startsWith('file://')) {
      return JSON.parse(readFileUrl(hubUrl));
    }
    const baseUrl = this.resolveHubUrl(hubUrl);
    if (!baseUrl) {
      throw new HubClientError('HUB_URL_MISSING', '未配置 Hub URL，无法获取 Manifest Export', '请传入 --hub-url 或配置 policy.hub.url。');
    }
    const query = version ? `?version=${encodeURIComponent(version)}` : '';
    return requestJson(joinHubUrl(baseUrl, `/api/hub/manifests/${encodeURIComponent(slug)}/export${query}`));
  }

  async getAssetContent({ slug, version, contentUrl, hubUrl }) {
    if (contentUrl && contentUrl.startsWith('file://')) {
      return readFileUrl(contentUrl);
    }
    const baseUrl = this.resolveHubUrl(hubUrl);
    if (!baseUrl) {
      throw new HubClientError('HUB_URL_MISSING', '未配置 Hub URL，无法获取资产内容', '请传入 --hub-url 或配置 policy.hub.url。');
    }
    const endpoint = contentUrl || `/api/hub/assets/${encodeURIComponent(slug)}/content?version=${encodeURIComponent(version || '1.0.0')}`;
    const data = await requestJson(joinHubUrl(baseUrl, endpoint));
    if (data && typeof data === 'object' && Object.prototype.hasOwnProperty.call(data, 'content')) {
      return data.content;
    }
    return data;
  }

  async getAgentProfileExport({ slug, version, contentUrl, hubUrl }) {
    if (contentUrl && contentUrl.startsWith('file://')) {
      return JSON.parse(readFileUrl(contentUrl));
    }
    const baseUrl = this.resolveHubUrl(hubUrl);
    if (!baseUrl) {
      throw new HubClientError('HUB_URL_MISSING', '未配置 Hub URL，无法获取 Agent Profile', '请传入 --hub-url 或配置 policy.hub.url。');
    }
    const endpoint = contentUrl || `/api/hub/agent-profiles/${encodeURIComponent(slug)}/export?version=${encodeURIComponent(version || '1.0.0')}`;
    return requestJson(joinHubUrl(baseUrl, endpoint));
  }

  async createInstallRecord(payload = {}, options = {}) {
    const hubUrl = this.resolveHubUrl(options.hubUrl || payload.hubUrl);
    if (!hubUrl) {
      throw new HubClientError('HUB_URL_MISSING', '未配置 Hub URL，无法上报安装记录', '请传入 --hub-url 或配置 policy.hub.url。');
    }
    assertNoAbsolutePath(payload);
    return requestJson(joinHubUrl(hubUrl, '/api/hub/install-records'), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }

  async sendRuntimeFeedback(payload = {}, options = {}) {
    const hubUrl = this.resolveHubUrl(options.hubUrl || payload.hubUrl);
    if (!hubUrl) {
      throw new HubClientError('HUB_URL_MISSING', '未配置 Hub URL，无法上报运行反馈', '请传入 --hub-url 或配置 policy.hub.url。');
    }
    assertNoAbsolutePath(payload);
    return requestJson(joinHubUrl(hubUrl, '/api/hub/runtime-feedback'), {
      method: 'POST',
      body: JSON.stringify(payload),
    });
  }
}

module.exports = {
  HubClient,
  HubClientError,
  assertNoAbsolutePath,
  joinHubUrl,
};
