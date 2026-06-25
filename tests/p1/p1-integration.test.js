const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

// P1 能力导入
const { TechScannerEngine } = require('../../src/scanner/engine');
const { CursorAdapter } = require('../../src/ide/adapters/cursor-adapter');
const { ClaudeAdapter } = require('../../src/ide/adapters/claude-adapter');
const { validateAdapterConsistency } = require('../../src/ide/adapters/adapter-protocol');
const {
  ASSET_TYPES,
  createAssetPackage,
  validateAssetPackage,
  computeAssetChecksum,
  guessAssetType,
  buildAssetIdentity,
  AssetPackageManager,
} = require('../../src/asset');
const {
  CONFIG_LAYERS,
  LayerRegistry,
  mergeConfigs,
  detectConflicts,
  checkReadonlyFields,
} = require('../../src/config/config-layer');
const { ConfigLoader } = require('../../src/config/config-loader');

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// ============================================================
// P1.6-TC01: P1 集成测试 — 全链路验证
// ============================================================

async function testFullPipeline() {
  const root = createTempDir('p1-integration-');
  const scanner = new TechScannerEngine();

  // 1. Scanner 检测
  fs.mkdirSync(path.join(root, 'src'), { recursive: true });
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'test-project',
      dependencies: { react: '^18.0.0', 'react-dom': '^18.0.0' },
      devDependencies: { vite: '^5.0.0', '@vitejs/plugin-react': '^4.0.0' },
    }),
    'utf8',
  );

  const scanResult = await scanner.scan(root);
  assert(scanResult.packages.length >= 1);
  assert.strictEqual(scanResult.packages[0].primary.framework, 'react-vite');

  // 2. Adapter 生成
  const cursorAdapter = new CursorAdapter();
  const claudeAdapter = new ClaudeAdapter();
  const cursorOutput = cursorAdapter.generateFiles({ rootDir: root, profile: 'react' });
  const claudeOutput = claudeAdapter.generateFiles({ rootDir: root, profile: 'react' });

  // 3. 一致性校验
  const consistency = validateAdapterConsistency([cursorOutput, claudeOutput]);
  assert.strictEqual(consistency.ok, true);

  // 4. AssetPackage 创建与校验
  const pkg = createAssetPackage({
    assetId: 'test-integration',
    assetType: ASSET_TYPES.RULE,
    version: '1.0.0',
    checksum: computeAssetChecksum('integration test content'),
    generatedFiles: ['.agents/rules/test.md'],
  });
  const validation = validateAssetPackage(pkg);
  assert.strictEqual(validation.ok, true);

  // 5. AssetPackage 安装
  const manager = new AssetPackageManager(root);
  const installResult = manager.install(pkg, {
    '.agents/rules/test.md': 'integration test content',
  });
  assert.strictEqual(installResult.ok, true);
  assert(fs.existsSync(path.join(root, '.agents/rules/test.md')));

  // 6. ConfigLayer 合并
  const configResult = mergeConfigs({
    default: { execution: { mode: 'local-assisted' } },
    project: { execution: { mode: 'autonomous' } },
  });
  assert.strictEqual(configResult.config.execution.mode, 'autonomous');
  assert.strictEqual(configResult.readonlyViolations.length, 0);
}

// ============================================================
// P1.6-TC02: 回归测试 — 确认已有能力未破坏
// ============================================================

async function testScannerRegression() {
  const root = createTempDir('p1-regression-scanner-');
  fs.writeFileSync(
    path.join(root, 'package.json'),
    JSON.stringify({
      name: 'vue-app',
      dependencies: { vue: '^3.4.0' },
      devDependencies: { vite: '^5.0.0', '@vitejs/plugin-vue': '^5.0.0' },
    }),
    'utf8',
  );

  const scanner = new TechScannerEngine();
  const result = await scanner.scan(root);
  assert.strictEqual(result.packages[0].primary.framework, 'vue-vite');
}

