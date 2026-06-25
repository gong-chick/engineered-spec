const fs = require('fs');
const path = require('path');
const { GlobalCache } = require('../cache/global-cache');
const { safeJsonHash, sha256File } = require('../security/checksum');
const { ContextBudget } = require('./context-budget');
const { createIssue } = require('./types');

const SENSITIVE_CONTENT_RE = /(BEGIN (RSA|DSA|EC|OPENSSH)? ?PRIVATE KEY|AKIA[0-9A-Z]{16}|api[_-]?key\s*[:=]|secret\s*[:=]|password\s*[:=]|token\s*[:=])/i;

function hasContentField(value) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'content')) return true;
  if (Array.isArray(value)) return value.some(hasContentField);
  return Object.values(value).some(hasContentField);
}

function issueMessage(asset) {
  return `${asset.kind || 'asset'}:${asset.slug || asset.checksum || ''}`;
}

class ContextLoader {
  constructor(options = {}) {
    this.globalCache = options.globalCache || new GlobalCache(options);
    this.contextBudget = options.contextBudget || new ContextBudget();
  }

  getContentPath(asset) {
    if (!asset.checksum) {
      throw new Error(`资产缺少 checksum，无法加载：${issueMessage(asset)}`);
    }
    if (asset.kind === 'agent-profile') {
      const jsonProfilePath = path.join(this.globalCache.agentProfilesDir, asset.checksum, 'content.json');
      if (fs.existsSync(jsonProfilePath)) return jsonProfilePath;
      const profilePath = path.join(this.globalCache.agentProfilesDir, asset.checksum, 'content.md');
      if (fs.existsSync(profilePath)) return profilePath;
      const legacyProfilePath = path.join(this.globalCache.agentProfilesDir, `${asset.slug || 'unknown'}@${asset.version || 'latest'}.json`);
      if (fs.existsSync(legacyProfilePath)) return legacyProfilePath;
    }
    return this.globalCache.getAssetContentPath(asset.checksum);
  }

  loadAssets(assetsToLoad = [], options = {}) {
    const allowMissingOptionalAssets = options.allowMissingOptionalAssets !== false;
    const loadedAssets = [];
    const warnings = [];
    const errors = [];

    for (const asset of assetsToLoad) {
      if (hasContentField(asset)) {
        throw new Error(`registry.index.json 不允许包含完整 content：${issueMessage(asset)}`);
      }

      const required = asset.required === true;
      const contentPath = this.getContentPath(asset);
      if (!fs.existsSync(contentPath)) {
        const message = required
          ? `必需资产缓存缺失：${issueMessage(asset)}`
          : `可选资产缓存缺失：${issueMessage(asset)}`;
        const item = createIssue(
          required ? 'error' : 'warning',
          required ? 'CONTEXT_REQUIRED_ASSET_CACHE_MISSING' : 'CONTEXT_OPTIONAL_ASSET_CACHE_MISSING',
          message,
          '请先执行 ai-spec-auto sync .',
        );
        if (required || !allowMissingOptionalAssets) {
          errors.push(item);
          throw new Error(message);
        }
        warnings.push(item);
        continue;
      }

      const isHubAgentProfileJson = asset.kind === 'agent-profile' &&
        path.basename(contentPath) === 'content.json' &&
        path.basename(path.dirname(contentPath)) === asset.checksum;
      const actualChecksum = isHubAgentProfileJson
        ? safeJsonHash(JSON.parse(fs.readFileSync(contentPath, 'utf8')))
        : sha256File(contentPath);
      if (actualChecksum !== asset.checksum) {
        throw new Error(`资产 checksum 不一致：${issueMessage(asset)}，期望 ${asset.checksum}，实际 ${actualChecksum}`);
      }

      const content = fs.readFileSync(contentPath, 'utf8');
      if (SENSITIVE_CONTENT_RE.test(content)) {
        warnings.push(createIssue(
          'warning',
          'CONTEXT_ASSET_SENSITIVE_CONTENT',
          `资产疑似包含敏感内容：${issueMessage(asset)}`,
          '请检查缓存资产来源，避免把密钥写入标准资产',
        ));
      }

      loadedAssets.push({
        kind: asset.kind || 'asset',
        slug: asset.slug || '',
        version: asset.version || '',
        checksum: asset.checksum,
        source: 'global-cache',
        content,
        contentLength: content.length,
        tokenEstimate: this.contextBudget.estimateTextTokens(content),
      });
    }

    return {
      loadedAssets,
      warnings,
      errors,
    };
  }
}

module.exports = {
  ContextLoader,
  hasContentField,
};
