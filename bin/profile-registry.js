const fs = require('fs');
const path = require('path');

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function getProfilesRegistryPath(sourceDir) {
  return path.join(sourceDir, '.agents/registry/profiles.json');
}

function readProfilesRegistry(sourceDir) {
  const filePath = getProfilesRegistryPath(sourceDir);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Registry file not found: ${filePath}`);
  }
  const data = readJsonFile(filePath, 'profiles.json');
  if (!data || typeof data !== 'object' || !data.profiles || typeof data.profiles !== 'object') {
    throw new Error('Registry profiles.json is missing root key "profiles"');
  }
  return data;
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
}

function getProfileEntries(profilesRegistry) {
  return profilesRegistry?.profiles && typeof profilesRegistry.profiles === 'object'
    ? profilesRegistry.profiles
    : {};
}

function getProfileIds(profilesRegistry) {
  return Object.keys(getProfileEntries(profilesRegistry));
}

function resolveProfileId(profilesRegistry, rawProfile) {
  const requested = String(rawProfile || '').trim();
  if (!requested) {
    return null;
  }

  const profiles = getProfileEntries(profilesRegistry);
  if (Object.prototype.hasOwnProperty.call(profiles, requested)) {
    return requested;
  }

  for (const [profileId, entry] of Object.entries(profiles)) {
    const aliases = normalizeStringList(entry?.aliases);
    if (aliases.includes(requested)) {
      return profileId;
    }
  }

  return null;
}

function getProfileEntry(profilesRegistry, rawProfile) {
  const resolvedId = resolveProfileId(profilesRegistry, rawProfile);
  if (!resolvedId) {
    return null;
  }
  return {
    id: resolvedId,
    ...(getProfileEntries(profilesRegistry)[resolvedId] || {}),
  };
}

function formatSupportedProfiles(profilesRegistry) {
  return getProfileIds(profilesRegistry).join(', ');
}

module.exports = {
  getProfileEntries,
  getProfileEntry,
  getProfileIds,
  getProfilesRegistryPath,
  readProfilesRegistry,
  resolveProfileId,
  formatSupportedProfiles,
};
