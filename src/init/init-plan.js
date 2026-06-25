const fs = require('fs');
const path = require('path');
const { PROJECT_TYPES } = require('../scanner/types');
const { ManifestInstaller } = require('./manifest-installer');
const { FactExtractor } = require('../scanner/facts/fact-extractor');
const { DetectorRegistry } = require('../scanner/detectors/detector-registry');
const { INIT_FILE_ACTIONS, MANIFEST_CONFIDENCE, PROJECT_KINDS } = require('./types');

const WORKSPACE_TYPES = new Set([
  PROJECT_TYPES.NODE_WORKSPACE,
  PROJECT_TYPES.PNPM_WORKSPACE,
  PROJECT_TYPES.PACKAGE_JSON_WORKSPACE,
  PROJECT_TYPES.LERNA_WORKSPACE,
  PROJECT_TYPES.TURBO_WORKSPACE,
  PROJECT_TYPES.NX_WORKSPACE,
  PROJECT_TYPES.MAVEN_MULTI_MODULE,
  PROJECT_TYPES.GRADLE_MULTI_MODULE,
  PROJECT_TYPES.MULTI_PROJECT_WORKSPACE,
]);

function detectDomain(primary, tags) {
  const values = new Set([...(primary?.tags || []), ...(tags || [])]);
  if (values.has('frontend')) return 'frontend';
  if (values.has('backend')) return 'backend';
  return 'unknown';
}

function buildTechProfile(pkg) {
  const primary = pkg.primary || null;
  return {
    domain: detectDomain(primary, pkg.tags),
    language: primary?.language || [],
    frameworks: primary?.framework ? [primary.framework] : [],
    buildTool: primary?.buildTool || '',
    confidence: primary?.confidence || 0,
    reasons: primary?.reasons || pkg.reasons || [],
  };
}

