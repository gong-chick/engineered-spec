const fs = require('fs');
const path = require('path');
const { createChecksum, readJsonIfExists, toRelativePath, writeJson } = require('./json-utils');

const ASSET_SUBDIRS = ['rules', 'skills', 'roles', 'commands', 'flows', 'orchestration', 'templates'];

const MANIFEST_TO_PROFILE = Object.freeze({
  'frontend-vue-vite-standard': 'vue',
  'frontend-react-vite-standard': 'react',
  'frontend-react-standard': 'react',
  'frontend-react-nextjs-standard': 'react',
  'backend-java-springboot-standard': 'springboot',
  'backend-java-springmvc-legacy-standard': 'springboot',
  'backend-java-springcloud-standard': 'springboot',
  'backend-node-nestjs-standard': 'nestjs',
});

function scanAssets(rootDir, subdir) {
  const dirPath = path.join(rootDir, '.agents', subdir);
  if (!fs.existsSync(dirPath)) return [];
  const files = [];
  for (const entry of fs.readdirSync(dirPath, { withFileTypes: true })) {
    if (entry.isFile()) {
      const fullPath = path.join(dirPath, entry.name);
      const relativePath = toRelativePath(rootDir, fullPath);
      files.push({
        id: `${subdir}/${entry.name.replace(/\.[^.]+$/, '')}`,
        version: '0.1.0',
        path: relativePath,
      });
    }
  }
  return files;
}

class ManifestWriter {
  write(rootDir, plan, context = {}, options = {}) {
    const filePath = path.join(rootDir, '.ai-spec', 'manifest.json');
    const existing = readJsonIfExists(filePath);
    const now = options.now || new Date().toISOString();
    const manifest = plan.packages[0]?.recommendedManifest || null;

    const rules = scanAssets(rootDir, 'rules');
    const skills = scanAssets(rootDir, 'skills');
    const commands = scanAssets(rootDir, 'commands');
    const agentProfiles = scanAssets(rootDir, 'roles');

    const adapters = {
      cursor: {
        enabled: true,
        outputDir: '.cursor/rules',
      },
      claudeCode: {
        enabled: true,
        outputDir: '.claude',
      },
      codex: {
        enabled: false,
      },
    };

    const memory = {
      project: '.memory/project.md',
      conventions: '.memory/conventions.md',
    };

    const hooks = [];
    const hooksConfigPath = path.join(rootDir, '.harness', 'hooks.config.json');
    if (fs.existsSync(hooksConfigPath)) {
      hooks.push({
        id: 'hooks-config',
        path: '.harness/hooks.config.json',
      });
    }

    const profile = manifest ? MANIFEST_TO_PROFILE[manifest.slug] || null : null;
    const profiles = profile ? [profile] : [];

    const doc = {
      version: '0.1.0',
      projectId: context.projectId || '',
      manifestSlug: manifest ? manifest.slug : null,
      manifestVersion: manifest ? manifest.version || '1.0.0' : null,
      profiles,
      profile: profiles[0] || null,
      rules,
      skills,
      agentProfiles,
      commands,
      hooks,
      adapters,
      memory,
      specs: [],
      generatedAt: now,
    };

    // 计算 checksum（排除 checksum 字段本身）
    const checksumInput = JSON.stringify({
      version: doc.version,
      projectId: doc.projectId,
      manifestSlug: doc.manifestSlug,
      rules: doc.rules,
      skills: doc.skills,
      agentProfiles: doc.agentProfiles,
      commands: doc.commands,
      hooks: doc.hooks,
      adapters: doc.adapters,
      memory: doc.memory,
      specs: doc.specs,
    });
    doc.checksum = createChecksum(checksumInput);

    writeJson(filePath, doc);
    return {
      path: '.ai-spec/manifest.json',
      fullPath: filePath,
      action: existing ? 'update' : 'create',
      data: doc,
    };
  }
}

module.exports = {
  ManifestWriter,
  scanAssets,
};
