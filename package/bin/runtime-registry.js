const fs = require('fs');
const path = require('path');
const {
  resolveProfileId,
} = require('./profile-registry');

const PACKAGE_ROOT = path.join(__dirname, '..');
const REGISTRY_CACHE = new Map();

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function uniqueWorkspaceRoots(targetDir) {
  const roots = [PACKAGE_ROOT, path.resolve(targetDir || '.')];
  return [...new Set(roots)];
}

function cloneValue(value) {
  return JSON.parse(JSON.stringify(value));
}

function buildRegistrySourceDescriptors(targetDir, fileName) {
  return uniqueWorkspaceRoots(targetDir).map((root) => {
    const filePath = path.join(root, '.agents', 'registry', fileName);
    if (!fs.existsSync(filePath)) {
      return {
        root,
        filePath,
        exists: false,
      };
    }

    const stat = fs.statSync(filePath);
    return {
      root,
      filePath,
      exists: true,
      mtimeMs: stat.mtimeMs,
      size: stat.size,
    };
  });
}

function buildRegistryCacheKey(targetDir, fileName, objectKey) {
  return JSON.stringify({
    sources: buildRegistrySourceDescriptors(targetDir, fileName),
    fileName,
    objectKey,
  });
}

function mergeNamedEntries(baseEntries, overrideEntries) {
  const merged = {
    ...(baseEntries || {}),
  };

  for (const [id, entry] of Object.entries(overrideEntries || {})) {
    const nextEntry = {
      ...(merged[id] || {}),
    };
    if (entry && typeof entry === 'object' && !Array.isArray(entry)) {
      if (Object.prototype.hasOwnProperty.call(entry, 'source')) {
        delete nextEntry.sourceByProfile;
      }
      if (Object.prototype.hasOwnProperty.call(entry, 'sourceByProfile')) {
        delete nextEntry.source;
      }
      if (
        Object.prototype.hasOwnProperty.call(entry, 'rule_ids') &&
        !Object.prototype.hasOwnProperty.call(entry, 'rule_ids_by_profile')
      ) {
        delete nextEntry.rule_ids_by_profile;
      }
      if (
        (Object.prototype.hasOwnProperty.call(entry, 'skill_priority') ||
          Object.prototype.hasOwnProperty.call(entry, 'preferred_skills')) &&
        !Object.prototype.hasOwnProperty.call(entry, 'skill_priority_by_profile') &&
        !Object.prototype.hasOwnProperty.call(entry, 'preferred_skills_by_profile')
      ) {
        delete nextEntry.skill_priority_by_profile;
        delete nextEntry.preferred_skills_by_profile;
      }
    }
    merged[id] = {
      ...nextEntry,
      ...(entry || {}),
    };
  }

  return merged;
}

function loadRegistryFile(targetDir, fileName, objectKey) {
  const cacheKey = buildRegistryCacheKey(targetDir, fileName, objectKey);
  if (REGISTRY_CACHE.has(cacheKey)) {
    return cloneValue(REGISTRY_CACHE.get(cacheKey));
  }

  const roots = uniqueWorkspaceRoots(targetDir);
  const loaded = [];

  for (const root of roots) {
    const filePath = path.join(root, '.agents', 'registry', fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }
    loaded.push({
      root,
      filePath,
      data: readJsonFile(filePath, fileName),
    });
  }

  if (loaded.length === 0) {
    const emptyRegistry = {
      version: 1,
      support_files: [],
      [objectKey]: {},
      _sources: [],
    };
    REGISTRY_CACHE.set(cacheKey, emptyRegistry);
    return cloneValue(emptyRegistry);
  }

  const merged = {
    version: typeof loaded[0].data.version === 'number' ? loaded[0].data.version : 1,
    support_files: Array.isArray(loaded[0].data.support_files) ? [...loaded[0].data.support_files] : [],
    [objectKey]: {},
    _sources: loaded.map((item) => item.filePath),
  };

  for (const item of loaded) {
    if (typeof item.data.version === 'number') {
      merged.version = item.data.version;
    }
    if (Array.isArray(item.data.support_files)) {
      merged.support_files = [...item.data.support_files];
    }
    merged[objectKey] = mergeNamedEntries(merged[objectKey], item.data[objectKey]);
  }

  REGISTRY_CACHE.set(cacheKey, merged);
  return cloneValue(merged);
}

