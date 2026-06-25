const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveGlobalCacheRoot(options = {}) {
  return path.resolve(options.rootDir || process.env.AI_SPEC_AUTO_HOME || path.join(os.homedir(), '.ai-spec-auto'));
}

class GlobalCache {
  constructor(options = {}) {
    this.rootDir = resolveGlobalCacheRoot(options);
    this.cacheDir = path.join(this.rootDir, 'cache');
    this.assetsDir = path.join(this.cacheDir, 'assets');
    this.manifestsDir = path.join(this.cacheDir, 'manifests');
    this.agentProfilesDir = path.join(this.cacheDir, 'agent-profiles');
    this.logsDir = path.join(this.rootDir, 'logs');
  }

  ensureLayout() {
    for (const dirPath of [this.assetsDir, this.manifestsDir, this.agentProfilesDir, this.logsDir]) {
      fs.mkdirSync(dirPath, { recursive: true });
    }
  }

  getAssetDir(checksum) {
    return path.join(this.assetsDir, checksum);
  }

  getAssetContentPath(checksum) {
    return path.join(this.getAssetDir(checksum), 'content.md');
  }

  getAssetMetadataPath(checksum) {
    return path.join(this.getAssetDir(checksum), 'metadata.json');
  }

  getRelativeAssetPath(checksum) {
    return `assets/${checksum}`;
  }

  getAgentProfileDir(checksum) {
    return path.join(this.agentProfilesDir, checksum);
  }

  getAgentProfileContentPath(checksum) {
    return path.join(this.getAgentProfileDir(checksum), 'content.json');
  }

  getAgentProfileMetadataPath(checksum) {
    return path.join(this.getAgentProfileDir(checksum), 'metadata.json');
  }

  getRelativeAgentProfilePath(checksum) {
    return `agent-profiles/${checksum}`;
  }
}

module.exports = {
  GlobalCache,
  resolveGlobalCacheRoot,
};
