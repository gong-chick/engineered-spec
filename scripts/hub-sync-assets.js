#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const {
  collectRelatedAssetIdsFromScenarios,
  mergeSelectionWithDerivedIds,
} = require("../internal/hub-sync-selection");

const PROJECT_ROOT = process.cwd();
const DEFAULT_BASE_URL = "http://localhost:3000";
const DEFAULT_HUB_PROJECT = path.resolve(PROJECT_ROOT, "../skill-q-platform");
const DEFAULT_CONFIG_PATH = path.resolve(PROJECT_ROOT, "scripts/hub-sync-assets.config.json");
const DEFAULT_CONFIG_EXAMPLE_PATH = path.resolve(
  PROJECT_ROOT,
  "scripts/hub-sync-assets.config.example.json",
);

const TEXT_FILE_EXTENSIONS = new Set([
  ".md",
  ".mdx",
  ".txt",
  ".json",
  ".jsonc",
  ".yaml",
  ".yml",
  ".js",
  ".cjs",
  ".mjs",
  ".ts",
  ".tsx",
  ".jsx",
  ".css",
  ".scss",
  ".sass",
  ".less",
  ".html",
  ".xml",
  ".svg",
  ".sh",
  ".ps1",
  ".py",
  ".sql",
  ".toml",
  ".env",
  ".gitignore",
  ".npmrc",
]);

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  run(options).catch((error) => {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`[hub-sync] failed: ${message}`);
    process.exitCode = 1;
  });
}

async function run(cliOptions) {
  const config = loadConfig(cliOptions.configPath);
  const resolved = resolveRuntimeOptions(cliOptions, config);
  const client = new HubClient(resolved);

  const shouldUseAdminSession =
    !resolved.skipRoles ||
    !resolved.skipScenarios ||
    resolved.hasAdminAuthInput;
  if (shouldUseAdminSession && !client.hasAdminAccess()) {
    await client.ensureAdminSession();
  }

  const categories = resolved.skipSkills && resolved.skipRules
    ? { skill: [], rule: [] }
    : client.hasAdminAccess()
      ? await loadCategories(client, resolved)
      : { skill: [], rule: [] };
  const skillBrowseItems = !client.hasAdminAccess() || (resolved.skipSkills && resolved.skipRoles && resolved.skipScenarios)
    ? []
    : await loadBrowseItems(client, "skill", resolved);
  const ruleBrowseItems = !client.hasAdminAccess() || (resolved.skipRules && resolved.skipRoles && resolved.skipScenarios)
    ? []
    : await loadBrowseItems(client, "rule", resolved);
  const roleResponse = resolved.skipRoles && resolved.skipScenarios
    ? { items: [] }
    : await client.getJson("/api/admin/roles");
  const scenarioResponse = resolved.skipScenarios
    ? { items: [] }
    : await client.getJson("/api/admin/scenarios");

  const localRegistries = {
    skills: readJson(path.resolve(PROJECT_ROOT, ".agents/registry/skills.json")).skills || {},
    rules: readJson(path.resolve(PROJECT_ROOT, ".agents/registry/rules.json")).rules || {},
    roles: readJson(path.resolve(PROJECT_ROOT, ".agents/registry/roles.json")).roles || {},
    scenarios:
      readJson(path.resolve(PROJECT_ROOT, ".agents/registry/scenario-packages.json")).scenario_packages || {},
  };
  const relatedScenarioIds = selectResourceIds(
    localRegistries.scenarios,
    resolved.fromScenarioSelection,
  );
  const relatedAssets = collectRelatedAssetIdsFromScenarios({
    scenarioIds: relatedScenarioIds,
    localScenarios: localRegistries.scenarios,
    localRoles: localRegistries.roles,
  });
  resolved.roleSelection = mergeSelectionWithDerivedIds({
    selection: resolved.roleSelection,
    selectionSpecified: resolved.roleSelectionSpecified,
    derivedIds: relatedAssets.roleIds,
    preferDerivedWhenImplicitAll: relatedScenarioIds.length > 0,
  });
  resolved.skillSelection = mergeSelectionWithDerivedIds({
    selection: resolved.skillSelection,
    selectionSpecified: resolved.skillSelectionSpecified,
    derivedIds: relatedAssets.skillIds,
    preferDerivedWhenImplicitAll: relatedScenarioIds.length > 0,
  });
  resolved.skipRoles = isSelectionNone(resolved.roleSelection);
  resolved.skipSkills = isSelectionNone(resolved.skillSelection);

  const hubState = {
    categories,
    skillsBySlug: indexBy(skillBrowseItems.items || [], "slug"),
    rulesBySlug: indexBy(ruleBrowseItems.items || [], "slug"),
    rolesBySlug: indexBy(roleResponse.items || [], "slug"),
    scenariosBySlug: indexBy(scenarioResponse.items || [], "slug"),
  };

  const summary = {
    skill: { created: 0, updated: 0, versioned: 0, skipped: 0 },
    rule: { created: 0, updated: 0, versioned: 0, skipped: 0 },
    role: { created: 0, updated: 0, versioned: 0, skipped: 0 },
    scenario: { created: 0, updated: 0, skipped: 0 },
  };

  if (!resolved.skipRules) {
    await syncRules({
      client,
      resolved,
      config,
      localRules: localRegistries.rules,
      hubState,
      summary,
    });
  }

  if (!resolved.skipSkills) {
    await syncSkills({
      client,
      resolved,
      config,
      localSkills: localRegistries.skills,
      hubState,
      summary,
    });
  }

  if (!resolved.skipRoles) {
    await syncRoles({
      client,
      resolved,
      config,
      localRoles: localRegistries.roles,
      hubState,
      summary,
    });
  }

  if (!resolved.skipScenarios) {
    await syncScenarios({
      client,
      resolved,
      config,
      localScenarios: localRegistries.scenarios,
      hubState,
      summary,
    });
  }

  printSummary(summary, resolved.dryRun);
}

function parseArgs(argv) {
  const args = {
    help: false,
    dryRun: false,
    baseUrl: undefined,
    hubProject: undefined,
    configPath: DEFAULT_CONFIG_PATH,
    adminEmail: undefined,
    adminPassword: undefined,
    adminCookie: undefined,
    adminSecret: undefined,
    agentApiKey: undefined,
    skills: undefined,
    rules: undefined,
    roles: undefined,
    scenarios: undefined,
    fromScenarios: undefined,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--help" || current === "-h") {
      args.help = true;
      continue;
    }
    if (current === "--dry-run") {
      args.dryRun = true;
      continue;
    }
    const next = argv[index + 1];
    if (current === "--base-url") {
      args.baseUrl = next;
      index += 1;
      continue;
    }
    if (current === "--hub-project") {
      args.hubProject = next;
      index += 1;
      continue;
    }
    if (current === "--config") {
      args.configPath = next ? path.resolve(PROJECT_ROOT, next) : DEFAULT_CONFIG_PATH;
      index += 1;
      continue;
    }
    if (current === "--admin-email") {
      args.adminEmail = next;
      index += 1;
      continue;
    }
    if (current === "--admin-password") {
      args.adminPassword = next;
      index += 1;
      continue;
    }
    if (current === "--admin-cookie") {
      args.adminCookie = next;
      index += 1;
      continue;
    }
    if (current === "--admin-secret") {
      args.adminSecret = next;
      index += 1;
      continue;
    }
    if (current === "--agent-api-key") {
      args.agentApiKey = next;
      index += 1;
      continue;
    }
    if (current === "--skills") {
      args.skills = next;
      index += 1;
      continue;
    }
    if (current === "--rules") {
      args.rules = next;
      index += 1;
      continue;
    }
    if (current === "--roles") {
      args.roles = next;
      index += 1;
      continue;
    }
    if (current === "--scenarios") {
      args.scenarios = next;
      index += 1;
      continue;
    }
    if (current === "--from-scenarios") {
      args.fromScenarios = next;
      index += 1;
      continue;
    }
    throw new Error(`unknown argument: ${current}`);
  }

  return args;
}

