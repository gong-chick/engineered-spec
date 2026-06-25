const fs = require('fs');
const path = require('path');
const { GlobalCache } = require('../cache/global-cache');
const { getProjectFiles, readJsonFile, readProjectState } = require('../project/project-files');
const { ContextBudget } = require('./context-budget');
const { ContextLoader, hasContentField } = require('./context-loader');
const { ContextPlanner } = require('./context-planner');
const {
  CONTEXT_PRIVACY_FLAGS,
  CONTEXT_SCHEMA_VERSION,
  assertValidStage,
  createIssue,
  normalizeContextOptions,
  normalizeTokenBudget,
} = require('./types');

function readRequiredState(rootDir) {
  const state = readProjectState(rootDir);
  const required = [
    ['project', '.ai-spec/project.json'],
    ['lock', '.ai-spec/ai-spec.lock.json'],
    ['registry', '.agents/registry.index.json'],
    ['contextIndex', '.ai-spec/context-index.json'],
  ];
  for (const [key, label] of required) {
    if (!state[key]) {
      throw new Error(`缺少 ${label}，无法构建 ContextBundle`);
    }
  }
  return state;
}

function sanitizeProject(project = {}) {
  return {
    projectId: project.projectId || '',
    projectName: project.projectName || '',
    projectType: project.projectType || '',
    techProfile: project.techProfile || {},
    manifest: project.manifest || {},
  };
}

function readWorkspace(rootDir) {
  const workspacePath = path.join(rootDir, '.ai-spec/workspace.json');
  if (!fs.existsSync(workspacePath)) return null;
  return readJsonFile(workspacePath);
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function redactKnownAbsolutePaths(text, rootDir, cacheRootDir) {
  let result = String(text || '');
  for (const [absolutePath, replacement] of [
    [rootDir, '.'],
    [cacheRootDir, '~/.ai-spec-auto'],
  ]) {
    if (absolutePath) {
      result = result.replace(new RegExp(escapeRegExp(absolutePath), 'g'), replacement);
    }
  }
  return result;
}

function sanitizeRelativeValue(value, rootDir) {
  if (Array.isArray(value)) {
    return value.map((item) => sanitizeRelativeValue(item, rootDir));
  }
  if (value && typeof value === 'object') {
    return Object.fromEntries(Object.entries(value).map(([key, item]) => [key, sanitizeRelativeValue(item, rootDir)]));
  }
  if (typeof value === 'string' && path.isAbsolute(value)) {
    const relative = path.relative(rootDir, value);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      return relative || '.';
    }
    return '<absolute-path-redacted>';
  }
  return value;
}

function assetIdentity(asset) {
  return `${asset.kind || ''}:${asset.slug || ''}:${asset.version || ''}`;
}

function createLockAssetMap(lockFile = {}) {
  const result = new Map();
  const lockAssets = [
    ...(Array.isArray(lockFile.assets) ? lockFile.assets : []),
    ...(Array.isArray(lockFile.agentProfiles) ? lockFile.agentProfiles.map((item) => ({ ...item, kind: item.kind || 'agent-profile' })) : []),
  ];
  for (const asset of lockAssets) {
    const kind = asset.kind || 'asset';
    result.set(assetIdentity({ ...asset, kind }), { ...asset, kind });
  }
  return result;
}

function applyLockToPlan(plan, lockFile) {
  const lockByIdentity = createLockAssetMap(lockFile);
  const warnings = [];
  if (lockByIdentity.size === 0) {
    warnings.push(createIssue(
      'warning',
      'CONTEXT_LOCK_ASSETS_EMPTY',
      '当前 lock.assets 为空，阶段没有匹配资产，ContextBuilder 不加载 registry 中的资产正文',
      '请先执行 ai-spec-auto sync . 或重新生成 lock',
    ));
    return {
      assetsToLoad: [],
      warnings,
    };
  }

  const assetsToLoad = [];
  for (const asset of plan.assetsToLoad) {
    const lockAsset = lockByIdentity.get(assetIdentity(asset));
    if (!lockAsset) {
      warnings.push(createIssue(
        'warning',
        'CONTEXT_REGISTRY_ASSET_NOT_IN_LOCK',
        `registry 资产未出现在 lock 中，已跳过：${asset.kind}:${asset.slug || asset.checksum}`,
        '请执行 ai-spec-auto sync . 保持 lock 与 registry 一致',
      ));
      continue;
    }
    if (lockAsset.checksum !== asset.checksum) {
      warnings.push(createIssue(
        'warning',
        'CONTEXT_REGISTRY_LOCK_CHECKSUM_MISMATCH',
        `registry 与 lock checksum 不一致，已跳过：${asset.kind}:${asset.slug || asset.checksum}`,
        '请执行 ai-spec-auto sync . 修复索引',
      ));
      continue;
    }
    assetsToLoad.push({
      ...asset,
      checksum: lockAsset.checksum,
      version: lockAsset.version || asset.version || '',
    });
  }

  if (assetsToLoad.length === 0) {
    warnings.push(createIssue(
      'warning',
      'CONTEXT_ASSET_NOT_MATCHED',
      `阶段 ${plan.stage} 没有匹配资产`,
      '请确认 context-index 阶段规则、registry 和 lock 是否一致',
    ));
  }

  return {
    assetsToLoad,
    warnings,
  };
}

