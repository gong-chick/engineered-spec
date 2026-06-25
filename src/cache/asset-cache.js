const fs = require('fs');
const path = require('path');
const { sha256File, sha256Text } = require('../security/checksum');
const { GlobalCache } = require('./global-cache');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) return null;
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch {
    return null;
  }
}

class AssetCache {
  constructor(options = {}) {
    this.globalCache = options.globalCache || new GlobalCache(options);
  }

  hasValidAsset(asset) {
    const contentPath = this.globalCache.getAssetContentPath(asset.checksum);
    if (!fs.existsSync(contentPath)) return false;
    return sha256File(contentPath) === asset.checksum;
  }

  getCachedAsset(asset) {
    if (!this.hasValidAsset(asset)) return null;
    return {
      checksum: asset.checksum,
      contentPath: this.globalCache.getAssetContentPath(asset.checksum),
      metadata: readJsonIfExists(this.globalCache.getAssetMetadataPath(asset.checksum)),
    };
  }

  writeAsset(asset, content) {
    const actual = sha256Text(content);
    if (actual !== asset.checksum) {
      throw new Error(`资产 checksum 不一致：${asset.slug || asset.checksum}，期望 ${asset.checksum}，实际 ${actual}`);
    }
    const assetDir = this.globalCache.getAssetDir(asset.checksum);
    fs.mkdirSync(assetDir, { recursive: true });
    fs.writeFileSync(this.globalCache.getAssetContentPath(asset.checksum), content, 'utf8');
    writeJson(this.globalCache.getAssetMetadataPath(asset.checksum), {
      kind: asset.kind || 'asset',
      slug: asset.slug || '',
      version: asset.version || '',
      checksum: asset.checksum,
      cacheKey: asset.checksum,
      cachePath: this.globalCache.getRelativeAssetPath(asset.checksum),
      cachedAt: new Date().toISOString(),
    });
    return this.getCachedAsset(asset);
  }
}

module.exports = {
  AssetCache,
};
