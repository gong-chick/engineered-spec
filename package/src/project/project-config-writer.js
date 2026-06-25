const path = require('path');
const {
  createChecksum,
  mergeMissing,
  readJsonIfExists,
  stableHash,
  writeJson,
} = require('./json-utils');

function resolveProjectName(rootDir, planPackage) {
  if (planPackage?.name) return planPackage.name;
  return path.basename(rootDir);
}

function selectPrimaryPackage(plan) {
  return plan.packages[0] || null;
}

function buildManifestConfig(manifest) {
  if (!manifest) return null;
  return {
    slug: manifest.slug,
    version: manifest.version || '1.0.0',
    checksum: createChecksum(`${manifest.slug}@${manifest.version || '1.0.0'}`),
  };
}

class ProjectConfigWriter {
  write(rootDir, plan, options = {}) {
    const filePath = path.join(rootDir, '.ai-spec/project.json');
    const existing = readJsonIfExists(filePath);
    const now = options.now || new Date().toISOString();
    const planPackage = selectPrimaryPackage(plan);
    const manifest = planPackage?.recommendedManifest || null;
    const defaultDoc = {
      schemaVersion: '1.0.0',
      projectId: `proj_${stableHash(rootDir, 20)}`,
      projectName: resolveProjectName(rootDir, planPackage),
      projectType: plan.packages.length > 1 || planPackage?.path !== '.' ? 'package' : 'single',
      relativePath: '.',
      techProfile: {
        domain: planPackage?.techProfile?.domain || '',
        language: planPackage?.techProfile?.language || [],
        frameworks: planPackage?.techProfile?.frameworks || [],
        buildTool: planPackage?.techProfile?.buildTool || '',
        confidence: planPackage?.techProfile?.confidence || 0,
        reasons: planPackage?.techProfile?.reasons || [],
      },
      projectKind: planPackage?.projectKind || 'unknown',
      manifest: buildManifestConfig(manifest),
      warnings: planPackage?.warnings || [],
      defaultExecutor: 'cursor',
      createdAt: now,
      updatedAt: now,
    };

    const nextDoc = mergeMissing(defaultDoc, existing || {});
    if (!manifest) {
      nextDoc.manifest = null;
    }
    nextDoc.updatedAt = now;
    writeJson(filePath, nextDoc);
    return {
      path: '.ai-spec/project.json',
      fullPath: filePath,
      action: existing ? 'update' : 'create',
      data: nextDoc,
    };
  }
}

module.exports = {
  ProjectConfigWriter,
};
