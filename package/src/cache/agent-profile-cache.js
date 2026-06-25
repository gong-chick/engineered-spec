const fs = require('fs');
const path = require('path');
const { GlobalCache } = require('./global-cache');
const { safeJsonHash } = require('../security/checksum');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

class AgentProfileCache {
  constructor(options = {}) {
    this.globalCache = options.globalCache || new GlobalCache(options);
  }

  hasValidProfile(profile) {
    const contentPath = this.globalCache.getAgentProfileContentPath(profile.checksum);
    if (!fs.existsSync(contentPath)) return false;
    const parsed = JSON.parse(fs.readFileSync(contentPath, 'utf8'));
    return safeJsonHash(parsed) === profile.checksum;
  }

  writeProfile(profile, profileExport) {
    const content = profileExport.content || profileExport;
    const actual = safeJsonHash(content);
    if (actual !== profile.checksum) {
      throw new Error(`Agent Profile checksum 不一致：${profile.slug || profile.checksum}，期望 ${profile.checksum}，实际 ${actual}`);
    }
    const dir = this.globalCache.getAgentProfileDir(profile.checksum);
    fs.mkdirSync(dir, { recursive: true });
    writeJson(this.globalCache.getAgentProfileContentPath(profile.checksum), content);
    writeJson(this.globalCache.getAgentProfileMetadataPath(profile.checksum), {
      slug: profile.slug || profileExport.slug || '',
      version: profile.version || profileExport.version || '',
      checksum: profile.checksum,
      source: 'hub',
      cachedAt: new Date().toISOString(),
    });
    return {
      checksum: profile.checksum,
      contentPath: this.globalCache.getAgentProfileContentPath(profile.checksum),
    };
  }

  read(slug, version) {
    const legacyPath = path.join(this.globalCache.agentProfilesDir, `${slug}@${version || 'latest'}.json`);
    if (!fs.existsSync(legacyPath)) return null;
    return JSON.parse(fs.readFileSync(legacyPath, 'utf8'));
  }

  write(slug, version, profileExport) {
    const checksum = profileExport.checksum || safeJsonHash(profileExport.content || profileExport);
    return this.writeProfile({ slug, version, checksum }, profileExport).contentPath;
  }
}

module.exports = {
  AgentProfileCache,
};
