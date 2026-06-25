const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PassThrough, Writable } = require('stream');
const { spawnSync } = require('child_process');
const { __test__ } = require('../../bin/install-workflow');
const { readProfilesRegistry } = require('../../bin/profile-registry');

const repoRoot = path.join(__dirname, '..', '..');
const {
  selectCustomRuleList,
  selectFromList,
  selectBootstrapChoices,
  buildDevDependencyInstallArgs,
  selectUpdateModules,
  selectUpdateRuleMode,
  selectUpdateRuleFiles,
  listSelectableUpdateRules,
  copyAgents,
} = __test__;

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

function readText(filePath) {
  return fs.readFileSync(filePath, 'utf8');
}

function stripAnsi(value) {
  return String(value || '').replace(/\u001b\[[0-9;?]*[A-Za-z]/g, '');
}

function writeExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function seedAiSpecRuntimeState(targetDir) {
  writeJson(path.join(targetDir, '.ai-spec', 'current-run.json'), {
    schema_version: 1,
    kind: 'run-state',
    run_id: 'run_seed',
    status: 'waiting-approval',
  });
  writeJson(path.join(targetDir, '.ai-spec', 'repo-map.json'), {
    pages: ['src/views/login/index.vue'],
  });
  writeJson(path.join(targetDir, '.ai-spec', 'internal', 'current-dispatch.json'), {
    role: { id: 'requirement-analyst' },
  });
  writeJson(path.join(targetDir, '.ai-spec', 'internal', 'tmp', 'task-orchestrator-turn.json'), {
    schema_version: 1,
    kind: 'run-plan',
  });
  writeJson(path.join(targetDir, '.ai-spec', 'checkpoints', 'run_seed', '001-bootstrap.json'), {
    schema_version: 1,
    kind: 'checkpoint',
  });
  writeText(path.join(targetDir, '.ai-spec', 'runner', 'consumed', 'stale.log'), 'stale\n');
  writeText(path.join(targetDir, '.ai-spec', 'runtime-actions', 'legacy.json'), '{}\n');
  writeText(path.join(targetDir, '.ai-spec', 'stale-custom.txt'), 'stale\n');
}

function createFakePackageManagerBin(targetDir) {
  const fakeBinDir = path.join(targetDir, 'fake-pkg-bin');
  const script = `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "9.0.0"
  exit 0
fi
if [ "$1" = "uninstall" ]; then
  shift
  node - "$PWD/package.json" "$@" <<'NODE'
const fs = require('fs');
const pkgPath = process.argv[2];
const packages = process.argv.slice(3);
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
for (const name of packages) {
  if (pkg.dependencies) delete pkg.dependencies[name];
  if (pkg.devDependencies) delete pkg.devDependencies[name];
}
if (pkg.dependencies && Object.keys(pkg.dependencies).length === 0) delete pkg.dependencies;
if (pkg.devDependencies && Object.keys(pkg.devDependencies).length === 0) delete pkg.devDependencies;
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\\n', 'utf8');
NODE
  exit 0
fi
exit 0
`;
  writeExecutable(path.join(fakeBinDir, 'pnpm'), script);
  writeExecutable(path.join(fakeBinDir, 'npm'), script);
  return fakeBinDir;
}

function createFakeUiproBin(targetDir) {
  const fakeBinDir = path.join(targetDir, 'fake-uipro-bin');
  writeExecutable(
    path.join(fakeBinDir, 'uipro'),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "1.0.0"
  exit 0
fi
if [ "$1" = "init" ]; then
  mkdir -p "$PWD/.shared/ui-ux-pro-max"
  mkdir -p "$PWD/.cursor/commands"
  printf '{"palettes":161,"styles":67}\\n' > "$PWD/.shared/ui-ux-pro-max/catalog.json"
  cat > "$PWD/.cursor/commands/ui-ux-pro-max.md" <<'EOF'
# UI UX Pro Max

优先读取 data/catalog.json
EOF
  exit 0
fi
echo "unexpected uipro invocation: $@" >&2
exit 1
`,
  );
  return fakeBinDir;
}

function createFakeUiproSkillLayoutBin(targetDir) {
  const fakeBinDir = path.join(targetDir, 'fake-uipro-skill-layout-bin');
  writeExecutable(
    path.join(fakeBinDir, 'uipro'),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "2.0.0"
  exit 0
fi
if [ "$1" = "init" ]; then
  mkdir -p "$PWD/.cursor/skills/ui-ux-pro-max/data"
  printf '{"palettes":161,"layout":"cursor-skill"}\\n' > "$PWD/.cursor/skills/ui-ux-pro-max/data/catalog.json"
  cat > "$PWD/.cursor/skills/ui-ux-pro-max/SKILL.md" <<'EOF'
---
name: ui-ux-pro-max
description: fake cursor skill layout
---

# UI UX Pro Max

优先读取 .cursor/skills/ui-ux-pro-max/data/catalog.json
EOF
  exit 0
fi
echo "unexpected uipro invocation: $@" >&2
exit 1
`,
  );
  return fakeBinDir;
}

function createWorkspaceRootAwarePnpmBin(targetDir) {
  const fakeBinDir = path.join(targetDir, 'fake-workspace-pnpm-bin');
  const commandLog = path.join(targetDir, 'pnpm-commands.log');
  writeExecutable(
    path.join(fakeBinDir, 'pnpm'),
    `#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const args = process.argv.slice(2);
if (args[0] === '--version') {
  console.log('10.26.2');
  process.exit(0);
}
fs.appendFileSync(${JSON.stringify(commandLog)}, args.join(' ') + '\\n', 'utf8');
if (args[0] === 'add') {
  if (!args.includes('-w')) {
    console.error('missing -w for workspace-root install');
    process.exit(42);
  }
  const binDir = path.join(process.cwd(), 'node_modules', '.bin');
  fs.mkdirSync(binDir, { recursive: true });
  fs.writeFileSync(path.join(binDir, process.platform === 'win32' ? 'ai-spec-auto.cmd' : 'ai-spec-auto'), '#!/bin/sh\\n', 'utf8');
  process.exit(0);
}
process.exit(0);
`,
  );
  return { fakeBinDir, commandLog };
}

function runCli(args, extraEnv = {}) {
  return spawnSync('node', ['./bin/cli.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ENGINEERED_SPEC_LOCAL: repoRoot,
      ENGINEERED_SPEC_FORCE_LOCAL_CLI: '1',
      ...extraEnv,
    },
  });
}

