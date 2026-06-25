const path = require('path');
const { readJsonIfExists, writeJson } = require('../../project/json-utils');
const { IDE_SCHEMA_VERSION, PROFILES, getPriorityAssets } = require('../ide-types');

class IdeRegistryBuilder {
  /**
   * 根据项目配置生成 IDE 消费索引
   * @param {string} rootDir - 项目根目录
   * @param {{ profile?: string, ide?: string[] }} options
   * @returns {{ registry: object, warnings: string[] }}
   */
  build(rootDir, options = {}) {
    const projectConfig = readJsonIfExists(path.join(rootDir, '.ai-spec', 'project.json'));
    const workspaceConfig = readJsonIfExists(path.join(rootDir, '.ai-spec', 'workspace.json'));
    const lockFile = readJsonIfExists(path.join(rootDir, '.ai-spec', 'ai-spec.lock.json'));
    const assetRegistry = readJsonIfExists(path.join(rootDir, '.agents', 'registry.index.json'));

    const warnings = [];
    if (!projectConfig) {
      warnings.push('未找到 .ai-spec/project.json，请先运行 init --recommend --yes');
    }
    if (!lockFile) {
      warnings.push('未找到 .ai-spec/ai-spec.lock.json');
    }
    if (!assetRegistry) {
      warnings.push('未找到 .agents/registry.index.json');
    }

    // 推断 profile
    const profile = this._resolveProfile(projectConfig, options.profile);

    // 从 projectConfig 推断语言和框架信息
    const language = projectConfig?.language || (profile === PROFILES.VUE ? ['TypeScript', 'JavaScript'] : ['TypeScript', 'JavaScript']);
    const framework = profile === PROFILES.VUE ? 'Vue' : profile === PROFILES.REACT ? 'React' : '';

    // 推断包管理器
    const packageManager = workspaceConfig?.packageManager || 'pnpm';

    const priorityAssets = getPriorityAssets(profile);

    const registry = {
      schemaVersion: IDE_SCHEMA_VERSION,
      generatedBy: 'ai-spec-auto',
      updatedAt: new Date().toISOString(),
      project: {
        profile,
        framework,
        language,
        packageManager,
      },
      ide: {
        enabled: options.ide || ['cursor', 'claude'],
        linkMode: options.linkMode || 'auto',
        anchors: {
          agentsMd: options.writeAgentAnchor !== false,
          claudeMd: options.writeAgentAnchor !== false,
          memoryMd: options.writeMemoryAnchor !== false,
        },
      },
      indexes: {
        assetRegistry: '.agents/registry.index.json',
        lockFile: '.ai-spec/ai-spec.lock.json',
        contextIndex: '.ai-spec/context-index.json',
        projectConfig: '.ai-spec/project.json',
        workspaceConfig: '.ai-spec/workspace.json',
        policyConfig: '.ai-spec/policy.json',
      },
      priorityAssets,
      privacy: {
        sourceCodeIncluded: false,
        rawPromptIncluded: false,
        rawResponseIncluded: false,
        absolutePathIncluded: false,
      },
    };

    return { registry, warnings };
  }

  /**
   * 写入 ide-registry.json 到目标项目
   * @param {string} rootDir
   * @param {{ dryRun?: boolean, profile?: string, ide?: string[] }} options
   * @returns {{ path: string, action: string, data: object }}
   */
  write(rootDir, options = {}) {
    const { registry, warnings } = this.build(rootDir, options);
    const filePath = path.join(rootDir, '.agents', 'registry', 'ide-registry.json');
    const { readJsonIfExists: readJson } = require('../../project/json-utils');
    const existing = readJson(filePath);
    const action = existing ? 'update' : 'create';

    if (!options.dryRun) {
      writeJson(filePath, registry);
    }

    return {
      path: '.agents/registry/ide-registry.json',
      action,
      data: registry,
      warnings,
    };
  }

  /**
   * 写入 ide-integration.json 到目标项目
   * @param {string} rootDir
   * @param {{ dryRun?: boolean, ide?: string[], linkMode?: string, profile?: string }} options
   * @returns {{ path: string, action: string, data: object }}
   */
  writeIntegrationConfig(rootDir, options = {}) {
    const filePath = path.join(rootDir, '.ai-spec', 'ide-integration.json');
    const existing = readJsonIfExists(filePath);

    const config = {
      schemaVersion: IDE_SCHEMA_VERSION,
      profile: this._resolveProfile(readJsonIfExists(path.join(rootDir, '.ai-spec', 'project.json')), options.profile),
      ide: {
        cursor: {
          enabled: !options.ide || options.ide.includes('cursor'),
          rulesFile: '.cursor/rules/ai-spec-auto.mdc',
          commandsDir: '.cursor/commands',
        },
        claude: {
          enabled: !options.ide || options.ide.includes('claude'),
          entryFile: '.claude/ai-spec-auto.md',
          commandsDir: '.claude/commands',
        },
      },
      memoryAnchors: {
        'AGENTS.md': options.writeAgentAnchor !== false,
        'CLAUDE.md': options.writeAgentAnchor !== false,
        'memory.md': options.writeMemoryAnchor !== false,
      },
      linkMode: options.linkMode || 'auto',
      lastSyncAt: new Date().toISOString(),
    };

    if (!options.dryRun) {
      writeJson(filePath, config);
    }

    return {
      path: '.ai-spec/ide-integration.json',
      action: existing ? 'update' : 'create',
      data: config,
    };
  }

  _resolveProfile(projectConfig, explicitProfile) {
    if (explicitProfile && explicitProfile !== PROFILES.AUTO) {
      return explicitProfile;
    }
    if (projectConfig?.manifest?.slug) {
      const slug = projectConfig.manifest.slug.toLowerCase();
      if (slug.includes('vue')) return PROFILES.VUE;
      if (slug.includes('react') || slug.includes('next')) return PROFILES.REACT;
    }
    return PROFILES.AUTO;
  }
}

module.exports = {
  IdeRegistryBuilder,
};
