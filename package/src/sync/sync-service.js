const fs = require('fs');
const path = require('path');
const { AgentProfileCache } = require('../cache/agent-profile-cache');
const { AssetCache } = require('../cache/asset-cache');
const { GlobalCache } = require('../cache/global-cache');
const { resolveHubConfig } = require('../hub/hub-config');
const { HubClient } = require('../hub/hub-client');
const { readProjectState } = require('../project/project-files');
const { writeJson } = require('../project/json-utils');
const { AssetTamperChecker } = require('../security/asset-tamper-checker');

class SyncService {
  constructor(options = {}) {
    this.globalCache = options.globalCache || new GlobalCache(options);
    this.assetCache = options.assetCache || new AssetCache({ globalCache: this.globalCache });
    this.agentProfileCache = options.agentProfileCache || new AgentProfileCache({ globalCache: this.globalCache });
    this.hubClient = options.hubClient || new HubClient();
    this.tamperChecker = options.tamperChecker || new AssetTamperChecker({ globalCache: this.globalCache });
  }

  async sync(rootDir, options = {}) {
    this.globalCache.ensureLayout();
    const state = readProjectState(rootDir);
    if (!state.lock) {
      throw new Error('缺少 .ai-spec/ai-spec.lock.json，无法同步');
    }
    if (!state.registry) {
      throw new Error('缺少 .agents/registry.index.json，无法同步');
    }

    const hubConfig = resolveHubConfig(rootDir, options);
    let manifestExport = null;
    const reportMessages = [];
    if (hubConfig.url && state.lock.manifest?.slug) {
      try {
        manifestExport = await this.hubClient.getManifestExport({
          slug: state.lock.manifest.slug,
          version: state.lock.manifest.version || '1.0.0',
          hubUrl: hubConfig.url,
        });
      } catch (error) {
        if (this.isCacheComplete(state.lock)) {
          reportMessages.push(`Hub 不可用，已使用本地缓存继续：${error.message}`);
        } else {
          throw new Error(`Hub 不可用且缓存缺失，无法同步：${error.message}`);
        }
      }
    } else if (!hubConfig.url) {
      // 保持离线兼容：未配置 Hub 且 lock assets 为空时仍可通过。
    }

    const assets = manifestExport?.assets || state.lock.assets || [];
    const agentProfiles = manifestExport?.agentProfiles || state.lock.agentProfiles || [];
    const report = {
      total: assets.length,
      agentProfilesTotal: agentProfiles.length,
      cacheHits: 0,
      agentProfileCacheHits: 0,
      downloaded: 0,
      agentProfilesDownloaded: 0,
      skipped: assets.length === 0,
      messages: reportMessages,
    };
    if (!hubConfig.url) {
      report.messages.push('未配置 Hub URL，已使用本地模式');
    }
    if (assets.length === 0 && agentProfiles.length === 0) {
      report.messages.push('当前 lock 未包含远程资产，跳过资产同步');
      return report;
    }

    for (const asset of assets) {
      if (this.assetCache.hasValidAsset(asset)) {
        report.cacheHits += 1;
        continue;
      }
      const content = await this.hubClient.getAssetContent({ ...asset, hubUrl: hubConfig.url });
      this.assetCache.writeAsset(asset, content);
      report.downloaded += 1;
    }

    for (const profile of agentProfiles) {
      if (this.agentProfileCache.hasValidProfile(profile)) {
        report.agentProfileCacheHits += 1;
        continue;
      }
      const profileExport = await this.hubClient.getAgentProfileExport({ ...profile, hubUrl: hubConfig.url });
      this.agentProfileCache.writeProfile(profile, profileExport);
      report.agentProfilesDownloaded += 1;
    }

    if (manifestExport) {
      this.updateLockAndRegistry(rootDir, state, manifestExport, hubConfig.url);
    }

    const checkResult = this.tamperChecker.check(rootDir, { strictCache: true });
    if (!checkResult.passed) {
      const first = checkResult.errors[0];
      throw new Error(first ? first.message : '同步后一致性校验失败');
    }
    fs.mkdirSync(this.globalCache.logsDir, { recursive: true });
    return report;
  }

  isCacheComplete(lock) {
    const assets = lock.assets || [];
    const agentProfiles = lock.agentProfiles || [];
    if (assets.length === 0 && agentProfiles.length === 0) return false;
    return assets.every((asset) => this.assetCache.hasValidAsset(asset)) &&
      agentProfiles.every((profile) => this.agentProfileCache.hasValidProfile(profile));
  }

  updateLockAndRegistry(rootDir, state, manifestExport, hubUrl) {
    const lockPath = path.join(rootDir, '.ai-spec/ai-spec.lock.json');
    const registryPath = path.join(rootDir, '.agents/registry.index.json');
    const lock = {
      ...state.lock,
      hub: { ...(state.lock.hub || {}), url: hubUrl },
      manifest: {
        ...(state.lock.manifest || {}),
        slug: manifestExport.manifest.slug,
        version: manifestExport.manifest.version,
        checksum: manifestExport.manifest.checksum,
      },
      assets: (manifestExport.assets || []).map((asset) => ({
        kind: asset.kind,
        slug: asset.slug,
        version: asset.version,
        checksum: asset.checksum,
        required: asset.required,
        loadWhen: asset.loadWhen,
        contentUrl: asset.contentUrl,
      })),
      agentProfiles: (manifestExport.agentProfiles || []).map((profile) => ({
        kind: 'agent-profile',
        slug: profile.slug,
        version: profile.version,
        checksum: profile.checksum,
        required: true,
        contentUrl: profile.contentUrl,
      })),
    };
    const grouped = {
      rules: [],
      skills: [],
      roles: [],
      flows: [],
      agentProfiles: [],
    };
    for (const asset of lock.assets) {
      const key = asset.kind === 'role' ? 'roles' : asset.kind === 'flow' ? 'flows' : `${asset.kind}s`;
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push({
        kind: asset.kind,
        slug: asset.slug,
        version: asset.version,
        checksum: asset.checksum,
        cacheKey: asset.checksum,
        cachePath: `assets/${asset.checksum}`,
        required: asset.required,
        loadWhen: asset.loadWhen,
      });
    }
    for (const profile of lock.agentProfiles) {
      grouped.agentProfiles.push({
        kind: 'agent-profile',
        slug: profile.slug,
        version: profile.version,
        checksum: profile.checksum,
        cacheKey: profile.checksum,
        cachePath: `agent-profiles/${profile.checksum}`,
        required: true,
      });
    }
    const registry = {
      ...(state.registry || {}),
      schemaVersion: '1.0.0',
      source: 'hub-sync',
      manifest: {
        slug: manifestExport.manifest.slug,
        version: manifestExport.manifest.version,
      },
      assets: grouped,
    };
    writeJson(lockPath, lock);
    writeJson(registryPath, registry);
  }
}

module.exports = {
  SyncService,
};