async function testAdapterRegression() {
  const root = createTempDir('p1-regression-adapter-');
  const cursorAdapter = new CursorAdapter();
  const claudeAdapter = new ClaudeAdapter();

  const cursorOutput = cursorAdapter.generateFiles({ rootDir: root, profile: 'auto' });
  const claudeOutput = claudeAdapter.generateFiles({ rootDir: root, profile: 'auto' });

  assert.strictEqual(cursorOutput.adapterId, 'cursor');
  assert.strictEqual(claudeOutput.adapterId, 'claude');
  assert(cursorOutput.files.length >= 6);
  assert(claudeOutput.files.length >= 10);
}

async function testAssetPackageRegression() {
  const root = createTempDir('p1-regression-asset-');
  const manager = new AssetPackageManager(root);

  const pkg = createAssetPackage({
    assetId: 'regression-test',
    assetType: ASSET_TYPES.SKILL,
    version: '1.0.0',
    checksum: computeAssetChecksum('content'),
    generatedFiles: ['.agents/skills/test.md'],
  });

  // 安装
  const installResult = manager.install(pkg, { '.agents/skills/test.md': 'content' });
  assert.strictEqual(installResult.ok, true);

  // 升级
  const newPkg = createAssetPackage({
    assetId: 'regression-test',
    assetType: ASSET_TYPES.SKILL,
    version: '2.0.0',
    checksum: computeAssetChecksum('new content'),
    generatedFiles: ['.agents/skills/test.md'],
  });
  const upgradeResult = manager.upgrade(pkg, newPkg, { '.agents/skills/test.md': 'new content' });
  assert.strictEqual(upgradeResult.ok, true);
  assert(upgradeResult.backupId.includes('regression-test'));

  // 回滚
  const rollbackResult = manager.rollback(upgradeResult.backupId, newPkg);
  assert.strictEqual(rollbackResult.ok, true);
  assert.strictEqual(
    fs.readFileSync(path.join(root, '.agents/skills/test.md'), 'utf8'),
    'content',
  );
}

async function testConfigLayerRegression() {
  // 层顺序不变
  assert.strictEqual(CONFIG_LAYERS.length, 11);
  assert.strictEqual(CONFIG_LAYERS[0].id, 'default');
  assert.strictEqual(CONFIG_LAYERS[10].id, 'cli');

  // 合并行为不变
  const result = mergeConfigs({
    default: { a: 1 },
    project: { a: 2 },
    cli: { a: 3 },
  });
  assert.strictEqual(result.config.a, 3);

  // 冲突检测不变
  const conflicts = detectConflicts({
    default: { a: 1 },
    project: { a: 2 },
  });
  assert.strictEqual(conflicts.length, 1);

  // 只读保护不变
  const roCheck = checkReadonlyFields(
    { privacyPolicy: { uploadSourceCode: false } },
    { privacyPolicy: { uploadSourceCode: true } },
  );
  assert.strictEqual(roCheck.ok, false);
}

async function testConfigLoaderRegression() {
  const loader = new ConfigLoader();
  const config = await loader.load({ rootDir: createTempDir('p1-regression-config-') });
  assert(config.execution);
  assert(config.privacyPolicy);
  assert.strictEqual(config.privacyPolicy.uploadSourceCode, false);
  assert(config.branchPolicy);
  assert(config.tokenBudget);
}

// ============================================================
// P1.6-TC03: 回滚测试
// ============================================================

async function testAssetRollback() {
  const root = createTempDir('p1-rollback-');
  const manager = new AssetPackageManager(root);

  // 安装 v1
  const v1 = createAssetPackage({
    assetId: 'rollback-asset',
    assetType: ASSET_TYPES.RULE,
    version: '1.0.0',
    checksum: computeAssetChecksum('v1'),
    generatedFiles: ['.agents/rules/r.md'],
  });
  manager.install(v1, { '.agents/rules/r.md': 'v1' });

  // 升级到 v2（新增一个文件）
  const v2 = createAssetPackage({
    assetId: 'rollback-asset',
    assetType: ASSET_TYPES.RULE,
    version: '2.0.0',
    checksum: computeAssetChecksum('v2'),
    generatedFiles: ['.agents/rules/r.md', '.agents/rules/r2.md'],
  });
  const upgradeResult = manager.upgrade(v1, v2, {
    '.agents/rules/r.md': 'v2',
    '.agents/rules/r2.md': 'v2-new',
  });

  assert(fs.existsSync(path.join(root, '.agents/rules/r2.md')));

  // 回滚
  const rollbackResult = manager.rollback(upgradeResult.backupId, v2);
  assert.strictEqual(rollbackResult.ok, true);
  assert(!fs.existsSync(path.join(root, '.agents/rules/r2.md')));
  assert.strictEqual(
    fs.readFileSync(path.join(root, '.agents/rules/r.md'), 'utf8'),
    'v1',
  );
}

