const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  CONFIG_LAYERS,
  LAYER_IDS,
  READONLY_FIELDS,
  LayerRegistry,
  deepMerge,
  mergeConfigs,
  detectConflicts,
  checkReadonlyFields,
  forcePrivacyPolicy,
  loadEnterpriseConfig,
  loadTeamConfig,
  readJsonIfExists,
  getNestedValue,
  setNestedValue,
} = require('../../src/config/config-layer');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-test-config-'));
}

// ============================================================
// P1.4.1 — 层定义与注册表
// ============================================================

async function testConfigLayersCount() {
  assert.strictEqual(CONFIG_LAYERS.length, 11);
}

async function testConfigLayersOrder() {
  const ids = CONFIG_LAYERS.map((l) => l.id);
  assert.deepStrictEqual(ids, [
    'default',
    'enterprise',
    'global',
    'manifest',
    'agentProfile',
    'workspace',
    'project',
    'team',
    'policy',
    'run',
    'cli',
  ]);
}

async function testConfigLayersPriorities() {
  for (let i = 1; i < CONFIG_LAYERS.length; i++) {
    assert(CONFIG_LAYERS[i].priority > CONFIG_LAYERS[i - 1].priority);
  }
}

async function testLayerIds() {
  assert.deepStrictEqual(LAYER_IDS, CONFIG_LAYERS.map((l) => l.id));
}

async function testRegistryGetAll() {
  const registry = new LayerRegistry();
  const all = registry.getAll();
  assert.strictEqual(all.length, 11);
  assert.strictEqual(all[0].id, 'default');
  assert.strictEqual(all[10].id, 'cli');
}

async function testRegistryGet() {
  const registry = new LayerRegistry();
  const enterprise = registry.get('enterprise');
  assert.strictEqual(enterprise.id, 'enterprise');
  assert.strictEqual(enterprise.name, '企业配置');
}

async function testRegistryHas() {
  const registry = new LayerRegistry();
  assert(registry.has('default'));
  assert(registry.has('cli'));
  assert(!registry.has('nonexistent'));
}

async function testRegistryGetOrderedIds() {
  const registry = new LayerRegistry();
  const ids = registry.getOrderedIds();
  assert.strictEqual(ids[0], 'default');
  assert.strictEqual(ids[10], 'cli');
}

// ============================================================
// P1.4.2 — 配置合并
// ============================================================

async function testMergeEmpty() {
  const result = mergeConfigs({});
  assert(typeof result.config === 'object');
  assert.strictEqual(result.conflicts.length, 0);
  assert.strictEqual(result.readonlyViolations.length, 0);
}

async function testMergeSingleLayer() {
  const result = mergeConfigs({ default: { scanPolicy: { maxDepth: 3 } } });
  assert.strictEqual(result.config.scanPolicy.maxDepth, 3);
}

async function testMergeLayerOrder() {
  const result = mergeConfigs({
    default: { execution: { mode: 'local-assisted' } },
    project: { execution: { mode: 'autonomous' } },
  });
  // project 层优先级高于 default
  assert.strictEqual(result.config.execution.mode, 'autonomous');
}

async function testMergeMultipleLayers() {
  const result = mergeConfigs({
    default: { execution: { mode: 'a', executor: 'codex' } },
    global: { execution: { mode: 'b' } },
    project: { execution: { executor: 'cursor' } },
  });
  assert.strictEqual(result.config.execution.mode, 'b');
  assert.strictEqual(result.config.execution.executor, 'cursor');
}

async function testMergeDeepObject() {
  const result = mergeConfigs({
    default: { privacyPolicy: { uploadSourceCode: false, allowRelativePath: true } },
    project: { privacyPolicy: { allowRelativePath: false } },
  });
  assert.strictEqual(result.config.privacyPolicy.uploadSourceCode, false);
  assert.strictEqual(result.config.privacyPolicy.allowRelativePath, false);
}

