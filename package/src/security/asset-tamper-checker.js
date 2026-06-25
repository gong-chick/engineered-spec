const fs = require('fs');
const { GlobalCache } = require('../cache/global-cache');
const { readProjectState } = require('../project/project-files');
const { sha256File } = require('./checksum');

const PRIVACY_FALSE_FIELDS = [
  'uploadSourceCode',
  'uploadAbsolutePath',
  'uploadUserName',
  'uploadRawPrompt',
  'uploadRawResponse',
  'uploadFileContent',
];

function issue(level, code, message, suggestion) {
  return { level, code, message, suggestion };
}

function addIssue(result, item) {
  result[`${item.level}s`].push(item);
}

function assetIdentity(asset) {
  return `${asset.kind || 'asset'}:${asset.slug || ''}:${asset.version || ''}`;
}

function flattenRegistryAssets(registry) {
  const assets = registry?.assets || {};
  const result = [];
  for (const [group, items] of Object.entries(assets)) {
    if (Array.isArray(items)) {
      for (const item of items) {
        result.push({
          ...item,
          kind: item.kind || (group === 'agentProfiles' ? 'agent-profile' : group.replace(/s$/, '')),
        });
      }
    }
  }
  return result;
}

function containsContent(value) {
  if (!value || typeof value !== 'object') return false;
  if (Object.prototype.hasOwnProperty.call(value, 'content')) return true;
  if (Array.isArray(value)) return value.some(containsContent);
  return Object.values(value).some(containsContent);
}

class AssetTamperChecker {
  constructor(options = {}) {
    this.globalCache = options.globalCache || new GlobalCache(options);
  }

  check(rootDir, options = {}) {
    const strictCache = Boolean(options.strictCache);
    const result = {
      passed: true,
      errors: [],
      warnings: [],
      infos: [],
    };
    let state;
    try {
      state = readProjectState(rootDir);
    } catch (error) {
      addIssue(result, issue('error', 'JSON_INVALID', error.message, '请修复 JSON 格式后重新执行检查'));
      result.passed = false;
      return result;
    }

    const requiredFiles = [
      ['project', '.ai-spec/project.json'],
      ['policy', '.ai-spec/policy.json'],
      ['lock', '.ai-spec/ai-spec.lock.json'],
      ['registry', '.agents/registry.index.json'],
      ['contextIndex', '.ai-spec/context-index.json'],
    ];
    for (const [key, label] of requiredFiles) {
      if (!state[key]) {
        addIssue(result, issue('error', `MISSING_${key.toUpperCase()}`, `缺少 ${label}`, '请先执行 ai-spec-auto init . --recommend --yes'));
      }
    }
    if (result.errors.length > 0) {
      result.passed = false;
      return result;
    }

    this.checkPrivacy(state.policy, result);
    this.checkLock(state.lock, result);
    this.checkRegistry(state.lock, state.registry, result);
    this.checkContextIndex(state.contextIndex, result);
    this.checkAssetCache(state.lock, result, { strictCache });
    this.checkOverlays(state.lock, result);

    addIssue(result, issue('info', 'CHECK_COMPLETE', '资产完整性检查完成', '无需处理'));
    result.passed = result.errors.length === 0;
    return result;
  }

  checkPrivacy(policy, result) {
    const privacy = policy.privacyPolicy || {};
    for (const field of PRIVACY_FALSE_FIELDS) {
      if (privacy[field] === true) {
        addIssue(result, issue('error', 'PRIVACY_POLICY_VIOLATION', `隐私配置违规：privacyPolicy.${field} 不能为 true`, '请将该字段设置为 false'));
      }
    }
  }