function readPackageJson(rootDir, pkg) {
  const packageJsonPath = path.join(rootDir, pkg.path || '.', 'package.json');
  if (!fs.existsSync(packageJsonPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  } catch {
    return null;
  }
}

function hasFrontendBusinessEntry(rootDir, pkg) {
  const packageDir = path.join(rootDir, pkg.path || '.');
  return [
    'src/app',
    'src/pages',
    'vite.config.js',
    'vite.config.ts',
    'next.config.js',
    'next.config.mjs',
    'next.config.ts',
    'src/index.tsx',
    'src/index.jsx',
    'config/webpack.config.js',
    'webpack.config.js',
  ].some((relativePath) => fs.existsSync(path.join(packageDir, relativePath)));
}

function hasCliName(name) {
  return /\b(cli|spec|tool|auto)\b/i.test(String(name || '').replace(/[@/_-]+/g, ' '));
}

function detectProjectKind(rootDir, pkg) {
  const packageJson = readPackageJson(rootDir, pkg);
  const packageDir = path.join(rootDir, pkg.path || '.');
  if (packageJson?.bin || fs.existsSync(path.join(packageDir, 'bin/cli.js'))) {
    return PROJECT_KINDS.CLI_TOOL;
  }

  const primary = pkg.primary || null;
  if (hasCliName(packageJson?.name || pkg.name) && (!primary || !hasFrontendBusinessEntry(rootDir, pkg))) {
    return PROJECT_KINDS.CLI_TOOL;
  }

  if (!primary) {
    if (packageJson?.main || packageJson?.module || packageJson?.exports || packageJson?.types) {
      return PROJECT_KINDS.LIBRARY;
    }
    return PROJECT_KINDS.UNKNOWN;
  }

  if ((primary.tags || []).includes('frontend') && !hasFrontendBusinessEntry(rootDir, pkg)) {
    return PROJECT_KINDS.LIBRARY;
  }

  return PROJECT_KINDS.APPLICATION;
}

function buildRecommendationWarnings(pkg, projectKind, recommendedManifest) {
  const warnings = [];
  if (!pkg.primary) {
    warnings.push('未识别到明确技术栈，不自动推荐 Manifest');
  }
  if (projectKind === PROJECT_KINDS.CLI_TOOL) {
    warnings.push('当前项目被识别为 cli-tool，不自动推荐前端业务 Manifest');
  }
  if (pkg.primary && (pkg.primary.confidence || 0) < MANIFEST_CONFIDENCE.REQUIRE_CONFIRM) {
    warnings.push('技术栈识别置信度低于 60，不自动推荐 Manifest');
  }
  for (const warning of recommendedManifest?.warnings || []) {
    warnings.push(warning);
  }
  return warnings;
}

function findHubRecommendation(pkg, recommendations = []) {
  return recommendations.find((item) => item.packageId === pkg.packageId || item.packageId === pkg.path) || null;
}

function fileAction(rootDir, relativePath, enabled = true) {
  if (!enabled) return INIT_FILE_ACTIONS.SKIP;
  return fs.existsSync(path.join(rootDir, relativePath)) ? INIT_FILE_ACTIONS.UPDATE : INIT_FILE_ACTIONS.CREATE;
}

function buildFilesToWrite(rootDir, scanResult, workspaceRoot = false) {
  const isWorkspace = !workspaceRoot && (WORKSPACE_TYPES.has(scanResult.workspace.type) || scanResult.packages.length > 1);
  return [
    {
      path: '.ai-spec/project.json',
      action: fileAction(rootDir, '.ai-spec/project.json'),
      description: '写入项目画像与 Manifest 推荐结果',
      requireConfirm: true,
    },
    {
      path: '.ai-spec/policy.json',
      action: fileAction(rootDir, '.ai-spec/policy.json'),
      description: '写入本地执行、分支与隐私策略',
      requireConfirm: true,
    },
    {
      path: '.ai-spec/workspace.json',
      action: fileAction(rootDir, '.ai-spec/workspace.json', isWorkspace),
      description: '写入多包工作区拓扑',
      requireConfirm: true,
    },
    {
      path: '.ai-spec/ai-spec.lock.json',
      action: fileAction(rootDir, '.ai-spec/ai-spec.lock.json'),
      description: '写入 Manifest 与资产锁定索引',
      requireConfirm: true,
    },
    {
      path: '.agents/registry.index.json',
      action: fileAction(rootDir, '.agents/registry.index.json'),
      description: '写入本地 Registry 索引',
      requireConfirm: true,
    },
    {
      path: '.ai-spec/context-index.json',
      action: fileAction(rootDir, '.ai-spec/context-index.json'),
      description: '写入渐进式上下文索引',
      requireConfirm: true,
    },
    {
      path: '.codex/instructions.md',
      action: fileAction(rootDir, '.codex/instructions.md'),
      description: '注入 Codex 指针文件',
      requireConfirm: true,
    },
    {
      path: '.cursor/rules/ai-spec-auto.mdc',
      action: fileAction(rootDir, '.cursor/rules/ai-spec-auto.mdc'),
      description: '注入 Cursor 指针文件',
      requireConfirm: true,
    },
    {
      path: 'CLAUDE.md',
      action: fileAction(rootDir, 'CLAUDE.md'),
      description: '注入 Claude Code 指针文件',
      requireConfirm: true,
    },
    {
      path: 'memory.md',
      action: fileAction(rootDir, 'memory.md'),
      description: '注入本地记忆入口指针',
      requireConfirm: true,
    },
  ];
}

class InitPlanBuilder {
  constructor(options = {}) {
    this.manifestInstaller = options.manifestInstaller || new ManifestInstaller();
  }

  build(scanResult, options = {}) {
    const rootDir = scanResult.workspace.rootDir;
    let scanPackages = scanResult.packages;
    if (options.workspaceRoot) {
      const rootPkg = scanPackages.find((pkg) => pkg.path === '.');
      if (rootPkg) {
        scanPackages = [rootPkg];
      } else if (fs.existsSync(path.join(rootDir, 'package.json'))) {
        const factExtractor = options.factExtractor || new FactExtractor();
        const detectorRegistry = options.detectorRegistry || new DetectorRegistry();
        const facts = factExtractor.extract({
          rootDir,
          relativePath: '.',
          workspaceRoot: rootDir,
        });
        const detection = detectorRegistry.detect(facts);
        const primary = detection.primary || null;
        scanPackages = [{
          packageId: '.',
          name: facts.name || path.basename(rootDir),
          path: '.',
          primary,
          tags: detection.tags || [],
          reasons: primary?.reasons || ['--workspace-root 模式，仅初始化根目录'],
          candidates: detection.candidates || [],
        }];
      } else {
        scanPackages = [];
      }
    }
    const packages = scanPackages.map((pkg) => {
      const projectKind = detectProjectKind(rootDir, pkg);
      const recommendationInput = {
        ...pkg,
        projectKind,
      };
      const hubRecommendation = findHubRecommendation(pkg, options.hubRecommendations);
      const recommendedManifest = hubRecommendation?.manifest
        ? {
          slug: hubRecommendation.manifest.slug,
          version: hubRecommendation.manifest.version || '1.0.0',
          score: hubRecommendation.score || 0,
          reasons: hubRecommendation.reasons || ['Hub 推荐 Manifest'],
          warnings: hubRecommendation.requiresConfirmation ? ['Hub 推荐要求人工确认'] : [],
          requiresConfirmation: hubRecommendation.requiresConfirmation === true,
        }
        : this.manifestInstaller.recommendForPackage(recommendationInput, {
          manualManifestSlug: options.manualManifestSlug,
        });
      const warnings = buildRecommendationWarnings(pkg, projectKind, recommendedManifest);
      return {
        packageId: pkg.packageId,
        name: pkg.name,
        path: pkg.path,
        projectKind,
        techProfile: buildTechProfile(pkg),
        primary: pkg.primary || null,
        recommendedManifest: recommendedManifest ? {
          slug: recommendedManifest.slug,
          version: recommendedManifest.version,
          score: recommendedManifest.score,
          reasons: recommendedManifest.reasons,
          requiresConfirmation: recommendedManifest.requiresConfirmation,
          checksum: recommendedManifest.checksum,
        } : null,
        recommendationSource: recommendedManifest ? (options.recommendationSource || 'local') : 'none',
        candidates: pkg.candidates || [],
        warnings,
      };
    });

    const warnings = [];
    if (packages.length === 0) {
      warnings.push('未发现可初始化的项目包');
    }
    if (packages.some((pkg) => pkg.techProfile.confidence < 60)) {
      warnings.push('存在低置信度技术栈识别结果，建议人工确认 Manifest');
    }
    for (const pkg of packages) {
      for (const warning of pkg.warnings || []) {
        if (!warnings.includes(warning)) warnings.push(warning);
      }
    }

    return {
      workspace: scanResult.workspace,
      packages,
      filesToWrite: buildFilesToWrite(rootDir, scanResult, options.workspaceRoot),
      warnings,
      requiresConfirmation: true,
      recommendationSource: options.recommendationSource || 'local',
      hub: options.hubConfig || null,
    };
  }
}

module.exports = {
  InitPlanBuilder,
  WORKSPACE_TYPES,
  buildTechProfile,
};
