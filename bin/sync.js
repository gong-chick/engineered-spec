#!/usr/bin/env node
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  formatSupportedProfiles,
  getProfileEntries,
  readProfilesRegistry,
  resolveProfileId,
} = require('./profile-registry');
const {
  normalizeSuperpowersManifest,
  buildSuperpowersState,
  writeSuperpowersState,
  shouldExposeSkillToIde,
  SUPERPOWERS_STATE_REL_PATH,
  upsertManagedAgentsBlock,
} = require('./superpowers');
const {
  normalizeVisualBridgeManifest,
  buildVisualBridgeState,
  writeVisualBridgeState,
  readVisualBridgeState,
  VISUAL_BRIDGE_STATE_REL_PATH,
} = require('./visual-bridge-config');
const { readRenderedCommandTemplate } = require('./command-template-renderer');

const SUPPORTED_IDES = ['cursor', 'claude', 'codex', 'opencode', 'trae', 'qoder'];
const DEFAULT_IDES = ['cursor', 'claude'];
const ALL_IDES = [...SUPPORTED_IDES];
const DEFAULT_REMOTE_MANIFEST_TIMEOUT_MS = 15000;

function printUsage(profilesRegistry = null) {
  const profileHint = profilesRegistry
    ? formatSupportedProfiles(profilesRegistry)
    : 'see .agents/registry/profiles.json';
  console.log(`Usage:
  ai-spec-auto sync [target] --manifest <manifest.json|url> [options]

Options:
  --manifest <file|url>   Local manifest JSON file path or remote manifest URL
  --profile <profile>     Override profile from manifest (${profileHint})
  --ide <preset>          Override ides (default | all | cursor | claude | codex | qoder | comma-separated)
  --superpowers           Force enable superpowers（超能力桥接）
  --no-superpowers        Force disable superpowers（超能力桥接）
  --hub-origin <origin>   Hub origin for supplement fetch when manifest is local
  --no-hub-fetch          Disable Hub supplement fetch for missing assets
  --out <file>            Write the normalized manifest to a file
  --json                  Print JSON output only
  --dry-run               Resolve only, do not write files
  --force                 Reserved for future conflict handling
  --help                  Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    target: '.',
    json: false,
    pretty: true,
    dryRun: false,
    force: false,
    hubFetch: true,
    out: '',
  };

  while (args.length > 0) {
    const arg = args.shift();
    if (!arg.startsWith('-') && options.target === '.') {
      options.target = arg;
      continue;
    }

    switch (arg) {
      case '--manifest':
        options.manifest = requireArg(arg, args);
        break;
      case '--profile':
        options.profile = requireArg(arg, args);
        break;
      case '--ide':
        options.ide = requireArg(arg, args);
        break;
      case '--superpowers':
        options.superpowers = true;
        break;
      case '--no-superpowers':
        options.superpowers = false;
        break;
      case '--json':
        options.json = true;
        options.pretty = false;
        break;
      case '--hub-origin':
        options.hubOrigin = requireArg(arg, args);
        break;
      case '--no-hub-fetch':
        options.hubFetch = false;
        break;
      case '--out':
        options.out = requireArg(arg, args);
        break;
      case '--dry-run':
        options.dryRun = true;
        break;
      case '--force':
        options.force = true;
        break;
      case '--pretty':
        options.pretty = true;
        options.json = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return options;
}

function requireArg(flag, args) {
  const next = args.shift();
  if (!next || next.startsWith('--')) {
    throw new Error(`选项 ${flag} 需要一个参数值`);
  }
  return next;
}

function isHttpUrl(value) {
  return /^https?:\/\//i.test(String(value || ''));
}

function getSourceDir() {
  if (process.env.ENGINEERED_SPEC_LOCAL) {
    return process.env.ENGINEERED_SPEC_LOCAL;
  }
  return path.join(__dirname, '..');
}

function toPosix(value) {
  return value.split(path.sep).join('/');
}

function targetRel(targetDir, filePath) {
  return toPosix(path.relative(targetDir, filePath));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function readRegistryJson(sourceDir, fileName, rootKey) {
  const filePath = path.join(sourceDir, '.agents/registry', fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Registry file not found: ${filePath}`);
  }
  const data = readJsonFile(filePath, `Registry ${fileName}`);
  if (!data || typeof data !== 'object' || !data[rootKey] || typeof data[rootKey] !== 'object') {
    throw new Error(`Registry ${fileName} is missing root key "${rootKey}"`);
  }
  return data[rootKey];
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item).trim()).filter(Boolean))];
  }
  return [...new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean))];
}

function normalizeIdes(value) {
  const raw = typeof value === 'string' ? value.trim() : value;
  if (!raw || (Array.isArray(raw) && raw.length === 0)) {
    return [...DEFAULT_IDES];
  }
  if (raw === 'default') {
    return [...DEFAULT_IDES];
  }
  if (raw === 'all') {
    return [...ALL_IDES];
  }

  const items = normalizeList(raw);
  const unknown = items.filter((item) => !SUPPORTED_IDES.includes(item));
  if (unknown.length > 0) {
    throw new Error(`Unsupported ides: ${unknown.join(', ')}`);
  }
  return items;
}

function parseLocalPreferences(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return null;
  }
  if (!Object.prototype.hasOwnProperty.call(value, 'project_init')) {
    return null;
  }
  const projectInit = value.project_init;
  if (!projectInit || typeof projectInit !== 'object' || Array.isArray(projectInit)) {
    return { project_init: { custom_rules: [] } };
  }
  return {
    project_init: {
      custom_rules: normalizeList(projectInit.custom_rules),
    },
  };
}

function walkFiles(rootDir, predicate) {
  const results = [];
  if (!fs.existsSync(rootDir)) {
    return results;
  }
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === '.DS_Store') {
        continue;
      }
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
        continue;
      }
      if (!predicate || predicate(fullPath, entry)) {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
}

function readSkillCatalog(sourceDir, metadataMap = new Map()) {
  const skillRegistry = readRegistryJson(sourceDir, 'skills.json', 'skills');
  const profilesRegistry = readProfilesRegistry(sourceDir);
  const catalog = {
    common: new Map(),
    profiles: Object.fromEntries(
      Object.keys(getProfileEntries(profilesRegistry)).map((profileId) => [profileId, new Map()])
    ),
    domains: new Map(),
  };
  const profileDirMap = Object.entries(getProfileEntries(profilesRegistry)).map(([profileId, entry]) => ({
    profileId,
    skillsDir: String(entry?.skills_dir || '').trim(),
  }));

  const skillsRoot = path.join(sourceDir, '.agents/skills');
  const skillFiles = walkFiles(skillsRoot, (filePath) => filePath.endsWith('/SKILL.md'));
  for (const filePath of skillFiles) {
    const rel = toPosix(path.relative(sourceDir, filePath));
    const dirRel = toPosix(path.dirname(rel));
    const id = path.basename(path.dirname(filePath));
    const entry = {
      id,
      sourceDirRel: dirRel,
      sourceFileRel: rel,
      domains: normalizeList(skillRegistry[id]?.domains),
      sourceRoot: sourceDir,
      sourceType: metadataMap.get(id)?.__sourceType || 'local',
      sourceRef: metadataMap.get(id)?.__sourceRef || `local://${dirRel}`,
      sourceOrigin: metadataMap.get(id)?.__sourceOrigin || null,
      version: metadataMap.get(id)?.__version || 'workspace',
      hubSlug: metadataMap.get(id)?.__hubSlug || null,
    };

    if (rel.startsWith('.agents/skills/common/')) {
      catalog.common.set(id, entry);
    } else if (rel.startsWith('.agents/skills/domains/')) {
      catalog.domains.set(id, entry);
    } else {
      const matchedProfile = profileDirMap.find((item) => item.skillsDir && rel.startsWith(`${item.skillsDir}/`));
      if (matchedProfile) {
        catalog.profiles[matchedProfile.profileId].set(id, entry);
      }
    }
  }

  return catalog;
}