function printHelp() {
  console.log(`
Usage:
  node ./scripts/hub-sync-assets.js [options]

Options:
  --dry-run                    Only print planned operations
  --base-url <url>             Hub base url, default http://localhost:3000
  --hub-project <path>         Hub project path, default ../skill-q-platform
  --config <path>              Private config path, default scripts/hub-sync-assets.config.json
  --admin-email <email>        Hub admin email for login
  --admin-password <pwd>       Hub admin password for login
  --admin-cookie <cookie>      Existing admin_session cookie
  --admin-secret <secret>      HUB_ADMIN_SECRET, used for skill/rule author bypass and admin API bypass
  --agent-api-key <key>        Agent API key, required when Hub enforces upload login for skill/rule version updates
  --skills <all|csv|none>      Sync selected skills
  --rules <all|csv|none>       Sync selected rules
  --roles <all|csv|none>       Sync selected roles
  --scenarios <all|csv|none>   Sync selected scenarios
  --from-scenarios <all|csv|none>
                               Expand related roles and skills from scenario packages
  --help                       Show help

Examples:
  node ./scripts/hub-sync-assets.js --dry-run
  node ./scripts/hub-sync-assets.js --skills create-api,create-route --rules none
  node ./scripts/hub-sync-assets.js --from-scenarios change-to-release --rules none --scenarios none
  node ./scripts/hub-sync-assets.js --config scripts/hub-sync-assets.config.json

Notes:
  - If you pass http://localhost:3000/admin, the script will normalize it to http://localhost:3000.
  - skill/rule can run without admin login when your local Hub allows direct upload APIs.
  - Existing skill/rule resources need version publishing for file changes. If Hub requires upload login,
    you must provide --agent-api-key or config hub.agentApiKey for those version updates.
  - existing skill/rule updates usually still need --admin-secret or --agent-api-key.
  - if your local Hub lets requireAdminJson accept HUB_ADMIN_SECRET, roles/scenarios can also use --admin-secret.
  - otherwise roles/scenarios still require the admin session.
  - A config example is available at ${path.relative(PROJECT_ROOT, DEFAULT_CONFIG_EXAMPLE_PATH)}.
`.trim());
}

function loadConfig(configPath) {
  if (!configPath || !fs.existsSync(configPath)) {
    return {};
  }
  return readJson(configPath);
}

function resolveRuntimeOptions(cliOptions, config) {
  const hubProjectDir = path.resolve(
    PROJECT_ROOT,
    cliOptions.hubProject || config?.hub?.projectDir || DEFAULT_HUB_PROJECT,
  );
  const envFileValues = loadEnvOverrides(hubProjectDir);

  const baseUrl = normalizeBaseUrl(
    cliOptions.baseUrl ||
      process.env.HUB_SYNC_BASE_URL ||
      config?.hub?.baseUrl ||
      DEFAULT_BASE_URL,
  );

  const adminSecret =
    cliOptions.adminSecret ||
    process.env.HUB_ADMIN_SECRET ||
    process.env.HUB_SYNC_ADMIN_SECRET ||
    config?.hub?.adminSecret ||
    envFileValues.HUB_ADMIN_SECRET ||
    "";

  return {
    baseUrl,
    hubProjectDir,
    adminEmail:
      cliOptions.adminEmail ||
      process.env.HUB_SYNC_ADMIN_EMAIL ||
      config?.hub?.adminEmail ||
      "",
    adminPassword:
      cliOptions.adminPassword ||
      process.env.HUB_SYNC_ADMIN_PASSWORD ||
      config?.hub?.adminPassword ||
      "",
    adminCookie:
      cliOptions.adminCookie ||
      process.env.HUB_SYNC_ADMIN_COOKIE ||
      config?.hub?.adminSessionCookie ||
      "",
    adminSecret,
    agentApiKey:
      cliOptions.agentApiKey ||
      process.env.HUB_SYNC_AGENT_API_KEY ||
      config?.hub?.agentApiKey ||
      "",
    hasAdminAuthInput: Boolean(
      cliOptions.adminCookie ||
      process.env.HUB_SYNC_ADMIN_COOKIE ||
      config?.hub?.adminSessionCookie ||
        adminSecret ||
        ((cliOptions.adminEmail ||
          process.env.HUB_SYNC_ADMIN_EMAIL ||
          config?.hub?.adminEmail) &&
          (cliOptions.adminPassword ||
            process.env.HUB_SYNC_ADMIN_PASSWORD ||
            config?.hub?.adminPassword)),
    ),
    dryRun: Boolean(cliOptions.dryRun),
    config,
    skillSelectionSpecified: typeof cliOptions.skills !== "undefined",
    roleSelectionSpecified: typeof cliOptions.roles !== "undefined",
    skillSelection: normalizeSelection(cliOptions.skills),
    ruleSelection: normalizeSelection(cliOptions.rules),
    roleSelection: normalizeSelection(cliOptions.roles),
    scenarioSelection: normalizeSelection(cliOptions.scenarios),
    fromScenarioSelection: normalizeSelection(
      typeof cliOptions.fromScenarios === "undefined" ? "none" : cliOptions.fromScenarios,
    ),
    skipSkills: isSelectionNone(normalizeSelection(cliOptions.skills)),
    skipRules: isSelectionNone(normalizeSelection(cliOptions.rules)),
    skipRoles: isSelectionNone(normalizeSelection(cliOptions.roles)),
    skipScenarios: isSelectionNone(normalizeSelection(cliOptions.scenarios)),
  };
}

