const path = require('path');
const os = require('os');
const { mergeMissing, readJsonIfExists, stableHash, writeJson } = require('./json-utils');

function resolveProjectName(rootDir, planPackage) {
  if (planPackage?.name) return planPackage.name;
  return path.basename(rootDir);
}

function buildProjectHash(rootDir) {
  return stableHash(rootDir, 12);
}

function buildProjectId(projectName, projectHash) {
  const slug = projectName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  return `${slug}-${projectHash}`;
}

function resolveLocalStateDir(projectId) {
  return path.join(os.homedir(), '.ai-spec-auto', 'projects', projectId);
}

class ConfigWriter {
  write(rootDir, plan, options = {}) {
    const filePath = path.join(rootDir, '.ai-spec', 'config.json');
    const existing = readJsonIfExists(filePath);
    const now = options.now || new Date().toISOString();
    const planPackage = plan.packages[0] || null;
    const projectName = resolveProjectName(rootDir, planPackage);
    const projectHash = buildProjectHash(rootDir);
    const projectId = buildProjectId(projectName, projectHash);
    const localStateDir = resolveLocalStateDir(projectId);

    const defaultDoc = {
      version: '0.1.0',
      projectName,
      projectId,
      projectRoot: rootDir,
      projectHash,
      localStateDir,
      adapters: {
        cursor: true,
        claudeCode: true,
        codex: false,
      },
      runtime: {
        maxRepairAttempts: 2,
        requireTestBeforeDone: true,
        requireReviewBeforeArchive: true,
      },
      createdAt: now,
      updatedAt: now,
    };

    const nextDoc = mergeMissing(defaultDoc, existing || {});
    nextDoc.updatedAt = now;
    // 保证 projectId 和 localStateDir 基于实际路径计算，不被旧值覆盖
    nextDoc.projectId = projectId;
    nextDoc.projectHash = projectHash;
    nextDoc.localStateDir = localStateDir;
    nextDoc.projectRoot = rootDir;

    writeJson(filePath, nextDoc);
    return {
      path: '.ai-spec/config.json',
      fullPath: filePath,
      action: existing ? 'update' : 'create',
      data: nextDoc,
    };
  }
}

module.exports = {
  ConfigWriter,
  buildProjectHash,
  buildProjectId,
  resolveLocalStateDir,
  resolveProjectName,
};