function loadSyncRegistry(sourceDir) {
  const roles = readJsonFile(path.join(sourceDir, '.agents/registry/roles.json'), 'Registry roles.json');
  const flowsPath = path.join(sourceDir, '.agents/registry/flows.json');
  const flows = fs.existsSync(flowsPath)
    ? readJsonFile(flowsPath, 'Registry flows.json')
    : { version: 1, support_files: [], flows: {} };
  const scenarioPackagesPath = path.join(sourceDir, '.agents/registry/scenario-packages.json');
  const scenarioPackages = fs.existsSync(scenarioPackagesPath)
    ? readJsonFile(scenarioPackagesPath, 'Registry scenario-packages.json')
    : { version: 1, scenario_packages: {} };
  return {
    roles: {
      ...roles,
      __sourceRoot: sourceDir,
    },
    rules: buildRuleRegistryForSource(readRegistryJson(sourceDir, 'rules.json', 'rules'), sourceDir, new Map()),
    flows: {
      ...flows,
      __sourceRoot: sourceDir,
    },
    scenarioPackages: {
      ...scenarioPackages,
      __sourceRoot: sourceDir,
    },
  };
}

function readRoleCatalog(roleRegistry) {
  const catalog = new Map();
  for (const [id, entry] of Object.entries(roleRegistry.roles || {})) {
    if (!entry || typeof entry !== 'object' || !entry.source) {
      continue;
    }
    catalog.set(id, {
      id,
      name: entry.name || id,
      status: entry.status || 'unknown',
      domains: normalizeList(entry.domains),
      sourceRel: entry.source,
      sourceRoot: roleRegistry.__sourceRoot,
      sourceType: entry.__sourceType || 'local',
      sourceRef: entry.__sourceRef || `local://${entry.source}`,
      sourceOrigin: entry.__sourceOrigin || null,
      version: entry.__version || 'workspace',
      hubSlug: entry.__hubSlug || null,
    });
  }
  return catalog;
}

function readRuleCatalog(ruleRegistry) {
  const catalog = new Map();
  for (const [id, entry] of Object.entries(ruleRegistry || {})) {
    if (!entry || typeof entry !== 'object') {
      continue;
    }
    if (!entry.source && !entry.sourceByProfile) {
      continue;
    }
    catalog.set(id, {
      id,
      source: entry.source || null,
      sourceByProfile: entry.sourceByProfile || null,
      domains: normalizeList(entry.domains),
      sourceRoot: entry.__sourceRoot,
      sourceType: entry.__sourceType || 'local',
      sourceRef: entry.__sourceRef || (entry.source ? `local://${entry.source}` : 'local://profiled-rule'),
      sourceOrigin: entry.__sourceOrigin || null,
      version: entry.__version || 'workspace',
      hubSlug: entry.__hubSlug || null,
    });
  }
  return catalog;
}

function readFlowCatalog(flowRegistry) {
  const catalog = new Map();
  for (const [id, entry] of Object.entries(flowRegistry.flows || {})) {
    if (!entry || typeof entry !== 'object' || !entry.source) {
      continue;
    }
    catalog.set(id, {
      id,
      name: entry.name || id,
      status: entry.status || 'unknown',
      sourceRel: entry.source,
      sourceRoot: flowRegistry.__sourceRoot,
      sourceType: entry.__sourceType || 'local',
      sourceRef: entry.__sourceRef || `local://${entry.source}`,
      sourceOrigin: entry.__sourceOrigin || null,
      version: entry.__version || 'workspace',
    });
  }
  return catalog;
}

function resolveSkill(id, profile, catalog) {
  return (
    catalog.profiles[profile]?.get(id) ||
    catalog.common.get(id) ||
    catalog.domains.get(id) ||
    null
  );
}

function normalizeLegacyProfileScopedSkillId(skillId, profile, catalog, warnings) {
  const normalized = String(skillId || '').trim();
  if (!normalized) {
    return normalized;
  }

  const match = normalized.match(/^(.*?)-(react|vue)$/);
  if (!match) {
    return normalized;
  }

  const [, baseId, scopedProfile] = match;
  if (!baseId) {
    return normalized;
  }

  const resolvedBase = resolveSkill(baseId, profile, catalog);
  if (!resolvedBase) {
    return normalized;
  }

  if (scopedProfile !== profile) {
    warnings.push(`Skill id "${normalized}" uses legacy profile suffix "${scopedProfile}" but target profile is "${profile}"; normalized to "${baseId}".`);
  } else {
    warnings.push(`Skill id "${normalized}" uses legacy profile suffix; normalized to "${baseId}".`);
  }
  return baseId;
}

const LEGACY_RULE_ID_ALIASES = {
  'react-project-overview': 'project-overview',
  'vue-project-overview': 'project-overview',
  'react-project-structure': 'project-structure',
  'vue-project-structure': 'project-structure',
  'react-component-guidelines': 'component-standard',
  'vue-component-guidelines': 'component-standard',
  'react-routing-guidelines': 'route-standard',
  'vue-routing-guidelines': 'route-standard',
  'react-state-management': 'store-standard',
  'vue-state-management': 'store-standard',
  'react-style-guidelines': 'style-standard',
  'vue-style-guidelines': 'style-standard',
  'api-guidelines': 'api-standard',
  'coding-guidelines': 'coding-standard',
  'general-constraints': 'generic-constraints',
  'documentation-guidelines': 'doc-standard',
  'testing-guidelines': 'test-standard',
  'superpowers-execution-guidelines': 'superpowers-standard',
  'code-formatting-and-checks': 'format-check-standard',
  'audit-reporting-guidelines': 'audit-report-standard',
};

function normalizeLegacyRuleId(ruleId, profile, ruleRegistry, warnings) {
  const normalized = String(ruleId || '').trim();
  if (!normalized) {
    return normalized;
  }

  const canonicalId = LEGACY_RULE_ID_ALIASES[normalized];
  if (!canonicalId) {
    return normalized;
  }

  const resolvedCanonical = resolveRule(canonicalId, profile, ruleRegistry);
  if (!resolvedCanonical) {
    return normalized;
  }

  warnings.push(`Rule id "${normalized}" uses legacy manifest alias; normalized to "${canonicalId}".`);
  return canonicalId;
}

function resolveRule(id, profile, ruleRegistry) {
  const entry = ruleRegistry.get(id);
  if (!entry) {
    return null;
  }
  if (entry.sourceByProfile) {
    const source = entry.sourceByProfile[profile];
    if (!source) {
      return null;
    }
    return { ...entry, id, sourceRel: source, domains: entry.domains || [] };
  }
  return { ...entry, id, sourceRel: entry.source, domains: entry.domains || [] };
}

function normalizeManifest(rawManifest, existingManifest, options, profilesRegistry) {
  const rawProfile = options.profile || rawManifest?.profile || existingManifest?.profile || null;
  const resolvedProfile = resolveProfileId(profilesRegistry, rawProfile);
  const rawLocalPreferences = parseLocalPreferences(rawManifest?.local_preferences);
  const existingLocalPreferences = parseLocalPreferences(existingManifest?.local_preferences);
  const normalizedSuperpowers = normalizeSuperpowersManifest(
    options.superpowers === undefined
      ? rawManifest?.superpowers
      : { ...(rawManifest?.superpowers || existingManifest?.superpowers || {}), enabled: options.superpowers },
    existingManifest?.superpowers,
  );
  const normalizedVisualBridge = normalizeVisualBridgeManifest(
    rawManifest?.visual_bridge,
    existingManifest?.visual_bridge,
  );
  const manifest = {
    schema_version: Number(rawManifest?.schema_version || existingManifest?.schema_version || 1),
    manifest_type: rawManifest?.manifest_type || existingManifest?.manifest_type || 'hub-install',
    name: rawManifest?.name || existingManifest?.name || null,
    description: rawManifest?.description || existingManifest?.description || null,
    version: rawManifest?.version || existingManifest?.version || null,
    profile: resolvedProfile,
    ides: normalizeIdes(options.ide || rawManifest?.ides || existingManifest?.ides || 'default'),
    scenario_packages: normalizeList(rawManifest?.scenario_packages || existingManifest?.scenario_packages),
    roles: normalizeList(rawManifest?.roles || existingManifest?.roles),
    skills: normalizeList(rawManifest?.skills || existingManifest?.skills),
    rules: normalizeList(rawManifest?.rules || existingManifest?.rules),
    entry_role: rawManifest?.entry_role || existingManifest?.entry_role || null,
    tags: normalizeList(rawManifest?.tags || existingManifest?.tags),
    constraints: rawManifest?.constraints || existingManifest?.constraints || null,
    notes: normalizeList(rawManifest?.notes || existingManifest?.notes),
    sources: Array.isArray(rawManifest?.sources) ? rawManifest.sources : Array.isArray(existingManifest?.sources) ? existingManifest.sources : [],
  };
  if (normalizedSuperpowers) {
    manifest.superpowers = normalizedSuperpowers;
  }
  if (normalizedVisualBridge) {
    manifest.visual_bridge = normalizedVisualBridge;
  }
  const localPreferences = rawLocalPreferences !== null ? rawLocalPreferences : existingLocalPreferences;
  if (localPreferences) {
    manifest.local_preferences = localPreferences;
  }

  if (!manifest.profile) {
    if (!rawProfile) {
      throw new Error('Manifest is missing profile（技术栈）');
    }
    throw new Error(`Unsupported profile: ${rawProfile}. Supported profiles: ${formatSupportedProfiles(profilesRegistry)}`);
  }

  return manifest;
}