function normalizeSelection(value) {
  if (!value) return { mode: "all", values: new Set() };
  const trimmed = String(value).trim();
  if (!trimmed || trimmed === "all") {
    return { mode: "all", values: new Set() };
  }
  if (trimmed === "none") {
    return { mode: "none", values: new Set() };
  }
  return {
    mode: "pick",
    values: new Set(
      trimmed
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  };
}

function isSelectionNone(selection) {
  return selection.mode === "none";
}

function loadEnvOverrides(hubProjectDir) {
  const files = [".env.local", ".env.development.local", ".env", ".env.development"];
  const merged = {};
  for (const filename of files) {
    const filePath = path.join(hubProjectDir, filename);
    if (!fs.existsSync(filePath)) continue;
    Object.assign(merged, parseEnvLikeFile(fs.readFileSync(filePath, "utf8")));
  }
  return merged;
}

function parseEnvLikeFile(content) {
  const output = {};
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const match = line.match(/^([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
    if (!match) continue;
    let value = match[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    output[match[1]] = value;
  }
  return output;
}

function normalizeBaseUrl(input) {
  const url = new URL(String(input));
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

class HubClient {
  constructor(options) {
    this.baseUrl = options.baseUrl;
    this.adminEmail = options.adminEmail;
    this.adminPassword = options.adminPassword;
    this.cookie = options.adminCookie || "";
    this.adminSecret = options.adminSecret || "";
    this.agentApiKey = options.agentApiKey || "";
    this.dryRun = options.dryRun;
  }

  hasAdminSession() {
    return Boolean(this.cookie);
  }

  hasAdminAccess() {
    return Boolean(this.cookie || this.adminSecret);
  }

  async ensureAdminSession() {
    if (!this.cookie) {
      if (!this.adminEmail || !this.adminPassword) {
        throw new Error(
          "missing admin auth: provide --admin-email/--admin-password, --admin-cookie, or hub config",
        );
      }
      await this.login();
    }
    await this.getJson("/api/admin/auth/me");
  }

  async login() {
    const response = await fetch(`${this.baseUrl}/api/admin/auth/login`, {
      method: "POST",
      headers: {
        "content-type": "application/json",
        accept: "application/json",
      },
      body: JSON.stringify({
        email: this.adminEmail,
        password: this.adminPassword,
      }),
    });
    if (!response.ok) {
      throw new Error(`admin login failed: ${await readErrorText(response)}`);
    }
    const cookies = getResponseCookies(response);
    const adminSession = cookies.find((cookie) => cookie.startsWith("admin_session="));
    if (!adminSession) {
      throw new Error("admin login succeeded but no admin_session cookie was returned");
    }
    this.cookie = adminSession;
  }

  async getJson(pathname) {
    return this.requestJson(pathname, { method: "GET" });
  }

  async postJson(pathname, body) {
    return this.requestJson(pathname, {
      method: "POST",
      headers: {
        "content-type": "application/json",
      },
      body: JSON.stringify(body),
    });
  }

  async postForm(pathname, formData) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      method: "POST",
      headers: this.buildHeaders({}),
      body: formData,
    });
    if (!response.ok) {
      throw new Error(await readErrorText(response));
    }
    return unwrapApiResponse(await response.json());
  }

  async requestJson(pathname, init) {
    const response = await fetch(`${this.baseUrl}${pathname}`, {
      ...init,
      headers: this.buildHeaders(init.headers || {}),
    });
    if (!response.ok) {
      throw new Error(await readErrorText(response));
    }
    return unwrapApiResponse(await response.json());
  }

  buildHeaders(headers) {
    const next = {
      accept: "application/json",
      ...headers,
    };
    if (this.cookie) {
      next.cookie = this.cookie;
    }
    if (this.adminSecret) {
      next["x-hub-admin-secret"] = this.adminSecret;
    }
    if (this.agentApiKey) {
      next.authorization = `Bearer ${this.agentApiKey}`;
    }
    return next;
  }
}

async function loadCategories(client) {
  const [skill, rule] = await Promise.all([
    client.getJson("/api/admin/categories?resourceType=skill"),
    client.getJson("/api/admin/categories?resourceType=rule"),
  ]);
  return {
    skill: skill.items || [],
    rule: rule.items || [],
  };
}

async function loadBrowseItems(client, resourceType) {
  const pageSize = 100;
  let page = 1;
  let total = 0;
  const items = [];
  do {
    const response = await client.getJson(
      `/api/admin/resources/browse?resourceType=${resourceType}&page=${page}&pageSize=${pageSize}`,
    );
    total = Number(response.total || 0);
    items.push(...(response.items || []));
    page += 1;
  } while (items.length < total);
  return { items };
}

async function syncRules(context) {
  const ids = selectResourceIds(context.localRules, context.resolved.ruleSelection);
  for (const ruleId of ids) {
    const local = context.localRules[ruleId];
    const desiredAssets = buildRuleAssets(ruleId, local, context);
    if (desiredAssets.length === 0) {
      context.summary.rule.skipped += 1;
      continue;
    }
    for (const desired of desiredAssets) {
      if (!desired) {
        context.summary.rule.skipped += 1;
        continue;
      }

      let existing = context.hubState.rulesBySlug[desired.slug];
      if (!existing) {
        const publicExisting = await fetchPublicResource(context.client, "rule", desired.slug);
        if (publicExisting) {
          existing = publicExisting;
          context.hubState.rulesBySlug[desired.slug] = buildPreviewSkillRuleState(
            "rule",
            publicExisting,
            desired,
          );
        }
      }
      if (!existing) {
        if (!desired.categorySlug) {
          warn(`rule ${ruleId}: missing categorySlug, skip create`);
          context.summary.rule.skipped += 1;
          continue;
        }
        if (context.resolved.dryRun) {
          info(`rule ${desired.slug}: create`);
          context.summary.rule.created += 1;
          context.hubState.rulesBySlug[desired.slug] = buildPreviewSkillRuleState(
            "rule",
            null,
            desired,
          );
          continue;
        }

        const createResult = await createSkillRuleOrNull({
          type: "rule",
          desired,
          client: context.client,
        });
        if (createResult?.created) {
          info(`rule ${desired.slug}: created`);
          context.summary.rule.created += 1;
          context.hubState.rulesBySlug[desired.slug] = {
            id: createResult.resource?.id || desired.slug,
            slug: desired.slug,
            name: desired.name,
            registryId: desired.registryId,
            manifestId: desired.manifestId,
            tags: desired.tags,
            supportedProfiles: desired.supportedProfiles,
            categoryName: createResult.resource?.category?.name || desired.categorySlug,
          };
          continue;
        }

        const conflictExisting = await fetchConflictResource({
          type: "rule",
          desiredSlug: desired.slug,
          conflictSlugs: createResult?.conflictSlugs || [],
          client: context.client,
        });
        if (!conflictExisting) {
          throw new Error(`rule ${ruleId}: resource create conflicted but public resource was not found`);
        }
        existing = conflictExisting;
        context.hubState.rulesBySlug[desired.slug] = buildPreviewSkillRuleState(
          "rule",
          conflictExisting,
          desired,
        );
      }

      const existingDetails = existing
        ? await fetchPublicResource(context.client, "rule", existing.slug || desired.slug) || existing
        : null;
      const metadataPatch = existingDetails
        ? buildSkillRuleMetadataPatch("rule", desired, existingDetails)
        : buildSkillRuleFullPatch(desired);
      if (metadataPatch) {
        if (context.resolved.dryRun) {
          info(`rule ${desired.slug}: update metadata`);
        } else {
          await context.client.postJson(
            `/api/rules/${encodeURIComponent(existingDetails?.slug || existing?.slug || desired.slug)}`,
            metadataPatch,
          );
          info(`rule ${desired.slug}: metadata updated`);
        }
        context.summary.rule.updated += 1;
      }

      const versionChanged = await ensureSkillRuleVersion({
        type: "rule",
        desired,
        slug: desired.slug,
        client: context.client,
        dryRun: context.resolved.dryRun,
      });
      if (versionChanged === "versioned") {
        context.summary.rule.versioned += 1;
      } else if (!metadataPatch) {
        context.summary.rule.skipped += 1;
      }

      context.hubState.rulesBySlug[desired.slug] = buildPreviewSkillRuleState(
        "rule",
        existing,
        desired,
      );
    }
  }
}

async function syncSkills(context) {
  const ids = selectResourceIds(context.localSkills, context.resolved.skillSelection);
  for (const skillId of ids) {
    const local = context.localSkills[skillId];
    const desiredAssets = buildSkillAssets(skillId, local, context);
    if (desiredAssets.length === 0) {
      context.summary.skill.skipped += 1;
      continue;
    }
    for (const desired of desiredAssets) {
      if (!desired) {
        context.summary.skill.skipped += 1;
        continue;
      }

      let existing = context.hubState.skillsBySlug[desired.slug];
      if (!existing) {
        const publicExisting = await fetchPublicResource(context.client, "skill", desired.slug);
        if (publicExisting) {
          existing = publicExisting;
          context.hubState.skillsBySlug[desired.slug] = buildPreviewSkillRuleState(
            "skill",
            publicExisting,
            desired,
          );
        }
      }
      if (!existing) {
        if (!desired.categorySlug) {
          warn(`skill ${skillId}: missing categorySlug, skip create`);
          context.summary.skill.skipped += 1;
          continue;
        }
        if (context.resolved.dryRun) {
          info(`skill ${desired.slug}: create`);
          context.summary.skill.created += 1;
          context.hubState.skillsBySlug[desired.slug] = buildPreviewSkillRuleState(
            "skill",
            null,
            desired,
          );
          continue;
        }

        const createResult = await createSkillRuleOrNull({
          type: "skill",
          desired,
          client: context.client,
        });
        if (createResult?.created) {
          info(`skill ${desired.slug}: created`);
          context.summary.skill.created += 1;
          context.hubState.skillsBySlug[desired.slug] = {
            id: createResult.resource?.id || desired.slug,
            slug: desired.slug,
            name: desired.name,
            registryId: desired.registryId,
            manifestId: desired.manifestId,
            tags: desired.tags,
            supportedProfiles: desired.supportedProfiles,
            categoryName: createResult.resource?.category?.name || desired.categorySlug,
          };
          continue;
        }

        const conflictExisting = await fetchConflictResource({
          type: "skill",
          desiredSlug: desired.slug,
          conflictSlugs: createResult?.conflictSlugs || [],
          client: context.client,
        });
        if (!conflictExisting) {
          throw new Error(`skill ${skillId}: resource create conflicted but public resource was not found`);
        }
        existing = conflictExisting;
        context.hubState.skillsBySlug[desired.slug] = buildPreviewSkillRuleState(
          "skill",
          conflictExisting,
          desired,
        );
      }

      const existingDetails = existing
        ? await fetchPublicResource(context.client, "skill", existing.slug || desired.slug) || existing
        : null;
      const metadataPatch = existingDetails
        ? buildSkillRuleMetadataPatch("skill", desired, existingDetails)
        : buildSkillRuleFullPatch(desired);
      if (metadataPatch) {
        if (context.resolved.dryRun) {
          info(`skill ${desired.slug}: update metadata`);
        } else {
          await context.client.postJson(
            `/api/skills/${encodeURIComponent(existingDetails?.slug || existing?.slug || desired.slug)}`,
            metadataPatch,
          );
          info(`skill ${desired.slug}: metadata updated`);
        }
        context.summary.skill.updated += 1;
      }

      const versionChanged = await ensureSkillRuleVersion({
        type: "skill",
        desired,
        slug: desired.slug,
        client: context.client,
        dryRun: context.resolved.dryRun,
      });
      if (versionChanged === "versioned") {
        context.summary.skill.versioned += 1;
      } else if (!metadataPatch) {
        context.summary.skill.skipped += 1;
      }

      context.hubState.skillsBySlug[desired.slug] = buildPreviewSkillRuleState(
        "skill",
        existing,
        desired,
      );
    }
  }
}

async function syncRoles(context) {
  const ids = selectResourceIds(context.localRoles, context.resolved.roleSelection);
  for (const roleId of ids) {
    const local = context.localRoles[roleId];
    const desired = await buildRoleAsset(roleId, local, context);
    if (!desired) {
      context.summary.role.skipped += 1;
      continue;
    }

    const existing = context.hubState.rolesBySlug[desired.slug];
    if (!existing) {
      if (context.resolved.dryRun) {
        info(`role ${roleId}: create`);
        context.summary.role.created += 1;
        context.hubState.rolesBySlug[desired.slug] = buildPreviewRoleState(null, desired);
      } else {
        await context.client.postJson("/api/admin/roles", desired.payload);
        info(`role ${roleId}: created`);
        context.summary.role.created += 1;
        const refreshed = await context.client.getJson("/api/admin/roles");
        context.hubState.rolesBySlug = indexBy(refreshed.items || [], "slug");
      }
      continue;
    }

    const existingPayload = normalizeRoleResponseToPayload(existing);
    if (deepEqual(existingPayload, desired.payload)) {
      context.summary.role.skipped += 1;
      info(`role ${roleId}: no changes`);
      continue;
    }
    const needsVersion = await roleVersionWouldChange({
      client: context.client,
      slug: existing.slug,
      desiredVersionFiles: desired.versionFiles,
    });

    if (context.resolved.dryRun) {
      info(`role ${roleId}: update${needsVersion ? " + version" : ""}`);
      context.summary.role.updated += 1;
      if (needsVersion) {
        context.summary.role.versioned += 1;
      }
      context.hubState.rolesBySlug[desired.slug] = buildPreviewRoleState(existing, desired);
      continue;
    }

    await context.client.postJson("/api/admin/roles/update", {
      id: existing.id,
      ...desired.payload,
    });
    await ensureRoleVersion({
      client: context.client,
      slug: existing.slug,
      desiredVersionFiles: desired.versionFiles,
      dryRun: false,
    });
    info(`role ${roleId}: updated`);
    context.summary.role.updated += 1;
    if (needsVersion) {
      context.summary.role.versioned += 1;
    }

    const refreshed = await context.client.getJson("/api/admin/roles");
    context.hubState.rolesBySlug = indexBy(refreshed.items || [], "slug");
  }
}

async function syncScenarios(context) {
  const ids = selectResourceIds(context.localScenarios, context.resolved.scenarioSelection);
  for (const scenarioId of ids) {
    const local = context.localScenarios[scenarioId];
    const desired = buildScenarioAsset(scenarioId, local, context);
    if (!desired) {
      context.summary.scenario.skipped += 1;
      continue;
    }

    const existing = context.hubState.scenariosBySlug[desired.slug];
    if (!existing) {
      if (context.resolved.dryRun) {
        info(`scenario ${scenarioId}: create`);
        context.summary.scenario.created += 1;
        context.hubState.scenariosBySlug[desired.slug] = buildPreviewScenarioState(null, desired);
      } else {
        await context.client.postJson("/api/admin/scenarios", desired.payload);
        info(`scenario ${scenarioId}: created`);
        context.summary.scenario.created += 1;
        const refreshed = await context.client.getJson("/api/admin/scenarios");
        context.hubState.scenariosBySlug = indexBy(refreshed.items || [], "slug");
      }
      continue;
    }

    const existingPayload = normalizeScenarioResponseToPayload(existing);
    if (deepEqual(existingPayload, desired.payload)) {
      context.summary.scenario.skipped += 1;
      info(`scenario ${scenarioId}: no changes`);
      continue;
    }

    if (context.resolved.dryRun) {
      info(`scenario ${scenarioId}: update`);
      context.summary.scenario.updated += 1;
      context.hubState.scenariosBySlug[desired.slug] = buildPreviewScenarioState(existing, desired);
      continue;
    }

    await context.client.postJson("/api/admin/scenarios/update", {
      id: existing.id,
      ...desired.payload,
    });
    info(`scenario ${scenarioId}: updated`);
    context.summary.scenario.updated += 1;

    const refreshed = await context.client.getJson("/api/admin/scenarios");
    context.hubState.scenariosBySlug = indexBy(refreshed.items || [], "slug");
  }
}

function buildSkillAssets(skillId, local, context) {
  const variants = buildProfileVariantSpecs({
    type: "skill",
    resourceId: skillId,
    local,
    hubState: context.hubState,
  });
  if (variants.length === 0) {
    return [buildSkillAsset(skillId, local, context, null)].filter(Boolean);
  }
  return variants
    .map((variant) => buildSkillAsset(skillId, local, context, variant))
    .filter(Boolean);
}

function buildRuleAssets(ruleId, local, context) {
  const variants = buildProfileVariantSpecs({
    type: "rule",
    resourceId: ruleId,
    local,
    hubState: context.hubState,
  });
  if (variants.length === 0) {
    return [buildRuleAsset(ruleId, local, context, null)].filter(Boolean);
  }
  return variants
    .map((variant) => buildRuleAsset(ruleId, local, context, variant))
    .filter(Boolean);
}

function buildSkillAsset(skillId, local, context, variant) {
  const override = resolveResourceOverride({
    config: context.config,
    type: "skills",
    resourceId: skillId,
    variantSlug: variant?.slug,
  });
  const files = collectSkillFiles(local, skillId, variant?.sourcePaths);
  if (files.length === 0) {
    warn(`skill ${skillId}: no files collected`);
    return null;
  }

  const primaryFile = pickPrimaryTextFile(files, "SKILL.md") || files[0];
  const parsed = parseFrontmatterFile(primaryFile.content, "skill");
  const name = override.name || variant?.existing?.name || parsed.name || skillId;
  const description =
    override.description ||
    parsed.description ||
    variant?.existing?.description ||
    `Sync from local skill ${skillId}`;
  const supportedProfiles =
    override.supportedProfiles ||
    variant?.supportedProfiles ||
    Object.keys(local.sourceByProfile || {});
  const domains = Array.isArray(local.domains) ? local.domains : [];
  const categorySlug = resolveCategorySlug({
    type: "skill",
    resourceId: skillId,
    override,
    domains,
    categories: context.hubState.categories.skill,
    config: context.config,
  });

  return {
    slug: variant?.slug || override.slug || skillId,
    registryId: override.registryId || skillId,
    manifestId: override.manifestId || override.registryId || skillId,
    name,
    description,
    longDescription: override.longDescription || "",
    author: override.author || context.config?.defaults?.author || "Hub Admin",
    categorySlug,
    tags: uniqueKeepOrder(override.tags || domains),
    supportedProfiles: uniqueKeepOrder(supportedProfiles),
    downloadPolicy: override.downloadPolicy || context.config?.defaults?.downloadPolicy || "login",
    files,
  };
}

function buildRuleAsset(ruleId, local, context, variant) {
  const override = resolveResourceOverride({
    config: context.config,
    type: "rules",
    resourceId: ruleId,
    variantSlug: variant?.slug,
  });
  const files = collectRuleFiles(local, variant?.sourcePaths);
  if (files.length === 0) {
    warn(`rule ${ruleId}: no files collected`);
    return null;
  }

  const primaryFile = files[0];
  const parsed = parseFrontmatterFile(primaryFile.content, "rule");
  const name = override.name || variant?.existing?.name || parsed.name || ruleId;
  const description =
    override.description ||
    parsed.description ||
    variant?.existing?.description ||
    `Sync from local rule ${ruleId}`;
  const supportedProfiles =
    override.supportedProfiles ||
    variant?.supportedProfiles ||
    Object.keys(local.sourceByProfile || {});
  const domains = Array.isArray(local.domains) ? local.domains : [];
  const categorySlug = resolveCategorySlug({
    type: "rule",
    resourceId: ruleId,
    override,
    domains,
    categories: context.hubState.categories.rule,
    config: context.config,
  });

  return {
    slug: variant?.slug || override.slug || ruleId,
    registryId: override.registryId || ruleId,
    manifestId: override.manifestId || override.registryId || ruleId,
    name,
    description,
    longDescription: override.longDescription || "",
    author: override.author || context.config?.defaults?.author || "Hub Admin",
    categorySlug,
    tags: uniqueKeepOrder(override.tags || domains),
    supportedProfiles: uniqueKeepOrder(supportedProfiles),
    downloadPolicy: override.downloadPolicy || context.config?.defaults?.downloadPolicy || "login",
    files,
  };
}

async function buildRoleAsset(roleId, local, context) {
  const override = resolveResourceOverride({
    config: context.config,
    type: "roles",
    resourceId: roleId,
  });
  const sourcePath = path.resolve(PROJECT_ROOT, local.source);
  if (!fs.existsSync(sourcePath)) {
    warn(`role ${roleId}: source not found ${local.source}`);
    return null;
  }

  const uploadParsed = await parseRoleWithHub(context.client, sourcePath);
  const registrySkillSlugs = uniqueKeepOrder([
    ...(Array.isArray(local.skill_priority) ? local.skill_priority : []),
    ...(Array.isArray(local.micro_skill_allowlist) ? local.micro_skill_allowlist : []),
    ...(Array.isArray(uploadParsed.roleData.preferredSkills) ? uploadParsed.roleData.preferredSkills : []),
  ]);
  const registryRuleSlugs = uniqueKeepOrder(Array.isArray(local.rule_ids) ? local.rule_ids : []);
  const skillIds = uniqueKeepOrder(
    registrySkillSlugs.flatMap((slug) => resolveLinkedResourceIds("skill", slug, context.hubState)),
  );
  const ruleIds = uniqueKeepOrder(
    registryRuleSlugs.flatMap((slug) => resolveLinkedResourceIds("rule", slug, context.hubState)),
  );
  const domainIds = resolveRoleDomainIds({
    override,
    local,
    uploadParsed,
    config: context.config,
  });
  const name = override.name || uploadParsed.roleData.name || local.name || roleId;
  const slug = override.slug || uploadParsed.roleData.slug || roleId;
  const payload = {
    name,
    slug,
    registryId: override.registryId || roleId,
    manifestId: override.manifestId || override.registryId || roleId,
    author: override.author || context.config?.defaults?.author || "Hub Admin",
    description: override.description || uploadParsed.roleData.description || `${name} role`,
    longDescription: override.longDescription || null,
    publishStatus: override.publishStatus || context.config?.defaults?.rolePublishStatus || "draft",
    roleStatus: override.roleStatus || local.status || uploadParsed.roleData.roleStatus || "draft",
    tags: uniqueKeepOrder(override.tags || local.domains || []),
    supportedProfiles: uniqueKeepOrder(override.supportedProfiles || local.profiles || []),
    triggers: uniqueKeepOrder(override.triggers || uploadParsed.roleData.triggers || []),
    preferredSkills: uniqueKeepOrder(override.preferredSkills || registrySkillSlugs),
    reads: uniqueKeepOrder(override.reads || uploadParsed.roleData.reads || []),
    writes: uniqueKeepOrder(override.writes || uploadParsed.roleData.writes || []),
    handoffTo: uniqueKeepOrder(override.handoffTo || uploadParsed.roleData.handoffTo || []),
    rolePositioning: override.rolePositioning || uploadParsed.sections.rolePositioning || null,
    workingPrinciples: uniqueKeepOrder(
      override.workingPrinciples || uploadParsed.sections.workingPrinciples || [],
    ),
    requiredSteps: uniqueKeepOrder(override.requiredSteps || uploadParsed.sections.requiredSteps || []),
    executionContract: override.executionContract || uploadParsed.sections.executionContract || null,
    outputStandard: override.outputStandard || uploadParsed.sections.outputStandard || null,
    prohibitedActions: uniqueKeepOrder(
      override.prohibitedActions || uploadParsed.sections.prohibitedActions || [],
    ),
    handoffNotes: override.handoffNotes || uploadParsed.sections.handoffNotes || null,
    skillIds,
    ruleIds,
    domainIds,
  };

  const versionFiles = buildRoleVersionFiles({
    ...payload,
    skillSlugs: registrySkillSlugs,
    ruleSlugs: registryRuleSlugs,
    domainSlugs: uniqueKeepOrder(override.domainSlugs || local.domains || uploadParsed.roleData.domains || []),
  });

  return {
    slug,
    payload,
    versionFiles,
  };
}

function buildScenarioAsset(scenarioId, local, context) {
  const override = resolveResourceOverride({
    config: context.config,
    type: "scenarios",
    resourceId: scenarioId,
  });
  const roleItems = [];
  for (const roleSlug of local.roles || []) {
    const role = context.hubState.rolesBySlug[roleSlug];
    if (!role) {
      warn(`scenario ${scenarioId}: role ${roleSlug} not found in Hub, skip scenario`);
      return null;
    }
    roleItems.push({
      id: role.id,
      isOptional: Array.isArray(override.optionalRoles) && override.optionalRoles.includes(roleSlug),
    });
  }

  const explicitSkillIds = uniqueKeepOrder(
    (local.skills || []).flatMap((slug) => resolveLinkedResourceIds("skill", slug, context.hubState)),
  );
  const explicitRuleIds = uniqueKeepOrder(
    (local.rules || []).flatMap((slug) => resolveLinkedResourceIds("rule", slug, context.hubState)),
  );
  const roleSkillIds = roleItems.flatMap((item) => {
    const role = findRoleById(context.hubState, item.id);
    return role ? (role.skillLinks || []).map((link) => link.skillId).filter(Boolean) : [];
  });
  const roleRuleIds = roleItems.flatMap((item) => {
    const role = findRoleById(context.hubState, item.id);
    return role ? (role.ruleLinks || []).map((link) => link.ruleId).filter(Boolean) : [];
  });
  const skillIds = uniqueKeepOrder([...explicitSkillIds, ...roleSkillIds]);
  const ruleIds = uniqueKeepOrder([...explicitRuleIds, ...roleRuleIds]);
  const domainIds = resolveScenarioDomainIds({
    scenario: local,
    override,
    roleItems,
    hubState: context.hubState,
    config: context.config,
  });
  const supportedProfiles = uniqueKeepOrder(
    override.supportedProfiles ||
      local.profiles ||
      context.config?.defaults?.scenarioSupportedProfiles ||
      ["vue", "react"],
  );
  const name = override.name || scenarioId;
  const payload = {
    name,
    slug: override.slug || scenarioId,
    description:
      override.description ||
      `自动同步场景方案，入口 ${override.entryRoleSlug || local.roles?.[0] || "unknown"}，角色链路：${(local.roles || []).join(" -> ")}`,
    longDescription: override.longDescription || null,
    publishStatus: override.publishStatus || context.config?.defaults?.scenarioPublishStatus || "draft",
    tags: uniqueKeepOrder(override.tags || local.domains || []),
    supportedProfiles,
    recommendedIdes: uniqueKeepOrder(
      override.recommendedIdes || context.config?.defaults?.scenarioRecommendedIdes || ["cursor"],
    ),
    entryRoleId: resolveScenarioEntryRoleId(override, local, context.hubState),
    isFeatured:
      typeof override.isFeatured === "boolean"
        ? override.isFeatured
        : Boolean(context.config?.defaults?.scenarioFeatured),
    roles: sortByKey(roleItems, (row) => `${row.id}:${row.isOptional ? 1 : 0}`),
    skillIds: sortStrings(skillIds),
    ruleIds: sortStrings(ruleIds),
    domainIds: sortStrings(domainIds),
  };

  if (!payload.entryRoleId && roleItems.length > 0) {
    payload.entryRoleId = roleItems[0].id;
  }

  return {
    slug: payload.slug,
    payload,
  };
}

async function ensureSkillRuleVersion({ type, desired, slug, client, dryRun }) {
  const versions = await client.getJson(`/api/${type === "skill" ? "skills" : "rules"}/${encodeURIComponent(slug)}/versions`);
  const latest = Array.isArray(versions)
    ? versions.find((item) => item && item.isLatest) || versions[0]
    : null;
  const currentFiles = normalizeFiles(latest?.files || []);
  const desiredFiles = normalizeFiles(desired.files || []);
  if (deepEqual(currentFiles, desiredFiles)) {
    info(`${type} ${slug}: version files unchanged`);
    return "unchanged";
  }

  if (dryRun) {
    info(`${type} ${slug}: publish version`);
    return "versioned";
  }

  const nextVersion = suggestNextPatchVersion(
    Array.isArray(versions) ? versions.map((item) => item.version).filter(Boolean) : [],
  );
  try {
    await client.postJson(`/api/${type === "skill" ? "skills" : "rules"}/${encodeURIComponent(slug)}/versions`, {
      version: nextVersion,
      changelog: "sync from local registry",
      files: desired.files,
      isLatest: true,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes("请先登录后再上传")) {
      throw new Error(
        `${type} ${slug}: version update requires agent login. Provide --agent-api-key or hub.agentApiKey.`,
      );
    }
    throw error;
  }
  info(`${type} ${slug}: version ${nextVersion} created`);
  return "versioned";
}

async function ensureRoleVersion({ client, slug, desiredVersionFiles, dryRun }) {
  const needsChange = await roleVersionWouldChange({
    client,
    slug,
    desiredVersionFiles,
  });
  if (!needsChange) {
    info(`role ${slug}: version files unchanged`);
    return;
  }
  if (dryRun) {
    info(`role ${slug}: publish version`);
    return;
  }
  const versions = await client.getJson(`/api/roles/${encodeURIComponent(slug)}/versions`);
  const nextVersion = suggestNextPatchVersion(
    Array.isArray(versions) ? versions.map((item) => item.version).filter(Boolean) : [],
  );
  await client.postJson(`/api/roles/${encodeURIComponent(slug)}/versions`, {
    version: nextVersion,
    changelog: "sync from local registry",
    isLatest: true,
  });
  info(`role ${slug}: version ${nextVersion} created`);
}

async function roleVersionWouldChange({ client, slug, desiredVersionFiles }) {
  const versions = await client.getJson(`/api/roles/${encodeURIComponent(slug)}/versions`);
  const latest = Array.isArray(versions)
    ? versions.find((item) => item && item.isLatest) || versions[0]
    : null;
  const currentFiles = normalizeFiles(latest?.files || []);
  const desiredFiles = normalizeFiles(desiredVersionFiles || []);
  return !deepEqual(currentFiles, desiredFiles);
}

function buildProfileVariantSpecs({ type, resourceId, local, hubState }) {
  if (!local?.sourceByProfile || typeof local.sourceByProfile !== "object") {
    return [];
  }
  const profiles = Object.keys(local.sourceByProfile).sort();
  if (profiles.length <= 1) {
    return [];
  }
  const existingMatches = findResourcesByRegistryKey(type, resourceId, hubState);
  if (existingMatches.length === 0) {
    return [];
  }
  return profiles.map((profile) => {
    const existing = pickProfileResourceVariant(type, resourceId, profile, existingMatches);
    return {
      profile,
      slug: existing?.slug || defaultSplitResourceSlug(type, resourceId, profile),
      sourcePaths: [local.sourceByProfile[profile]].filter(Boolean),
      supportedProfiles: [profile],
      existing,
    };
  });
}

function findResourcesByRegistryKey(type, resourceId, hubState) {
  const collection = type === "skill" ? hubState.skillsBySlug : hubState.rulesBySlug;
  return Object.values(collection || {}).filter(
    (item) =>
      item &&
      (item.registryId === resourceId || item.manifestId === resourceId),
  );
}

function pickProfileResourceVariant(type, resourceId, profile, items) {
  const fallbackSlug = defaultSplitResourceSlug(type, resourceId, profile);
  return (
    items.find((item) => normalizeStringArray(item.supportedProfiles).includes(profile)) ||
    items.find((item) => item.slug === fallbackSlug) ||
    null
  );
}

function defaultSplitResourceSlug(type, resourceId, profile) {
  return type === "rule" ? `${profile}-${resourceId}` : `${resourceId}-${profile}`;
}

function resolveLinkedResourceIds(type, resourceId, hubState) {
  const collection = type === "skill" ? hubState.skillsBySlug : hubState.rulesBySlug;
  const direct = collection?.[resourceId];
  if (direct?.id) {
    return [direct.id];
  }
  return findResourcesByRegistryKey(type, resourceId, hubState)
    .map((item) => item.id)
    .filter(Boolean);
}

function collectSkillFiles(local, skillId, forcedSourcePaths) {
  const sourcePaths = forcedSourcePaths || resolveSourcePaths(local);
  if (sourcePaths.length === 0) return [];
  const absoluteSkillDirs = uniqueKeepOrder(
    sourcePaths.map((relativePath) => path.dirname(path.resolve(PROJECT_ROOT, relativePath))),
  );
  const baseDir = commonAncestor(absoluteSkillDirs);
  const fileEntries = [];
  for (const skillDir of absoluteSkillDirs) {
    for (const absoluteFile of walkFiles(skillDir)) {
      const buffer = fs.readFileSync(absoluteFile);
      if (looksBinary(buffer, absoluteFile)) {
        warn(`skill ${skillId}: skipped binary file ${path.relative(PROJECT_ROOT, absoluteFile)}`);
        continue;
      }
      const relativePath = toPosixPath(path.relative(baseDir, absoluteFile));
      fileEntries.push({
        name: path.basename(absoluteFile),
        path: relativePath,
        content: buffer.toString("utf8"),
      });
    }
  }
  return normalizeFiles(fileEntries);
}

function collectRuleFiles(local, forcedSourcePaths) {
  const sourcePaths = forcedSourcePaths || resolveSourcePaths(local);
  if (sourcePaths.length === 0) return [];
  const absoluteFiles = uniqueKeepOrder(sourcePaths.map((relativePath) => path.resolve(PROJECT_ROOT, relativePath)));
  const baseDir = commonAncestor(absoluteFiles.map((absoluteFile) => path.dirname(absoluteFile)));
  return normalizeFiles(
    absoluteFiles.map((absoluteFile) => ({
      name: path.basename(absoluteFile),
      path: toPosixPath(path.relative(baseDir, absoluteFile)),
      content: fs.readFileSync(absoluteFile, "utf8"),
    })),
  );
}

function resolveSourcePaths(local) {
  if (local.source) {
    return [local.source];
  }
  if (local.sourceByProfile && typeof local.sourceByProfile === "object") {
    return Object.keys(local.sourceByProfile)
      .sort()
      .map((key) => local.sourceByProfile[key])
      .filter(Boolean);
  }
  return [];
}

async function parseRoleWithHub(client, sourcePath) {
  const buffer = fs.readFileSync(sourcePath);
  const form = new FormData();
  form.set("kind", "role");
  form.set("mode", "zip");
  form.set("file", new Blob([buffer]), path.basename(sourcePath));
  return client.postForm("/api/upload", form);
}

function resolveCategorySlug({ type, resourceId, override, domains, categories, config }) {
  if (override.categorySlug) return override.categorySlug;
  const categoryMap = config?.categoryMap?.[type] || {};
  if (categoryMap[resourceId]) return categoryMap[resourceId];
  for (const domain of domains || []) {
    if (categoryMap[`domain:${domain}`]) {
      return categoryMap[`domain:${domain}`];
    }
  }
  const defaultKey = type === "skill" ? "skillCategorySlug" : "ruleCategorySlug";
  if (config?.defaults?.[defaultKey]) return config.defaults[defaultKey];
  if (Array.isArray(categories) && categories.length === 1) {
    return categories[0].slug;
  }
  return null;
}

function resolveResourceOverride({ config, type, resourceId, variantSlug }) {
  const resources = config?.resources?.[type] || {};
  const base = resources?.[resourceId] || {};
  const variant = variantSlug ? resources?.[variantSlug] || {} : {};
  return {
    ...base,
    ...variant,
  };
}

function buildSkillRuleMetadataPatch(type, desired, existing) {
  const patch = {};
  const existingCategorySlug = existing.categorySlug || existing.category?.slug || null;
  if (desired.name && desired.name !== existing.name) patch.name = desired.name;
  if (desired.slug && desired.slug !== existing.slug) patch.slug = desired.slug;
  if (desired.registryId !== undefined && desired.registryId !== existing.registryId) {
    patch.registryId = desired.registryId;
  }
  if (desired.manifestId !== undefined && desired.manifestId !== existing.manifestId) {
    patch.manifestId = desired.manifestId;
  }
  if (desired.description !== existing.description) {
    patch.description = desired.description;
  }
  if ((desired.longDescription || null) !== (existing.longDescription || null)) {
    patch.longDescription = desired.longDescription || null;
  }
  if (desired.author !== existing.author) {
    patch.author = desired.author;
  }
  if (desired.categorySlug && desired.categorySlug !== existingCategorySlug) {
    patch.categorySlug = desired.categorySlug;
  }
  if (!sameStringArray(desired.tags, existing.tags)) {
    patch.tags = desired.tags;
  }
  if (!sameStringArray(desired.supportedProfiles, existing.supportedProfiles)) {
    patch.supportedProfiles = desired.supportedProfiles;
  }
  if (desired.downloadPolicy !== existing.downloadPolicy) {
    patch.downloadPolicy = desired.downloadPolicy;
  }
  return Object.keys(patch).length > 0 ? patch : null;
}

function buildSkillRuleFullPatch(desired) {
  return {
    name: desired.name,
    slug: desired.slug,
    registryId: desired.registryId,
    manifestId: desired.manifestId,
    description: desired.description,
    longDescription: desired.longDescription || null,
    author: desired.author,
    categorySlug: desired.categorySlug,
    tags: desired.tags,
    supportedProfiles: desired.supportedProfiles,
    downloadPolicy: desired.downloadPolicy,
  };
}

async function createSkillRuleOrNull({ type, desired, client }) {
  try {
    const response = await client.postJson(`/${type === "skill" ? "api/skills" : "api/rules"}`, {
      name: desired.name,
      slug: desired.slug,
      registryId: desired.registryId,
      manifestId: desired.manifestId,
      description: desired.description,
      longDescription: desired.longDescription,
      author: desired.author,
      categorySlug: desired.categorySlug,
      tags: desired.tags,
      supportedProfiles: desired.supportedProfiles,
      downloadPolicy: desired.downloadPolicy,
      initialFiles: desired.files,
    });
    return {
      created: true,
      resource: response?.[type] || response || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (isConflictMessage(message)) {
      return {
        created: false,
        resource: null,
        conflictSlugs: extractConflictResourceSlugs(message),
      };
    }
    throw error;
  }
}

async function fetchPublicResource(client, type, slug) {
  try {
    return await client.getJson(`/api/${type === "skill" ? "skills" : "rules"}/${encodeURIComponent(slug)}`);
  } catch {
    return null;
  }
}

async function fetchConflictResource({ type, desiredSlug, conflictSlugs, client }) {
  const candidates = uniqueKeepOrder([desiredSlug, ...(conflictSlugs || [])]);
  for (const candidate of candidates) {
    const resource = await fetchPublicResource(client, type, candidate);
    if (resource) {
      return resource;
    }
  }
  return null;
}

function resolveRoleDomainIds({ override, local, uploadParsed, config }) {
  const explicit = Array.isArray(override.domainIds) ? override.domainIds : [];
  if (explicit.length > 0) {
    return explicit;
  }
  const configMap = config?.domainIdMap || {};
  const mapped = uniqueKeepOrder([
    ...(Array.isArray(local.domains) ? local.domains : []),
    ...(Array.isArray(uploadParsed.roleData.domains) ? uploadParsed.roleData.domains : []),
  ])
    .map((slug) => configMap[slug])
    .filter(Boolean);
  if (mapped.length > 0) {
    return mapped;
  }
  if (Array.isArray(uploadParsed.mappedDomainIds) && uploadParsed.mappedDomainIds.length > 0) {
    return uniqueKeepOrder(uploadParsed.mappedDomainIds);
  }
  return [];
}

function resolveScenarioDomainIds({ scenario, override, roleItems, hubState, config }) {
  if (Array.isArray(override.domainIds) && override.domainIds.length > 0) {
    return uniqueKeepOrder(override.domainIds);
  }
  const domainMap = config?.domainIdMap || {};
  const mapped = uniqueKeepOrder(Array.isArray(scenario.domains) ? scenario.domains : [])
    .map((slug) => domainMap[slug])
    .filter(Boolean);
  if (mapped.length > 0) {
    return mapped;
  }
  const roleDomainIds = [];
  for (const roleItem of roleItems) {
    const role = Object.values(hubState.rolesBySlug).find((item) => item.id === roleItem.id);
    if (role && Array.isArray(role.domainLinks)) {
      roleDomainIds.push(...role.domainLinks.map((link) => link.domainId).filter(Boolean));
    }
  }
  return uniqueKeepOrder(roleDomainIds);
}

function resolveScenarioEntryRoleId(override, local, hubState) {
  if (override.entryRoleId) return override.entryRoleId;
  if (override.entryRoleSlug && hubState.rolesBySlug[override.entryRoleSlug]) {
    return hubState.rolesBySlug[override.entryRoleSlug].id;
  }
  const firstRoleSlug = Array.isArray(local.roles) ? local.roles[0] : null;
  return firstRoleSlug && hubState.rolesBySlug[firstRoleSlug]
    ? hubState.rolesBySlug[firstRoleSlug].id
    : null;
}

function normalizeRoleResponseToPayload(item) {
  return {
    name: item.name,
    slug: item.slug,
    registryId: item.registryId || null,
    manifestId: item.manifestId || null,
    author: item.author,
    description: item.description,
    longDescription: item.longDescription || null,
    publishStatus: item.publishStatus,
    roleStatus: item.roleStatus,
    tags: normalizeStringArray(item.tags),
    supportedProfiles: normalizeStringArray(item.supportedProfiles),
    triggers: normalizeStringArray(item.triggers),
    preferredSkills: normalizeStringArray(item.preferredSkills),
    reads: normalizeStringArray(item.reads),
    writes: normalizeStringArray(item.writes),
    handoffTo: normalizeStringArray(item.handoffTo),
    rolePositioning: item.rolePositioning || null,
    workingPrinciples: normalizeStringArray(item.workingPrinciples),
    requiredSteps: normalizeStringArray(item.requiredSteps),
    executionContract: item.executionContract || null,
    outputStandard: item.outputStandard || null,
    prohibitedActions: normalizeStringArray(item.prohibitedActions),
    handoffNotes: item.handoffNotes || null,
    skillIds: (item.skillLinks || []).map((link) => link.skillId),
    ruleIds: (item.ruleLinks || []).map((link) => link.ruleId),
    domainIds: (item.domainLinks || []).map((link) => link.domainId),
  };
}

function buildPreviewSkillRuleState(type, existing, desired) {
  return {
    ...(existing || {}),
    id: existing?.id || previewResourceId(type, desired.slug),
    slug: desired.slug,
    name: desired.name,
    registryId: desired.registryId ?? existing?.registryId ?? null,
    manifestId: desired.manifestId ?? existing?.manifestId ?? null,
    description: desired.description,
    longDescription: desired.longDescription || null,
    author: desired.author,
    tags: desired.tags,
    supportedProfiles: desired.supportedProfiles,
    categorySlug: desired.categorySlug || existing?.categorySlug || null,
    categoryName: existing?.categoryName || desired.categorySlug || null,
    downloadPolicy: desired.downloadPolicy,
  };
}

function buildPreviewRoleState(existing, desired) {
  return {
    ...(existing || {}),
    id: existing?.id || previewResourceId("role", desired.slug),
    ...desired.payload,
    skillLinks: (desired.payload.skillIds || []).map((skillId) => ({ skillId })),
    ruleLinks: (desired.payload.ruleIds || []).map((ruleId) => ({ ruleId })),
    domainLinks: (desired.payload.domainIds || []).map((domainId) => ({ domainId })),
  };
}

function normalizeScenarioResponseToPayload(item) {
  return {
    name: item.name,
    slug: item.slug,
    description: item.description,
    longDescription: item.longDescription || null,
    publishStatus: item.publishStatus,
    tags: normalizeStringArray(item.tags),
    supportedProfiles: normalizeStringArray(item.supportedProfiles),
    recommendedIdes: normalizeStringArray(item.recommendedIdes),
    entryRoleId: item.entryRoleId || null,
    isFeatured: Boolean(item.isFeatured),
    roles: sortByKey(
      (item.roles || []).map((link) => ({
        id: link.roleId,
        isOptional: Boolean(link.isOptional),
      })),
      (row) => `${row.id}:${row.isOptional ? 1 : 0}`,
    ),
    skillIds: sortStrings((item.skills || []).map((link) => link.skillId)),
    ruleIds: sortStrings((item.rules || []).map((link) => link.ruleId)),
    domainIds: sortStrings((item.domainLinks || []).map((link) => link.domainId)),
  };
}

function buildPreviewScenarioState(existing, desired) {
  return {
    ...(existing || {}),
    id: existing?.id || previewResourceId("scenario", desired.slug),
    ...desired.payload,
    roles: (desired.payload.roles || []).map((link) => ({
      roleId: link.id,
      isOptional: Boolean(link.isOptional),
    })),
    skills: (desired.payload.skillIds || []).map((skillId) => ({ skillId })),
    rules: (desired.payload.ruleIds || []).map((ruleId) => ({ ruleId })),
    domainLinks: (desired.payload.domainIds || []).map((domainId) => ({ domainId })),
  };
}

function buildRoleVersionFiles(input) {
  return normalizeFiles([
    {
      name: `${input.slug}.role.json`,
      path: `.hub/roles/${input.slug}.role.json`,
      content: JSON.stringify(
        {
          name: input.name,
          slug: input.slug,
          author: input.author,
          description: input.description,
          longDescription: input.longDescription ?? null,
          publishStatus: input.publishStatus,
          roleStatus: input.roleStatus,
          supportedProfiles: input.supportedProfiles,
          tags: input.tags,
          triggers: input.triggers,
          preferredSkills: input.preferredSkills,
          reads: input.reads,
          writes: input.writes,
          handoffTo: input.handoffTo,
          skills: input.skillSlugs,
          rules: input.ruleSlugs,
          capabilityDomains: input.domainSlugs,
          sections: {
            rolePositioning: input.rolePositioning ?? null,
            workingPrinciples: input.workingPrinciples,
            requiredSteps: input.requiredSteps,
            executionContract: input.executionContract ?? null,
            outputStandard: input.outputStandard ?? null,
            prohibitedActions: input.prohibitedActions,
            handoffNotes: input.handoffNotes ?? null,
          },
        },
        null,
        2,
      ),
    },
  ]);
}

function walkFiles(rootDir) {
  const results = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === ".DS_Store") continue;
      const absolutePath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        if (entry.name === ".git" || entry.name === "node_modules") continue;
        stack.push(absolutePath);
        continue;
      }
      results.push(absolutePath);
    }
  }
  results.sort();
  return results;
}

