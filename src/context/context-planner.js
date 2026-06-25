const {
  DEFAULT_STAGE_LOAD_RULES,
  assertValidStage,
  createIssue,
} = require('./types');

const REGISTRY_GROUP_KIND = {
  rules: 'rule',
  skills: 'skill',
  agentProfiles: 'agent-profile',
  flows: 'flow',
  roles: 'role',
};

function cloneRule(rule) {
  return {
    stage: rule.stage,
    loadKinds: Array.isArray(rule.loadKinds) ? [...rule.loadKinds] : [],
    requiredAgents: Array.isArray(rule.requiredAgents) ? [...rule.requiredAgents] : [],
    maxAssets: Number.isFinite(rule.maxAssets) && rule.maxAssets > 0 ? rule.maxAssets : 1,
  };
}

function getDefaultStageRule(stage) {
  const rule = DEFAULT_STAGE_LOAD_RULES.find((item) => item.stage === stage);
  return cloneRule(rule || DEFAULT_STAGE_LOAD_RULES[0]);
}

function resolveStageRule(stage, contextIndex = {}) {
  const fileRule = (contextIndex.stageLoadRules || []).find((item) => item.stage === stage);
  const baseRule = fileRule || getDefaultStageRule(stage);
  const fallback = getDefaultStageRule(stage);
  return {
    stage,
    loadKinds: Array.isArray(baseRule.loadKinds) && baseRule.loadKinds.length > 0
      ? [...baseRule.loadKinds]
      : fallback.loadKinds,
    requiredAgents: Array.isArray(baseRule.requiredAgents)
      ? [...baseRule.requiredAgents]
      : fallback.requiredAgents,
    maxAssets: Number.isFinite(baseRule.maxAssets) && baseRule.maxAssets > 0
      ? baseRule.maxAssets
      : fallback.maxAssets,
  };
}

function normalizeRegistryKind(group, item) {
  if (item.kind) return item.kind;
  if (REGISTRY_GROUP_KIND[group]) return REGISTRY_GROUP_KIND[group];
  return group.replace(/s$/, '');
}

function flattenRegistryAssets(registryIndex = {}) {
  const groups = registryIndex.assets || {};
  const result = [];
  for (const [group, items] of Object.entries(groups)) {
    if (!Array.isArray(items)) continue;
    for (const item of items) {
      result.push({
        ...item,
        kind: normalizeRegistryKind(group, item),
      });
    }
  }
  return result;
}

function matchesStageLoadWhen(asset, stage) {
  const loadWhen = asset.loadWhen;
  if (!loadWhen) return true;
  if (Array.isArray(loadWhen.exceptStages) && loadWhen.exceptStages.includes(stage)) return false;
  if (Array.isArray(loadWhen.stages)) return loadWhen.stages.includes(stage);
  if (loadWhen.stage) return loadWhen.stage === stage;
  return true;
}

function identity(asset) {
  return `${asset.kind || ''}:${asset.slug || ''}:${asset.version || ''}`;
}

class ContextPlanner {
  plan(input = {}) {
    const stage = input.stage;
    assertValidStage(stage);

    const stageLoadRule = resolveStageRule(stage, input.contextIndex || {});
    const registryAssets = flattenRegistryAssets(input.registryIndex || {});
    const warnings = [];
    const reasons = [
      `阶段 ${stage} 使用 loadKinds=${stageLoadRule.loadKinds.join(', ')}，maxAssets=${stageLoadRule.maxAssets}`,
    ];

    const selected = [];
    const selectedIds = new Set();

    for (const agentSlug of stageLoadRule.requiredAgents) {
      const agent = registryAssets.find((asset) => asset.kind === 'agent-profile' && asset.slug === agentSlug);
      if (!agent) {
        warnings.push(createIssue(
          'warning',
          'CONTEXT_REQUIRED_AGENT_MISSING',
          `阶段 ${stage} 缺少必需 Agent Profile：${agentSlug}`,
          '请执行 ai-spec-auto sync . 或检查 registry.index.json',
        ));
        continue;
      }
      selected.push({
        ...agent,
        required: true,
        requiredReason: `阶段 ${stage} 要求加载 Agent Profile ${agentSlug}`,
      });
      selectedIds.add(identity(agent));
      reasons.push(`加载 ${agentSlug}：阶段要求的 requiredAgents`);
    }

    for (const asset of registryAssets) {
      if (selected.length >= stageLoadRule.maxAssets) break;
      if (!stageLoadRule.loadKinds.includes(asset.kind)) continue;
      if (!matchesStageLoadWhen(asset, stage)) continue;
      if (selectedIds.has(identity(asset))) continue;
      selected.push({
        ...asset,
        required: asset.required === true,
        requiredReason: `kind=${asset.kind} 匹配 ${stage} 阶段加载规则`,
      });
      selectedIds.add(identity(asset));
      reasons.push(`加载 ${asset.slug || asset.checksum}：kind=${asset.kind} 匹配阶段规则`);
    }

    if (selected.length === 0) {
      warnings.push(createIssue(
        'warning',
        'CONTEXT_ASSET_NOT_MATCHED',
        `阶段 ${stage} 没有匹配资产`,
        '如需加载上下文，请先执行 sync 并确认 registry.index.json 中包含对应 kind',
      ));
    }

    return {
      stage,
      loadKinds: stageLoadRule.loadKinds,
      requiredAgents: stageLoadRule.requiredAgents,
      maxAssets: stageLoadRule.maxAssets,
      assetsToLoad: selected.slice(0, stageLoadRule.maxAssets),
      overlaysToLoad: [],
      sharedContractsToLoad: [],
      reasons,
      warnings,
      stageLoadRule,
    };
  }
}

module.exports = {
  ContextPlanner,
  flattenRegistryAssets,
  resolveStageRule,
};