async function loadManifestInput(manifestInput, timeoutMs = DEFAULT_REMOTE_MANIFEST_TIMEOUT_MS) {
  if (isHttpUrl(manifestInput)) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetch(manifestInput, {
        signal: controller.signal,
        headers: {
          accept: 'application/json',
        },
      });
      if (!response.ok) {
        throw new Error(`Remote manifest request failed with status ${response.status} ${response.statusText}: ${manifestInput}`);
      }
      const rawText = await response.text();
      try {
        return {
          manifestSource: manifestInput,
          rawManifest: JSON.parse(rawText),
        };
      } catch (error) {
        throw new Error(`Remote manifest is not valid JSON: ${manifestInput}`);
      }
    } catch (error) {
      if (error.name === 'AbortError') {
        throw new Error(`Remote manifest request timed out after ${timeoutMs}ms: ${manifestInput}`);
      }
      if (error.message && error.message.startsWith('Remote manifest')) {
        throw error;
      }
      throw new Error(`Failed to fetch remote manifest: ${manifestInput} (${error.message})`);
    } finally {
      clearTimeout(timer);
    }
  }

  const manifestPath = path.resolve(manifestInput);
  if (!fs.existsSync(manifestPath)) {
    throw new Error(`Manifest file not found: ${manifestPath}`);
  }

  return {
    manifestSource: manifestPath,
    rawManifest: readJsonFile(manifestPath, 'Manifest'),
  };
}

function sha256Json(value) {
  return `sha256:${crypto.createHash('sha256').update(JSON.stringify(value)).digest('hex')}`;
}

function hashDirectory(dirPath) {
  if (!fs.existsSync(dirPath)) {
    return null;
  }
  const hash = crypto.createHash('sha256');
  const files = walkFiles(dirPath, () => true);
  for (const filePath of files) {
    const rel = toPosix(path.relative(dirPath, filePath));
    hash.update(rel);
    hash.update(fs.readFileSync(filePath));
  }
  return hash.digest('hex');
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function resolveManifest(manifest, catalogs, options = {}) {
  const allowMissing = options.allowMissing === true;
  const warnings = [];
  const roleIds = new Set(manifest.roles);
  const skillIds = new Set(manifest.skills);
  const ruleIds = new Set(manifest.rules);
  for (const scenarioId of manifest.scenario_packages || []) {
    const scenarioEntry = catalogs.scenarioPackages?.get(scenarioId);
    if (!scenarioEntry) {
      continue;
    }
    for (const roleId of scenarioEntry.roles || []) roleIds.add(roleId);
    for (const skillId of scenarioEntry.skills || []) skillIds.add(skillId);
    for (const ruleId of scenarioEntry.rules || []) ruleIds.add(ruleId);
    if (manifest.superpowers?.enabled && ['frontend-basic', 'bugfix-to-verification'].includes(scenarioId)) {
      ruleIds.add('superpowers-standard');
    }
  }
  const domains = new Set();
  const missing = {
    roles: [],
    skills: [],
    rules: [],
  };

  const resolvedRoles = [];
  for (const roleId of roleIds) {
    const entry = catalogs.roles.get(roleId);
    if (!entry) {
      if (allowMissing) {
        missing.roles.push(roleId);
        continue;
      }
      throw new Error(`Unknown role（专家角色） id: ${roleId}`);
    }
    resolvedRoles.push(entry);
    for (const domain of entry.domains || []) domains.add(domain);
  }

  const resolvedSkills = [];
  for (const skillId of skillIds) {
    const normalizedSkillId = normalizeLegacyProfileScopedSkillId(skillId, manifest.profile, catalogs.skills, warnings);
    const entry = resolveSkill(normalizedSkillId, manifest.profile, catalogs.skills);
    if (!entry) {
      if (allowMissing) {
        missing.skills.push(skillId);
        continue;
      }
      throw new Error(`Unknown skill（技能） id for profile "${manifest.profile}": ${skillId}`);
    }
    resolvedSkills.push(entry);
    for (const domain of entry.domains || []) domains.add(domain);
  }

  const resolvedRules = [];
  for (const ruleId of ruleIds) {
    const normalizedRuleId = normalizeLegacyRuleId(ruleId, manifest.profile, catalogs.rules, warnings);
    const entry = resolveRule(normalizedRuleId, manifest.profile, catalogs.rules);
    if (!entry) {
      if (allowMissing) {
        missing.rules.push(ruleId);
        continue;
      }
      throw new Error(`Unknown rule（规则） id for profile "${manifest.profile}": ${ruleId}`);
    }
    resolvedRules.push(entry);
    for (const domain of entry.domains || []) domains.add(domain);
  }

  const installedFlows = [...catalogs.flows.values()]
    .filter((entry) => entry.status === 'active')
    .map((entry) => entry.id);

  if (!manifest.entry_role) {
    manifest.entry_role = resolvedRoles.some((entry) => entry.id === 'task-orchestrator')
      ? 'task-orchestrator'
      : resolvedRoles[0]?.id || null;
  }

  if (!allowMissing && manifest.entry_role && !resolvedRoles.some((entry) => entry.id === manifest.entry_role)) {
    throw new Error(`entry_role（默认入口角色） is not included in resolved roles: ${manifest.entry_role}`);
  }

  return {
    warnings,
    missing,
    resolved: {
      domains: unique([...domains]),
      installed_flows: installedFlows,
      roles: resolvedRoles,
      skills: resolvedSkills,
      rules: resolvedRules,
    },
  };
}

function hasMissingAssets(resolvedResult) {
  return resolvedResult.missing.roles.length > 0 ||
    resolvedResult.missing.skills.length > 0 ||
    resolvedResult.missing.rules.length > 0;
}

function normalizeOrigin(value) {
  if (!value) return null;
  try {
    return new URL(String(value)).origin;
  } catch (error) {
    throw new Error(`Invalid hub origin: ${value}`);
  }
}

function resolveHubOrigin(options, manifestSource) {
  if (options.hubFetch === false) {
    return null;
  }
  if (options.hubOrigin) {
    return normalizeOrigin(options.hubOrigin);
  }
  if (isHttpUrl(manifestSource)) {
    return new URL(manifestSource).origin;
  }
  return null;
}

function mergeRegistryEntries(localEntries, remoteEntries) {
  return {
    ...(remoteEntries || {}),
    ...(localEntries || {}),
  };
}

function mergeSupportFiles(localFiles, remoteFiles) {
  return unique([...(remoteFiles || []), ...(localFiles || [])]);
}

function buildRoleRegistryForSource(rawRegistry, sourceRoot, metadataMap) {
  return {
    version: rawRegistry.version || 1,
    support_files: [...(rawRegistry.support_files || [])],
    __sourceRoot: sourceRoot,
    roles: Object.fromEntries(
      Object.entries(rawRegistry.roles || {}).map(([id, entry]) => {
        const meta = metadataMap.get(id);
        return [id, {
          ...entry,
          ...(meta || {}),
        }];
      }),
    ),
  };
}

function buildRuleRegistryForSource(rawRegistry, sourceRoot, metadataMap) {
  return Object.fromEntries(
    Object.entries(rawRegistry || {}).map(([id, entry]) => {
      const meta = metadataMap.get(id);
      return [id, {
        ...entry,
        __sourceRoot: sourceRoot,
        ...(meta || {}),
      }];
    }),
  );
}

function buildFlowRegistryForSource(rawRegistry, sourceRoot) {
  return {
    version: rawRegistry.version || 1,
    support_files: [...(rawRegistry.support_files || [])],
    __sourceRoot: sourceRoot,
    flows: Object.fromEntries(
      Object.entries(rawRegistry.flows || {}).map(([id, entry]) => [id, {
        ...entry,
      }]),
    ),
  };
}

function createAssetMetadataMap(items, kind, requestUrl, origin) {
  const map = new Map();
  for (const item of items || []) {
    const id = String(item.registryId || '').trim();
    if (!id) continue;
    map.set(id, {
      __sourceType: 'hub',
      __sourceRef: `${requestUrl}#${kind}:${id}`,
      __sourceOrigin: origin,
      __version: String(item.version || 'published'),
      __hubSlug: item.hubSlug || null,
    });
  }
  return map;
}

function mergeMapCatalog(localMap, remoteMap) {
  return new Map([
    ...remoteMap.entries(),
    ...localMap.entries(),
  ]);
}

function mergeSkillCatalog(localCatalog, remoteCatalog) {
  const profiles = {};
  const profileIds = unique([
    ...Object.keys(localCatalog.profiles || {}),
    ...Object.keys(remoteCatalog.profiles || {}),
  ]);
  for (const profileId of profileIds) {
    profiles[profileId] = mergeMapCatalog(
      localCatalog.profiles?.[profileId] || new Map(),
      remoteCatalog.profiles?.[profileId] || new Map(),
    );
  }

  return {
    common: mergeMapCatalog(localCatalog.common, remoteCatalog.common),
    profiles,
    domains: mergeMapCatalog(localCatalog.domains, remoteCatalog.domains),
  };
}

function extractZipArchive(zipPath, destDir) {
  let result;
  if (process.platform === 'win32') {
    result = spawnSync('powershell', [
      '-NoProfile',
      '-Command',
      `Expand-Archive -LiteralPath '${zipPath.replace(/'/g, "''")}' -DestinationPath '${destDir.replace(/'/g, "''")}' -Force`,
    ], {
      encoding: 'utf8',
    });
  } else {
    result = spawnSync('unzip', ['-qq', zipPath, '-d', destDir], {
      encoding: 'utf8',
    });
  }

  if (result.error) {
    throw new Error(`Failed to extract Hub supplement zip: ${result.error.message}`);
  }
  if (result.status !== 0) {
    throw new Error(`Failed to extract Hub supplement zip: ${(result.stderr || result.stdout || '').trim() || 'unknown unzip error'}`);
  }
}

function readOptionalJson(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJsonFile(filePath, label);
}

async function fetchHubSupplement(origin, manifest, missing, timeoutMs) {
  const requestUrl = `${origin.replace(/\/$/, '')}/api/install/supplement-export`;
  const payload = {
    profile: manifest.profile,
    ides: manifest.ides,
    roles: missing.roles,
    skills: missing.skills,
    rules: missing.rules,
  };
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(requestUrl, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        accept: 'application/zip',
        'content-type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
    if (!response.ok) {
      const text = await response.text().catch(() => '');
      throw new Error(`Hub supplement request failed with status ${response.status} ${response.statusText}${text ? `: ${text}` : ''}`);
    }

    const bytes = Buffer.from(await response.arrayBuffer());
    const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-hub-supplement-'));
    const zipPath = path.join(tempDir, 'supplement.zip');
    const extractDir = path.join(tempDir, 'bundle');
    ensureDir(extractDir);
    fs.writeFileSync(zipPath, bytes);
    extractZipArchive(zipPath, extractDir);

    const report = readOptionalJson(path.join(extractDir, 'export-report.json'), 'Hub supplement report') || {
      warnings: [],
      assets: { roles: [], skills: [], rules: [] },
    };
    return {
      origin,
      requestUrl,
      tempDir,
      extractDir,
      report,
    };
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new Error(`Hub supplement request timed out after ${timeoutMs}ms: ${requestUrl}`);
    }
    if (error.message && error.message.startsWith('Hub supplement')) {
      throw error;
    }
    throw new Error(`Failed to fetch Hub supplement: ${requestUrl} (${error.message})`);
  } finally {
    clearTimeout(timer);
  }
}