function clearRegistryCache() {
  REGISTRY_CACHE.clear();
}

function loadRolesRegistry(targetDir) {
  return loadRegistryFile(targetDir, 'roles.json', 'roles');
}

function loadFlowsRegistry(targetDir) {
  return loadRegistryFile(targetDir, 'flows.json', 'flows');
}

function loadRulesRegistry(targetDir) {
  return loadRegistryFile(targetDir, 'rules.json', 'rules');
}

function loadSkillsRegistry(targetDir) {
  return loadRegistryFile(targetDir, 'skills.json', 'skills');
}

function loadProfilesRegistry(targetDir) {
  return loadRegistryFile(targetDir, 'profiles.json', 'profiles');
}

function getRoleRuntimeConfig(targetDir, roleId) {
  if (!roleId) {
    return null;
  }
  const rolesRegistry = loadRolesRegistry(targetDir);
  return rolesRegistry.roles?.[roleId] || null;
}

function getFlowRuntimeConfig(targetDir, flowId) {
  if (!flowId) {
    return null;
  }
  const flowsRegistry = loadFlowsRegistry(targetDir);
  return flowsRegistry.flows?.[flowId] || null;
}

function getRuleRuntimeConfig(targetDir, ruleId) {
  if (!ruleId) {
    return null;
  }
  const rulesRegistry = loadRulesRegistry(targetDir);
  return rulesRegistry.rules?.[ruleId] || null;
}

function getSkillRuntimeConfig(targetDir, skillId) {
  if (!skillId) {
    return null;
  }
  const skillsRegistry = loadSkillsRegistry(targetDir);
  return skillsRegistry.skills?.[skillId] || null;
}

function resolveRuntimeProfileId(targetDir, profileId) {
  if (!profileId) {
    return null;
  }
  return resolveProfileId(loadProfilesRegistry(targetDir), profileId);
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value
    .map((item) => (typeof item === 'string' ? item.trim() : ''))
    .filter(Boolean);
}

function uniqueList(values) {
  const out = [];
  const seen = new Set();
  for (const value of values) {
    const trimmed = String(value || '').trim();
    if (!trimmed || seen.has(trimmed)) continue;
    seen.add(trimmed);
    out.push(trimmed);
  }
  return out;
}

function getProfileSpecificArray(entry, projectProfile, key, fallbackKey = null) {
  if (!entry || typeof entry !== 'object' || !projectProfile) {
    return [];
  }
  const byProfile = entry[key];
  if (byProfile && typeof byProfile === 'object' && !Array.isArray(byProfile)) {
    return normalizeStringArray(byProfile[projectProfile]);
  }
  if (fallbackKey) {
    const alt = entry[fallbackKey];
    if (alt && typeof alt === 'object' && !Array.isArray(alt)) {
      return normalizeStringArray(alt[projectProfile]);
    }
  }
  return [];
}

function getRoleRuleIds(targetDir, roleId, projectProfile) {
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);
  return uniqueList([
    ...normalizeStringArray(registryEntry?.rule_ids),
    ...getProfileSpecificArray(registryEntry, projectProfile, 'rule_ids_by_profile'),
  ]);
}

function getRoleSkillPriority(targetDir, roleId, projectProfile) {
  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);
  return uniqueList([
    ...normalizeStringArray(registryEntry?.skill_priority || registryEntry?.preferred_skills),
    ...getProfileSpecificArray(
      registryEntry,
      projectProfile,
      'skill_priority_by_profile',
      'preferred_skills_by_profile',
    ),
  ]);
}

module.exports = {
  PACKAGE_ROOT,
  loadProfilesRegistry,
  loadRulesRegistry,
  loadSkillsRegistry,
  loadRolesRegistry,
  loadFlowsRegistry,
  getRuleRuntimeConfig,
  getSkillRuntimeConfig,
  getRoleRuntimeConfig,
  getFlowRuntimeConfig,
  getRoleRuleIds,
  getRoleSkillPriority,
  resolveRuntimeProfileId,
  clearRegistryCache,
};
