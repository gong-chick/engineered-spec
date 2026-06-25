const { HubClient } = require('../../hub/hub-client');
const { normalizeAssetPackage } = require('./asset-package');
const { buildUsageFeedbackList } = require('./asset-usage-feedback');

class HubConnector {
  constructor(options = {}) {
    this.hubClient = options.hubClient || new HubClient(options);
  }

  async searchAssets(input = {}) {
    const hubUrl = this.hubClient.resolveHubUrl(input.hubUrl);
    if (!hubUrl) {
      throw new Error('未配置 Hub URL，无法搜索资产。');
    }
    const params = new URLSearchParams();
    if (input.query || input.q) params.set('q', input.query || input.q);
    if (input.assetType || input.kind) params.set('kind', input.assetType || input.kind);
    const url = `${hubUrl}/api/hub/search?${params.toString()}`;
    const data = await fetch(url).then(async (response) => {
      const body = await response.json();
      if (!response.ok || body?.success === false) {
        throw new Error(body?.error?.message || body?.message || `Hub 搜索失败：HTTP ${response.status}`);
      }
      return Object.prototype.hasOwnProperty.call(body || {}, 'success') ? body.data : body;
    });
    const items = Array.isArray(data?.items) ? data.items : Array.isArray(data) ? data : [];
    return {
      ...data,
      items: items.map((item) => normalizeAssetPackage(item)),
    };
  }

  normalizeAssetPackage(asset, options = {}) {
    return normalizeAssetPackage(asset, options);
  }

  buildUsageFeedback(input = {}) {
    return buildUsageFeedbackList(input);
  }
}

module.exports = {
  HubConnector,
};