async function testMergeArrayReplacement() {
  const result = mergeConfigs({
    default: { fallbackExecutors: ['cursor'] },
    project: { fallbackExecutors: ['claude-code', 'codex'] },
  });
  // 数组应被替换而非合并
  assert.deepStrictEqual(result.config.fallbackExecutors, ['claude-code', 'codex']);
}

async function testMergeNullLayer() {
  const result = mergeConfigs({
    default: { execution: { mode: 'a' } },
    enterprise: null,
    project: { execution: { mode: 'b' } },
  });
  assert.strictEqual(result.config.execution.mode, 'b');
}

async function testMergeForcesPrivacyPolicy() {
  const result = mergeConfigs({
    default: {},
    project: { privacyPolicy: { uploadSourceCode: true } },
  });
  // 隐私策略被强制覆盖
  assert.strictEqual(result.config.privacyPolicy.uploadSourceCode, false);
}

// ============================================================
// P1.4.3 — 冲突检测
// ============================================================

async function testDetectNoConflicts() {
  const conflicts = detectConflicts({
    default: { execution: { mode: 'a' } },
    project: { scanPolicy: { maxDepth: 3 } },
  });
  assert.strictEqual(conflicts.length, 0);
}

async function testDetectConflict() {
  const conflicts = detectConflicts({
    default: { execution: { mode: 'a' } },
    project: { execution: { mode: 'b' } },
  });
  assert.strictEqual(conflicts.length, 1);
  assert.strictEqual(conflicts[0].field, 'execution.mode');
  assert(conflicts[0].layers.includes('default'));
  assert(conflicts[0].layers.includes('project'));
}

async function testDetectMultipleConflicts() {
  const conflicts = detectConflicts({
    default: { execution: { mode: 'a' }, scanPolicy: { maxDepth: 3 } },
    project: { execution: { mode: 'b' }, scanPolicy: { maxDepth: 5 } },
  });
  assert.strictEqual(conflicts.length, 2);
}

async function testDetectSameValueNoConflict() {
  const conflicts = detectConflicts({
    default: { execution: { mode: 'a' } },
    project: { execution: { mode: 'a' } },
  });
  // 相同值不算冲突
  assert.strictEqual(conflicts.length, 0);
}

async function testDetectNullLayerIgnored() {
  const conflicts = detectConflicts({
    default: { execution: { mode: 'a' } },
    enterprise: null,
    project: { execution: { mode: 'b' } },
  });
  assert.strictEqual(conflicts.length, 1);
}

// ============================================================
// P1.4.4 — 本地覆盖
// ============================================================

async function testLocalOverride() {
  const result = mergeConfigs({
    default: { execution: { mode: 'local-assisted' } },
    workspace: { execution: { mode: 'workspace-mode' } },
    project: { execution: { mode: 'project-mode' } },
  });
  // project 优先级高于 workspace
  assert.strictEqual(result.config.execution.mode, 'project-mode');
}

async function testLocalOverrideDeep() {
  const result = mergeConfigs({
    default: { tokenBudget: { enabled: true, maxInputTokens: 120000 } },
    project: { tokenBudget: { maxInputTokens: 50000 } },
  });
  assert.strictEqual(result.config.tokenBudget.enabled, true);
  assert.strictEqual(result.config.tokenBudget.maxInputTokens, 50000);
}

async function testCliOverridesAll() {
  const result = mergeConfigs({
    default: { execution: { mode: 'a' } },
    enterprise: { execution: { mode: 'b' } },
    project: { execution: { mode: 'c' } },
    team: { execution: { mode: 'd' } },
    cli: { execution: { mode: 'e' } },
  });
  // CLI 优先级最高
  assert.strictEqual(result.config.execution.mode, 'e');
}

// ============================================================
// P1.4.5 — 只读字段保护
// ============================================================

async function testReadonlyFieldsList() {
  assert.strictEqual(READONLY_FIELDS.length, 6);
  assert(READONLY_FIELDS.includes('privacyPolicy.uploadSourceCode'));
  assert(READONLY_FIELDS.includes('privacyPolicy.uploadAbsolutePath'));
}

