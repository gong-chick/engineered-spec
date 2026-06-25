const { URL } = require('url');
const { PrivacyFilter } = require('./privacy-filter');

class VisualClientError extends Error {
  constructor(code, message, suggestion, details = {}) {
    super(message);
    this.name = 'VisualClientError';
    this.code = code;
    this.suggestion = suggestion || '';
    this.details = details;
  }
}

function joinVisualUrl(visualUrl, endpoint) {
  if (!visualUrl) return endpoint;
  if (/^https?:\/\//i.test(endpoint)) return endpoint;
  return `${String(visualUrl).replace(/\/+$/, '')}/${String(endpoint).replace(/^\/+/, '')}`;
}

async function parseVisualResponse(response) {
  let body;
  try {
    body = await response.json();
  } catch (error) {
    throw new VisualClientError('VISUAL_RESPONSE_INVALID', 'Visual 返回不是合法 JSON', '请检查 Collector API 响应格式。', { error: error.message });
  }
  if (!response.ok || body?.success === false) {
    const visualError = body?.error || {};
    throw new VisualClientError(
      visualError.code || `HTTP_${response.status}`,
      visualError.message || `Visual 请求失败：HTTP ${response.status}`,
      visualError.suggestion || '请检查 engineered-spec-visual 服务状态。',
      { status: response.status },
    );
  }
  if (body && Object.prototype.hasOwnProperty.call(body, 'success')) {
    return body.data;
  }
  return body;
}

class VisualClient {
  constructor(options = {}) {
    this.visualUrl = options.visualUrl || '';
    this.privacyFilter = options.privacyFilter || new PrivacyFilter();
  }

  resolveVisualUrl(inputVisualUrl) {
    return String(inputVisualUrl || this.visualUrl || '').replace(/\/+$/, '');
  }

  async post(endpoint, payload, options = {}) {
    const visualUrl = this.resolveVisualUrl(options.visualUrl || payload.visualUrl);
    if (!visualUrl) {
      throw new VisualClientError('VISUAL_URL_MISSING', '未配置 Visual URL，无法上报运行态数据', '请传入 --visual-url 或配置 AI_SPEC_VISUAL_URL。');
    }
    const safePayload = this.privacyFilter.filter(payload);
    const url = new URL(joinVisualUrl(visualUrl, endpoint));
    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(safePayload),
      });
      return await parseVisualResponse(response);
    } catch (error) {
      if (error instanceof VisualClientError) throw error;
      throw new VisualClientError('VISUAL_NETWORK_ERROR', `Visual 网络请求失败：${error.message}`, '请检查 Visual URL、网络或服务是否启动。');
    }
  }

  async sendProjectState(payload, options = {}) {
    return this.post('/api/collector/project-state', payload, options);
  }

  async sendRunEvent(payload, options = {}) {
    return this.post('/api/collector/run-event', payload, options);
  }

  async sendHistory(payload, options = {}) {
    this.privacyFilter.assertRelativeChangedFiles(payload.changedFiles || []);
    return this.post('/api/collector/history', payload, options);
  }

  async sendIncident(payload, options = {}) {
    return this.post('/api/collector/incident', payload, options);
  }
}

module.exports = {
  VisualClient,
  VisualClientError,
  joinVisualUrl,
};
