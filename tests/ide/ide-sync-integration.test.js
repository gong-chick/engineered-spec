/**
 * IDE Sync 集成测试
 * 端到端验证：init --recommend --yes → ide sync → ide doctor → ide repair 完整链路
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');

function createTempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-integration-'));
}

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runCli(args, options = {}) {
  return spawnSync('node', ['./bin/cli.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_SPEC_SKIP_LAUNCHER_SYNC: '1',
    },
    ...options,
  });
}

function createReactProject() {
  const root = createTempDir();
  writeJson(path.join(root, 'package.json'), {
    name: 'react-test-app',
    dependencies: {
      react: '^19.0.0',
      'react-dom': '^19.0.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
    },
  });
  fs.mkdirSync(path.join(root, 'src/pages'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/pages/index.tsx'), 'export default function Home() { return <div>Home</div>; }\n');
  return root;
}

function createVueProject() {
  const root = createTempDir();
  writeJson(path.join(root, 'package.json'), {
    name: 'vue-test-app',
    dependencies: {
      vue: '^3.5.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
      vite: '^6.0.0',
    },
  });
  fs.mkdirSync(path.join(root, 'src/views'), { recursive: true });
  fs.writeFileSync(path.join(root, 'src/views/index.vue'), '<template><div>Home</div></template>\n');
  return root;
}

async function testInitThenSyncThenDoctorForReact() {
  const root = createReactProject();

  // Step 1: init --recommend --yes
  const initResult = runCli(['init', root, '--recommend', '--yes']);
  assert.strictEqual(initResult.status, 0, initResult.stderr || initResult.stdout);
  assert(fs.existsSync(path.join(root, '.ai-spec/project.json')));

  // Step 2: ide sync
  const syncResult = runCli(['ide', 'sync', root, '--ide', 'cursor,claude', '--profile', 'react', '--link-mode', 'copy', '--yes']);
  assert.strictEqual(syncResult.status, 0, syncResult.stderr || syncResult.stdout);
  assert(syncResult.stdout.includes('IDE 同步完成'), syncResult.stdout);

  // 验证核心文件
  assert(fs.existsSync(path.join(root, '.agents/registry/ide-registry.json')));
  assert(fs.existsSync(path.join(root, '.ai-spec/ide-integration.json')));
  assert(fs.existsSync(path.join(root, '.cursor/rules/ai-spec-auto.mdc')));
  assert(fs.existsSync(path.join(root, '.claude/ai-spec-auto.md')));

  // 验证 ide-registry.json 的 profile 是 react
  const ideRegistry = JSON.parse(fs.readFileSync(path.join(root, '.agents/registry/ide-registry.json'), 'utf8'));
  assert.strictEqual(ideRegistry.project.profile, 'react');

  // Step 3: ide doctor 应该通过
  const doctorResult = runCli(['ide', 'doctor', root]);
  assert.strictEqual(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);

  // Step 4: ide sync 幂等执行
  const syncResult2 = runCli(['ide', 'sync', root, '--ide', 'cursor,claude', '--profile', 'react', '--link-mode', 'copy', '--yes']);
  assert.strictEqual(syncResult2.status, 0, syncResult2.stderr || syncResult2.stdout);
  assert(syncResult2.stdout.includes('IDE 同步完成'));

  // 业务代码不应被修改
  assert(fs.existsSync(path.join(root, 'src/pages/index.tsx')));
  assert(fs.existsSync(path.join(root, 'package.json')));

  // 验证锚点
  const agentsContent = fs.readFileSync(path.join(root, 'AGENTS.md'), 'utf8');
  assert(agentsContent.includes('AI-SPEC-AUTO:START'));
  assert(agentsContent.includes('.ai-spec/project.json'));

  const claudeContent = fs.readFileSync(path.join(root, 'CLAUDE.md'), 'utf8');
  assert(claudeContent.includes('AI-SPEC-AUTO:START'));
  assert(claudeContent.includes('/spec-start'));
}

async function testInitThenSyncThenDoctorForVue() {
  const root = createVueProject();

  // Step 1: init --recommend --yes
  const initResult = runCli(['init', root, '--recommend', '--yes']);
  assert.strictEqual(initResult.status, 0, initResult.stderr || initResult.stdout);

  // Step 2: ide sync with vue profile
  const syncResult = runCli(['ide', 'sync', root, '--ide', 'cursor,claude', '--profile', 'vue', '--link-mode', 'copy', '--yes']);
  assert.strictEqual(syncResult.status, 0, syncResult.stderr || syncResult.stdout);
  assert(syncResult.stdout.includes('IDE 同步完成'));

  // 验证 profile
  const ideRegistry = JSON.parse(fs.readFileSync(path.join(root, '.agents/registry/ide-registry.json'), 'utf8'));
  assert.strictEqual(ideRegistry.project.profile, 'vue');
  assert.strictEqual(ideRegistry.project.framework, 'Vue');

  // Step 3: ide doctor
  const doctorResult = runCli(['ide', 'doctor', root]);
  assert.strictEqual(doctorResult.status, 0, doctorResult.stderr || doctorResult.stdout);

  // 验证锚点内容
  const memoryContent = fs.readFileSync(path.join(root, 'memory.md'), 'utf8');
  assert(memoryContent.includes('AI-SPEC-AUTO:START'));
  assert(memoryContent.includes('禁止写入'));
}

async function testRepairAfterFileDeletion() {
  const root = createReactProject();

  // init + sync
  runCli(['init', root, '--recommend', '--yes']);
  runCli(['ide', 'sync', root, '--ide', 'cursor,claude', '--profile', 'react', '--link-mode', 'copy', '--yes']);

  // 删除 ide-registry.json
  const ideRegistryPath = path.join(root, '.agents/registry/ide-registry.json');
  assert(fs.existsSync(ideRegistryPath));
  fs.unlinkSync(ideRegistryPath);

  // doctor 应该发现缺失
  const doctorResult = runCli(['ide', 'doctor', root]);
  assert(doctorResult.stdout.includes('.agents/registry/ide-registry.json') || doctorResult.stdout.includes('ide-registry'));

  // repair 应该恢复
  const repairResult = runCli(['ide', 'repair', root, '--yes']);
  assert.strictEqual(repairResult.status, 0, repairResult.stderr || repairResult.stdout);
  assert(repairResult.stdout.includes('IDE 修复完成') || repairResult.stdout.includes('修复'));

  // 文件恢复
  assert(fs.existsSync(ideRegistryPath));
}

async function testDryRunShowsPlan() {
  const root = createReactProject();

  // init
  runCli(['init', root, '--recommend', '--yes']);

  // ide sync --dry-run
  const syncResult = runCli(['ide', 'sync', root, '--ide', 'cursor,claude', '--profile', 'react', '--dry-run']);
  assert.strictEqual(syncResult.status, 0, syncResult.stderr || syncResult.stdout);

  // 不应写入 ide-registry
  assert(!fs.existsSync(path.join(root, '.agents/registry/ide-registry.json')));
}

async function testSyncWithoutYesShowsPlanAndRequiresConfirmation() {
  const root = createReactProject();

  runCli(['init', root, '--recommend', '--yes']);

  // sync 不带 --yes 或 --dry-run
  const result = runCli(['ide', 'sync', root, '--ide', 'cursor,claude', '--profile', 'react']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('请追加 --yes 确认写入') || result.stdout.includes('--dry-run'));
}

async function testDoctorWithoutInitReportsErrors() {
  const root = createTempDir();

  const result = runCli(['ide', 'doctor', root]);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('project.json') || result.stdout.includes('缺失'));
}

async function testHelpOutput() {
  const result = runCli(['ide', '--help']);
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert(result.stdout.includes('sync'));
  assert(result.stdout.includes('doctor'));
  assert(result.stdout.includes('repair'));
  assert(result.stdout.includes('--profile'));
  assert(result.stdout.includes('--link-mode'));
}

async function testInvalidProfile() {
  const result = runCli(['ide', 'sync', '.', '--profile', 'angular', '--dry-run']);
  assert.notStrictEqual(result.status, 0);
  assert(result.stderr.includes('profile') || result.stderr.includes('无效'));
}

async function testInvalidLinkMode() {
  const result = runCli(['ide', 'sync', '.', '--link-mode', 'hardlink', '--dry-run']);
  assert.notStrictEqual(result.status, 0);
  assert(result.stderr.includes('link-mode') || result.stderr.includes('无效'));
}

async function main() {
  await testInitThenSyncThenDoctorForReact();
  await testInitThenSyncThenDoctorForVue();
  await testRepairAfterFileDeletion();
  await testDryRunShowsPlan();
  await testSyncWithoutYesShowsPlanAndRequiresConfirmation();
  await testDoctorWithoutInitReportsErrors();
  await testHelpOutput();
  await testInvalidProfile();
  await testInvalidLinkMode();
  console.log('ide-sync-integration tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
