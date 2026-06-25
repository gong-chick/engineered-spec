const assert = require('assert');
const fs = require('fs');
const http = require('http');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');

function writeJsonFile(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeTextFile(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function readTextFile(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function createWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function createManifest(profile = 'vue', ides = ['cursor'], overrides = {}) {
  return {
    schema_version: 1,
    manifest_type: 'hub-install',
    profile,
    ides,
    scenario_packages: [],
    roles: ['task-orchestrator'],
    skills: ['create-proposal'],
    rules: ['api-standard'],
    entry_role: 'task-orchestrator',
    ...overrides,
  };
}

function runCli(args, extraEnv = {}) {
  return spawnSync('node', ['./bin/cli.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

function runCliAsync(args, extraEnv = {}) {
  return new Promise((resolve) => {
    const child = spawn('node', ['./bin/cli.js', ...args], {
      cwd: repoRoot,
      env: {
        ...process.env,
        ...extraEnv,
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk.toString();
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk.toString();
    });
    child.on('close', (code) => {
      resolve({ status: code, stdout, stderr });
    });
  });
}

function runInstall(args, extraEnv = {}) {
  return spawnSync('bash', ['./install.sh', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ...extraEnv,
    },
  });
}

function startServer(handler) {
  return new Promise((resolve) => {
    const server = http.createServer(handler);
    server.once('error', (error) => {
      if (error && (error.code === 'EPERM' || error.code === 'EACCES')) {
        resolve({
          server: null,
          origin: null,
          skipped: true,
          reason: `${error.code}: ${error.message}`,
        });
        return;
      }

      throw error;
    });
    server.listen(0, () => {
      const address = server.address();
      resolve({
        server,
        origin: `http://127.0.0.1:${address.port}`,
        skipped: false,
        reason: null,
      });
    });
  });
}

function closeServer(server) {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }
      resolve();
    });
  });
}

function createSupplementZip(options = {}) {
  const roleId = options.roleId || 'remote-only-role';
  const skillId = options.skillId || 'remote-only-skill';
  const ruleId = options.ruleId || 'remote-only-rule';
  const roleSlug = options.roleSlug || `${roleId}-slug`;
  const skillSlug = options.skillSlug || `${skillId}-slug`;
  const ruleSlug = options.ruleSlug || `${ruleId}-slug`;
  const roleVersion = options.roleVersion || '1.2.3';
  const skillVersion = options.skillVersion || '2.3.4';
  const ruleVersion = options.ruleVersion || '3.4.5';

  const bundleRoot = createWorkspace('ai-spec-auto-supplement-bundle-');
  writeJsonFile(path.join(bundleRoot, '.agents/registry/profiles.json'), {
    version: 1,
    profiles: {
      vue: {
        status: 'active',
        label: 'Vue',
        rules_dir: '.agents/rules/profiles/vue',
        skills_dir: '.agents/skills/profiles/vue',
        configs_dir: 'configs/profiles/vue',
      },
    },
  });
  writeJsonFile(path.join(bundleRoot, '.agents/registry/roles.json'), {
    version: 1,
    roles: {
      [roleId]: {
        name: roleId,
        status: 'active',
        source: `.agents/roles/common/${roleId}.md`,
        domains: ['delivery'],
      },
    },
  });
  writeJsonFile(path.join(bundleRoot, '.agents/registry/skills.json'), {
    version: 1,
    skills: {
      [skillId]: {
        source: `.agents/skills/common/${skillId}/SKILL.md`,
        domains: ['delivery'],
      },
    },
  });
  writeJsonFile(path.join(bundleRoot, '.agents/registry/rules.json'), {
    version: 1,
    rules: {
      [ruleId]: {
        source: `.agents/rules/common/${ruleId}/RULE.md`,
        domains: ['delivery'],
      },
    },
  });
  writeJsonFile(path.join(bundleRoot, '.agents/registry/flows.json'), {
    version: 1,
    flows: {},
  });
  writeTextFile(
    path.join(bundleRoot, '.agents/roles/common', `${roleId}.md`),
    `---\nid: ${JSON.stringify(roleId)}\nname: ${JSON.stringify(roleId)}\nstatus: "active"\n---\n\n# ${roleId}\n`,
  );
  writeTextFile(
    path.join(bundleRoot, '.agents/skills/common', skillId, 'SKILL.md'),
    `---\nname: ${JSON.stringify(skillId)}\ndescription: "remote supplement skill"\n---\n\n# ${skillId}\n`,
  );
  writeTextFile(
    path.join(bundleRoot, '.agents/rules/common', ruleId, 'RULE.md'),
    `---\nalwaysApply: false\ndescription: "remote supplement rule"\n---\n\n# ${ruleId}\n`,
  );
  writeJsonFile(path.join(bundleRoot, 'export-report.json'), {
    generatedAt: '2026-04-14T00:00:00.000Z',
    manifest: createManifest('vue', ['cursor'], {
      roles: [roleId],
      skills: [skillId],
      rules: [ruleId],
      entry_role: roleId,
    }),
    warnings: [],
    assets: {
      roles: [{ hubSlug: roleSlug, registryId: roleId, version: roleVersion, source: `.agents/roles/common/${roleId}.md`, skills: [skillId], rules: [ruleId] }],
      skills: [{ hubSlug: skillSlug, hubName: skillId, registryId: skillId, version: skillVersion, mode: 'common', profiles: [] }],
      rules: [{ hubSlug: ruleSlug, hubName: ruleId, registryId: ruleId, version: ruleVersion, mode: 'common', profiles: [] }],
      scenarios: [],
    },
  });

  const zipPath = path.join(createWorkspace('ai-spec-auto-supplement-zip-'), 'supplement.zip');
  const zipped = spawnSync('zip', ['-qr', zipPath, '.'], {
    cwd: bundleRoot,
    encoding: 'utf8',
  });
  if (zipped.status !== 0) {
    throw new Error(`failed to create supplement zip: ${zipped.stderr || zipped.stdout}`);
  }

  return {
    zipPath,
    roleId,
    skillId,
    ruleId,
    roleSlug,
    skillSlug,
    ruleSlug,
    roleVersion,
    skillVersion,
    ruleVersion,
  };
}

async function main() {
  let result = runCli(['sync', createWorkspace('ai-spec-auto-sync-missing-arg-'), '--manifest']);
  assert.strictEqual(result.status, 1);
  assert.ok(result.stderr.includes('选项 --manifest 需要一个参数值'));

  const localTarget = createWorkspace('ai-spec-auto-sync-local-');
  const localManifestPath = path.join(localTarget, 'manifest.json');
  writeJsonFile(localManifestPath, createManifest('vue'));

  result = runCli(['sync', localTarget, '--manifest', localManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  let payload = JSON.parse(result.stdout);
  assert.strictEqual(payload.kind, 'sync-result');
  assert.strictEqual(payload.source.manifest, path.resolve(localManifestPath));
  assert.strictEqual(
    JSON.parse(fs.readFileSync(path.join(localTarget, '.ai-spec', 'manifest.json'), 'utf8')).profile,
    'vue',
  );

  const legacySkillTarget = createWorkspace('ai-spec-auto-sync-legacy-skill-');
  const legacySkillManifestPath = path.join(legacySkillTarget, 'manifest.json');
  writeJsonFile(
    legacySkillManifestPath,
    createManifest('vue', ['cursor'], { skills: ['create-api-react'] }),
  );
  result = runCli(['sync', legacySkillTarget, '--manifest', legacySkillManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  payload = JSON.parse(result.stdout);
  assert.ok(payload.resolved.skills.includes('create-api'));
  assert.ok(payload.warnings.some((item) => item.includes('create-api-react')));
  assert.ok(fs.existsSync(path.join(legacySkillTarget, '.agents', 'skills', 'create-api', 'SKILL.md')));

  const legacyRuleTarget = createWorkspace('ai-spec-auto-sync-legacy-rule-');
  const legacyRuleManifestPath = path.join(legacyRuleTarget, 'manifest.json');
  writeJsonFile(
    legacyRuleManifestPath,
    createManifest('vue', ['cursor'], { rules: ['react-project-overview'] }),
  );
  result = runCli(['sync', legacyRuleTarget, '--manifest', legacyRuleManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  payload = JSON.parse(result.stdout);
  assert.ok(payload.resolved.rules.includes('project-overview'));
  assert.ok(payload.warnings.some((item) => item.includes('react-project-overview')));
  assert.ok(fs.existsSync(path.join(legacyRuleTarget, '.agents', 'rules', '01-项目概述.md')));

  const scenarioMetadataTarget = createWorkspace('ai-spec-auto-sync-scenario-metadata-');
  const scenarioMetadataManifestPath = path.join(scenarioMetadataTarget, 'manifest.json');
  writeJsonFile(
    scenarioMetadataManifestPath,
    createManifest('vue', ['cursor'], { scenario_packages: ['prd-to-delivery', 'unknown-scenario'] }),
  );
  result = runCli(['sync', scenarioMetadataTarget, '--manifest', scenarioMetadataManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  payload = JSON.parse(result.stdout);
  assert.deepStrictEqual(payload.warnings, []);
  assert.ok(fs.existsSync(path.join(scenarioMetadataTarget, '.ai-spec', 'manifest.json')));

  const metadataPreserveTarget = createWorkspace('ai-spec-auto-sync-local-preferences-');
  const metadataPreserveManifestPath = path.join(metadataPreserveTarget, 'manifest.json');
  writeJsonFile(
    metadataPreserveManifestPath,
    createManifest('vue', ['cursor'], { rules: ['api-standard', 'component-standard'] }),
  );
  writeJsonFile(path.join(metadataPreserveTarget, '.ai-spec', 'manifest.json'), {
    profile: 'vue',
    ides: ['cursor'],
    roles: ['task-orchestrator'],
    skills: ['create-proposal'],
    rules: ['api-standard'],
    local_preferences: {
      project_init: {
        custom_rules: ['04-组件规范.md', '05-API规范.md'],
      },
    },
  });
  result = runCli(['sync', metadataPreserveTarget, '--manifest', metadataPreserveManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  payload = JSON.parse(result.stdout);
  assert.deepStrictEqual(payload.warnings, []);
  assert.deepStrictEqual(
    JSON.parse(fs.readFileSync(path.join(metadataPreserveTarget, '.ai-spec', 'manifest.json'), 'utf8')).local_preferences.project_init.custom_rules,
    ['04-组件规范.md', '05-API规范.md'],
  );

  const ideOverrideTarget = createWorkspace('ai-spec-auto-sync-ide-');
  const ideOverrideManifestPath = path.join(ideOverrideTarget, 'manifest.json');
  writeJsonFile(ideOverrideManifestPath, createManifest('vue', ['cursor', 'claude']));
  result = runCli(['sync', ideOverrideTarget, '--manifest', ideOverrideManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.cursor', 'commands', 'opsx-apply.md')));
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.cursor', 'commands', 'opsx-archive.md')));
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.cursor', 'commands', 'opsx-explore.md')));
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.claude', 'commands', 'spec-start.md')));
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.cursor', 'commands', 'spec-start-review.md')));
  assert.ok(fs.existsSync(path.join(ideOverrideTarget, '.claude', 'commands', 'spec-start-review.md')));
  assert.ok(!fs.existsSync(path.join(ideOverrideTarget, '.claude', 'commands', 'opsx-propose.md')));
  const cursorSpecStart = readTextFile(path.join(ideOverrideTarget, '.cursor', 'commands', 'spec-start.md'));
  const cursorSpecStartReview = readTextFile(path.join(ideOverrideTarget, '.cursor', 'commands', 'spec-start-review.md'));
  const cursorSpecUpdate = readTextFile(path.join(ideOverrideTarget, '.cursor', 'commands', 'spec-update.md'));
  const claudeSpecStart = readTextFile(path.join(ideOverrideTarget, '.claude', 'commands', 'spec-start.md'));
  const claudeSpecStartReview = readTextFile(path.join(ideOverrideTarget, '.claude', 'commands', 'spec-start-review.md'));
  assert.ok(cursorSpecStart.startsWith('---\n'));
  assert.ok(cursorSpecStart.includes('./node_modules/.bin/ai-spec-auto'));
  assert.ok(cursorSpecStart.includes('protocol-step --target . --user-input'));
  assert.ok(cursorSpecStartReview.startsWith('---\n'));
  assert.ok(cursorSpecStartReview.includes('name: /spec-start-review'));
  assert.ok(cursorSpecStartReview.includes('main-flow-blocking'));
  assert.ok(cursorSpecStartReview.includes('--mode'));
  assert.ok(cursorSpecStartReview.includes('--flow'));
  assert.ok(cursorSpecStartReview.includes('--review-policy'));
  assert.ok(cursorSpecStartReview.includes('/spec-start-review 创建订单列表 mock 页面'));
  assert.ok(cursorSpecStartReview.includes('/spec-start-review --mode suggest 创建订单列表 mock 页面'));
  assert.ok(cursorSpecStartReview.includes('/spec-start-review --mode manual --flow prd-to-delivery 创建订单列表 mock 页面'));
  assert.ok(cursorSpecUpdate.startsWith('---\n'));
  assert.ok(cursorSpecUpdate.includes('./node_modules/.bin/ai-spec-auto'));
  assert.ok(cursorSpecUpdate.includes('protocol-update --target . --user-input'));
  assert.ok(claudeSpecStart.includes('./node_modules/.bin/ai-spec-auto'));
  assert.ok(!claudeSpecStart.startsWith('---\n'));
  assert.ok(claudeSpecStartReview.includes('./node_modules/.bin/ai-spec-auto'));
  assert.ok(claudeSpecStartReview.includes('$ARGUMENTS'));
  assert.ok(claudeSpecStartReview.includes('main-flow-blocking'));

  const superpowersTarget = createWorkspace('ai-spec-auto-sync-superpowers-');
  const superpowersManifestPath = path.join(superpowersTarget, 'manifest.json');
  writeJsonFile(superpowersManifestPath, createManifest('vue', ['cursor', 'codex'], {
    skills: ['create-proposal', 'using-superpowers'],
    superpowers: {
      enabled: true,
      policy: 'ask',
      preferred_mode: 'host-enhanced',
      codex_entry: 'agents-skill-wrapper',
    },
  }));
  result = runCli(['sync', superpowersTarget, '--manifest', superpowersManifestPath, '--json'], {
    HOME: path.join(superpowersTarget, 'fake-home'),
    CODEX_HOME: path.join(superpowersTarget, 'fake-codex-home'),
  });
  assert.strictEqual(result.status, 0, result.stderr);
  payload = JSON.parse(result.stdout);
  const syncedManifest = JSON.parse(fs.readFileSync(path.join(superpowersTarget, '.ai-spec', 'manifest.json'), 'utf8'));
  const syncedSuperpowers = JSON.parse(fs.readFileSync(path.join(superpowersTarget, '.ai-spec', 'superpowers.json'), 'utf8'));
  const syncedLock = JSON.parse(fs.readFileSync(path.join(superpowersTarget, '.ai-spec', 'lock.json'), 'utf8'));
  const syncedSources = JSON.parse(fs.readFileSync(path.join(superpowersTarget, '.ai-spec', 'sources.json'), 'utf8'));
  assert.strictEqual(syncedManifest.superpowers.enabled, true);
  assert.strictEqual(syncedSuperpowers.enabled, true);
  assert.strictEqual(syncedSuperpowers.mode, 'project-minimal');
  assert.ok(fs.existsSync(path.join(superpowersTarget, '.codex', 'commands', 'spec-start.md')));
  assert.ok(fs.existsSync(path.join(superpowersTarget, '.codex', 'commands', 'spec-start-review.md')));
  assert.ok(fs.existsSync(path.join(superpowersTarget, '.codex', 'skills', 'using-superpowers')));
  assert.ok(fs.existsSync(path.join(superpowersTarget, 'AGENTS.md')));
  assert.ok(fs.readFileSync(path.join(superpowersTarget, 'AGENTS.md'), 'utf8').includes('ai-spec-auto superpowers bridge'));
  assert.ok(readTextFile(path.join(superpowersTarget, '.codex', 'commands', 'spec-start-review.md')).includes('$ARGUMENTS'));
  assert.ok(syncedLock.assets.superpowers);
  assert.ok(syncedSources.assets.some((item) => item.kind === 'superpowers-config'));
  assert.ok(syncedSources.assets.some((item) => item.kind === 'ide-superpowers-entry' && item.id === 'codex:using-superpowers'));
  assert.ok(syncedSources.assets.some((item) => item.kind === 'codex-agents-bridge'));

  const visualBridgeTarget = createWorkspace('ai-spec-auto-sync-visual-bridge-');
  const visualBridgeManifestPath = path.join(visualBridgeTarget, 'manifest.json');
  writeJsonFile(visualBridgeManifestPath, createManifest('vue', ['cursor'], {
    visual_bridge: {
      enabled: true,
      server_url: 'http://127.0.0.1:3200',
      workspace_id: 'workspace-demo',
      agent_id: 'ai-spec-auto',
    },
  }));
  writeJsonFile(path.join(visualBridgeTarget, '.ai-spec', 'visual-bridge.json'), {
    enabled: true,
    server_url: 'http://127.0.0.1:3100',
    workspace_id: 'legacy-workspace',
    agent_id: 'legacy-agent',
    connect_token: 'keep-me',
  });
  result = runCli(['sync', visualBridgeTarget, '--manifest', visualBridgeManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  const syncedVisualBridge = JSON.parse(fs.readFileSync(path.join(visualBridgeTarget, '.ai-spec', 'visual-bridge.json'), 'utf8'));
  const visualBridgeSources = JSON.parse(fs.readFileSync(path.join(visualBridgeTarget, '.ai-spec', 'sources.json'), 'utf8'));
  assert.strictEqual(syncedVisualBridge.enabled, true);
  assert.strictEqual(syncedVisualBridge.server_url, 'http://127.0.0.1:3200');
  assert.strictEqual(syncedVisualBridge.workspace_id, 'workspace-demo');
  assert.strictEqual(syncedVisualBridge.agent_id, 'ai-spec-auto');
  assert.strictEqual(syncedVisualBridge.connect_token, 'keep-me');
  assert.ok(visualBridgeSources.assets.some((item) => item.kind === 'visual-bridge-config'));

  const cleanupTarget = createWorkspace('ai-spec-auto-sync-cleanup-');
  const cleanupManifestPath = path.join(cleanupTarget, 'manifest.json');
  writeJsonFile(cleanupManifestPath, createManifest('vue', ['cursor', 'claude']));
  result = runCli(['sync', cleanupTarget, '--manifest', cleanupManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  writeTextFile(path.join(cleanupTarget, '.agents', 'skills', 'create-proposal', 'stale.txt'), 'stale');
  writeTextFile(path.join(cleanupTarget, '.cursor', 'mcp.json'), '{"custom":true}\n');

  result = runCli(['sync', cleanupTarget, '--manifest', cleanupManifestPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(path.join(cleanupTarget, '.agents', 'skills', 'create-proposal', 'stale.txt')));
  assert.strictEqual(fs.readFileSync(path.join(cleanupTarget, '.cursor', 'mcp.json'), 'utf8'), '{"custom":true}\n');

  const cleanupManifestNextPath = path.join(cleanupTarget, 'manifest.next.json');
  writeJsonFile(cleanupManifestNextPath, createManifest('vue', ['cursor'], { skills: [], rules: [] }));
  result = runCli(['sync', cleanupTarget, '--manifest', cleanupManifestNextPath, '--json']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(path.join(cleanupTarget, '.agents', 'skills', 'create-proposal')));
  assert.ok(!fs.existsSync(path.join(cleanupTarget, '.agents', 'rules', '05-API规范.md')));
  assert.ok(!fs.existsSync(path.join(cleanupTarget, '.claude', 'rules')));
  assert.ok(!fs.existsSync(path.join(cleanupTarget, '.claude', 'commands', 'spec-start.md')));
  assert.ok(fs.existsSync(path.join(cleanupTarget, '.cursor', 'mcp.json')));
  assert.ok(readTextFile(path.join(cleanupTarget, '.cursor', 'commands', 'spec-start.md')).startsWith('---\n'));

  const remoteTarget = createWorkspace('ai-spec-auto-sync-remote-');
  const remoteServer = await startServer((req, res) => {
    if (req.url === '/manifest.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(createManifest('react')));
      return;
    }
    if (req.url === '/invalid.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end('{not-json');
      return;
    }
    if (req.url === '/timeout.json') {
      return;
    }
    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  if (!remoteServer.skipped) {
    const { server, origin } = remoteServer;
    try {
      const remoteManifestUrl = `${origin}/manifest.json`;
      result = await runCliAsync(['sync', remoteTarget, '--manifest', remoteManifestUrl, '--json']);
      assert.strictEqual(result.status, 0, result.stderr);
      payload = JSON.parse(result.stdout);
      assert.strictEqual(payload.source.manifest, remoteManifestUrl);

      const lock = JSON.parse(fs.readFileSync(path.join(remoteTarget, '.ai-spec', 'lock.json'), 'utf8'));
      const sources = JSON.parse(fs.readFileSync(path.join(remoteTarget, '.ai-spec', 'sources.json'), 'utf8'));
      assert.strictEqual(lock.source.manifest, remoteManifestUrl);
      assert.strictEqual(sources.manifest.source, remoteManifestUrl);

      result = await runCliAsync(['sync', createWorkspace('ai-spec-auto-sync-invalid-'), '--manifest', `${origin}/invalid.json`, '--json']);
      assert.strictEqual(result.status, 1);
      assert.ok(result.stderr.includes('Remote manifest is not valid JSON'));

      result = await runCliAsync(['sync', createWorkspace('ai-spec-auto-sync-404-'), '--manifest', `${origin}/missing.json`, '--json']);
      assert.strictEqual(result.status, 1);
      assert.ok(result.stderr.includes('Remote manifest request failed with status 404'));

      result = await runCliAsync(
        ['sync', createWorkspace('ai-spec-auto-sync-timeout-'), '--manifest', `${origin}/timeout.json`, '--json'],
        { AI_SPEC_REMOTE_MANIFEST_TIMEOUT_MS: '50' },
      );
      assert.strictEqual(result.status, 1);
      assert.ok(result.stderr.includes('Remote manifest request timed out after 50ms'));
    } finally {
      await closeServer(server);
    }
  } else {
    console.warn(`sync test notice: remote HTTP manifest checks skipped (${remoteServer.reason})`);
  }

  const supplement = createSupplementZip();
  const remoteSupplementTarget = createWorkspace('ai-spec-auto-sync-supplement-remote-');
  const supplementManifest = createManifest('vue', ['cursor'], {
    roles: [supplement.roleId],
    skills: [supplement.skillId],
    rules: [supplement.ruleId],
    entry_role: supplement.roleId,
  });
  const supplementServer = await startServer((req, res) => {
    if (req.method === 'GET' && req.url === '/manifest.json') {
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(supplementManifest));
      return;
    }

    if (req.method === 'POST' && req.url === '/api/install/supplement-export') {
      let body = '';
      req.on('data', (chunk) => {
        body += chunk.toString();
      });
      req.on('end', () => {
        const payload = JSON.parse(body || '{}');
        assert.deepStrictEqual(payload.roles, [supplement.roleId]);
        assert.deepStrictEqual(payload.skills, [supplement.skillId]);
        assert.deepStrictEqual(payload.rules, [supplement.ruleId]);
        res.writeHead(200, { 'content-type': 'application/zip' });
        res.end(fs.readFileSync(supplement.zipPath));
      });
      return;
    }

    res.writeHead(404, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ error: 'not found' }));
  });

  if (!supplementServer.skipped) {
    const { server, origin } = supplementServer;
    try {
      result = await runCliAsync(
        ['sync', remoteSupplementTarget, '--manifest', `${origin}/manifest.json`, '--json'],
      );
      assert.strictEqual(result.status, 0, result.stderr);
      payload = JSON.parse(result.stdout);
      assert.ok(payload.resolved.roles.includes(supplement.roleId));
      assert.ok(payload.resolved.skills.includes(supplement.skillId));
      assert.ok(payload.resolved.rules.includes(supplement.ruleId));
      assert.ok(fs.existsSync(path.join(remoteSupplementTarget, '.agents/roles/common', `${supplement.roleId}.md`)));
      assert.ok(fs.existsSync(path.join(remoteSupplementTarget, '.agents/skills', supplement.skillId, 'SKILL.md')));
      assert.ok(fs.existsSync(path.join(remoteSupplementTarget, '.agents/rules', `${supplement.ruleId}.md`)));

      const remoteLock = JSON.parse(fs.readFileSync(path.join(remoteSupplementTarget, '.ai-spec', 'lock.json'), 'utf8'));
      const remoteSources = JSON.parse(fs.readFileSync(path.join(remoteSupplementTarget, '.ai-spec', 'sources.json'), 'utf8'));
      const lockRole = remoteLock.assets.roles.find((item) => item.id === supplement.roleId);
      const lockSkill = remoteLock.assets.skills.find((item) => item.id === supplement.skillId);
      const lockRule = remoteLock.assets.rules.find((item) => item.id === supplement.ruleId);
      assert.strictEqual(lockRole.source_type, 'hub');
      assert.strictEqual(lockRole.hub_slug, supplement.roleSlug);
      assert.strictEqual(lockRole.version, supplement.roleVersion);
      assert.strictEqual(lockSkill.source_type, 'hub');
      assert.strictEqual(lockSkill.hub_slug, supplement.skillSlug);
      assert.strictEqual(lockSkill.version, supplement.skillVersion);
      assert.strictEqual(lockRule.source_type, 'hub');
      assert.strictEqual(lockRule.hub_slug, supplement.ruleSlug);
      assert.strictEqual(lockRule.version, supplement.ruleVersion);
      assert.ok(remoteSources.registries.some((item) => item.type === 'hub-supplement' && item.source === origin));

      const localSupplementTarget = createWorkspace('ai-spec-auto-sync-supplement-local-');
      const localSupplementManifestPath = path.join(localSupplementTarget, 'manifest.json');
      writeJsonFile(localSupplementManifestPath, supplementManifest);
      result = await runCliAsync(
        ['sync', localSupplementTarget, '--manifest', localSupplementManifestPath, '--hub-origin', origin, '--json'],
      );
      assert.strictEqual(result.status, 0, result.stderr);
      assert.ok(fs.existsSync(path.join(localSupplementTarget, '.agents/rules', `${supplement.ruleId}.md`)));

      const noHubFetchTarget = createWorkspace('ai-spec-auto-sync-no-hub-fetch-');
      const noHubFetchManifestPath = path.join(noHubFetchTarget, 'manifest.json');
      writeJsonFile(noHubFetchManifestPath, supplementManifest);
      result = await runCliAsync(
        ['sync', noHubFetchTarget, '--manifest', noHubFetchManifestPath, '--no-hub-fetch', '--json'],
      );
      assert.strictEqual(result.status, 1);
      assert.ok(result.stderr.includes(`Unknown role（专家角色） id: ${supplement.roleId}`));
    } finally {
      await closeServer(server);
    }
  } else {
    console.warn(`sync test notice: supplement HTTP checks skipped (${supplementServer.reason})`);
  }

  const wrapperTarget = createWorkspace('ai-spec-auto-install-sync-');
  const wrapperManifestPath = path.join(wrapperTarget, 'wrapper-manifest.json');
  writeJsonFile(wrapperManifestPath, createManifest('vue', ['cursor', 'claude']));
  result = runInstall(['sync', wrapperTarget, '--manifest', wrapperManifestPath], {
    ENGINEERED_SPEC_LOCAL: repoRoot,
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(wrapperTarget, '.ai-spec', 'lock.json')));
  assert.ok(fs.existsSync(path.join(wrapperTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(!fs.existsSync(path.join(wrapperTarget, '.claude', 'commands', 'opsx-propose.md')));

  console.log('sync test passed: local/remote manifests, cursor-only command overrides, remote failures, timeout handling, and install.sh sync wrapper all behave as expected');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