  checkLock(lock, result) {
    if (!lock.schemaVersion) {
      addIssue(result, issue('error', 'LOCK_SCHEMA_MISSING', 'lock 缺少 schemaVersion', '请重新生成 ai-spec.lock.json'));
    }
    if (lock.manifest && !lock.manifest.checksum) {
      addIssue(result, issue('error', 'MANIFEST_CHECKSUM_MISSING', 'manifest checksum 字段缺失', '请重新执行 sync 或 init'));
    }
    if (!lock.manifest) {
      addIssue(result, issue('warning', 'MANIFEST_NOT_INSTALLED', 'lock 未包含 Manifest', '如需安装规范，请使用 --manifest 手动指定'));
    }
    for (const asset of lock.assets || []) {
      if (!asset.checksum) {
        addIssue(result, issue('error', 'ASSET_CHECKSUM_MISSING', `资产 ${asset.slug || ''} 缺少 checksum`, '请修正 lock 文件'));
      }
    }
    for (const profile of lock.agentProfiles || []) {
      if (!profile.checksum) {
        addIssue(result, issue('error', 'AGENT_PROFILE_CHECKSUM_MISSING', `Agent Profile ${profile.slug || ''} 缺少 checksum`, '请修正 lock 文件'));
      }
    }
  }

  checkRegistry(lock, registry, result) {
    if (containsContent(registry)) {
      addIssue(result, issue('error', 'REGISTRY_CONTENT_FORBIDDEN', 'registry.index.json 不允许包含完整 content', '请只保留 cacheKey/cachePath/checksum 索引'));
    }
    const registryAssets = flattenRegistryAssets(registry);
    const registryByIdentity = new Map(registryAssets.map((asset) => [assetIdentity(asset), asset]));
    for (const asset of lock.assets || []) {
      const registryAsset = registryByIdentity.get(assetIdentity(asset));
      if (!registryAsset) {
        addIssue(result, issue('error', 'REGISTRY_ASSET_MISSING', `registry 缺少资产索引：${asset.slug || asset.checksum}`, '请执行 ai-spec-auto sync . 重新生成索引'));
        continue;
      }
      if (registryAsset.checksum !== asset.checksum) {
        addIssue(result, issue('error', 'REGISTRY_LOCK_MISMATCH', `registry 与 lock checksum 不一致：${asset.slug || asset.checksum}`, '请执行 ai-spec-auto sync . 重新生成索引'));
      }
    }
  }

  checkContextIndex(contextIndex, result) {
    if (contextIndex.contextStrategy !== 'progressive') {
      addIssue(result, issue('error', 'CONTEXT_STRATEGY_INVALID', 'contextStrategy 必须是 progressive', '请重新生成 context-index.json'));
    }
    const stages = new Set((contextIndex.stageLoadRules || []).map((item) => item.stage));
    for (const stage of ['planning', 'implementation', 'verification', 'diagnosing']) {
      if (!stages.has(stage)) {
        addIssue(result, issue('error', 'CONTEXT_STAGE_MISSING', `context-index 缺少 ${stage} 阶段`, '请重新生成 context-index.json'));
      }
    }
  }

  checkAssetCache(lock, result, options = {}) {
    for (const asset of lock.assets || []) {
      if (!asset.checksum) continue;
      const contentPath = this.globalCache.getAssetContentPath(asset.checksum);
      if (!fs.existsSync(contentPath)) {
        addIssue(result, issue(options.strictCache ? 'error' : 'warning', 'ASSET_CACHE_MISSING', `缓存缺失：${asset.slug || asset.checksum}`, '请先执行 ai-spec-auto sync .'));
        continue;
      }
      const actual = sha256File(contentPath);
      if (actual !== asset.checksum) {
        addIssue(result, issue('error', 'ASSET_TAMPERED', `标准资产 checksum 不一致：${asset.slug || asset.checksum}`, '请执行 ai-spec-auto sync . 恢复缓存'));
      }
    }
  }

  checkOverlays(lock, result) {
    if (Array.isArray(lock.overlays) && lock.overlays.length > 0) {
      addIssue(result, issue('warning', 'OVERLAY_CHECK_NOT_IMPLEMENTED', 'overlay checksum 校验暂未实现', '后续实现 overlay 后补充校验'));
    }
  }
}

module.exports = {
  AssetTamperChecker,
  PRIVACY_FALSE_FIELDS,
  flattenRegistryAssets,
};
