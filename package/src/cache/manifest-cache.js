const fs = require('fs');
const path = require('path');
const { GlobalCache } = require('./global-cache');

class ManifestCache {
  constructor(options = {}) {
    this.globalCache = options.globalCache || new GlobalCache(options);
  }

  getManifestPath(slug, version) {
    return path.join(this.globalCache.manifestsDir, `${slug}@${version || 'latest'}.json`);
  }

  read(slug, version) {
    const filePath = this.getManifestPath(slug, version);
    if (!fs.existsSync(filePath)) return null;
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  }

  write(slug, version, manifestExport) {
    const filePath = this.getManifestPath(slug, version);
    fs.mkdirSync(path.dirname(filePath), { recursive: true });
    fs.writeFileSync(filePath, `${JSON.stringify(manifestExport, null, 2)}\n`, 'utf8');
    return filePath;
  }
}

module.exports = {
  ManifestCache,
};