async function testReadonlyNoViolation() {
  const result = checkReadonlyFields(
    { privacyPolicy: { uploadSourceCode: false } },
    { privacyPolicy: { uploadSourceCode: false } },
  );
  assert.strictEqual(result.ok, true);
  assert.strictEqual(result.violations.length, 0);
}

async function testReadonlyViolation() {
  const result = checkReadonlyFields(
    { privacyPolicy: { uploadSourceCode: false } },
    { privacyPolicy: { uploadSourceCode: true } },
  );
  assert.strictEqual(result.ok, false);
  assert(result.violations.includes('privacyPolicy.uploadSourceCode'));
}

async function testReadonlyMergeEnforced() {
  // 即使某层试图覆盖只读字段，mergeConfigs 仍返回冲突
  const result = mergeConfigs({
    default: { privacyPolicy: { uploadSourceCode: false } },
    project: { privacyPolicy: { uploadSourceCode: true } },
  });
  // 强制隐私策略会将其覆盖回 false
  assert.strictEqual(result.config.privacyPolicy.uploadSourceCode, false);
}

async function testReadonlyMultipleViolations() {
  const result = checkReadonlyFields(
    { privacyPolicy: { uploadSourceCode: false, uploadAbsolutePath: false } },
    { privacyPolicy: { uploadSourceCode: true, uploadAbsolutePath: true } },
  );
  assert.strictEqual(result.ok, false);
  assert.strictEqual(result.violations.length, 2);
}

// ============================================================
// 工具函数
// ============================================================

async function testDeepMerge() {
  const a = { x: 1, y: { z: 2 } };
  const b = { y: { w: 3 } };
  const result = deepMerge(a, b);
  assert.strictEqual(result.x, 1);
  assert.strictEqual(result.y.z, 2);
  assert.strictEqual(result.y.w, 3);
  // 不修改原对象
  assert.strictEqual(a.y.w, undefined);
}

async function testDeepMergeArray() {
  const a = { arr: [1, 2] };
  const b = { arr: [3, 4] };
  const result = deepMerge(a, b);
  assert.deepStrictEqual(result.arr, [3, 4]);
}

async function testGetNestedValue() {
  const obj = { a: { b: { c: 42 } } };
  assert.strictEqual(getNestedValue(obj, 'a.b.c'), 42);
  assert.strictEqual(getNestedValue(obj, 'a.b'), obj.a.b);
  assert.strictEqual(getNestedValue(obj, 'a.x'), undefined);
  assert.strictEqual(getNestedValue(obj, 'x.y.z'), undefined);
}

async function testSetNestedValue() {
  const obj = {};
  setNestedValue(obj, 'a.b.c', 42);
  assert.strictEqual(obj.a.b.c, 42);
}

async function testForcePrivacyPolicy() {
  const config = { privacyPolicy: { uploadSourceCode: true }, other: 'value' };
  const result = forcePrivacyPolicy(config);
  assert.strictEqual(result.privacyPolicy.uploadSourceCode, false);
  assert.strictEqual(result.other, 'value');
}

async function testReadJsonIfExists() {
  const tmpDir = createTempDir();
  const filePath = path.join(tmpDir, 'test.json');
  fs.writeFileSync(filePath, JSON.stringify({ key: 'value' }), 'utf8');

  const result = readJsonIfExists(filePath);
  assert.strictEqual(result.key, 'value');

  const missing = readJsonIfExists(path.join(tmpDir, 'missing.json'));
  assert.strictEqual(missing, null);

  const nullResult = readJsonIfExists(null);
  assert.strictEqual(nullResult, null);
}

// ============================================================
// 从文件加载企业/团队配置
// ============================================================

async function testLoadEnterpriseConfig() {
  const tmpDir = createTempDir();
  const enterpriseDir = path.join(tmpDir, '.ai-spec');
  fs.mkdirSync(enterpriseDir, { recursive: true });
  fs.writeFileSync(
    path.join(enterpriseDir, 'enterprise.json'),
    JSON.stringify({ tokenBudget: { maxInputTokens: 80000 } }),
    'utf8',
  );

  const config = loadEnterpriseConfig(tmpDir);
  assert.strictEqual(config.tokenBudget.maxInputTokens, 80000);
}