function buildSupplementState(supplement) {
  const supplementRoot = supplement.extractDir;
  const supplementRegistry = loadSyncRegistry(supplementRoot);
  const roleMetadata = createAssetMetadataMap(supplement.report.assets?.roles, 'role', supplement.requestUrl, supplement.origin);
  const skillMetadata = createAssetMetadataMap(supplement.report.assets?.skills, 'skill', supplement.requestUrl, supplement.origin);
  const ruleMetadata = createAssetMetadataMap(supplement.report.assets?.rules, 'rule', supplement.requestUrl, supplement.origin);

  const roleRegistry = buildRoleRegistryForSource(supplementRegistry.roles, supplementRoot, roleMetadata);
  const flowRegistry = buildFlowRegistryForSource(supplementRegistry.flows, supplementRoot);
  const ruleRegistry = buildRuleRegistryForSource(supplementRegistry.rules, supplementRoot, ruleMetadata);

  return {
    registry: {
      roles: roleRegistry,
      rules: ruleRegistry,
      flows: flowRegistry,
    },
    catalogs: {
      roles: readRoleCatalog(roleRegistry),
      skills: readSkillCatalog(supplementRoot, skillMetadata),
      rules: readRuleCatalog(ruleRegistry),
      flows: readFlowCatalog(flowRegistry),
    },
    warnings: normalizeList(supplement.report.warnings),
  };
}

function mergePreparedState(prepared, supplement, supplementState) {
  const mergedRoleRegistry = {
    ...prepared.registry.roles,
    support_files: mergeSupportFiles(prepared.registry.roles.support_files, supplementState.registry.roles.support_files),
    roles: mergeRegistryEntries(prepared.registry.roles.roles, supplementState.registry.roles.roles),
  };
  const mergedRuleRegistry = mergeRegistryEntries(prepared.registry.rules, supplementState.registry.rules);
  const mergedFlowRegistry = {
    ...prepared.registry.flows,
    support_files: mergeSupportFiles(prepared.registry.flows.support_files, supplementState.registry.flows.support_files),
    flows: mergeRegistryEntries(prepared.registry.flows.flows, supplementState.registry.flows.flows),
  };

  return {
    ...prepared,
    registry: {
      roles: mergedRoleRegistry,
      rules: mergedRuleRegistry,
      flows: mergedFlowRegistry,
    },
    catalogs: {
      roles: mergeMapCatalog(prepared.catalogs.roles, supplementState.catalogs.roles),
      skills: mergeSkillCatalog(prepared.catalogs.skills, supplementState.catalogs.skills),
      rules: mergeMapCatalog(prepared.catalogs.rules, supplementState.catalogs.rules),
      flows: prepared.catalogs.flows,
    },
    supplements: [...(prepared.supplements || []), supplement],
  };
}

