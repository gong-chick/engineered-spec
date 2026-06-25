const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { buildContext } = require('../../src/context/context-builder');
const { sha256Text } = require('../../src/security/checksum');

function createWorkspace(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, value, 'utf8');
}

function cacheAsset(cacheHome, kind, slug, content) {
  const checksum = sha256Text(content);
  const baseDir = kind === 'agent-profile'
    ? path.join(cacheHome, 'cache/agent-profiles', checksum)
    : path.join(cacheHome, 'cache/assets', checksum);
  writeText(path.join(baseDir, 'content.md'), content);
  return { kind, slug, version: '1.0.0', checksum };
}

function setupProject(root, cacheHome, options = {}) {
  const role = cacheAsset(cacheHome, 'role', 'planner-role', '# 规划角色\n');
  const flow = cacheAsset(cacheHome, 'flow', 'planning-flow', '# 规划流程\n');
  const rule = cacheAsset(cacheHome, 'rule', 'implementation-rule', '# 实现规则\n');
  const skill = cacheAsset(cacheHome, 'skill', 'create-test', '# 测试技能\n');
  const agent = cacheAsset(cacheHome, 'agent-profile', 'diagnostic-agent', '# 诊断专家\n');
  const allAssets = [role, flow, rule, skill, agent];

  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_context',
    projectName: 'context-demo',
    projectType: 'single',
    techProfile: { domain: 'frontend', frameworks: ['React'] },
    manifest: { slug: 'frontend-react-standard', version: '1.0.0' },
  });
  writeJson(path.join(root, '.ai-spec/policy.json'), {
    schemaVersion: '1.0.0',
    privacyPolicy: {
      uploadSourceCode: false,
      uploadRawPrompt: false,
      uploadRawResponse: false,
      uploadAbsolutePath: false,
      uploadFileContent: false,
    },
  });
  writeJson(path.join(root, '.ai-spec/workspace.json'), {
    schemaVersion: '1.0.0',
    workspaceId: 'ws_context',
    name: 'context-workspace',
    root: '.',
    type: 'single-repo',
    packages: [],
  });
  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_context',
    workspaceId: 'ws_context',
    hub: { url: '' },
    manifest: {
      slug: 'frontend-react-standard',
      version: '1.0.0',
      checksum: sha256Text('manifest'),
    },
    assets: allAssets,
    overlays: [],
    sharedContracts: [],
  });
  writeJson(path.join(root, '.agents/registry.index.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_context',
    source: 'local-init',
    manifest: { slug: 'frontend-react-standard', version: '1.0.0' },
    assets: {
      roles: [role],
      flows: [flow],
      rules: [rule],
      skills: [skill],
      agentProfiles: [agent],
    },
    ...(options.registryOverrides || {}),
  });
  writeJson(path.join(root, '.ai-spec/context-index.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_context',
    contextStrategy: 'progressive',
    levels: {},
    stageLoadRules: [
      { stage: 'planning', loadKinds: ['role', 'flow'], maxAssets: 5 },
      { stage: 'implementation', loadKinds: ['rule', 'skill', 'agent-profile'], maxAssets: 8 },
      { stage: 'verification', loadKinds: ['rule', 'flow'], maxAssets: 6 },
      { stage: 'diagnosing', loadKinds: ['rule', 'skill', 'agent-profile'], requiredAgents: ['diagnostic-agent'], maxAssets: 6 },
    ],
    sharedContracts: [],
  });
  writeText(path.join(root, 'src/business-secret.js'), 'const secret = "业务源码不能进入上下文";\n');
}

function assertNoAbsolutePath(bundle, root, cacheHome) {
  const text = JSON.stringify(bundle);
  assert(!text.includes(root), 'ContextBundle 不应包含项目绝对路径');
  assert(!text.includes(cacheHome), 'ContextBundle 不应包含缓存绝对路径');
}