function runInstallWrapper(args, extraEnv = {}) {
  return spawnSync('bash', ['./install.sh', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      ENGINEERED_SPEC_LOCAL: repoRoot,
      ENGINEERED_SPEC_FORCE_LOCAL_CLI: '1',
      ...extraEnv,
    },
  });
}

async function withMockTTY(run) {
  const originalStdin = Object.getOwnPropertyDescriptor(process, 'stdin');
  const originalStdout = Object.getOwnPropertyDescriptor(process, 'stdout');

  const input = new PassThrough();
  input.isTTY = true;
  input.setRawMode = () => {};

  const outputChunks = [];
  const output = new Writable({
    write(chunk, _encoding, callback) {
      outputChunks.push(Buffer.isBuffer(chunk) ? chunk.toString('utf8') : String(chunk));
      callback();
    },
  });
  output.isTTY = true;

  Object.defineProperty(process, 'stdin', { configurable: true, value: input });
  Object.defineProperty(process, 'stdout', { configurable: true, value: output });

  try {
    return await run({
      input,
      getOutput() {
        return outputChunks.join('');
      },
    });
  } finally {
    Object.defineProperty(process, 'stdin', originalStdin);
    Object.defineProperty(process, 'stdout', originalStdout);
  }
}

async function verifyInteractiveCustomRuleSelectionUsesSpaceToggle() {
  const options = { rulesStrategy: 'custom', customRules: [] };

  await withMockTTY(async ({ input, getOutput }) => {
    const selection = selectCustomRuleList(options, {
      defaultRules: ['01-项目概述.md', '03-项目结构.md'],
      hint: '默认已勾选 01/03（项目概述、项目结构），可按空格取消',
    });

    setImmediate(() => {
      input.write('\x1b[B');
      input.write('\x1b[B');
      input.write(' ');
      input.write('\r');
    });

    await selection;

    const output = getOutput();
    assert.ok(output.includes('[✓] 04-组件规范'));
    assert.ok(!output.includes('[x]'));
    assert.ok(!output.includes('1) ['));
  });

  assert.deepStrictEqual(options.customRules, [
    '01-项目概述.md',
    '03-项目结构.md',
    '04-组件规范.md',
  ]);
}

async function verifyInteractiveEmptySelectionFallsBackToStandard() {
  const options = { rulesStrategy: 'custom', customRules: [] };

  await withMockTTY(async ({ input }) => {
    const selection = selectCustomRuleList(options, {
      defaultRules: ['01-项目概述.md', '03-项目结构.md'],
      hint: '默认已勾选 01/03（项目概述、项目结构），可按空格取消',
      emptySelectionLabel: '未选择任何自定义规则，将使用标准规范。',
    });

    setImmediate(() => {
      input.write(' ');
      input.write('\x1b[B');
      input.write(' ');
      input.write('\r');
    });

    await selection;
  });

  assert.strictEqual(options.rulesStrategy, 'standard');
  assert.deepStrictEqual(options.customRules, []);
}

async function verifyInteractiveSingleSelectionUsesArrowSpaceEnter() {
  let selected = null;

  await withMockTTY(async ({ input, getOutput }) => {
    const selection = selectFromList('选择技术栈 Profile：', [
      { value: 'vue', label: 'vue', desc: 'Vue' },
      { value: 'react', label: 'react', desc: 'React' },
    ], 0);

    setImmediate(() => {
      input.write('\x1b[B');
      input.write(' ');
      input.write('\r');
    });

    selected = await selection;

    const output = getOutput();
    assert.ok(output.includes('空格选择'));
    assert.ok(output.includes('[✓] react'));
    assert.ok(!output.includes('1) vue'));
  });

  assert.strictEqual(selected, 'react');
}

async function verifyInteractiveSingleSelectionEnterConfirmsDefault() {
  let selected = null;

  await withMockTTY(async ({ input, getOutput }) => {
    const selection = selectFromList('规则安装策略：', [
      { value: 'standard', label: '使用标准规范', desc: '直接使用规范库中的规则，适合快速接入' },
      { value: 'custom', label: '根据项目自定义', desc: '跳过部分规则，后续由 /project-init 按项目生成' },
    ], 0);

    setImmediate(() => {
      input.write('\r');
    });

    selected = await selection;

    const output = getOutput();
    assert.ok(output.includes('[✓] 使用标准规范'));
    assert.ok(!output.includes('请选择 (1-2)'));
  });

  assert.strictEqual(selected, 'standard');
}

async function verifyInteractiveSuperpowersDefaultsToEnabled() {
  const options = {
    uipro: 'no',
    superpowers: 'ask',
    installLint: 'no',
    installHusky: 'no',
  };

  await withMockTTY(async ({ input, getOutput }) => {
    const selection = selectBootstrapChoices(options);

    setImmediate(() => {
      input.write('\r');
    });

    await selection;

    const output = getOutput();
    assert.ok(output.includes('启用 superpowers? (Y/n) [默认 Y]'));
  });

  assert.strictEqual(options.superpowers, 'yes');
}

async function verifyInteractiveUpdateModuleSelectionUsesSpaceToggle() {
  const options = {
    updateSkills: 'yes',
    updateRules: 'yes',
    updateConfigs: 'yes',
    updateCommands: 'yes',
    updateIdeLinks: 'yes',
    updateOpenSpec: 'yes',
    updateUipro: 'no',
  };

  await withMockTTY(async ({ input, getOutput }) => {
    const selection = selectUpdateModules(options);

    setImmediate(() => {
      input.write('\x1b[B');
      input.write(' ');
      input.write('\r');
    });

    await selection;

    const output = stripAnsi(getOutput());
    assert.ok(!output.includes('输入要切换的编号'));
  });

  assert.strictEqual(options.updateRules, 'no');
  assert.strictEqual(options.updateSkills, 'yes');
}

async function verifyInteractiveUpdateRuleModeSkipsWhenRulesDisabled() {
  const options = {
    updateRules: 'no',
    updateRuleMode: 'legacy',
    selectedUpdateRuleFiles: [],
  };
  const profilesRegistry = readProfilesRegistry(repoRoot);

  await withMockTTY(async ({ getOutput }) => {
    await selectUpdateRuleMode(options, repoRoot, profilesRegistry);
    const output = stripAnsi(getOutput());
    assert.ok(!output.includes('规则更新方式'));
  });

  assert.strictEqual(options.updateRuleMode, 'legacy');
  assert.deepStrictEqual(options.selectedUpdateRuleFiles, []);
}

