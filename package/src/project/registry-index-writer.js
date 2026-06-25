const path = require('path');
const { readJsonIfExists, writeJson } = require('./json-utils');

class RegistryIndexWriter {
  write(rootDir, plan, context = {}) {
    const filePath = path.join(rootDir, '.agents/registry.index.json');
    const existing = readJsonIfExists(filePath);
    const manifest = plan.packages[0]?.recommendedManifest || null;
    const doc = {
      schemaVersion: '1.0.0',
      projectId: context.projectId || '',
      source: 'local-init',
      manifest: manifest ? {
        slug: manifest.slug,
        version: manifest.version || '1.0.0',
      } : null,
      assets: {
        rules: [],
        skills: [],
        agentProfiles: [],
      },
      cacheRefs: {
        rules: [],
        skills: [],
        agentProfiles: [],
      },
      cacheKey: '',
      cachePath: '',
    };

    writeJson(filePath, doc);
    return {
      path: '.agents/registry.index.json',
      fullPath: filePath,
      action: existing ? 'update' : 'create',
      data: doc,
    };
  }
}

module.exports = {
  RegistryIndexWriter,
};
