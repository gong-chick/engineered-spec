const { GlobalCache } = require('../cache/global-cache');
const { AssetTamperChecker } = require('../security/asset-tamper-checker');

function summarize(result) {
  return {
    errors: result.errors.length,
    warnings: result.warnings.length,
    infos: result.infos.length,
  };
}

class CheckService {
  constructor(options = {}) {
    this.globalCache = options.globalCache || new GlobalCache(options);
    this.tamperChecker = options.tamperChecker || new AssetTamperChecker({ globalCache: this.globalCache });
  }

  check(rootDir, options = {}) {
    const result = this.tamperChecker.check(rootDir, {
      strictCache: Boolean(options.strictCache),
    });
    return {
      ...result,
      summary: summarize(result),
    };
  }
}

module.exports = {
  CheckService,
  summarize,
};