function readExistingManifest(targetDir) {
  const manifestPath = path.join(targetDir, '.ai-spec/manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  return readJsonFile(manifestPath, 'Existing manifest');
}

function writeJsonTracked(targetDir, filePath, value, changes) {
  const content = `${JSON.stringify(value, null, 2)}\n`;
  return writeTextTracked(targetDir, filePath, content, changes);
}

function writeTextTracked(targetDir, filePath, content, changes) {
  ensureDir(path.dirname(filePath));
  const rel = targetRel(targetDir, filePath);
  if (!fs.existsSync(filePath)) {
    fs.writeFileSync(filePath, content, 'utf8');
    changes.created.push(rel);
    return;
  }
  const current = fs.readFileSync(filePath, 'utf8');
  if (current === content) {
    if (!changes.skipped.includes(rel)) {
      changes.skipped.push(rel);
    }
    return;
  }
  fs.writeFileSync(filePath, content, 'utf8');
  changes.updated.push(rel);
}

function copyFileTracked(sourceDir, targetDir, sourceRel, destRel, changes) {
  const sourcePath = path.join(sourceDir, sourceRel);
  const destPath = path.join(targetDir, destRel);
  const content = fs.readFileSync(sourcePath);
  ensureDir(path.dirname(destPath));
  const rel = targetRel(targetDir, destPath);

  if (!fs.existsSync(destPath)) {
    fs.writeFileSync(destPath, content);
    changes.created.push(rel);
    return;
  }

  const current = fs.readFileSync(destPath);
  if (Buffer.compare(current, content) === 0) {
    if (!changes.skipped.includes(rel)) {
      changes.skipped.push(rel);
    }
    return;
  }

  fs.writeFileSync(destPath, content);
  changes.updated.push(rel);
}

function copyRenderedCommandTracked(sourceDir, targetDir, sourceRel, destRel, changes) {
  const sourcePath = path.join(sourceDir, sourceRel);
  const destPath = path.join(targetDir, destRel);
  const content = readRenderedCommandTemplate(sourcePath, {
    forceLocalProtocol: process.env.ENGINEERED_SPEC_FORCE_LOCAL_CLI === '1',
  });
  ensureDir(path.dirname(destPath));
  const rel = targetRel(targetDir, destPath);

  if (!fs.existsSync(destPath)) {
    fs.writeFileSync(destPath, content, 'utf8');
    changes.created.push(rel);
    return;
  }

  const current = fs.readFileSync(destPath, 'utf8');
  if (current === content) {
    if (!changes.skipped.includes(rel)) {
      changes.skipped.push(rel);
    }
    return;
  }

  fs.writeFileSync(destPath, content, 'utf8');
  changes.updated.push(rel);
}

function copyFileIfMissingTracked(sourceDir, targetDir, sourceRel, destRel, changes) {
  const sourcePath = path.join(sourceDir, sourceRel);
  const destPath = path.join(targetDir, destRel);
  const rel = targetRel(targetDir, destPath);
  if (fs.existsSync(destPath)) {
    if (!changes.skipped.includes(rel)) {
      changes.skipped.push(rel);
    }
    return;
  }
  const content = fs.readFileSync(sourcePath);
  ensureDir(path.dirname(destPath));
  fs.writeFileSync(destPath, content);
  changes.created.push(rel);
}

function copyDirectoryTracked(sourceDir, targetDir, sourceDirRel, destDirRel, changes) {
  const sourcePath = path.join(sourceDir, sourceDirRel);
  const destPath = path.join(targetDir, destDirRel);
  const existsBefore = fs.existsSync(destPath);
  const sourceHash = hashDirectory(sourcePath);
  const destHash = existsBefore ? hashDirectory(destPath) : null;
  const rel = targetRel(targetDir, destPath);

  if (existsBefore && sourceHash && destHash && sourceHash === destHash) {
    if (!changes.skipped.includes(rel)) {
      changes.skipped.push(rel);
    }
    return;
  }

  fs.rmSync(destPath, { recursive: true, force: true });
  ensureDir(path.dirname(destPath));
  fs.cpSync(sourcePath, destPath, { recursive: true });
  if (existsBefore) {
    if (!changes.updated.includes(rel)) {
      changes.updated.push(rel);
    }
  } else {
    if (!changes.created.includes(rel)) {
      changes.created.push(rel);
    }
  }
}

function isManagedPruneAsset(asset) {
  if (!asset || typeof asset !== 'object') return false;
  const rel = String(asset.local_path || '').trim();
  if (!rel) return false;
  if (rel === '.agents' || rel.startsWith('.agents/roles/') || rel.startsWith('.agents/skills/') || rel.startsWith('.agents/rules/')) {
    return true;
  }
  if (rel === SUPERPOWERS_STATE_REL_PATH) {
    return true;
  }
  if (rel === VISUAL_BRIDGE_STATE_REL_PATH) {
    return true;
  }
  if (/^\.(claude|cursor|codex|opencode|trae)\/rules$/.test(rel)) {
    return true;
  }
  if (/^\.(claude|cursor|codex|opencode|trae)\/skills\/[^/]+$/.test(rel)) {
    return true;
  }
  if (/^\.(claude|cursor|codex|opencode|trae)\/commands\/[^/]+\.md$/.test(rel)) {
    return true;
  }
  if (/^\.codex\/commands\/[^/]+\.md$/.test(rel)) {
    return true;
  }
  return false;
}

function readPreviousSources(targetDir) {
  const sourcesPath = path.join(targetDir, '.ai-spec', 'sources.json');
  if (!fs.existsSync(sourcesPath)) {
    return null;
  }
  return readJsonFile(sourcesPath, 'Existing sources');
}

function collectManagedPathsFromSources(sources) {
  const managed = new Set();
  for (const asset of Array.isArray(sources?.assets) ? sources.assets : []) {
    if (!isManagedPruneAsset(asset)) {
      continue;
    }
    managed.add(asset.local_path);
  }
  return managed;
}

function sortPathsForRemoval(paths) {
  return [...paths].sort((left, right) => {
    const leftDepth = left.split('/').length;
    const rightDepth = right.split('/').length;
    if (leftDepth !== rightDepth) {
      return rightDepth - leftDepth;
    }
    return right.localeCompare(left);
  });
}

function cleanupEmptyIdeDirs(targetDir, changes) {
  for (const ide of ALL_IDES) {
    const ideDir = path.join(targetDir, `.${ide}`);
    if (!fs.existsSync(ideDir)) {
      continue;
    }
    for (const child of ['commands', 'skills']) {
      const childDir = path.join(ideDir, child);
      if (fs.existsSync(childDir) && fs.readdirSync(childDir).filter((entry) => entry !== '.DS_Store').length === 0) {
        removePathTracked(targetDir, childDir, changes);
      }
    }
    const remaining = fs.readdirSync(ideDir).filter((entry) => entry !== '.DS_Store');
    if (remaining.length === 0) {
      removePathTracked(targetDir, ideDir, changes);
    }
  }
}

function pruneManagedAssets(targetDir, previousSources, currentSources, changes) {
  const previousPaths = collectManagedPathsFromSources(previousSources);
  const currentPaths = collectManagedPathsFromSources(currentSources);
  const stalePaths = [...previousPaths].filter((item) => !currentPaths.has(item));
  for (const rel of sortPathsForRemoval(stalePaths)) {
    removePathTracked(targetDir, path.join(targetDir, rel), changes);
  }
  cleanupEmptyIdeDirs(targetDir, changes);
}

function ensureSymlinkTracked(targetDir, linkPath, linkTarget, changes) {
  ensureDir(path.dirname(linkPath));
  const rel = targetRel(targetDir, linkPath);
  let existedBefore = false;

  try {
    const stat = fs.lstatSync(linkPath);
    existedBefore = true;
    if (stat.isSymbolicLink()) {
      const currentTarget = fs.readlinkSync(linkPath);
      if (currentTarget === linkTarget) {
        if (!changes.skipped.includes(rel)) {
          changes.skipped.push(rel);
        }
        return;
      }
      fs.unlinkSync(linkPath);
    } else {
      fs.rmSync(linkPath, { recursive: true, force: true });
    }
  } catch (error) {
    existedBefore = false;
  }

  fs.symlinkSync(linkTarget, linkPath);
  if (existedBefore) {
    if (!changes.updated.includes(rel)) {
      changes.updated.push(rel);
    }
  } else {
    if (!changes.created.includes(rel)) {
      changes.created.push(rel);
    }
  }
}

function removePathTracked(targetDir, targetPath, changes) {
  const rel = targetRel(targetDir, targetPath);
  try {
    const stat = fs.lstatSync(targetPath);
    if (stat.isSymbolicLink()) {
      fs.unlinkSync(targetPath);
    } else {
      fs.rmSync(targetPath, { recursive: true, force: true });
    }
    if (!changes.updated.includes(rel) && !changes.created.includes(rel)) {
      changes.updated.push(rel);
    }
  } catch (error) {
    // Already absent; nothing to do.
  }
}

function installRoles(targetDir, resolvedRoles, roleRegistry, changes) {
  for (const supportFile of roleRegistry.support_files || []) {
    copyFileTracked(roleRegistry.__sourceRoot, targetDir, supportFile, supportFile, changes);
  }

  const copiedDomainReadmes = new Set();
  for (const role of resolvedRoles) {
    copyFileTracked(role.sourceRoot, targetDir, role.sourceRel, role.sourceRel, changes);
    const domainReadme = role.sourceRel.match(/^\.agents\/roles\/domains\/([^/]+)\//);
    if (domainReadme && role.sourceType === 'local') {
      const domainReadmeRel = `.agents/roles/domains/${domainReadme[1]}/README.md`;
      if (!copiedDomainReadmes.has(domainReadmeRel) && fs.existsSync(path.join(role.sourceRoot, domainReadmeRel))) {
        copyFileTracked(role.sourceRoot, targetDir, domainReadmeRel, domainReadmeRel, changes);
        copiedDomainReadmes.add(domainReadmeRel);
      }
    }
  }
}

function installSkills(targetDir, resolvedSkills, changes) {
  if (resolvedSkills.some((item) => item.sourceType === 'local')) {
    const localRoot = resolvedSkills.find((item) => item.sourceType === 'local')?.sourceRoot;
    if (localRoot && fs.existsSync(path.join(localRoot, '.agents/skills/README.md'))) {
      copyFileTracked(localRoot, targetDir, '.agents/skills/README.md', '.agents/skills/README.md', changes);
    }
  }
  for (const skill of resolvedSkills) {
    copyDirectoryTracked(skill.sourceRoot, targetDir, skill.sourceDirRel, `.agents/skills/${skill.id}`, changes);
  }
}

function installRules(targetDir, resolvedRules, changes) {
  const localRoot = resolvedRules.find((item) => item.sourceType === 'local')?.sourceRoot;
  if (localRoot && fs.existsSync(path.join(localRoot, '.agents/rules/README.md'))) {
    copyFileTracked(localRoot, targetDir, '.agents/rules/README.md', '.agents/rules/README.md', changes);
  }
  for (const rule of resolvedRules) {
    const destRel = getInstalledRulePath(rule);
    copyFileTracked(rule.sourceRoot, targetDir, rule.sourceRel, destRel, changes);
  }
}

function getInstalledRulePath(rule) {
  const baseName = path.basename(rule.sourceRel || '');
  if (baseName && baseName !== 'RULE.md') {
    return `.agents/rules/${baseName}`;
  }
  return `.agents/rules/${rule.id}.md`;
}

function installFlows(targetDir, catalogs, flowRegistry, changes) {
  for (const supportFile of flowRegistry.support_files || []) {
    copyFileTracked(flowRegistry.__sourceRoot, targetDir, supportFile, supportFile, changes);
  }
  for (const flow of catalogs.flows.values()) {
    copyFileTracked(flow.sourceRoot, targetDir, flow.sourceRel, flow.sourceRel, changes);
  }
}

function installIdeAssets(sourceDir, targetDir, ides, resolvedSkills, changes, superpowersEnabled = false) {
  const commandsDir = path.join(sourceDir, '.agents/commands/common');
  const commandFiles = fs.existsSync(commandsDir)
    ? fs.readdirSync(commandsDir).filter((name) => name.endsWith('.md')).sort()
    : [];

  for (const ide of ides) {
    const ideDir = path.join(targetDir, `.${ide}`);
    ensureDir(ideDir);
    ensureSymlinkTracked(targetDir, path.join(ideDir, 'rules'), '../.agents/rules', changes);
    ensureDir(path.join(ideDir, 'skills'));

    for (const skill of resolvedSkills) {
      const linkPath = path.join(ideDir, 'skills', skill.id);
      if (!shouldExposeSkillToIde(skill.id, superpowersEnabled)) {
        removePathTracked(targetDir, linkPath, changes);
        continue;
      }
      const linkTarget = `../../.agents/skills/${skill.id}`;
      ensureSymlinkTracked(targetDir, linkPath, linkTarget, changes);
    }

    for (const fileName of commandFiles) {
      copyRenderedCommandTracked(sourceDir, targetDir, `.agents/commands/common/${fileName}`, `.${ide}/commands/${fileName}`, changes);
    }

    const ideCommandsDir = path.join(sourceDir, '.agents/commands', ide);
    const ideCommandFiles = fs.existsSync(ideCommandsDir)
      ? fs.readdirSync(ideCommandsDir).filter((name) => name.endsWith('.md')).sort()
      : [];

    for (const fileName of ideCommandFiles) {
      copyRenderedCommandTracked(sourceDir, targetDir, `.agents/commands/${ide}/${fileName}`, `.${ide}/commands/${fileName}`, changes);
    }

    if (ide === 'cursor') {
      const sourceMcp = path.join(sourceDir, '.cursor/mcp.json');
      if (fs.existsSync(sourceMcp)) {
        copyFileIfMissingTracked(sourceDir, targetDir, '.cursor/mcp.json', '.cursor/mcp.json', changes);
      }
    }
  }
}

function buildLock(manifest, targetDir, manifestSource, resolved, cliVersion) {
  return {
    schema_version: 1,
    lock_type: 'local-install-lock',
    generated_at: new Date().toISOString(),
    target: {
      path: targetRel(targetDir, targetDir) || '.',
      profile: manifest.profile,
      ides: manifest.ides,
    },
    source: {
      manifest: manifestSource,
      manifest_type: manifest.manifest_type,
    },
    request: {
      scenario_packages: manifest.scenario_packages,
      roles: manifest.roles,
      skills: manifest.skills,
      rules: manifest.rules,
      superpowers: manifest.superpowers || null,
    },
    resolved: {
      domains: resolved.domains,
      installed_flows: resolved.installed_flows,
      roles: resolved.roles.map((item) => item.id),
      skills: resolved.skills.map((item) => item.id),
      rules: resolved.rules.map((item) => item.id),
    },
    assets: {
      roles: resolved.roles.map((item) => ({
        id: item.id,
        version: item.version || 'workspace',
        source_type: item.sourceType || 'local',
        ...(item.hubSlug ? { hub_slug: item.hubSlug } : {}),
      })),
      skills: resolved.skills.map((item) => ({
        id: item.id,
        version: item.version || 'workspace',
        source_type: item.sourceType || 'local',
        ...(item.hubSlug ? { hub_slug: item.hubSlug } : {}),
      })),
      rules: resolved.rules.map((item) => ({
        id: item.id,
        version: item.version || 'workspace',
        source_type: item.sourceType || 'local',
        ...(item.hubSlug ? { hub_slug: item.hubSlug } : {}),
      })),
      flows: resolved.installed_flows.map((id) => ({ id, version: 'workspace' })),
      superpowers: manifest.superpowers
        ? {
            enabled: manifest.superpowers.enabled,
            preferred_mode: manifest.superpowers.preferred_mode,
            codex_entry: manifest.superpowers.codex_entry,
          }
        : null,
      visual_bridge: manifest.visual_bridge
        ? {
            enabled: manifest.visual_bridge.enabled,
            server_url: manifest.visual_bridge.server_url,
            workspace_id: manifest.visual_bridge.workspace_id,
            agent_id: manifest.visual_bridge.agent_id,
            push_on_runtime_state: manifest.visual_bridge.push_on_runtime_state,
            push_on_sync: manifest.visual_bridge.push_on_sync,
            fail_open: manifest.visual_bridge.fail_open,
          }
        : null,
    },
    installer: {
      command: 'ai-spec-auto sync',
      cli_version: cliVersion,
      mode: 'normal',
    },
    integrity: {
      manifest_hash: sha256Json(manifest),
      resolved_hash: sha256Json({
        domains: resolved.domains,
        installed_flows: resolved.installed_flows,
        roles: resolved.roles.map((item) => item.id),
        skills: resolved.skills.map((item) => item.id),
        rules: resolved.rules.map((item) => item.id),
        superpowers: manifest.superpowers || null,
      }),
    },
    status: 'success',
  };
}

function buildSources(manifest, manifestSource, resolved, sourceDir) {
  const assets = [];

  assets.push({
    kind: 'superpowers-config',
    id: 'project-superpowers',
    source_type: 'local',
    source_ref: `local://${SUPERPOWERS_STATE_REL_PATH}`,
    local_path: SUPERPOWERS_STATE_REL_PATH,
  });
  if (manifest.visual_bridge) {
    assets.push({
      kind: 'visual-bridge-config',
      id: 'project-visual-bridge',
      source_type: 'local',
      source_ref: `local://${VISUAL_BRIDGE_STATE_REL_PATH}`,
      local_path: VISUAL_BRIDGE_STATE_REL_PATH,
    });
  }

  for (const role of resolved.roles) {
    assets.push({
      kind: 'role',
      id: role.id,
      source_type: role.sourceType || 'local',
      source_ref: role.sourceRef || `local://${role.sourceRel}`,
      local_path: role.sourceRel,
      ...(role.hubSlug ? { hub_slug: role.hubSlug } : {}),
      ...(role.version ? { version: role.version } : {}),
    });
  }

  for (const skill of resolved.skills) {
    assets.push({
      kind: 'skill',
      id: skill.id,
      source_type: skill.sourceType || 'local',
      source_ref: skill.sourceRef || `local://${skill.sourceDirRel}`,
      local_path: `.agents/skills/${skill.id}`,
      ...(skill.hubSlug ? { hub_slug: skill.hubSlug } : {}),
      ...(skill.version ? { version: skill.version } : {}),
    });
  }

  for (const rule of resolved.rules) {
    assets.push({
      kind: 'rule',
      id: rule.id,
      source_type: rule.sourceType || 'local',
      source_ref: rule.sourceRef || `local://${rule.sourceRel}`,
      local_path: getInstalledRulePath(rule),
      ...(rule.hubSlug ? { hub_slug: rule.hubSlug } : {}),
      ...(rule.version ? { version: rule.version } : {}),
    });
  }

  for (const flowId of resolved.installed_flows) {
    assets.push({
      kind: 'flow',
      id: flowId,
      source_type: 'local',
      source_ref: `local://.agents/flows/common/${flowId}.md`,
      local_path: `.agents/flows/common/${flowId}.md`,
    });
  }

  for (const ide of manifest.ides || []) {
    assets.push({
      kind: 'ide-rule-link',
      id: `${ide}:rules`,
      source_type: 'local',
      source_ref: `local://.${ide}/rules`,
      local_path: `.${ide}/rules`,
    });
  }

  for (const ide of manifest.ides || []) {
    for (const skill of resolved.skills) {
      if (!shouldExposeSkillToIde(skill.id, manifest.superpowers?.enabled)) {
        continue;
      }
      assets.push({
        kind: 'ide-skill-link',
        id: `${ide}:${skill.id}`,
        source_type: 'local',
        source_ref: `local://.${ide}/skills/${skill.id}`,
        local_path: `.${ide}/skills/${skill.id}`,
      });
      if (skill.id === 'using-superpowers') {
        assets.push({
          kind: 'ide-superpowers-entry',
          id: `${ide}:${skill.id}`,
          source_type: 'local',
          source_ref: `local://.${ide}/skills/${skill.id}`,
          local_path: `.${ide}/skills/${skill.id}`,
        });
      }
    }
  }

  for (const ide of manifest.ides || []) {
    const commonCommandsDir = path.join(sourceDir, '.agents', 'commands', 'common');
    const ideCommandsDir = path.join(sourceDir, '.agents', 'commands', ide);
    const commandFiles = unique([
      ...walkFiles(commonCommandsDir, (filePath) => filePath.endsWith('.md')).map((filePath) => path.basename(filePath)),
      ...walkFiles(ideCommandsDir, (filePath) => filePath.endsWith('.md')).map((filePath) => path.basename(filePath)),
    ]);
    for (const fileName of commandFiles) {
      assets.push({
        kind: 'ide-command-template',
        id: `${ide}:${fileName}`,
        source_type: 'local',
        source_ref: `local://.${ide}/commands/${fileName}`,
        local_path: `.${ide}/commands/${fileName}`,
      });
    }
  }

  if (manifest.superpowers?.enabled && (manifest.ides || []).includes('codex')) {
    assets.push({
      kind: 'codex-agents-bridge',
      id: 'codex:agents-md',
      source_type: 'local',
      source_ref: 'local://AGENTS.md',
      local_path: 'AGENTS.md',
    });
  }

  return {
    schema_version: 1,
    sources_type: 'local-install-sources',
    generated_at: new Date().toISOString(),
    manifest: {
      type: manifest.manifest_type,
      source: manifestSource,
    },
    registries: [
      {
        type: 'local-workspace',
        name: 'ai-spec-auto-local',
        path: sourceDir,
      },
      ...unique(
        [...resolved.roles, ...resolved.skills, ...resolved.rules]
          .map((item) => item.sourceOrigin || '')
          .filter(Boolean),
      ).map((origin) => ({
        type: 'hub-supplement',
        name: 'hub-supplement',
        source: origin,
      })),
    ],
    assets,
  };
}

function printPretty(result, isDryRun) {
  const noun = isDryRun ? 'sync-plan（同步计划）' : 'sync-result（同步结果）';
  console.log(`${noun}: ${result.status}`);
  console.log(`target（目标项目）: ${result.target.path}`);
  console.log(`profile（技术栈）: ${result.target.profile}`);
  console.log(`ides（IDE 列表）: ${result.target.ides.join(', ')}`);
  console.log(`roles（专家角色）: ${result.resolved.roles.join(', ') || '(none)'}`);
  console.log(`skills（技能）: ${result.resolved.skills.join(', ') || '(none)'}`);
  console.log(`rules（规则）: ${result.resolved.rules.join(', ') || '(none)'}`);
  console.log(`domains（能力域）: ${result.resolved.domains.join(', ') || '(none)'}`);
  if (Array.isArray(result.resolved.installed_flows)) {
    console.log(`installed_flows（已安装流程模板）: ${result.resolved.installed_flows.join(', ') || '(none)'}`);
  }
  if (result.changes) {
    console.log(`created（新建）: ${result.changes.created.length}`);
    console.log(`updated（更新）: ${result.changes.updated.length}`);
    console.log(`skipped（跳过）: ${result.changes.skipped.length}`);
    console.log(`conflicts（冲突）: ${result.changes.conflicts.length}`);
  }
  if (result.warnings.length > 0) {
    console.log(`warnings（警告）:`);
    for (const warning of result.warnings) {
      console.log(`- ${warning}`);
    }
  }
  if (result.errors.length > 0) {
    console.log(`errors（错误）:`);
    for (const error of result.errors) {
      console.log(`- ${error}`);
    }
  }
}

function buildPlan(targetDir, manifestSource, manifest, resolvedResult) {
  return {
    schema_version: 1,
    kind: 'sync-plan',
    status: 'planned',
    target: {
      path: targetDir,
      profile: manifest.profile,
      ides: manifest.ides,
    },
    source: {
      manifest: manifestSource,
      manifest_type: manifest.manifest_type,
    },
    request: {
      scenario_packages: manifest.scenario_packages,
      roles: manifest.roles,
      skills: manifest.skills,
      rules: manifest.rules,
    },
    resolved: {
      domains: resolvedResult.resolved.domains,
      installed_flows: resolvedResult.resolved.installed_flows,
      roles: resolvedResult.resolved.roles.map((item) => item.id),
      skills: resolvedResult.resolved.skills.map((item) => item.id),
      rules: resolvedResult.resolved.rules.map((item) => item.id),
    },
    warnings: resolvedResult.warnings,
    errors: [],
  };
}

function dedupeChanges(changes) {
  return {
    created: unique(changes.created),
    updated: unique(changes.updated.filter((item) => !changes.created.includes(item))),
    skipped: unique(changes.skipped.filter((item) => !changes.created.includes(item) && !changes.updated.includes(item))),
    conflicts: unique(changes.conflicts),
  };
}

function buildResult(prepared, changes = null) {
  return {
    schema_version: 1,
    kind: changes ? 'sync-result' : 'sync-plan',
    status: changes ? 'success' : 'planned',
    target: {
      path: prepared.targetDir,
      profile: prepared.manifest.profile,
      ides: prepared.manifest.ides,
    },
    source: {
      manifest: prepared.manifestSource,
      manifest_type: prepared.manifest.manifest_type,
    },
    request: {
      scenario_packages: prepared.manifest.scenario_packages,
      roles: prepared.manifest.roles,
      skills: prepared.manifest.skills,
      rules: prepared.manifest.rules,
    },
    resolved: {
      domains: prepared.resolvedResult.resolved.domains,
      installed_flows: prepared.resolvedResult.resolved.installed_flows,
      roles: prepared.resolvedResult.resolved.roles.map((item) => item.id),
      skills: prepared.resolvedResult.resolved.skills.map((item) => item.id),
      rules: prepared.resolvedResult.resolved.rules.map((item) => item.id),
    },
    ...(changes
      ? {
          changes,
          artifacts: {
            manifest: '.ai-spec/manifest.json',
            lock: '.ai-spec/lock.json',
            sources: '.ai-spec/sources.json',
          },
        }
      : {}),
    warnings: prepared.resolvedResult.warnings,
    errors: [],
  };
}

async function prepareSync(options) {
  const sourceDir = getSourceDir();
  const profilesRegistry = readProfilesRegistry(sourceDir);
  const registryValidation = require('./validate-registry').validateRegistry(sourceDir);
  if (registryValidation.status !== 'success') {
    throw new Error(`Registry validation failed with ${registryValidation.errors.length} error(s). Run "ai-spec-auto validate-registry" for details.`);
  }

  const targetDir = path.resolve(options.target || '.');
  const cliVersion = require(path.join(sourceDir, 'package.json')).version || '0.0.0';
  const manifestInput = options.manifest
    ? options.manifest
    : path.join(targetDir, '.ai-spec/manifest.json');

  if (!manifestInput) {
    throw new Error('sync（同步） requires --manifest（安装清单） or an existing .ai-spec/manifest.json');
  }

  const requestedTimeout = Number(process.env.AI_SPEC_REMOTE_MANIFEST_TIMEOUT_MS || DEFAULT_REMOTE_MANIFEST_TIMEOUT_MS);
  const timeoutMs = Number.isFinite(requestedTimeout) && requestedTimeout > 0
    ? requestedTimeout
    : DEFAULT_REMOTE_MANIFEST_TIMEOUT_MS;
  const { manifestSource, rawManifest } = await loadManifestInput(manifestInput, timeoutMs);
  const existingManifest = readExistingManifest(targetDir);
  const manifest = normalizeManifest(rawManifest, existingManifest, options, profilesRegistry);
  const registry = loadSyncRegistry(sourceDir);
  const catalogs = {
    roles: readRoleCatalog(registry.roles),
    skills: readSkillCatalog(sourceDir),
    rules: readRuleCatalog(registry.rules),
    flows: readFlowCatalog(registry.flows),
    scenarioPackages: new Map(Object.entries(registry.scenarioPackages?.scenario_packages || {})),
  };
  let prepared = {
    options,
    sourceDir,
    profilesRegistry,
    targetDir,
    cliVersion,
    manifestInput,
    manifestSource,
    rawManifest,
    existingManifest,
    manifest,
    registry,
    catalogs,
    supplements: [],
  };
  const preResolved = resolveManifest(manifest, catalogs, { allowMissing: true });
  const hubOrigin = resolveHubOrigin(options, manifestSource);

  if (hasMissingAssets(preResolved) && hubOrigin) {
    const supplement = await fetchHubSupplement(
      hubOrigin,
      manifest,
      preResolved.missing,
      timeoutMs,
    );
    const supplementState = buildSupplementState(supplement);
    prepared = mergePreparedState(prepared, supplement, supplementState);
  }

  const resolvedResult = resolveManifest(prepared.manifest, prepared.catalogs);

  return {
    ...prepared,
    resolvedResult: {
      ...resolvedResult,
      warnings: unique([
        ...resolvedResult.warnings,
        ...preResolved.warnings,
        ...prepared.supplements.flatMap((item) => normalizeList(item.report?.warnings)),
      ]),
    },
  };
}

async function runSync(options, preparedState = null) {
  const prepared = preparedState || await prepareSync(options);
  try {
    if (options.dryRun) {
      return buildResult(prepared, null);
    }

    const changes = {
      created: [],
      updated: [],
      skipped: [],
      conflicts: [],
    };

    installRoles(prepared.targetDir, prepared.resolvedResult.resolved.roles, prepared.registry.roles, changes);
    installSkills(prepared.targetDir, prepared.resolvedResult.resolved.skills, changes);
    installRules(prepared.targetDir, prepared.resolvedResult.resolved.rules, changes);
    installFlows(prepared.targetDir, prepared.catalogs, prepared.registry.flows, changes);
    installIdeAssets(
      prepared.sourceDir,
      prepared.targetDir,
      prepared.manifest.ides,
      prepared.resolvedResult.resolved.skills,
      changes,
      Boolean(prepared.manifest.superpowers?.enabled),
    );

    const aiSpecDir = path.join(prepared.targetDir, '.ai-spec');
    ensureDir(aiSpecDir);

    const manifestOutPath = path.join(aiSpecDir, 'manifest.json');
    const lockOutPath = path.join(aiSpecDir, 'lock.json');
    const sourcesOutPath = path.join(aiSpecDir, 'sources.json');
    const previousSources = readPreviousSources(prepared.targetDir);

    writeJsonTracked(prepared.targetDir, manifestOutPath, prepared.manifest, changes);
    const superpowersState = buildSuperpowersState({
      targetDir: prepared.targetDir,
      enabled: Boolean(prepared.manifest.superpowers?.enabled),
      manifestConfig: prepared.manifest.superpowers || null,
      ides: prepared.manifest.ides,
      env: process.env,
      cliVersion: prepared.cliVersion,
      source: 'sync',
    });
    writeSuperpowersState(prepared.targetDir, superpowersState);
    const visualBridgeState = buildVisualBridgeState({
      targetDir: prepared.targetDir,
      manifestConfig: prepared.manifest.visual_bridge || null,
      previousState: readVisualBridgeState(prepared.targetDir),
      cliVersion: prepared.cliVersion,
      source: 'sync',
    });
    if (visualBridgeState) {
      writeVisualBridgeState(prepared.targetDir, visualBridgeState);
    }
    const lock = buildLock(prepared.manifest, prepared.targetDir, prepared.manifestSource, prepared.resolvedResult.resolved, prepared.cliVersion);
    writeJsonTracked(prepared.targetDir, lockOutPath, lock, changes);
    const sources = buildSources(prepared.manifest, prepared.manifestSource, prepared.resolvedResult.resolved, prepared.sourceDir);
    if (previousSources) {
      pruneManagedAssets(prepared.targetDir, previousSources, sources, changes);
    }
    writeJsonTracked(prepared.targetDir, sourcesOutPath, sources, changes);
    upsertManagedAgentsBlock(
      prepared.targetDir,
      Boolean(prepared.manifest.superpowers?.enabled) && prepared.manifest.ides.includes('codex'),
    );

    return buildResult(prepared, dedupeChanges(changes));
  } finally {
    for (const supplement of prepared.supplements || []) {
      try {
        fs.rmSync(supplement.tempDir, { recursive: true, force: true });
      } catch (error) {
        // Cleanup failure should not change sync result.
      }
    }
  }
}

async function main(argv) {
  try {
    const options = parseArgs(argv);
    let profilesRegistry = null;
    try {
      profilesRegistry = readProfilesRegistry(getSourceDir());
    } catch (error) {
      if (!options.help) {
        throw error;
      }
    }
    if (options.help) {
      printUsage(profilesRegistry);
      return 0;
    }

    const result = await runSync(options);
    if (options.json) {
      process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    } else {
      printPretty(result, options.dryRun);
    }
    return 0;
  } catch (error) {
    console.error(`sync（同步） failed: ${error.message}`);
    return 1;
  }
}

module.exports = { parseArgs, prepareSync, runSync, main };

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
