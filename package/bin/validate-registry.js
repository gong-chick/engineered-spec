#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  getProfileIds,
  readProfilesRegistry,
} = require('./profile-registry');
const {
  validateSkillSpec,
} = require('./skill-spec-validator');

function printUsage() {
  console.log(`Usage:
  ai-spec-auto validate-registry [options]

Options:
  --source <dir>          Source workspace root (default: current package)
  --json                  Print JSON result only
  --help                  Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    json: false,
    pretty: true,
    source: null,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--source':
        options.source = args.shift();
        break;
      case '--json':
        options.json = true;
        options.pretty = false;
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

function getSourceDir(explicitSource) {
  if (explicitSource) {
    return path.resolve(explicitSource);
  }
  if (process.env.ENGINEERED_SPEC_LOCAL) {
    return process.env.ENGINEERED_SPEC_LOCAL;
  }
  return path.join(__dirname, '..');
}

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function readOptionalJsonFile(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJsonFile(filePath, label);
}

function buildSupportedProfileSet(profilesRegistry) {
  return new Set(getProfileIds(profilesRegistry));
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  return [];
}

function fileExists(sourceDir, relPath) {
  return fs.existsSync(path.join(sourceDir, relPath));
}

function assertArrayOfStrings(report, value, label) {
  if (!Array.isArray(value)) {
    report.errors.push(`${label} must be an array`);
    return [];
  }
  const invalid = value.filter((item) => typeof item !== 'string' || !item.trim());
  if (invalid.length > 0) {
    report.errors.push(`${label} must contain non-empty string items`);
  }
  return value;
}

function assertOptionalString(report, value, label) {
  if (value === undefined || value === null) {
    return;
  }
  if (typeof value !== 'string' || !value.trim()) {
    report.errors.push(`${label} must be a non-empty string`);
  }
}

function validateSourceDefinition(report, sourceDir, entry, label, supportedProfiles) {
  const hasSource = typeof entry.source === 'string';
  const hasSourceByProfile = entry.sourceByProfile && typeof entry.sourceByProfile === 'object';

  if (hasSource) {
    if (!entry.source.trim()) {
      report.errors.push(`${label} source must be a non-empty string`);
    } else if (!fileExists(sourceDir, entry.source)) {
      report.errors.push(`${label} references missing source: ${entry.source}`);
    }
  }

  if (hasSourceByProfile) {
    for (const [profile, relPath] of Object.entries(entry.sourceByProfile)) {
      if (!supportedProfiles.has(profile)) {
        report.errors.push(`${label} has unsupported profile key: ${profile}`);
      }
      if (typeof relPath !== 'string' || !relPath.trim()) {
        report.errors.push(`${label} sourceByProfile.${profile} must be a non-empty string`);
        continue;
      }
      if (!fileExists(sourceDir, relPath)) {
        report.errors.push(`${label} references missing profile source: ${relPath}`);
      }
    }
  }

  return {
    hasSource,
    hasSourceByProfile,
  };
}

function validateRuntimeTransition(report, value, label) {
  if (value === undefined || value === null) {
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    report.errors.push(`${label} must be an object`);
    return;
  }
  assertOptionalString(report, value.action, `${label}.action`);
  assertOptionalString(report, value.to_role, `${label}.to_role`);
  if (value.next_role !== undefined && value.next_role !== null) {
    assertOptionalString(report, value.next_role, `${label}.next_role`);
  }
  assertOptionalString(report, value.status, `${label}.status`);
  assertOptionalString(report, value.message, `${label}.message`);
}

function validateRuleContractProfiles(report, value, label, supportedProfiles) {
  if (value === undefined || value === null) {
    return;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    report.errors.push(`${label} must be an object`);
    return;
  }

  for (const [profile, entry] of Object.entries(value)) {
    if (profile !== 'default' && !supportedProfiles.has(profile)) {
      report.errors.push(`${label} has unsupported profile key: ${profile}`);
      continue;
    }
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      report.errors.push(`${label}.${profile} must be an object`);
      continue;
    }
    if (entry.must_follow !== undefined) {
      assertArrayOfStrings(report, entry.must_follow, `${label}.${profile}.must_follow`);
    }
    if (entry.blocked_when !== undefined) {
      assertArrayOfStrings(report, entry.blocked_when, `${label}.${profile}.blocked_when`);
    }
  }
}

function validateProfileList(report, value, label, supportedProfiles) {
  const profiles = assertArrayOfStrings(report, value, label);
  for (const profile of profiles) {
    if (!supportedProfiles.has(profile)) {
      report.errors.push(`${label} references unsupported profile: ${profile}`);
    }
  }
  return profiles;
}

function validateProfilesRegistry(sourceDir, profilesRegistry, report) {
  if (typeof profilesRegistry.version !== 'number') {
    report.errors.push('profiles.json version must be a number');
  }
  if (!profilesRegistry.profiles || typeof profilesRegistry.profiles !== 'object') {
    report.errors.push('profiles.json is missing "profiles" object');
    return new Set();
  }

  const profileIds = new Set();
  for (const [profileId, entry] of Object.entries(profilesRegistry.profiles)) {
    profileIds.add(profileId);
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) {
      report.errors.push(`profiles.json entry "${profileId}" must be an object`);
      continue;
    }

    assertOptionalString(report, entry.status, `profiles.json entry "${profileId}" status`);
    assertOptionalString(report, entry.label, `profiles.json entry "${profileId}" label`);
    assertOptionalString(report, entry.rules_dir, `profiles.json entry "${profileId}" rules_dir`);
    assertOptionalString(report, entry.skills_dir, `profiles.json entry "${profileId}" skills_dir`);
    assertOptionalString(report, entry.configs_dir, `profiles.json entry "${profileId}" configs_dir`);
    if (entry.aliases !== undefined) {
      assertArrayOfStrings(report, entry.aliases, `profiles.json entry "${profileId}" aliases`);
    }

    if (typeof entry.rules_dir === 'string' && entry.rules_dir.trim() && !fileExists(sourceDir, entry.rules_dir)) {
      report.errors.push(`profiles.json entry "${profileId}" references missing rules_dir: ${entry.rules_dir}`);
    }
    if (typeof entry.skills_dir === 'string' && entry.skills_dir.trim() && !fileExists(sourceDir, entry.skills_dir)) {
      report.errors.push(`profiles.json entry "${profileId}" references missing skills_dir: ${entry.skills_dir}`);
    }
    if (typeof entry.configs_dir === 'string' && entry.configs_dir.trim() && !fileExists(sourceDir, entry.configs_dir)) {
      report.errors.push(`profiles.json entry "${profileId}" references missing configs_dir: ${entry.configs_dir}`);
    }
  }

  return profileIds;
}

function validateRulesRegistry(sourceDir, rulesRegistry, report, supportedProfiles) {
  if (typeof rulesRegistry.version !== 'number') {
    report.errors.push('rules.json version must be a number');
  }
  if (!rulesRegistry.rules || typeof rulesRegistry.rules !== 'object') {
    report.errors.push('rules.json is missing "rules" object');
    return new Set();
  }

  const ruleIds = new Set();
  for (const [ruleId, entry] of Object.entries(rulesRegistry.rules)) {
    ruleIds.add(ruleId);
    if (!entry || typeof entry !== 'object') {
      report.errors.push(`rules.json entry "${ruleId}" must be an object`);
      continue;
    }
    const { hasSource, hasSourceByProfile } = validateSourceDefinition(
      report,
      sourceDir,
      entry,
      `rules.json entry "${ruleId}"`,
      supportedProfiles,
    );
    if (!hasSource && !hasSourceByProfile) {
      report.errors.push(`rules.json entry "${ruleId}" must define source or sourceByProfile`);
    }
    if (entry.domains !== undefined) {
      assertArrayOfStrings(report, entry.domains, `rules.json entry "${ruleId}" domains`);
    }
  }

  return ruleIds;
}

function validateSkillsRegistry(sourceDir, skillsRegistry, report, supportedProfiles) {
  if (typeof skillsRegistry.version !== 'number') {
    report.errors.push('skills.json version must be a number');
  }
  if (!skillsRegistry.skills || typeof skillsRegistry.skills !== 'object') {
    report.errors.push('skills.json is missing "skills" object');
    return new Set();
  }

  const skillIds = new Set();
  for (const [skillId, entry] of Object.entries(skillsRegistry.skills)) {
    skillIds.add(skillId);
    if (!entry || typeof entry !== 'object') {
      report.errors.push(`skills.json entry "${skillId}" must be an object`);
      continue;
    }
    const { hasSource, hasSourceByProfile } = validateSourceDefinition(
      report,
      sourceDir,
      entry,
      `skills.json entry "${skillId}"`,
      supportedProfiles,
    );
    if (!hasSource && !hasSourceByProfile) {
      report.errors.push(`skills.json entry "${skillId}" must define source or sourceByProfile`);
    }
    if (entry.domains !== undefined) {
      assertArrayOfStrings(report, entry.domains, `skills.json entry "${skillId}" domains`);
    }
    if (entry.profiles !== undefined) {
      validateProfileList(report, entry.profiles, `skills.json entry "${skillId}" profiles`, supportedProfiles);
    }
  }

  return skillIds;
}

function collectSkillSourceEntries(skillsRegistry) {
  const entries = [];
  for (const [skillId, entry] of Object.entries(skillsRegistry.skills || {})) {
    if (entry && typeof entry.source === 'string' && entry.source.trim()) {
      entries.push({
        skillId,
        profile: null,
        relPath: entry.source,
      });
    }
    if (entry && entry.sourceByProfile && typeof entry.sourceByProfile === 'object') {
      for (const [profile, relPath] of Object.entries(entry.sourceByProfile)) {
        if (typeof relPath === 'string' && relPath.trim()) {
          entries.push({
            skillId,
            profile,
            relPath,
          });
        }
      }
    }
  }
  return entries;
}

function validateSkillSourceSpecs(sourceDir, skillsRegistry, report) {
  const skillSourceEntries = collectSkillSourceEntries(skillsRegistry);
  const stats = {
    checked: 0,
    error_count: 0,
    warning_count: 0,
  };

  for (const entry of skillSourceEntries) {
    const absPath = path.join(sourceDir, entry.relPath);
    const label = entry.profile
      ? `skills.json entry "${entry.skillId}" (${entry.profile})`
      : `skills.json entry "${entry.skillId}"`;

    if (!fs.existsSync(absPath)) {
      continue;
    }

    const skillReport = validateSkillSpec(absPath);
    stats.checked += 1;
    stats.error_count += skillReport.errors.length;
    stats.warning_count += skillReport.warnings.length;
    report.checked_files.push(entry.relPath);

    for (const error of skillReport.errors) {
      report.errors.push(`${label} skill-spec: ${error}`);
    }
    for (const warning of skillReport.warnings) {
      report.warnings.push(`${label} skill-spec: ${warning}`);
    }
  }

  return stats;
}

function validateRolesRegistry(sourceDir, rolesRegistry, report, supportedProfiles) {
  if (typeof rolesRegistry.version !== 'number') {
    report.errors.push('roles.json version must be a number');
  }
  if (rolesRegistry.support_files !== undefined) {
    const supportFiles = assertArrayOfStrings(report, rolesRegistry.support_files, 'roles.json support_files');
    for (const relPath of supportFiles) {
      if (!fileExists(sourceDir, relPath)) {
        report.errors.push(`roles.json support file is missing: ${relPath}`);
      }
    }
  }
  if (!rolesRegistry.roles || typeof rolesRegistry.roles !== 'object') {
    report.errors.push('roles.json is missing "roles" object');
    return new Set();
  }

  const roleIds = new Set();
  for (const [roleId, entry] of Object.entries(rolesRegistry.roles)) {
    roleIds.add(roleId);
    if (!entry || typeof entry !== 'object') {
      report.errors.push(`roles.json entry "${roleId}" must be an object`);
      continue;
    }
    if (typeof entry.source !== 'string' || !entry.source.trim()) {
      report.errors.push(`roles.json entry "${roleId}" must define source`);
    } else if (!fileExists(sourceDir, entry.source)) {
      report.errors.push(`roles.json entry "${roleId}" references missing source: ${entry.source}`);
    }
    if (entry.domains !== undefined) {
      assertArrayOfStrings(report, entry.domains, `roles.json entry "${roleId}" domains`);
    }
    if (entry.profiles !== undefined) {
      validateProfileList(report, entry.profiles, `roles.json entry "${roleId}" profiles`, supportedProfiles);
    }
    if (entry.openspec_actions !== undefined) {
      assertArrayOfStrings(report, entry.openspec_actions, `roles.json entry "${roleId}" openspec_actions`);
    }
    if (entry.rule_ids !== undefined) {
      assertArrayOfStrings(report, entry.rule_ids, `roles.json entry "${roleId}" rule_ids`);
    }
    if (entry.skill_priority !== undefined) {
      assertArrayOfStrings(report, entry.skill_priority, `roles.json entry "${roleId}" skill_priority`);
    }
    if (entry.micro_skill_allowlist !== undefined) {
      assertArrayOfStrings(report, entry.micro_skill_allowlist, `roles.json entry "${roleId}" micro_skill_allowlist`);
    }
    if (entry.rule_contract_profiles !== undefined) {
      validateRuleContractProfiles(report, entry.rule_contract_profiles, `roles.json entry "${roleId}" rule_contract_profiles`, supportedProfiles);
    }
    if (entry.openspec_rule_sections !== undefined) {
      assertArrayOfStrings(report, entry.openspec_rule_sections, `roles.json entry "${roleId}" openspec_rule_sections`);
    }
    if (entry.required_inputs !== undefined) {
      assertArrayOfStrings(report, entry.required_inputs, `roles.json entry "${roleId}" required_inputs`);
    }
    if (entry.required_outputs !== undefined) {
      assertArrayOfStrings(report, entry.required_outputs, `roles.json entry "${roleId}" required_outputs`);
    }
    if (entry.approval_gates !== undefined) {
      assertArrayOfStrings(report, entry.approval_gates, `roles.json entry "${roleId}" approval_gates`);
    }
    if (entry.runtime_transition !== undefined) {
      validateRuntimeTransition(report, entry.runtime_transition, `roles.json entry "${roleId}" runtime_transition`);
    }
  }

  return roleIds;
}

function validateFlowsRegistry(sourceDir, flowsRegistry, report, supportedProfiles) {
  if (typeof flowsRegistry.version !== 'number') {
    report.errors.push('flows.json version must be a number');
  }
  if (flowsRegistry.support_files !== undefined) {
    const supportFiles = assertArrayOfStrings(report, flowsRegistry.support_files, 'flows.json support_files');
    for (const relPath of supportFiles) {
      if (!fileExists(sourceDir, relPath)) {
        report.errors.push(`flows.json support file is missing: ${relPath}`);
      }
    }
  }
  if (!flowsRegistry.flows || typeof flowsRegistry.flows !== 'object') {
    report.errors.push('flows.json is missing "flows" object');
    return new Set();
  }

  const flowIds = new Set();
  for (const [flowId, entry] of Object.entries(flowsRegistry.flows)) {
    flowIds.add(flowId);
    if (!entry || typeof entry !== 'object') {
      report.errors.push(`flows.json entry "${flowId}" must be an object`);
      continue;
    }
    if (typeof entry.source !== 'string' || !entry.source.trim()) {
      report.errors.push(`flows.json entry "${flowId}" must define source`);
    } else if (!fileExists(sourceDir, entry.source)) {
      report.errors.push(`flows.json entry "${flowId}" references missing source: ${entry.source}`);
    }
    if (entry.default_schema !== undefined) {
      assertOptionalString(report, entry.default_schema, `flows.json entry "${flowId}" default_schema`);
    }
    if (entry.profiles !== undefined) {
      validateProfileList(report, entry.profiles, `flows.json entry "${flowId}" profiles`, supportedProfiles);
    }
    if (entry.artifact_profile !== undefined) {
      assertOptionalString(report, entry.artifact_profile, `flows.json entry "${flowId}" artifact_profile`);
    }
    if (entry.required_roles !== undefined) {
      assertArrayOfStrings(report, entry.required_roles, `flows.json entry "${flowId}" required_roles`);
    }
    if (entry.first_handoff !== undefined) {
      assertOptionalString(report, entry.first_handoff, `flows.json entry "${flowId}" first_handoff`);
    }
    if (entry.approval_gates !== undefined) {
      assertArrayOfStrings(report, entry.approval_gates, `flows.json entry "${flowId}" approval_gates`);
    }
    if (entry.core_artifacts !== undefined) {
      assertArrayOfStrings(report, entry.core_artifacts, `flows.json entry "${flowId}" core_artifacts`);
    }
    if (entry.required_artifacts !== undefined) {
      assertArrayOfStrings(report, entry.required_artifacts, `flows.json entry "${flowId}" required_artifacts`);
    }
    if (entry.handoff_policy !== undefined) {
      assertOptionalString(report, entry.handoff_policy, `flows.json entry "${flowId}" handoff_policy`);
    }
    if (entry.completion_policy !== undefined) {
      assertOptionalString(report, entry.completion_policy, `flows.json entry "${flowId}" completion_policy`);
    }
  }

  return flowIds;
}

function validateRoleAndFlowReferences(rolesRegistry, flowsRegistry, report, ids) {
  for (const [roleId, entry] of Object.entries(rolesRegistry.roles || {})) {
    for (const ruleId of normalizeList(entry.rule_ids)) {
      if (!ids.rules.has(ruleId)) {
        report.errors.push(`roles.json entry "${roleId}" references unknown rule: ${ruleId}`);
      }
    }
    for (const skillId of normalizeList(entry.skill_priority)) {
      if (!ids.skills.has(skillId)) {
        report.errors.push(`roles.json entry "${roleId}" skill_priority references unknown skill: ${skillId}`);
      }
    }
    for (const skillId of normalizeList(entry.micro_skill_allowlist)) {
      if (!ids.skills.has(skillId)) {
        report.errors.push(`roles.json entry "${roleId}" micro_skill_allowlist references unknown skill: ${skillId}`);
      }
    }
    for (const skillId of normalizeList(entry.preferred_skills)) {
      if (!ids.skills.has(skillId)) {
        report.errors.push(`roles.json entry "${roleId}" preferred_skills references unknown skill: ${skillId}`);
      }
    }
    for (const handoffRole of normalizeList(entry.handoff_to)) {
      if (!ids.roles.has(handoffRole)) {
        report.errors.push(`roles.json entry "${roleId}" handoff_to references unknown role: ${handoffRole}`);
      }
    }
  }

  for (const [flowId, entry] of Object.entries(flowsRegistry.flows || {})) {
    for (const roleId of normalizeList(entry.required_roles)) {
      if (!ids.roles.has(roleId)) {
        report.errors.push(`flows.json entry "${flowId}" references unknown role in required_roles: ${roleId}`);
      }
    }
    if (entry.first_handoff && !ids.roles.has(entry.first_handoff)) {
      report.errors.push(`flows.json entry "${flowId}" references unknown first_handoff role: ${entry.first_handoff}`);
    }
  }
}

function validateScenarioPackagesRegistry(scenariosRegistry, report, ids, supportedProfiles) {
  if (!scenariosRegistry) {
    return;
  }
  if (typeof scenariosRegistry.version !== 'number') {
    report.errors.push('scenario-packages.json version must be a number');
  }
  if (!scenariosRegistry.scenario_packages || typeof scenariosRegistry.scenario_packages !== 'object') {
    report.errors.push('scenario-packages.json is missing "scenario_packages" object');
    return;
  }

  for (const [scenarioId, entry] of Object.entries(scenariosRegistry.scenario_packages)) {
    if (!entry || typeof entry !== 'object') {
      report.errors.push(`scenario-packages.json entry "${scenarioId}" must be an object`);
      continue;
    }

    const roles = assertArrayOfStrings(report, entry.roles || [], `scenario-packages.json entry "${scenarioId}" roles`);
    const skills = assertArrayOfStrings(report, entry.skills || [], `scenario-packages.json entry "${scenarioId}" skills`);
    const rules = assertArrayOfStrings(report, entry.rules || [], `scenario-packages.json entry "${scenarioId}" rules`);
    if (entry.domains !== undefined) {
      assertArrayOfStrings(report, entry.domains, `scenario-packages.json entry "${scenarioId}" domains`);
    }
    if (entry.profiles !== undefined) {
      validateProfileList(report, entry.profiles, `scenario-packages.json entry "${scenarioId}" profiles`, supportedProfiles);
    }

    for (const roleId of roles) {
      if (!ids.roles.has(roleId)) {
        report.errors.push(`scenario-packages.json entry "${scenarioId}" references unknown role: ${roleId}`);
      }
    }
    for (const skillId of skills) {
      if (!ids.skills.has(skillId)) {
        report.errors.push(`scenario-packages.json entry "${scenarioId}" references unknown skill: ${skillId}`);
      }
    }
    for (const ruleId of rules) {
      if (!ids.rules.has(ruleId)) {
        report.errors.push(`scenario-packages.json entry "${scenarioId}" references unknown rule: ${ruleId}`);
      }
    }
  }
}

function validateRegistry(sourceDir) {
  const report = {
    schema_version: 1,
    kind: 'registry-validation-result',
    status: 'success',
    source: sourceDir,
    checked_files: [],
    warnings: [],
    errors: [],
  };

  const registryDir = path.join(sourceDir, '.agents/registry');
  if (!fs.existsSync(registryDir)) {
    report.errors.push(`Registry directory not found: ${registryDir}`);
    report.status = 'failed';
    return report;
  }

  const rulesPath = path.join(registryDir, 'rules.json');
  const skillsPath = path.join(registryDir, 'skills.json');
  const rolesPath = path.join(registryDir, 'roles.json');
  const flowsPath = path.join(registryDir, 'flows.json');
  const scenariosPath = path.join(registryDir, 'scenario-packages.json');

  const profilesRegistry = readProfilesRegistry(sourceDir);
  const rulesRegistry = readJsonFile(rulesPath, 'rules.json');
  const skillsRegistry = readJsonFile(skillsPath, 'skills.json');
  const rolesRegistry = readJsonFile(rolesPath, 'roles.json');
  const flowsRegistry = readJsonFile(flowsPath, 'flows.json');
  const scenariosRegistry = readOptionalJsonFile(scenariosPath, 'scenario-packages.json');

  report.checked_files.push(
    '.agents/registry/profiles.json',
    '.agents/registry/rules.json',
    '.agents/registry/skills.json',
    '.agents/registry/roles.json',
    '.agents/registry/flows.json'
  );
  if (scenariosRegistry) {
    report.checked_files.push('.agents/registry/scenario-packages.json');
  }

  const profileIds = validateProfilesRegistry(sourceDir, profilesRegistry, report);
  const supportedProfiles = buildSupportedProfileSet(profilesRegistry);
  const ruleIds = validateRulesRegistry(sourceDir, rulesRegistry, report, supportedProfiles);
  const skillIds = validateSkillsRegistry(sourceDir, skillsRegistry, report, supportedProfiles);
  const roleIds = validateRolesRegistry(sourceDir, rolesRegistry, report, supportedProfiles);
  const flowIds = validateFlowsRegistry(sourceDir, flowsRegistry, report, supportedProfiles);
  const skillSpecStats = validateSkillSourceSpecs(sourceDir, skillsRegistry, report);
  const ids = {
    profiles: profileIds,
    roles: roleIds,
    skills: skillIds,
    rules: ruleIds,
    flows: flowIds,
  };
  validateRoleAndFlowReferences(rolesRegistry, flowsRegistry, report, ids);
  validateScenarioPackagesRegistry(scenariosRegistry, report, ids, supportedProfiles);

  if (report.errors.length > 0) {
    report.status = 'failed';
  }

  report.summary = {
    profile_count: profileIds.size,
    rule_count: ruleIds.size,
    skill_count: skillIds.size,
    role_count: roleIds.size,
    flow_count: flowIds.size,
    scenario_package_count: scenariosRegistry ? Object.keys(scenariosRegistry.scenario_packages || {}).length : 0,
  };
  report.stats = {
    ...report.summary,
    checked_file_count: report.checked_files.length,
    warning_count: report.warnings.length,
    error_count: report.errors.length,
    skill_spec: skillSpecStats,
  };

  return report;
}

function printPretty(report) {
  console.log(`registry-validation（注册表校验）: ${report.status}`);
  console.log(`source（源码目录）: ${report.source}`);
  if (report.summary) {
    console.log(`profiles（技术栈）: ${report.summary.profile_count}`);
    console.log(`rules（规则）: ${report.summary.rule_count}`);
    console.log(`skills（技能）: ${report.summary.skill_count}`);
    console.log(`roles（专家角色）: ${report.summary.role_count}`);
    console.log(`flows（流程模板）: ${report.summary.flow_count}`);
    console.log(`scenario_packages（场景方案包）: ${report.summary.scenario_package_count}`);
    if (report.stats && report.stats.skill_spec) {
      console.log(`skill_spec_sources（技能源码校验）: ${report.stats.skill_spec.checked}`);
    }
  }
  if (report.warnings.length > 0) {
    console.log('warnings（警告）:');
    for (const warning of report.warnings) {
      console.log(`- ${warning}`);
    }
  }
  if (report.errors.length > 0) {
    console.log('errors（错误）:');
    for (const error of report.errors) {
      console.log(`- ${error}`);
    }
  }
}

function main(argv) {
  try {
    const options = parseArgs(argv);
    if (options.help) {
      printUsage();
      return 0;
    }

    const sourceDir = getSourceDir(options.source);
    const report = validateRegistry(sourceDir);

    if (options.json) {
      process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    } else {
      printPretty(report);
    }

    return report.status === 'success' ? 0 : 1;
  } catch (error) {
    console.error(`validate-registry（校验注册表） failed: ${error.message}`);
    return 1;
  }
}

module.exports = {
  validateRegistry,
  main,
};

if (require.main === module) {
  process.exit(main(process.argv.slice(2)));
}
