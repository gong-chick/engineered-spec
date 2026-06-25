const path = require('path');
const { createChecksum, mergeMissing, readJsonIfExists, stableHash, writeJson } = require('./json-utils');
const { WORKSPACE_TYPES } = require('../init/init-plan');

function shouldWriteWorkspace(plan) {
  return WORKSPACE_TYPES.has(plan.workspace.type) || plan.packages.length > 1;
}

function buildPackageManifest(pkg) {
  if (!pkg.recommendedManifest) return null;
  return {
    slug: pkg.recommendedManifest.slug,
    version: pkg.recommendedManifest.version || '1.0.0',
    checksum: createChecksum(`${pkg.recommendedManifest.slug}@${pkg.recommendedManifest.version || '1.0.0'}`),
  };
}

class WorkspaceConfigWriter {
  write(rootDir, plan, options = {}) {
    if (!shouldWriteWorkspace(plan)) {
      return null;
    }

    const filePath = path.join(rootDir, '.ai-spec/workspace.json');
    const existing = readJsonIfExists(filePath);
    const now = options.now || new Date().toISOString();
    const defaultDoc = {
      schemaVersion: '1.0.0',
      workspaceId: `ws_${stableHash(rootDir, 20)}`,
      name: path.basename(rootDir),
      root: '.',
      type: 'monorepo',
      packages: plan.packages.map((pkg) => ({
        packageId: pkg.packageId,
        name: pkg.name || pkg.packageId,
        path: pkg.path,
        domain: pkg.techProfile.domain,
        language: pkg.techProfile.language,
        frameworks: pkg.techProfile.frameworks,
        projectKind: pkg.projectKind || 'unknown',
        manifest: buildPackageManifest(pkg),
      })),
      sharedContracts: [],
      createdAt: now,
      updatedAt: now,
    };

    const nextDoc = mergeMissing(defaultDoc, existing || {});
    nextDoc.updatedAt = now;
    writeJson(filePath, nextDoc);
    return {
      path: '.ai-spec/workspace.json',
      fullPath: filePath,
      action: existing ? 'update' : 'create',
      data: nextDoc,
    };
  }
}

module.exports = {
  WorkspaceConfigWriter,
  shouldWriteWorkspace,
};
