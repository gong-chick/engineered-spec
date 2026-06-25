const crypto = require('crypto');
const path = require('path');

const ASSET_TYPE_MAP = {
  rule: 'rule',
  rules: 'rule',
  skill: 'skill',
  skills: 'skill',
  role: 'agentProfile',
  agent: 'agentProfile',
  agentProfile: 'agentProfile',
  profile: 'agentProfile',
  workflow: 'workflow',
  flow: 'workflow',
  hook: 'hook',
  command: 'command',
};

function sha256Json(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value || {})).digest('hex')}`;
}

function assertRelativePath(relPath) {
  const normalized = path.posix.normalize(String(relPath || '').replace(/\\/g, '/'));
  if (!normalized || path.isAbsolute(relPath) || normalized === '..' || normalized.startsWith('../')) {
    throw new Error(`资产文件路径非法：${relPath}`);
  }
  return normalized;
}

function normalizeAssetType(value) {
  return ASSET_TYPE_MAP[String(value || '').trim()] || String(value || 'rule');
}

function normalizeAssetFiles(asset = {}) {
  const files = Array.isArray(asset.files)
    ? asset.files
    : Array.isArray(asset.generatedFiles)
      ? asset.generatedFiles
      : asset.installPath || asset.path
        ? [{ path: asset.installPath || asset.path, checksum: asset.checksum }]
        : [];
  return files.map((file) => ({
    path: assertRelativePath(file.path || file.installPath),
    checksum: file.checksum || asset.checksum || '',
  }));
}

function normalizeAssetPackage(asset = {}, options = {}) {
  const assetId = asset.assetId || asset.slug || asset.id || '';
  const assetType = normalizeAssetType(asset.assetType || asset.kind || asset.type);
  const files = normalizeAssetFiles(asset);
  return {
    ...asset,
    assetId,
    assetType,
    name: asset.name || asset.displayName || assetId,
    version: asset.version || '0.1.0',
    source: asset.source || options.source || 'skill-q-platform',
    checksum: asset.checksum || sha256Json({ assetId, assetType, files }),
    compatibility: asset.compatibility || options.compatibility || {},
    files,
    metadata: asset.metadata || {},
  };
}

module.exports = {
  assertRelativePath,
  normalizeAssetFiles,
  normalizeAssetPackage,
  normalizeAssetType,
};