function verifySelectableUpdateRulesIncludeCommonAndProfileOnly() {
  const profilesRegistry = readProfilesRegistry(repoRoot);
  const items = listSelectableUpdateRules(repoRoot, profilesRegistry, {
    profile: 'vue',
    profiles: [],
  });
  const values = items.map((item) => item.value);

  assert.ok(values.includes('02-编码规范.md'));
  assert.ok(values.includes('11-测试规范.md'));
  assert.ok(!values.includes('README.md'));
  assert.ok(!values.includes('12-Superpowers执行规范.md'));
}

async function verifyInteractiveUpdateRuleFileSelectionRequiresChoice() {
  const options = {
    profile: 'vue',
    profiles: [],
    selectedUpdateRuleFiles: [],
  };
  const profilesRegistry = readProfilesRegistry(repoRoot);

  await withMockTTY(async ({ input, getOutput }) => {
    const selection = selectUpdateRuleFiles(options, repoRoot, profilesRegistry);

    setImmediate(() => {
      input.write('\r');
      input.write(' ');
      input.write('\r');
    });

    await selection;

    const output = stripAnsi(getOutput());
    assert.ok(output.includes('至少选择 1 个规则文件'));
    assert.ok(output.includes('02-编码规范'));
    assert.ok(!output.includes('README.md'));
    assert.ok(!output.includes('12-Superpowers执行规范'));
  });

  assert.deepStrictEqual(options.selectedUpdateRuleFiles, ['02-编码规范.md']);
}

function verifyUpdateRuleCopyStrategies() {
  const profilesRegistry = readProfilesRegistry(repoRoot);
  const profileRuleDir = path.join(repoRoot, '.agents', 'rules', 'profiles', 'vue');
  const commonRuleDir = path.join(repoRoot, '.agents', 'rules', 'common');

  const standardTarget = createWorkspace('ai-spec-update-rules-standard-');
  writeText(path.join(standardTarget, '.agents', 'rules', '04-组件规范.md'), 'standard-existing\n');
  copyAgents(
    standardTarget,
    repoRoot,
    profilesRegistry,
    {
      profile: 'vue',
      profiles: [],
      rulesStrategy: 'standard',
      customRules: [],
    },
    {
      skipSkills: true,
      skipExistingRules: true,
      updateRuleMode: 'standard',
    },
  );
  assert.strictEqual(readText(path.join(standardTarget, '.agents', 'rules', '04-组件规范.md')), 'standard-existing\n');
  assert.ok(fs.existsSync(path.join(standardTarget, '.agents', 'rules', 'README.md')));

  const customTarget = createWorkspace('ai-spec-update-rules-custom-');
  writeText(path.join(customTarget, '.agents', 'rules', '01-项目概述.md'), 'custom-01\n');
  writeText(path.join(customTarget, '.agents', 'rules', '04-组件规范.md'), 'custom-04\n');
  writeText(path.join(customTarget, '.agents', 'rules', '05-API规范.md'), 'custom-05\n');
  writeText(path.join(customTarget, '.agents', 'rules', '12-Superpowers执行规范.md'), 'custom-12\n');
  writeText(path.join(customTarget, '.agents', 'rules', 'README.md'), 'custom-readme\n');
  copyAgents(
    customTarget,
    repoRoot,
    profilesRegistry,
    {
      profile: 'vue',
      profiles: [],
      rulesStrategy: 'custom',
      customRules: ['04-组件规范.md'],
    },
    {
      skipSkills: true,
      updateRuleMode: 'selected',
      selectedRuleFiles: ['01-项目概述.md', '04-组件规范.md'],
    },
  );
  assert.strictEqual(
    readText(path.join(customTarget, '.agents', 'rules', '01-项目概述.md')),
    readText(path.join(profileRuleDir, '01-项目概述.md')),
  );
  assert.strictEqual(
    readText(path.join(customTarget, '.agents', 'rules', '04-组件规范.md')),
    readText(path.join(profileRuleDir, '04-组件规范.md')),
  );
  assert.strictEqual(readText(path.join(customTarget, '.agents', 'rules', '05-API规范.md')), 'custom-05\n');
  assert.strictEqual(readText(path.join(customTarget, '.agents', 'rules', '12-Superpowers执行规范.md')), 'custom-12\n');
  assert.strictEqual(readText(path.join(customTarget, '.agents', 'rules', 'README.md')), 'custom-readme\n');

  const allTarget = createWorkspace('ai-spec-update-rules-all-');
  writeText(path.join(allTarget, '.agents', 'rules', '01-项目概述.md'), 'all-01\n');
  writeText(path.join(allTarget, '.agents', 'rules', '05-API规范.md'), 'all-05\n');
  writeText(path.join(allTarget, '.agents', 'rules', '12-Superpowers执行规范.md'), 'all-12\n');
  writeText(path.join(allTarget, '.agents', 'rules', 'README.md'), 'all-readme\n');
  copyAgents(
    allTarget,
    repoRoot,
    profilesRegistry,
    {
      profile: 'vue',
      profiles: [],
      rulesStrategy: 'standard',
      customRules: [],
    },
    {
      skipSkills: true,
      updateRuleMode: 'all',
    },
  );
  assert.strictEqual(
    readText(path.join(allTarget, '.agents', 'rules', '01-项目概述.md')),
    readText(path.join(profileRuleDir, '01-项目概述.md')),
  );
  assert.strictEqual(
    readText(path.join(allTarget, '.agents', 'rules', '05-API规范.md')),
    readText(path.join(profileRuleDir, '05-API规范.md')),
  );
  assert.strictEqual(readText(path.join(allTarget, '.agents', 'rules', '12-Superpowers执行规范.md')), 'all-12\n');
  assert.strictEqual(readText(path.join(allTarget, '.agents', 'rules', 'README.md')), 'all-readme\n');
  assert.strictEqual(
    readText(path.join(allTarget, '.agents', 'rules', '02-编码规范.md')),
    readText(path.join(commonRuleDir, '02-编码规范.md')),
  );
}

