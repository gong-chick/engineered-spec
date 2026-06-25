const fs = require('fs');
const path = require('path');
const { createChecksum, readJsonIfExists, writeJson } = require('./json-utils');

class LockFileWriter {
  write(rootDir, plan, context = {}, options = {}) {
    const filePath = path.join(rootDir, '.ai-spec/ai-spec.lock.json');
    const existing = readJsonIfExists(filePath);
    const now = options.now || new Date().toISOString();
    const manifest = plan.packages[0]?.recommendedManifest || null;
    const writtenFiles = options.writtenFiles || [];

    // 构建 adapterOutputs：按 IDE 分组生成文件
    const adapterOutputs = {
      cursor: [],
      claudeCode: [],
      codex: [],
    };
    for (const file of writtenFiles) {
      const filePathStr = file.path || '';
      if (filePathStr.startsWith('.cursor/')) {
        adapterOutputs.cursor.push(filePathStr);
      } else if (filePathStr.startsWith('.claude/') || filePathStr === 'CLAUDE.md') {
        adapterOutputs.claudeCode.push(filePathStr);
      } else if (filePathStr.startsWith('.codex/')) {
        adapterOutputs.codex.push(filePathStr);
      }
    }

    // 构建 assets：从 writtenFiles 中提取非适配器文件
    const assets = writtenFiles
      .filter((f) => !f.path.startsWith('.cursor/') && !f.path.startsWith('.claude/') && !f.path.startsWith('.codex/'))
      .map((f) => ({
        assetId: f.path.replace(/\//g, '-').replace(/^-|-$/g, ''),
        assetType: guessAssetType(f.path),
        version: '0.1.0',
        source: 'local',
        checksum: createContentChecksum(rootDir, f.path),
        lockedAt: now,
        generatedFiles: [f.path],
      }));

    const doc = {
      schemaVersion: '1.0.0',
      lockfileVersion: '0.1.0',
      projectId: context.projectId || '',
      workspaceId: context.workspaceId || '',
      lockedAt: now,
      hub: {
        url: plan.hub?.url || '',
      },
      manifest: manifest ? {
        slug: manifest.slug,
        version: manifest.version || '1.0.0',
        checksum: manifest.checksum || createChecksum(`${manifest.slug}@${manifest.version || '1.0.0'}`),
        installedAt: existing?.manifest?.installedAt || now,
      } : null,
      assets,
      adapterOutputs,
      generatedFiles: writtenFiles.map((f) => f.path),
      overlays: [],
      sharedContracts: [],
    };

    writeJson(filePath, doc);
    return {
      path: '.ai-spec/ai-spec.lock.json',
      fullPath: filePath,
      action: existing ? 'update' : 'create',
      data: doc,
    };
  }
}

function createContentChecksum(rootDir, relativePath) {
  const fullPath = path.join(rootDir, relativePath);
  if (fs.existsSync(fullPath) && fs.statSync(fullPath).isFile()) {
    const content = fs.readFileSync(fullPath, 'utf8');
    return createChecksum(content);
  }
  // 目录或不存在的文件回退到路径 hash
  return createChecksum(relativePath);
}

function guessAssetType(filePath) {
  if (filePath.startsWith('.agents/rules/')) return 'rule';
  if (filePath.startsWith('.agents/skills/')) return 'skill';
  if (filePath.startsWith('.agents/roles/')) return 'agentProfile';
  if (filePath.startsWith('.agents/commands/')) return 'command';
  if (filePath.startsWith('.harness/')) return 'hook';
  if (filePath.startsWith('.memory/')) return 'memory';
  if (filePath.startsWith('.ai-spec/')) return 'config';
  return 'other';
}

module.exports = {
  LockFileWriter,
};