function mergeIssueArrays(...groups) {
  return groups.flat().filter(Boolean);
}

function sanitizeLoadedAssets(loadedAssets, rootDir, cacheRootDir) {
  return loadedAssets.map((asset) => {
    const content = redactKnownAbsolutePaths(asset.content || '', rootDir, cacheRootDir);
    return {
      ...asset,
      content,
      contentLength: content.length,
      tokenEstimate: undefined,
    };
  });
}

class ContextBuilder {
  constructor(options = {}) {
    this.globalCache = options.globalCache || new GlobalCache(options.cache || {});
    this.contextPlanner = options.contextPlanner || new ContextPlanner();
    this.contextLoader = options.contextLoader || new ContextLoader({ globalCache: this.globalCache });
  }

  async buildContext(input = {}) {
    const rootDir = path.resolve(input.rootDir || process.cwd());
    const stage = input.stage || 'planning';
    assertValidStage(stage);
    const options = normalizeContextOptions(input.options || {});
    const tokenBudget = normalizeTokenBudget(input.tokenBudget || {});

    if (input.cache && input.cache.rootDir) {
      this.globalCache = new GlobalCache(input.cache);
      this.contextLoader = new ContextLoader({ globalCache: this.globalCache });
    }

    const state = readRequiredState(rootDir);
    const projectFiles = getProjectFiles(rootDir);
    if (hasContentField(state.registry)) {
      throw new Error('registry.index.json 不允许包含完整 content，ContextBuilder 已阻断加载');
    }
    const workspace = fs.existsSync(path.join(rootDir, '.ai-spec/workspace.json'))
      ? sanitizeRelativeValue(readWorkspace(rootDir), rootDir)
      : null;
    const warnings = [];
    const errors = [];

    if (state.policy?.privacyPolicy) {
      for (const field of ['uploadSourceCode', 'uploadRawPrompt', 'uploadRawResponse', 'uploadAbsolutePath', 'uploadFileContent']) {
        if (state.policy.privacyPolicy[field] === true) {
          warnings.push(createIssue(
            'warning',
            'CONTEXT_PRIVACY_POLICY_WARNING',
            `隐私配置 ${field} 为 true，ContextBundle 仍会强制关闭对应内容`,
            '请将该字段设置为 false',
          ));
        }
      }
    }

    const plan = this.contextPlanner.plan({
      stage,
      contextIndex: state.contextIndex,
      registryIndex: state.registry,
      lockFile: state.lock,
      targetPackages: input.targetPackages || [],
    });
    const lockedPlan = applyLockToPlan(plan, state.lock);

    let loaderResult = { loadedAssets: [], warnings: [], errors: [] };
    if (lockedPlan.assetsToLoad.length > 0) {
      loaderResult = this.contextLoader.loadAssets(lockedPlan.assetsToLoad, {
        allowMissingOptionalAssets: options.allowMissingOptionalAssets,
      });
    }

    const loadedAssets = sanitizeLoadedAssets(loaderResult.loadedAssets, rootDir, this.globalCache.rootDir);
    const budget = new ContextBudget(tokenBudget);
    const budgetResult = budget.evaluate(loadedAssets, tokenBudget);

    return {
      schemaVersion: CONTEXT_SCHEMA_VERSION,
      stage,
      project: sanitizeProject(state.project),
      workspace,
      loadedAssets,
      overlays: [],
      sharedContracts: Array.isArray(state.contextIndex.sharedContracts) ? state.contextIndex.sharedContracts : [],
      stageLoadRule: plan.stageLoadRule,
      tokenEstimate: budgetResult.tokenEstimate,
      privacy: { ...CONTEXT_PRIVACY_FLAGS },
      warnings: mergeIssueArrays(
        warnings,
        plan.warnings || [],
        lockedPlan.warnings,
        loaderResult.warnings,
        budgetResult.warnings,
      ),
      errors: mergeIssueArrays(
        errors,
        loaderResult.errors,
        budgetResult.errors,
      ),
      ...(options.explain ? {
        explain: {
          reasons: plan.reasons,
          files: {
            project: path.relative(rootDir, projectFiles.project),
            lock: path.relative(rootDir, projectFiles.lock),
            registry: path.relative(rootDir, projectFiles.registry),
            contextIndex: path.relative(rootDir, projectFiles.contextIndex),
          },
        },
      } : {}),
    };
  }
}

async function buildContext(input) {
  const options = input && input.cache ? { cache: input.cache } : {};
  return new ContextBuilder(options).buildContext(input || {});
}

module.exports = {
  ContextBuilder,
  applyLockToPlan,
  buildContext,
};