async function testLoadEnterpriseConfigMissing() {
  const tmpDir = createTempDir();
  const config = loadEnterpriseConfig(tmpDir);
  assert.strictEqual(config, null);
}

async function testLoadTeamConfig() {
  const tmpDir = createTempDir();
  const teamDir = path.join(tmpDir, '.ai-spec');
  fs.mkdirSync(teamDir, { recursive: true });
  fs.writeFileSync(
    path.join(teamDir, 'team.json'),
    JSON.stringify({ approvalPolicy: { beforeCommit: true } }),
    'utf8',
  );

  const config = loadTeamConfig(tmpDir);
  assert.strictEqual(config.approvalPolicy.beforeCommit, true);
}

async function testLoadTeamConfigMissing() {
  const tmpDir = createTempDir();
  const config = loadTeamConfig(tmpDir);
  assert.strictEqual(config, null);
}

// ============================================================
// Barrel 导出检查
// ============================================================

async function testExports() {
  assert.strictEqual(typeof CONFIG_LAYERS, 'object');
  assert.strictEqual(typeof LAYER_IDS, 'object');
  assert.strictEqual(typeof READONLY_FIELDS, 'object');
  assert.strictEqual(typeof LayerRegistry, 'function');
  assert.strictEqual(typeof deepMerge, 'function');
  assert.strictEqual(typeof mergeConfigs, 'function');
  assert.strictEqual(typeof detectConflicts, 'function');
  assert.strictEqual(typeof checkReadonlyFields, 'function');
  assert.strictEqual(typeof forcePrivacyPolicy, 'function');
  assert.strictEqual(typeof loadEnterpriseConfig, 'function');
  assert.strictEqual(typeof loadTeamConfig, 'function');
  assert.strictEqual(typeof readJsonIfExists, 'function');
  assert.strictEqual(typeof getNestedValue, 'function');
  assert.strictEqual(typeof setNestedValue, 'function');
}

// ============================================================
// main
// ============================================================

async function main() {
  // P1.4.1 — 层定义与注册表
  await testConfigLayersCount();
  await testConfigLayersOrder();
  await testConfigLayersPriorities();
  await testLayerIds();
  await testRegistryGetAll();
  await testRegistryGet();
  await testRegistryHas();
  await testRegistryGetOrderedIds();

  // P1.4.2 — 配置合并
  await testMergeEmpty();
  await testMergeSingleLayer();
  await testMergeLayerOrder();
  await testMergeMultipleLayers();
  await testMergeDeepObject();
  await testMergeArrayReplacement();
  await testMergeNullLayer();
  await testMergeForcesPrivacyPolicy();

  // P1.4.3 — 冲突检测
  await testDetectNoConflicts();
  await testDetectConflict();
  await testDetectMultipleConflicts();
  await testDetectSameValueNoConflict();
  await testDetectNullLayerIgnored();

  // P1.4.4 — 本地覆盖
  await testLocalOverride();
  await testLocalOverrideDeep();
  await testCliOverridesAll();

  // P1.4.5 — 只读字段保护
  await testReadonlyFieldsList();
  await testReadonlyNoViolation();
  await testReadonlyViolation();
  await testReadonlyMergeEnforced();
  await testReadonlyMultipleViolations();

  // 工具函数
  await testDeepMerge();
  await testDeepMergeArray();
  await testGetNestedValue();
  await testSetNestedValue();
  await testForcePrivacyPolicy();
  await testReadJsonIfExists();

  // 文件加载
  await testLoadEnterpriseConfig();
  await testLoadEnterpriseConfigMissing();
  await testLoadTeamConfig();
  await testLoadTeamConfigMissing();

  // 导出
  await testExports();

  console.log('config-layer tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