function commonAncestor(paths) {
  if (!Array.isArray(paths) || paths.length === 0) {
    return PROJECT_ROOT;
  }
  const split = paths.map((item) => path.resolve(item).split(path.sep).filter(Boolean));
  const minLength = Math.min(...split.map((parts) => parts.length));
  const shared = [];
  for (let index = 0; index < minLength; index += 1) {
    const value = split[0][index];
    if (split.every((parts) => parts[index] === value)) {
      shared.push(value);
    } else {
      break;
    }
  }
  const prefix = path.isAbsolute(paths[0]) ? path.sep : "";
  return prefix + shared.join(path.sep);
}

function parseFrontmatterFile(content, type) {
  const trimmed = content.trimStart();
  if (!trimmed.startsWith("---")) {
    return {};
  }
  const match = trimmed.match(/^---\s*\n([\s\S]*?)\n---\s*\n?([\s\S]*)$/);
  if (!match) {
    return {};
  }
  const meta = {};
  for (const line of match[1].split(/\r?\n/)) {
    const parsed = line.match(/^([A-Za-z0-9_-]+)\s*:\s*(.*)$/);
    if (!parsed) continue;
    let value = parsed[2].trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    meta[parsed[1].toLowerCase()] = value;
  }
  const name =
    meta.name || meta.title || meta["display-name"] || (type === "skill" ? meta.skill : meta.rule);
  const description = meta.description || meta.summary || meta.desc;
  return {
    name: typeof name === "string" ? name : undefined,
    description: typeof description === "string" ? description : undefined,
  };
}