async function testAdapterRollback() {
  const root = createTempDir('p1-rollback-adapter-');
  const adapter = new CursorAdapter();

  // 生成并写入文件
  const output = adapter.generateFiles({ rootDir: root, profile: 'react' });
  for (const file of output.files) {
    const fullPath = path.join(root, file.relativePath);
    fs.mkdirSync(path.dirname(fullPath), { recursive: true });
    fs.writeFileSync(fullPath, file.content, 'utf8');
  }

  // 验证文件存在
  for (const file of output.files) {
    assert(fs.existsSync(path.join(root, file.relativePath)));
  }

  // 回滚
  adapter.rollback(root);

  // 验证文件被删除
  for (const file of output.files) {
    assert(!fs.existsSync(path.join(root, file.relativePath)));
  }
}

// ============================================================
// P1.6-TC04: 进入 P2 判断 — 版本与接口稳定性
// ============================================================

async function testInterfaceStability() {
  // 验证所有 P1 模块的公共接口存在且类型正确

  // Scanner
  const scanner = new TechScannerEngine();
  assert(typeof scanner.scan === 'function');

  // Adapter Protocol
  const cursor = new CursorAdapter();
  const claude = new ClaudeAdapter();
  assert(typeof cursor.generateFiles === 'function');
  assert(typeof cursor.write === 'function');
  assert(typeof cursor.check === 'function');
  assert(typeof cursor.validate === 'function');
  assert(typeof cursor.diff === 'function');
  assert(typeof cursor.rollback === 'function');
  assert(typeof claude.generateFiles === 'function');
  assert(typeof validateAdapterConsistency === 'function');

  // Asset
  assert(typeof createAssetPackage === 'function');
  assert(typeof validateAssetPackage === 'function');
  assert(typeof computeAssetChecksum === 'function');
  assert(typeof guessAssetType === 'function');
  assert(typeof buildAssetIdentity === 'function');
  assert(typeof AssetPackageManager === 'function');

  // Config
  assert(typeof mergeConfigs === 'function');
  assert(typeof detectConflicts === 'function');
  assert(typeof checkReadonlyFields === 'function');
  assert(typeof LayerRegistry === 'function');
}

async function testIdempotency() {
  // 验证重复操作的幂等性
  const root = createTempDir('p1-idempotency-');
  const manager = new AssetPackageManager(root);

  const pkg = createAssetPackage({
    assetId: 'idempotent-test',
    assetType: ASSET_TYPES.RULE,
    version: '1.0.0',
    checksum: computeAssetChecksum('same content'),
    generatedFiles: ['.agents/rules/idem.md'],
  });

  // 两次安装相同内容
  const r1 = manager.install(pkg, { '.agents/rules/idem.md': 'same content' });
  const r2 = manager.install(pkg, { '.agents/rules/idem.md': 'same content' });

  assert.strictEqual(r1.ok, true);
  assert.strictEqual(r2.ok, true);
  assert.strictEqual(
    fs.readFileSync(path.join(root, '.agents/rules/idem.md'), 'utf8'),
    'same content',
  );
}

// ============================================================
// main
// ============================================================

async function main() {
  // TC01: 集成测试
  await testFullPipeline();

  // TC02: 回归测试
  await testScannerRegression();
  await testAdapterRegression();
  await testAssetPackageRegression();
  await testConfigLayerRegression();
  await testConfigLoaderRegression();

  // TC03: 回滚测试
  await testAssetRollback();
  await testAdapterRollback();

  // TC04: 接口稳定性与幂等性
  await testInterfaceStability();
  await testIdempotency();

  console.log('p1-integration tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