async function testBuildPlanningContextSucceeds() {
  const root = createWorkspace('ai-spec-context-builder-');
  const cacheHome = createWorkspace('ai-spec-context-cache-');
  setupProject(root, cacheHome);

  const bundle = await buildContext({
    rootDir: root,
    stage: 'planning',
    tokenBudget: { maxInputTokens: 80000, warningThreshold: 60000 },
    options: { explain: true },
    cache: { rootDir: cacheHome },
  });

  assert.strictEqual(bundle.schemaVersion, '1.0.0');
  assert.strictEqual(bundle.stage, 'planning');
  assert.strictEqual(bundle.project.projectId, 'proj_context');
  assert.deepStrictEqual(bundle.loadedAssets.map((asset) => asset.kind).sort(), ['flow', 'role']);
  assert.strictEqual(bundle.privacy.sourceCodeIncluded, false);
  assert.strictEqual(bundle.privacy.rawPromptIncluded, false);
  assert.strictEqual(bundle.privacy.rawResponseIncluded, false);
  assert.strictEqual(bundle.privacy.absolutePathIncluded, false);
  assertNoAbsolutePath(bundle, root, cacheHome);
  assert(!JSON.stringify(bundle).includes('业务源码不能进入上下文'));
}

async function testImplementationDoesNotLoadAllAssets() {
  const root = createWorkspace('ai-spec-context-builder-impl-');
  const cacheHome = createWorkspace('ai-spec-context-cache-impl-');
  setupProject(root, cacheHome);

  const bundle = await buildContext({
    rootDir: root,
    stage: 'implementation',
    cache: { rootDir: cacheHome },
  });

  assert(bundle.loadedAssets.every((asset) => ['rule', 'skill', 'agent-profile'].includes(asset.kind)));
  assert(!bundle.loadedAssets.some((asset) => asset.kind === 'role'));
  assert(!bundle.loadedAssets.some((asset) => asset.kind === 'flow'));
}

async function testBundleReportsTokenBudgetError() {
  const root = createWorkspace('ai-spec-context-builder-budget-');
  const cacheHome = createWorkspace('ai-spec-context-cache-budget-');
  setupProject(root, cacheHome);

  const bundle = await buildContext({
    rootDir: root,
    stage: 'planning',
    tokenBudget: { maxInputTokens: 1, warningThreshold: 1 },
    cache: { rootDir: cacheHome },
  });

  assert(bundle.tokenEstimate.inputTokens > 1);
  assert(bundle.errors.some((item) => item.code === 'CONTEXT_TOKEN_BUDGET_EXCEEDED'));
}

async function testEmptyLockAssetsReturnsEmptyBundle() {
  const root = createWorkspace('ai-spec-context-builder-empty-lock-');
  const cacheHome = createWorkspace('ai-spec-context-cache-empty-lock-');
  setupProject(root, cacheHome);
  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_context',
    hub: { url: '' },
    manifest: { slug: '', version: '1.0.0', checksum: sha256Text('manifest') },
    assets: [],
    overlays: [],
    sharedContracts: [],
  });

  const bundle = await buildContext({
    rootDir: root,
    stage: 'planning',
    cache: { rootDir: cacheHome },
  });

  assert.strictEqual(bundle.loadedAssets.length, 0);
  assert(bundle.warnings.some((item) => item.message.includes('没有匹配资产')));
}

async function testRegistryContentFieldFailsBeforePlanning() {
  const root = createWorkspace('ai-spec-context-builder-registry-content-');
  const cacheHome = createWorkspace('ai-spec-context-cache-registry-content-');
  setupProject(root, cacheHome);
  const registryPath = path.join(root, '.agents/registry.index.json');
  const registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
  registry.assets.rules[0].content = '即使当前 planning 阶段不加载 rule，也必须阻断';
  writeJson(registryPath, registry);

  await assert.rejects(() => buildContext({
    rootDir: root,
    stage: 'planning',
    cache: { rootDir: cacheHome },
  }), /registry\.index\.json 不允许包含完整 content/);
}

async function main() {
  await testBuildPlanningContextSucceeds();
  await testImplementationDoesNotLoadAllAssets();
  await testBundleReportsTokenBudgetError();
  await testEmptyLockAssetsReturnsEmptyBundle();
  await testRegistryContentFieldFailsBeforePlanning();
  console.log('context-builder tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