function pickPrimaryTextFile(files, filename) {
  return files.find((file) => path.basename(file.path).toLowerCase() === filename.toLowerCase()) || null;
}

function normalizeFiles(files) {
  return [...files]
    .map((file) => ({
      name: file.name,
      path: toPosixPath(file.path),
      ...(typeof file.content === "string" ? { content: file.content } : {}),
    }))
    .sort((left, right) => left.path.localeCompare(right.path));
}

function normalizeStringArray(value) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => typeof item === "string");
}

function sortStrings(value) {
  return normalizeStringArray(value).slice().sort((left, right) => left.localeCompare(right));
}

function sortByKey(items, pickKey) {
  return [...(items || [])].sort((left, right) => pickKey(left).localeCompare(pickKey(right)));
}

function sameStringArray(left, right) {
  return deepEqual(sortStrings(left), sortStrings(right));
}

function previewResourceId(type, slug) {
  return `preview-${type}-${slug}`;
}

function looksBinary(buffer, absolutePath) {
  const extension = path.extname(absolutePath).toLowerCase();
  if (TEXT_FILE_EXTENSIONS.has(extension)) {
    return false;
  }
  if (!extension && path.basename(absolutePath).startsWith(".")) {
    return false;
  }
  return buffer.includes(0);
}