function verifyPnpmWorkspaceRootInstallUsesWorkspaceFlag() {
  const workspaceRoot = createWorkspace('ai-spec-pnpm-workspace-root-');
  writeJson(path.join(workspaceRoot, 'package.json'), {
    name: 'pnpm-workspace-root-smoke',
    version: '1.0.0',
    workspaces: ['packages/*'],
  });
  writeText(path.join(workspaceRoot, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n');

  assert.deepStrictEqual(
    buildDevDependencyInstallArgs(workspaceRoot, 'pnpm', ['eslint']),
    ['add', '-w', '-D', 'eslint'],
  );

  const childPackage = path.join(workspaceRoot, 'packages', 'web');
  writeJson(path.join(childPackage, 'package.json'), {
    name: 'web',
    version: '1.0.0',
  });
  assert.deepStrictEqual(
    buildDevDependencyInstallArgs(childPackage, 'pnpm', ['eslint']),
    ['add', '-D', 'eslint'],
  );

  const { fakeBinDir, commandLog } = createWorkspaceRootAwarePnpmBin(workspaceRoot);
  const result = runCli(
    ['init', workspaceRoot, '--profile', 'react', '--level', 'L1', '--workspace-root', '--no-lint', '--no-husky', '--no-uipro'],
    { PATH: `${fakeBinDir}:${process.env.PATH || ''}` },
  );
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  assert.ok(readText(commandLog).includes('add -w -D '), readText(commandLog));
}

async function main() {
  await verifyInteractiveSingleSelectionUsesArrowSpaceEnter();
  await verifyInteractiveSingleSelectionEnterConfirmsDefault();
  await verifyInteractiveSuperpowersDefaultsToEnabled();
  await verifyInteractiveUpdateModuleSelectionUsesSpaceToggle();
  await verifyInteractiveUpdateRuleModeSkipsWhenRulesDisabled();
  verifySelectableUpdateRulesIncludeCommonAndProfileOnly();
  await verifyInteractiveUpdateRuleFileSelectionRequiresChoice();
  await verifyInteractiveCustomRuleSelectionUsesSpaceToggle();
  await verifyInteractiveEmptySelectionFallsBackToStandard();
  verifyUpdateRuleCopyStrategies();
  verifyPnpmWorkspaceRootInstallUsesWorkspaceFlag();

  const target = createWorkspace('ai-spec-install-workflow-');
  writeJson(path.join(target, 'package.json'), {
    name: 'install-workflow-smoke',
    version: '1.0.0',
  });

  let result = runCli(['init', target, '--profile', 'vue', '--level', 'L1', '--no-lint', '--no-husky', '--no-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(target, '.agents', 'rules', '01-项目概述.md')));
  assert.ok(fs.existsSync(path.join(target, '.agents', 'skills', 'create-proposal', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(target, '.agents', 'roles', 'common', 'task-orchestrator.md')));
  assert.ok(fs.existsSync(path.join(target, '.agents', 'roles', 'domains', 'testing', 'unit-test-specialist.md')));
  assert.ok(!fs.existsSync(path.join(target, '.agents', 'roles', 'domains', 'governance', 'lint-policy-specialist.md')));
  assert.ok(fs.existsSync(path.join(target, '.agents', 'flows', 'common', 'prd-to-delivery.md')));
  assert.ok(fs.existsSync(path.join(target, '.agents', 'flows', 'common', 'bugfix-to-verification.md')));
  assert.ok(fs.existsSync(path.join(target, '.agents', 'orchestration', 'task-orchestrator-run-plan-template.md')));
  assert.ok(!fs.existsSync(path.join(target, '.agents', 'orchestration', 'expert-dispatch-spec.md')));
  assert.ok(!fs.existsSync(path.join(target, '.agents', 'registry')));
  assert.ok(fs.existsSync(path.join(target, 'node_modules', '.bin', 'ai-spec-auto')) || fs.existsSync(path.join(target, 'node_modules', '.bin', 'ai-spec-auto.cmd')));
  assert.ok(!fs.existsSync(path.join(target, '.cursor')));
  assert.ok(!fs.existsSync(path.join(target, '.agents', 'skills', 'domains', 'ui-ux-pro-max', 'data')));

  result = runCli(['check', target]);
  assert.strictEqual(result.status, 0, result.stderr);

  const cursorProtocolTarget = createWorkspace('ai-spec-init-cursor-protocol-');
  writeJson(path.join(cursorProtocolTarget, 'package.json'), {
    name: 'cursor-protocol-smoke',
    version: '1.0.0',
  });
  result = runCli(['init', cursorProtocolTarget, '--profile', 'vue', '--level', 'L2', '--ide', 'cursor', '--skip-commands', '--no-lint', '--no-husky', '--no-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  const cursorSpecStart = readText(path.join(cursorProtocolTarget, '.cursor', 'commands', 'spec-start.md'));
  const cursorSpecStartReview = readText(path.join(cursorProtocolTarget, '.cursor', 'commands', 'spec-start-review.md'));
  const cursorSpecContinue = readText(path.join(cursorProtocolTarget, '.cursor', 'commands', 'spec-continue.md'));
  const cursorSpecUpdate = readText(path.join(cursorProtocolTarget, '.cursor', 'commands', 'spec-update.md'));
  assert.ok(cursorSpecStart.startsWith('---\n'));
  assert.ok(cursorSpecStart.includes('name: /spec-start'));
  assert.ok(cursorSpecStart.includes('ENGINEERED_SPEC_FORCE_LOCAL_PROTOCOL=1 ./node_modules/.bin/ai-spec-auto'));
  assert.ok(cursorSpecStart.includes('protocol-step --target . --user-input'));
  assert.ok(cursorSpecStartReview.startsWith('---\n'));
  assert.ok(cursorSpecStartReview.includes('name: /spec-start-review'));
  assert.ok(cursorSpecStartReview.includes('ENGINEERED_SPEC_FORCE_LOCAL_PROTOCOL=1 ./node_modules/.bin/ai-spec-auto'));
  assert.ok(cursorSpecStartReview.includes('main-flow-blocking'));
  assert.ok(cursorSpecStartReview.includes('--mode'));
  assert.ok(cursorSpecStartReview.includes('--flow'));
  assert.ok(cursorSpecStartReview.includes('--review-policy'));
  assert.ok(cursorSpecStartReview.includes('/spec-start-review 创建订单列表 mock 页面'));
  assert.ok(cursorSpecStartReview.includes('/spec-start-review --mode suggest 创建订单列表 mock 页面'));
  assert.ok(cursorSpecStartReview.includes('/spec-start-review --mode manual --flow prd-to-delivery 创建订单列表 mock 页面'));
  assert.ok(cursorSpecContinue.startsWith('---\n'));
  assert.ok(cursorSpecContinue.includes('ENGINEERED_SPEC_FORCE_LOCAL_PROTOCOL=1 ./node_modules/.bin/ai-spec-auto'));
  assert.ok(cursorSpecContinue.includes('protocol-advance --target . --json'));
  assert.ok(cursorSpecContinue.includes('protocol-update --target . --user-input'));
  assert.ok(cursorSpecUpdate.startsWith('---\n'));
  assert.ok(cursorSpecUpdate.includes('ENGINEERED_SPEC_FORCE_LOCAL_PROTOCOL=1 ./node_modules/.bin/ai-spec-auto'));
  assert.ok(cursorSpecUpdate.includes('protocol-update --target . --user-input'));
  assert.ok(!fs.existsSync(path.join(cursorProtocolTarget, '.claude')));

  const reviewCommandInitTarget = createWorkspace('ai-spec-init-review-command-');
  writeJson(path.join(reviewCommandInitTarget, 'package.json'), {
    name: 'review-command-init-smoke',
    version: '1.0.0',
  });
  result = runCli(['init', reviewCommandInitTarget, '--profile', 'vue', '--level', 'L2', '--ide', 'cursor,claude,codex', '--no-lint', '--no-husky', '--no-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(reviewCommandInitTarget, '.cursor', 'commands', 'spec-start-review.md')));
  assert.ok(fs.existsSync(path.join(reviewCommandInitTarget, '.claude', 'commands', 'spec-start-review.md')));
  assert.ok(fs.existsSync(path.join(reviewCommandInitTarget, '.codex', 'commands', 'spec-start-review.md')));
  assert.ok(readText(path.join(reviewCommandInitTarget, '.claude', 'commands', 'spec-start-review.md')).includes('$ARGUMENTS'));
  assert.ok(readText(path.join(reviewCommandInitTarget, '.codex', 'commands', 'spec-start-review.md')).includes('$ARGUMENTS'));

  const uiproTarget = createWorkspace('ai-spec-uipro-install-');
  writeJson(path.join(uiproTarget, 'package.json'), {
    name: 'uipro-install-smoke',
    version: '1.0.0',
  });
  const fakeUiproBin = createFakeUiproBin(uiproTarget);
  result = runCli(
    ['init', uiproTarget, '--profile', 'vue', '--level', 'L1', '--no-lint', '--no-husky', '--uipro'],
    { PATH: `${fakeUiproBin}:${process.env.PATH || ''}` },
  );
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(uiproTarget, '.agents', 'skills', 'domains', 'ui-ux-pro-max', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(uiproTarget, '.agents', 'skills', 'domains', 'ui-ux-pro-max', 'data', 'catalog.json')));
  assert.ok(!fs.existsSync(path.join(uiproTarget, '.agents', 'skills', 'ui-ux-pro-max')));
  assert.ok(result.stdout.includes('UI UX Pro Max 设计智能技能'));

  const uiproSkillLayoutTarget = createWorkspace('ai-spec-uipro-skill-layout-');
  writeJson(path.join(uiproSkillLayoutTarget, 'package.json'), {
    name: 'uipro-skill-layout-smoke',
    version: '1.0.0',
  });
  const fakeUiproSkillLayoutBin = createFakeUiproSkillLayoutBin(uiproSkillLayoutTarget);
  result = runCli(
    ['init', uiproSkillLayoutTarget, '--profile', 'vue', '--level', 'L1', '--no-lint', '--no-husky', '--uipro'],
    { PATH: `${fakeUiproSkillLayoutBin}:${process.env.PATH || ''}` },
  );
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(uiproSkillLayoutTarget, '.agents', 'skills', 'domains', 'ui-ux-pro-max', 'data', 'catalog.json')));
  assert.ok(readText(path.join(uiproSkillLayoutTarget, '.agents', 'skills', 'domains', 'ui-ux-pro-max', 'SKILL.md')).includes('data/catalog.json'));

  const syncOnlyTarget = createWorkspace('ai-spec-sync-check-');
  writeJson(path.join(syncOnlyTarget, 'package.json'), {
    name: 'sync-check-smoke',
    version: '1.0.0',
  });
  fs.mkdirSync(path.join(syncOnlyTarget, '.agents', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(syncOnlyTarget, '.agents', 'skills'), { recursive: true });
  writeJson(path.join(syncOnlyTarget, '.ai-spec', 'manifest.json'), {
    profile: 'vue',
    rules: ['project-overview'],
    skills: ['create-proposal'],
  });
  writeJson(path.join(syncOnlyTarget, '.ai-spec', 'lock.json'), {
    manifest: { profile: 'vue' },
  });

  result = runCli(['check', syncOnlyTarget]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('sync --manifest 同步资源'));

  const updateBackfillTarget = createWorkspace('ai-spec-update-backfill-');
  writeJson(path.join(updateBackfillTarget, 'package.json'), {
    name: 'update-backfill-smoke',
    version: '1.0.0',
  });
  fs.mkdirSync(path.join(updateBackfillTarget, '.agents', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(updateBackfillTarget, '.agents', 'skills'), { recursive: true });
  result = runCli(['update', updateBackfillTarget, '--skip-skills', '--skip-configs', '--skip-openspec', '--skip-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(updateBackfillTarget, '.agents', 'roles', 'common', 'task-orchestrator.md')));
  assert.ok(fs.existsSync(path.join(updateBackfillTarget, '.agents', 'flows', 'common', 'prd-to-delivery.md')));
  assert.ok(fs.existsSync(path.join(updateBackfillTarget, '.agents', 'orchestration', 'task-orchestrator-runtime-hooks.md')));
  assert.ok(!fs.existsSync(path.join(updateBackfillTarget, '.agents', 'registry')));

  const protocolWarningTarget = createWorkspace('ai-spec-check-protocol-warning-');
  writeJson(path.join(protocolWarningTarget, 'package.json'), {
    name: 'check-protocol-warning-smoke',
    version: '1.0.0',
  });
  fs.mkdirSync(path.join(protocolWarningTarget, '.agents', 'rules'), { recursive: true });
  fs.mkdirSync(path.join(protocolWarningTarget, '.agents', 'skills'), { recursive: true });
  writeText(path.join(protocolWarningTarget, 'node_modules', '.bin', 'ai-spec-auto'), '#!/bin/sh\nexit 0\n');
  writeText(path.join(protocolWarningTarget, '.cursor', 'commands', 'spec-start.md'), '# spec-start\n');
  writeText(path.join(protocolWarningTarget, '.cursor', 'rules'), '');
  result = runCli(['check', protocolWarningTarget]);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('缺少 .agents/roles、.agents/flows、.agents/orchestration'));
  assert.ok(result.stdout.includes('Cursor 协议命令模板可能过旧'));
  assert.ok(result.stdout.includes('spec-start.md'));
  assert.ok(!result.stdout.includes('.agents/registry'));

  const manifestInitTarget = createWorkspace('ai-spec-init-manifest-');
  writeJson(path.join(manifestInitTarget, 'package.json'), {
    name: 'init-manifest-smoke',
    version: '1.0.0',
  });
  fs.mkdirSync(path.join(manifestInitTarget, '.agents', 'rules'), { recursive: true });
  const manifestPath = path.join(manifestInitTarget, 'prd-to-delivery.manifest.json');
  writeJson(manifestPath, {
    schema_version: 1,
    manifest_type: 'hub-install',
    profile: 'vue',
    ides: ['cursor', 'claude'],
    scenario_packages: [],
    roles: ['task-orchestrator'],
    skills: ['create-proposal'],
    rules: ['api-standard'],
    entry_role: 'task-orchestrator',
  });
  const fakeBinDir = path.join(manifestInitTarget, 'fake-bin');
  writeExecutable(
    path.join(fakeBinDir, 'npx'),
    `#!/bin/sh
if [ "$1" = "--version" ]; then
  echo "10.0.0"
  exit 0
fi
if [ "$1" = "openspec" ]; then
  exit 0
fi
echo "unexpected npx invocation: $@" >&2
exit 1
`,
  );

  result = runCli(
    ['init', manifestInitTarget, '--manifest', manifestPath, '--custom-rules', '--no-lint', '--no-husky', '--no-uipro'],
    { PATH: `${fakeBinDir}:${process.env.PATH || ''}` },
  );
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('init-with-manifest'));
  assert.ok(result.stdout.includes('目标项目已包含 .agents/ 目录'));
  assert.ok(fs.existsSync(path.join(manifestInitTarget, '.agents', 'skills', 'create-proposal', 'SKILL.md')));
  assert.ok(!fs.existsSync(path.join(manifestInitTarget, '.agents', 'skills', 'create-api')));
  assert.ok(fs.existsSync(path.join(manifestInitTarget, '.agents', 'rules', '05-API规范.md')));
  assert.ok(!fs.existsSync(path.join(manifestInitTarget, '.agents', 'rules', '01-项目概述.md')));
  assert.ok(fs.existsSync(path.join(manifestInitTarget, '.agents', 'roles', 'common', 'task-orchestrator.md')));
  assert.ok(fs.existsSync(path.join(manifestInitTarget, '.agents', 'flows', 'common', 'prd-to-delivery.md')));
  assert.ok(!fs.existsSync(path.join(manifestInitTarget, '.agents', 'registry')));
  assert.ok(fs.existsSync(path.join(manifestInitTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(fs.existsSync(path.join(manifestInitTarget, 'node_modules', '.bin', 'ai-spec-auto')) || fs.existsSync(path.join(manifestInitTarget, 'node_modules', '.bin', 'ai-spec-auto.cmd')));
  assert.ok(result.stdout.includes('预校验通过'));
  assert.ok(result.stdout.includes('/project-init'));
  assert.ok(result.stdout.includes('/spec-start'));
  const writtenManifest = JSON.parse(fs.readFileSync(path.join(manifestInitTarget, '.ai-spec', 'manifest.json'), 'utf8'));
  assert.deepStrictEqual(writtenManifest.local_preferences.project_init.custom_rules, [
    '01-项目概述.md',
    '03-项目结构.md',
    '04-组件规范.md',
    '05-API规范.md',
    '06-路由规范.md',
    '07-状态管理.md',
    '09-样式规范.md',
  ]);

  const invalidManifestInitTarget = createWorkspace('ai-spec-init-manifest-invalid-');
  writeJson(path.join(invalidManifestInitTarget, 'package.json'), {
    name: 'init-manifest-invalid-smoke',
    version: '1.0.0',
  });
  const invalidManifestPath = path.join(invalidManifestInitTarget, 'broken.manifest.json');
  writeJson(invalidManifestPath, {
    schema_version: 1,
    manifest_type: 'hub-install',
    profile: 'vue',
    ides: ['cursor'],
    roles: ['task-orchestrator'],
    skills: ['missing-skill'],
    rules: ['api-standard'],
    entry_role: 'task-orchestrator',
  });
  result = runCli(
    ['init', invalidManifestInitTarget, '--manifest', invalidManifestPath, '--no-lint', '--no-husky', '--no-uipro'],
    { PATH: `${fakeBinDir}:${process.env.PATH || ''}` },
  );
  assert.notStrictEqual(result.status, 0);
  assert.ok(result.stderr.includes('Unknown skill（技能） id'));
  assert.ok(!fs.existsSync(path.join(invalidManifestInitTarget, '.agents')));
  assert.ok(!fs.existsSync(path.join(invalidManifestInitTarget, 'node_modules', '.bin', 'ai-spec-auto')));

  const updateScopeTarget = createWorkspace('ai-spec-update-ide-scope-');
  writeJson(path.join(updateScopeTarget, 'package.json'), {
    name: 'update-ide-scope-smoke',
    version: '1.0.0',
  });
  result = runCli(['init', updateScopeTarget, '--profile', 'vue', '--level', 'L2', '--ide', 'cursor', '--no-lint', '--no-husky', '--no-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(path.join(updateScopeTarget, '.claude')));

  result = runCli(['update', updateScopeTarget, '--skip-skills', '--skip-configs', '--skip-openspec', '--skip-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(updateScopeTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(!fs.existsSync(path.join(updateScopeTarget, '.claude', 'commands', 'spec-start.md')));

  fs.rmSync(path.join(updateScopeTarget, '.cursor', 'commands', 'spec-start-review.md'));
  result = runCli(['update', updateScopeTarget, '--update-commands', '--skip-skills', '--skip-configs', '--skip-openspec', '--skip-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(updateScopeTarget, '.cursor', 'commands', 'spec-start-review.md')));

  result = runCli(['update', updateScopeTarget, '--ide', 'claude', '--update-commands', '--skip-skills', '--skip-configs', '--skip-openspec', '--skip-uipro']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(fs.existsSync(path.join(updateScopeTarget, '.claude', 'commands', 'spec-start.md')));
  assert.ok(fs.existsSync(path.join(updateScopeTarget, '.claude', 'commands', 'spec-start-review.md')));

  const superpowersTarget = createWorkspace('ai-spec-superpowers-init-');
  writeJson(path.join(superpowersTarget, 'package.json'), {
    name: 'superpowers-init-smoke',
    version: '1.0.0',
  });
  const fakeHome = path.join(superpowersTarget, 'fake-home');
  const fakeCodexHome = path.join(superpowersTarget, 'fake-codex-home');
  const fakeSuperpowersPkgBin = createFakePackageManagerBin(superpowersTarget);
  result = runCli(
    ['init', superpowersTarget, '--profile', 'vue', '--level', 'L2', '--ide', 'cursor,codex', '--superpowers', '--no-lint', '--no-husky', '--no-uipro'],
    {
      PATH: `${fakeSuperpowersPkgBin}:${process.env.PATH || ''}`,
      HOME: fakeHome,
      CODEX_HOME: fakeCodexHome,
    },
  );
  assert.strictEqual(result.status, 0, result.stderr);
  const superpowersStatePath = path.join(superpowersTarget, '.ai-spec', 'superpowers.json');
  assert.ok(fs.existsSync(superpowersStatePath));
  const superpowersState = JSON.parse(fs.readFileSync(superpowersStatePath, 'utf8'));
  assert.strictEqual(superpowersState.enabled, true);
  assert.strictEqual(superpowersState.mode, 'project-minimal');
  assert.strictEqual(superpowersState.bindings.cursor.enabled, true);
  assert.strictEqual(superpowersState.bindings.codex.enabled, true);
  assert.ok(fs.existsSync(path.join(superpowersTarget, '.codex', 'commands', 'spec-start.md')));
  assert.ok(fs.existsSync(path.join(superpowersTarget, '.codex', 'skills', 'using-superpowers')));
  assert.ok(fs.lstatSync(path.join(superpowersTarget, '.codex', 'rules')).isSymbolicLink());
  assert.ok(fs.existsSync(path.join(superpowersTarget, 'AGENTS.md')));
  assert.ok(fs.readFileSync(path.join(superpowersTarget, 'AGENTS.md'), 'utf8').includes('ai-spec-auto superpowers bridge'));

  writeText(path.join(fakeHome, '.claude', 'skills', 'using-superpowers', 'SKILL.md'), '# claude superpowers\n');
  writeText(path.join(fakeCodexHome, 'skills', 'using-superpowers', 'SKILL.md'), '# codex superpowers\n');
  result = runCli(
    ['update', superpowersTarget, '--refresh-superpowers', '--skip-skills', '--skip-configs', '--skip-openspec', '--skip-uipro', '--skip-commands'],
    {
      PATH: `${fakeSuperpowersPkgBin}:${process.env.PATH || ''}`,
      HOME: fakeHome,
      CODEX_HOME: fakeCodexHome,
    },
  );
  assert.strictEqual(result.status, 0, result.stderr);
  const refreshedSuperpowersState = JSON.parse(fs.readFileSync(superpowersStatePath, 'utf8'));
  assert.strictEqual(refreshedSuperpowersState.enabled, true);
  assert.strictEqual(refreshedSuperpowersState.mode, 'host-enhanced');
  assert.strictEqual(refreshedSuperpowersState.host.capabilities.claude, true);
  assert.strictEqual(refreshedSuperpowersState.host.capabilities.codex, true);

  const visualBridgeTarget = createWorkspace('ai-spec-visual-bridge-init-');
  writeJson(path.join(visualBridgeTarget, 'package.json'), {
    name: 'visual-bridge-init-smoke',
    version: '1.0.0',
  });
  const visualBridgeFakeBin = createFakePackageManagerBin(visualBridgeTarget);
  result = runCli(
    ['init', visualBridgeTarget, '--profile', 'vue', '--level', 'L2', '--ide', 'cursor', '--visual-bridge', '--no-lint', '--no-husky', '--no-uipro'],
    {
      PATH: `${visualBridgeFakeBin}:${process.env.PATH || ''}`,
    },
  );
  assert.strictEqual(result.status, 0, result.stderr);
  const visualBridgeStatePath = path.join(visualBridgeTarget, '.ai-spec', 'visual-bridge.json');
  assert.ok(fs.existsSync(visualBridgeStatePath));
  const visualBridgeState = JSON.parse(fs.readFileSync(visualBridgeStatePath, 'utf8'));
  assert.strictEqual(visualBridgeState.enabled, true);
  assert.strictEqual(visualBridgeState.agent_id, 'ai-spec-auto');
  assert.strictEqual(visualBridgeState.push_on_runtime_state, true);
  assert.strictEqual(visualBridgeState.push_on_sync, false);

  const legacyUiproUpdateTarget = createWorkspace('ai-spec-uipro-legacy-update-');
  writeJson(path.join(legacyUiproUpdateTarget, 'package.json'), {
    name: 'uipro-legacy-update-smoke',
    version: '1.0.0',
  });
  writeText(path.join(legacyUiproUpdateTarget, '.agents', 'skills', 'ui-ux-pro-max', 'SKILL.md'), '# legacy\n');
  writeText(path.join(legacyUiproUpdateTarget, '.agents', 'skills', 'ui-ux-pro-max', 'data', 'legacy.txt'), 'legacy\n');
  const legacyFakeUiproBin = createFakeUiproBin(legacyUiproUpdateTarget);
  result = runCli(
    ['update', legacyUiproUpdateTarget, '--profile', 'vue', '--skip-skills', '--skip-configs', '--skip-openspec'],
    { PATH: `${legacyFakeUiproBin}:${process.env.PATH || ''}` },
  );
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(!fs.existsSync(path.join(legacyUiproUpdateTarget, '.agents', 'skills', 'ui-ux-pro-max')));
  assert.ok(fs.existsSync(path.join(legacyUiproUpdateTarget, '.agents', 'skills', 'domains', 'ui-ux-pro-max', 'SKILL.md')));
  assert.ok(fs.existsSync(path.join(legacyUiproUpdateTarget, '.agents', 'skills', 'domains', 'ui-ux-pro-max', 'data', 'catalog.json')));

  const uninstallTarget = createWorkspace('ai-spec-uninstall-managed-');
  const uninstallFakeBin = createFakePackageManagerBin(uninstallTarget);
  writeJson(path.join(uninstallTarget, 'package.json'), {
    name: 'uninstall-managed-smoke',
    version: '1.0.0',
    scripts: {
      prepare: 'husky install',
    },
    devDependencies: {
      '@engineered/ai-spec-auto': '0.0.60',
      eslint: '^9.0.0',
      prettier: '^3.0.0',
    },
  });
  fs.mkdirSync(path.join(uninstallTarget, '.agents', 'skills'), { recursive: true });
  fs.mkdirSync(path.join(uninstallTarget, '.cursor', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(uninstallTarget, '.ai-spec'), { recursive: true });
  fs.writeFileSync(path.join(uninstallTarget, '.cursor', 'commands', 'opsx-propose.md'), '# cmd\n', 'utf8');
  fs.writeFileSync(path.join(uninstallTarget, '.eslintrc.js'), 'module.exports = {};\n', 'utf8');
  fs.writeFileSync(path.join(uninstallTarget, '.prettierrc.json'), '{}\n', 'utf8');
  writeJson(path.join(uninstallTarget, '.ai-spec', 'manifest.json'), { profile: 'vue', ides: ['cursor'] });
  writeJson(path.join(uninstallTarget, '.ai-spec', 'lock.json'), { resolved: {} });
  writeJson(path.join(uninstallTarget, '.ai-spec', 'sources.json'), { assets: [] });
  seedAiSpecRuntimeState(uninstallTarget);
  writeJson(path.join(uninstallTarget, '.ai-spec', 'install-state.json'), {
    schema_version: 1,
    managed_paths: ['.agents', '.cursor/commands/opsx-propose.md'],
    created_config_files: ['.eslintrc.js'],
    added_dev_dependencies: ['@engineered/ai-spec-auto', 'eslint'],
    package_json: {
      prepare_script: 'husky install',
    },
  });
  result = runCli(['uninstall', uninstallTarget, '-y'], { PATH: `${uninstallFakeBin}:${process.env.PATH || ''}` });
  assert.strictEqual(result.status, 0, result.stderr);
  const uninstallPkg = JSON.parse(fs.readFileSync(path.join(uninstallTarget, 'package.json'), 'utf8'));
  assert.ok(!fs.existsSync(path.join(uninstallTarget, '.agents')));
  assert.ok(!fs.existsSync(path.join(uninstallTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(!fs.existsSync(path.join(uninstallTarget, '.eslintrc.js')));
  assert.ok(fs.existsSync(path.join(uninstallTarget, '.prettierrc.json')));
  assert.ok(!('prepare' in (uninstallPkg.scripts || {})));
  assert.ok(!('@engineered/ai-spec-auto' in (uninstallPkg.devDependencies || {})));
  assert.ok(!('eslint' in (uninstallPkg.devDependencies || {})));
  assert.ok('prettier' in (uninstallPkg.devDependencies || {}));
  assert.ok(!fs.existsSync(path.join(uninstallTarget, '.ai-spec')));

  const uninstallPrepareKeepTarget = createWorkspace('ai-spec-uninstall-prepare-keep-');
  const uninstallPrepareFakeBin = createFakePackageManagerBin(uninstallPrepareKeepTarget);
  writeJson(path.join(uninstallPrepareKeepTarget, 'package.json'), {
    name: 'uninstall-prepare-keep-smoke',
    version: '1.0.0',
    scripts: {
      prepare: 'custom && husky install',
    },
    devDependencies: {
      eslint: '^9.0.0',
    },
  });
  fs.mkdirSync(path.join(uninstallPrepareKeepTarget, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(uninstallPrepareKeepTarget, '.ai-spec'), { recursive: true });
  writeJson(path.join(uninstallPrepareKeepTarget, '.ai-spec', 'install-state.json'), {
    schema_version: 1,
    managed_paths: ['.agents'],
    created_config_files: [],
    added_dev_dependencies: ['eslint'],
    package_json: {
      prepare_script: 'husky install',
    },
  });
  result = runCli(['uninstall', uninstallPrepareKeepTarget, '-y'], { PATH: `${uninstallPrepareFakeBin}:${process.env.PATH || ''}` });
  assert.strictEqual(result.status, 0, result.stderr);
  const keepPreparePkg = JSON.parse(fs.readFileSync(path.join(uninstallPrepareKeepTarget, 'package.json'), 'utf8'));
  assert.strictEqual(keepPreparePkg.scripts.prepare, 'custom && husky install');

  const legacyUninstallTarget = createWorkspace('ai-spec-uninstall-legacy-');
  const legacyFakeBin = createFakePackageManagerBin(legacyUninstallTarget);
  writeJson(path.join(legacyUninstallTarget, 'package.json'), {
    name: 'uninstall-legacy-smoke',
    version: '1.0.0',
    devDependencies: {
      eslint: '^9.0.0',
    },
  });
  fs.mkdirSync(path.join(legacyUninstallTarget, '.agents'), { recursive: true });
  fs.mkdirSync(path.join(legacyUninstallTarget, '.cursor', 'commands'), { recursive: true });
  fs.mkdirSync(path.join(legacyUninstallTarget, '.ai-spec'), { recursive: true });
  fs.writeFileSync(path.join(legacyUninstallTarget, '.cursor', 'commands', 'opsx-propose.md'), '# cmd\n', 'utf8');
  fs.writeFileSync(path.join(legacyUninstallTarget, '.eslintrc.js'), 'module.exports = {};\n', 'utf8');
  writeJson(path.join(legacyUninstallTarget, '.ai-spec', 'manifest.json'), { profile: 'vue', ides: ['cursor'] });
  writeJson(path.join(legacyUninstallTarget, '.ai-spec', 'lock.json'), { resolved: {} });
  writeJson(path.join(legacyUninstallTarget, '.ai-spec', 'sources.json'), { assets: [] });
  seedAiSpecRuntimeState(legacyUninstallTarget);
  result = runCli(['uninstall', legacyUninstallTarget, '-y'], { PATH: `${legacyFakeBin}:${process.env.PATH || ''}` });
  assert.strictEqual(result.status, 0, result.stderr);
  const legacyPkg = JSON.parse(fs.readFileSync(path.join(legacyUninstallTarget, 'package.json'), 'utf8'));
  assert.ok(!fs.existsSync(path.join(legacyUninstallTarget, '.agents')));
  assert.ok(!fs.existsSync(path.join(legacyUninstallTarget, '.cursor', 'commands', 'opsx-propose.md')));
  assert.ok(fs.existsSync(path.join(legacyUninstallTarget, '.eslintrc.js')));
  assert.ok('eslint' in (legacyPkg.devDependencies || {}));
  assert.ok(!fs.existsSync(path.join(legacyUninstallTarget, '.ai-spec')));

  result = runInstallWrapper(['help']);
  assert.strictEqual(result.status, 0, result.stderr);
  assert.ok(result.stdout.includes('npx @engineered/ai-spec-auto@latest init .'));
  assert.ok(result.stdout.includes('npx @engineered/ai-spec-auto@latest init . --manifest <file-or-url>'));

  console.log('install workflow test passed: node installer core handles init/check, and thin bash wrapper forwards help to the node workflow');
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exit(1);
});