function suggestNextPatchVersion(currentVersions) {
  const parsed = currentVersions
    .map((value) => {
      const match = String(value).trim().match(/^(\d+)\.(\d+)\.(\d+)$/);
      if (!match) return null;
      return {
        major: Number(match[1]),
        minor: Number(match[2]),
        patch: Number(match[3]),
      };
    })
    .filter(Boolean);
  if (parsed.length === 0) return "1.0.0";
  parsed.sort((left, right) => {
    if (left.major !== right.major) return right.major - left.major;
    if (left.minor !== right.minor) return right.minor - left.minor;
    return right.patch - left.patch;
  });
  const latest = parsed[0];
  return `${latest.major}.${latest.minor}.${latest.patch + 1}`;
}

function selectResourceIds(registry, selection) {
  const all = Object.keys(registry);
  if (selection.mode === "all") return all;
  if (selection.mode === "none") return [];
  return all.filter((id) => selection.values.has(id));
}

function uniqueKeepOrder(items) {
  const output = [];
  const seen = new Set();
  for (const item of items || []) {
    if (!item) continue;
    if (seen.has(item)) continue;
    seen.add(item);
    output.push(item);
  }
  return output;
}

function toPosixPath(filePath) {
  return filePath.split(path.sep).join("/");
}

function deepEqual(left, right) {
  return JSON.stringify(left) === JSON.stringify(right);
}

function isConflictMessage(message) {
  return (
    typeof message === "string" &&
    (message.includes("已存在") ||
      message.includes("409") ||
      message.includes("duplicate") ||
      message.includes("Unique"))
  );
}

function extractConflictResourceSlugs(message) {
  if (typeof message !== "string") return [];
  const matches = [...message.matchAll(/对应\s*(?:Rule|Skill)\s*：([a-z0-9._-]+)/gi)];
  return uniqueKeepOrder(matches.map((match) => match[1]).filter(Boolean));
}

function indexBy(items, key) {
  const output = {};
  for (const item of items || []) {
    if (!item || !item[key]) continue;
    output[item[key]] = item;
  }
  return output;
}

function findRoleById(hubState, id) {
  return Object.values(hubState.rolesBySlug || {}).find((item) => item.id === id) || null;
}

function unwrapApiResponse(payload) {
  if (
    payload &&
    typeof payload === "object" &&
    Object.prototype.hasOwnProperty.call(payload, "data") &&
    Object.prototype.hasOwnProperty.call(payload, "code")
  ) {
    return payload.data;
  }
  return payload;
}

function getResponseCookies(response) {
  if (typeof response.headers.getSetCookie === "function") {
    return response.headers.getSetCookie().map((cookie) => cookie.split(";")[0]);
  }
  const cookie = response.headers.get("set-cookie");
  return cookie ? [cookie.split(";")[0]] : [];
}

async function readErrorText(response) {
  const text = await response.text();
  try {
    const parsed = JSON.parse(text);
    return parsed?.error || parsed?.message || text;
  } catch {
    return text || `${response.status} ${response.statusText}`;
  }
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function warn(message) {
  console.warn(`[hub-sync] warn: ${message}`);
}

function info(message) {
  console.log(`[hub-sync] ${message}`);
}

function printSummary(summary, dryRun) {
  console.log("");
  console.log(`[hub-sync] ${dryRun ? "dry-run summary" : "summary"}`);
  console.log(
    JSON.stringify(summary, null, 2),
  );
}

main();
