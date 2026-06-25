#!/usr/bin/env node
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const readline = require('readline');
const readlinePromises = require('readline/promises');
const {
  readProfilesRegistry,
  resolveProfileId,
  getProfileEntries,
  formatSupportedProfiles,
} = require('./profile-registry');
const {
  normalizeSuperpowersManifest,
  buildSuperpowersState,
  writeSuperpowersState,
  readSuperpowersState,
  shouldExposeSkillToIde,
  upsertManagedAgentsBlock,
} = require('./superpowers');
const {
  VISUAL_BRIDGE_STATE_REL_PATH,
  normalizeVisualBridgeManifest,
  buildVisualBridgeState,
  writeVisualBridgeState,
  readVisualBridgeState,
} = require('./visual-bridge-config');
const { readRenderedCommandTemplate } = require('./command-template-renderer');

const PKG_ROOT = path.join(__dirname, '..');
const VERSION = '2.0.0';
const DEFAULT_PROFILE = 'vue';
const DEFAULT_LEVEL = 'L3';
const DEFAULT_IDE_FILTER = 'default';
const DEFAULT_IDES = ['cursor', 'claude'];
const ALL_IDES = ['claude', 'cursor', 'codex', 'opencode', 'trae', 'qoder'];
const CURSOR_PROTOCOL_COMMAND_EXPECTATIONS = [
  ['spec-start.md', ['protocol-step --target . --user-input']],
  ['spec-continue.md', ['protocol-update --target . --user-input', 'protocol-advance --target . --json']],
  ['spec-update.md', ['protocol-update --target . --user-input']],
  ['spec-status.md', ['protocol-status --target . --json']],
  ['spec-stop.md', ['protocol-stop --target . --json']],
  ['spec-orchestrate.md', [
    'protocol-step --target . --user-input',
    'protocol-update --target . --user-input',
    'protocol-advance --target . --json',
  ]],
];
const PROJECT_SPECIFIC_RULES = new Set(['01-项目概述.md', '03-项目结构.md']);
const UPDATE_RULE_PROTECTED_FILES = new Set(['README.md', '12-Superpowers执行规范.md']);
const UPDATE_RULE_MODES = {
  LEGACY: 'legacy',
  STANDARD: 'standard',
  SELECTED: 'selected',
  ALL: 'all',
};
const CUSTOMIZABLE_RULES = [
  ['01-项目概述.md', '项目定位、技术栈、业务边界、关键约束'],
  ['03-项目结构.md', '目录树、分层设计、模块职责、组织约定'],
  ['04-组件规范.md', 'SFC 结构、Props/Emits、组件目录、拆分策略'],
  ['05-API规范.md', '接口目录、请求封装、命名约定、错误处理'],
  ['06-路由规范.md', '路由配置、懒加载、导航守卫、目录结构'],
  ['07-状态管理.md', 'Store 目录、模块划分、命名约定'],
  ['09-样式规范.md', 'CSS Modules/Scoped、主题变量、全局样式'],
];
const PROFILE_SUMMARIES = {
  vue: 'Frontend / Vue',
  react: 'Frontend / React',
  nestjs: 'Backend / NestJS',
  springboot: 'Backend / Spring Boot',
  'node-tooling': 'Tooling / Node.js',
};
const DEFAULT_CUSTOM_RULE_SELECTION = CUSTOMIZABLE_RULES.map(([name]) => name);
const UPDATE_MODULE_ITEMS = [
  ['updateSkills', 'Skills（技能）'],
  ['updateRules', 'Rules（规范规则）'],
  ['updateConfigs', 'Configs（lint/format）'],
  ['updateCommands', 'Commands（命令模板）'],
  ['updateIdeLinks', 'IDE Links（IDE 链接）'],
  ['updateOpenSpec', 'OpenSpec'],
  ['updateUipro', 'UI UX Pro Max'],
];
const INSTALL_STATE_FILE = '.ai-spec/install-state.json';
const SHARED_CONFIG_FILES = [
  '.prettierrc.json',
  '.prettierignore',
  '.stylelintrc.json',
  '.stylelintignore',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintignore',
  '.lintstagedrc',
  'commitlint.config.js',
  '.editorconfig',
];
const LINT_DEP_SPECS = ['eslint', 'prettier', 'stylelint', 'stylelint-config-standard'];
const VUE_LINT_DEP_SPECS = ['stylelint-config-html', 'stylelint-config-recommended-vue', 'postcss-html'];
const HUSKY_DEP_SPECS = ['husky@8', 'lint-staged@15', '@commitlint/cli@19', '@commitlint/config-conventional@19'];

const C = {
  red: '\x1b[31m',
  green: '\x1b[32m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m',
  bold: '\x1b[1m',
  reset: '\x1b[0m',
};

function color(text, token) {
  if (!process.stdout.isTTY) {
    return text;
  }
  return `${C[token] || ''}${text}${C.reset}`;
}

function info(msg) {
  console.log(`${color('ℹ', 'blue')} ${msg}`);
}

function ok(msg) {
  console.log(`${color('✔', 'green')} ${msg}`);
}

function warn(msg) {
  console.log(`${color('⚠', 'yellow')} ${msg}`);
}

function err(msg) {
  console.error(`${color('✖', 'red')} ${msg}`);
}

function isInteractive() {
  return Boolean(process.stdin.isTTY && process.stdout.isTTY);
}

function isWindows() {
  return process.platform === 'win32';
}

function getSourceDir() {
  if (process.env.ENGINEERED_SPEC_LOCAL && fs.existsSync(path.join(process.env.ENGINEERED_SPEC_LOCAL, '.agents'))) {
    return process.env.ENGINEERED_SPEC_LOCAL;
  }
  if (fs.existsSync(path.join(PKG_ROOT, '.agents'))) {
    return PKG_ROOT;
  }
  const cacheDir = process.env.ENGINEERED_SPEC_CACHE || path.join(os.homedir(), '.ai-spec-auto');
  const repo = process.env.ENGINEERED_SPEC_REPO || 'https://github.com/Colouful/engineered-spec.git';
  const branch = process.env.ENGINEERED_SPEC_BRANCH || 'main';
  if (fs.existsSync(path.join(cacheDir, '.git'))) {
    spawnSync('git', ['-C', cacheDir, 'pull', '--quiet'], { stdio: 'ignore' });
  } else {
    const cloned = spawnSync('git', ['clone', '--quiet', '-b', branch, repo, cacheDir], { stdio: 'inherit' });
    if (cloned.status !== 0) {
      throw new Error(`克隆规范库失败: ${repo}`);
    }
  }
  return cacheDir;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  return [...new Set(String(value).split(',').map((item) => item.trim()).filter(Boolean))];
}

function normalizeCustomRulesSelection(value) {
  const allowed = new Set(DEFAULT_CUSTOM_RULE_SELECTION);
  return normalizeList(value).filter((item) => allowed.has(item));
}

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    command: '',
    target: '.',
    manifest: '',
    profile: DEFAULT_PROFILE,
    profiles: [],
    level: DEFAULT_LEVEL,
    ideFilter: DEFAULT_IDE_FILTER,
    rulesStrategy: 'ask',
    customRules: [],
    installLint: 'ask',
    installHusky: 'ask',
    uipro: 'ask',
    superpowers: 'ask',
    visualBridge: 'yes',  // 默认启用，不再提示
    updateSkills: 'yes',
    updateRules: 'yes',
    forceUpdateRules: 'ask',
    updateConfigs: 'yes',
    updateCommands: 'yes',
    updateIdeLinks: 'yes',
    updateOpenSpec: 'yes',
    updateUipro: 'no',
    updateRuleMode: UPDATE_RULE_MODES.LEGACY,
    selectedUpdateRuleFiles: [],
    force: false,
    workspacePackageSubpath: '',
    workspaceRoot: false,
    profileExplicit: false,
    ideExplicit: false,
    levelExplicit: false,
    hubOrigin: '',
    hubFetch: true,
    refreshSuperpowers: false,
    superpowersExplicit: false,
    visualBridgeExplicit: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case 'init':
      case 'update':
      case 'check':
      case 'uninstall':
      case 'help':
        if (!options.command) {
          options.command = arg;
        } else if (options.target === '.') {
          options.target = arg;
        } else {
          throw new Error(`Unknown argument: ${arg}`);
        }
        break;
      case '--profile':
        options.profile = requireArg(arg, args);
        options.profileExplicit = true;
        break;
      case '--profiles':
        options.profiles = requireArg(arg, args)
          .split(',')
          .map((s) => s.trim())
          .filter(Boolean);
        options.profileExplicit = true;
        break;
      case '--level':
        options.level = requireArg(arg, args).toUpperCase();
        options.levelExplicit = true;
        break;
      case '--ide':
        options.ideFilter = requireArg(arg, args);
        options.ideExplicit = true;
        break;
      case '--manifest':
        options.manifest = requireArg(arg, args);
        break;
      case '--hub-origin':
        options.hubOrigin = requireArg(arg, args);
        break;
      case '--no-hub-fetch':
        options.hubFetch = false;
        break;
      case '--standard-rules':
        options.rulesStrategy = 'standard';
        options.customRules = [];
        break;
      case '--custom-rules':
        options.rulesStrategy = 'custom';
        options.customRules = CUSTOMIZABLE_RULES.map(([name]) => name);
        break;
      case '--lint':
        options.installLint = 'yes';
        break;
      case '--no-lint':
        options.installLint = 'no';
        break;
      case '--husky':
        options.installHusky = 'yes';
        break;
      case '--no-husky':
        options.installHusky = 'no';
        break;
      case '--uipro':
        options.uipro = 'yes';
        break;
      case '--no-uipro':
        options.uipro = 'no';
        break;
      case '--superpowers':
        options.superpowers = 'yes';
        options.superpowersExplicit = true;
        break;
      case '--no-superpowers':
        options.superpowers = 'no';
        options.superpowersExplicit = true;
        break;
      case '--refresh-superpowers':
        options.refreshSuperpowers = true;
        break;
      case '--visual-bridge':
        options.visualBridge = 'yes';
        options.visualBridgeExplicit = true;
        break;
      case '--no-visual-bridge':
        options.visualBridge = 'no';
        options.visualBridgeExplicit = true;
        break;
      case '--update-rules':
        options.updateRules = 'yes';
        break;
      case '--no-update-rules':
        options.updateRules = 'no';
        break;
      case '--force-update-rules':
        options.forceUpdateRules = 'yes';
        break;
      case '--no-force-update-rules':
        options.forceUpdateRules = 'no';
        break;
      case '--skip-skills':
        options.updateSkills = 'no';
        break;
      case '--skip-configs':
        options.updateConfigs = 'no';
        break;
      case '--skip-commands':
        options.updateCommands = 'no';
        break;
      case '--update-commands':
        options.updateCommands = 'yes';
        break;
      case '--skip-ide-links':
        options.updateIdeLinks = 'no';
        break;
      case '--skip-openspec':
        options.updateOpenSpec = 'no';
        break;
      case '--skip-uipro':
        options.updateUipro = 'no';
        break;
      case '--update-uipro':
        options.updateUipro = 'yes';
        break;
      case '--package':
        options.workspacePackageSubpath = requireArg(arg, args);
        break;
      case '--workspace-root':
        options.workspaceRoot = true;
        break;
      case '-y':
      case '--force':
        options.force = true;
        break;
      case '-h':
      case '--help':
        options.command = 'help';
        break;
      default:
        if (!arg.startsWith('-') && options.target === '.') {
          options.target = arg;
          break;
        }
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  if (!options.command) {
    options.command = 'help';
  }
  return options;
}

function requireArg(flag, args) {
  const next = args.shift();
  if (!next || next.startsWith('--')) {
    throw new Error(`选项 ${flag} 需要一个参数值`);
  }
  return next;
}

function commandExists(name) {
  const probe = spawnSync(name, ['--version'], { stdio: 'ignore' });
  return probe.status === 0;
}

function runCommand(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || process.cwd(),
    env: { ...process.env, ...(options.env || {}) },
    stdio: options.stdio || 'inherit',
    shell: false,
    encoding: options.encoding || 'utf8',
  });
  return result;
}

function readJson(filePath, label = filePath) {
  try {
    return JSON.parse(fs.readFileSync(filePath, 'utf8'));
  } catch (error) {
    throw new Error(`${label} 不是合法 JSON: ${filePath}`);
  }
}

function writeJson(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function copyFile(sourcePath, destPath, options = {}) {
  if (!fs.existsSync(sourcePath)) return false;
  ensureDir(path.dirname(destPath));
  if (options.skipExisting && fs.existsSync(destPath)) {
    return false;
  }
  fs.copyFileSync(sourcePath, destPath);
  return true;
}

function removePath(targetPath) {
  if (!fs.existsSync(targetPath)) {
    return;
  }
  try {
    fs.rmSync(targetPath, { recursive: true, force: true });
  } catch (error) {
    try {
      fs.unlinkSync(targetPath);
    } catch (_) {
      // ignore
    }
  }
}

function copyDirReplace(sourceDir, destDir) {
  if (!fs.existsSync(sourceDir)) {
    return false;
  }
  removePath(destDir);
  ensureDir(path.dirname(destDir));
  fs.cpSync(sourceDir, destDir, { recursive: true });
  return true;
}

function walkFiles(rootDir) {
  if (!fs.existsSync(rootDir)) return [];
  const results = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      if (entry.name === '.DS_Store') continue;
      const fullPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(fullPath);
      } else {
        results.push(fullPath);
      }
    }
  }
  return results.sort();
}

function copyDirIncremental(sourceDir, destDir, options = {}) {
  if (!fs.existsSync(sourceDir)) {
    return { copiedAny: false, createdPaths: [] };
  }
  let copiedAny = false;
  const createdPaths = [];
  for (const filePath of walkFiles(sourceDir)) {
    const rel = path.relative(sourceDir, filePath);
    const firstSegment = rel.split(path.sep)[0];
    const baseName = path.basename(filePath);
    if (options.skipHuskyArtifacts && (firstSegment === '.husky' || baseName === '.lintstagedrc' || baseName === 'commitlint.config.js')) {
      continue;
    }
    const destPath = path.join(destDir, rel);
    ensureDir(path.dirname(destPath));
    const existedBefore = fs.existsSync(destPath);
    if (options.skipExisting && fs.existsSync(destPath)) {
      info(`  跳过已存在: ${rel.split(path.sep).join('/')}`);
      continue;
    }
    fs.copyFileSync(filePath, destPath);
    copiedAny = true;
    if (!existedBefore) {
      createdPaths.push(rel.split(path.sep).join('/'));
    }
  }
  return { copiedAny, createdPaths };
}

function readInstalledManifestSuperpowers(targetDir) {
  const manifestPath = path.join(targetDir, '.ai-spec', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const manifest = readJson(manifestPath, 'existing manifest');
  return normalizeSuperpowersManifest(manifest?.superpowers, null);
}

function readInstalledManifestVisualBridge(targetDir) {
  const manifestPath = path.join(targetDir, '.ai-spec', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return null;
  }
  const manifest = readJson(manifestPath, 'existing manifest');
  return normalizeVisualBridgeManifest(manifest?.visual_bridge, null);
}

function createDirLink(targetAbsolute, linkPath) {
  removePath(linkPath);
  ensureDir(path.dirname(linkPath));
  if (isWindows()) {
    fs.symlinkSync(targetAbsolute, linkPath, 'junction');
  } else {
    const rel = path.relative(path.dirname(linkPath), targetAbsolute) || '.';
    fs.symlinkSync(rel, linkPath);
  }
}

function normalizeIdeFilter(value) {
  const raw = String(value || DEFAULT_IDE_FILTER).trim();
  if (raw === 'default') return [...DEFAULT_IDES];
  if (raw === 'all') return [...ALL_IDES];
  const list = normalizeList(raw);
  const unknown = list.filter((item) => !ALL_IDES.includes(item));
  if (unknown.length > 0) {
    throw new Error(`Unsupported ides: ${unknown.join(', ')}`);
  }
  return list;
}

function sameStringList(left, right) {
  if (left.length !== right.length) return false;
  return left.every((item, index) => item === right[index]);
}

function readPackageJson(filePath) {
  if (!fs.existsSync(filePath)) return null;
  return readJson(filePath, 'package.json');
}

function normalizeInstallState(state) {
  const base = state && typeof state === 'object' ? state : {};
  return {
    schema_version: 1,
    managed_paths: normalizeList(base.managed_paths),
    created_config_files: normalizeList(base.created_config_files),
    added_dev_dependencies: normalizeList(base.added_dev_dependencies),
    package_json: base.package_json && typeof base.package_json === 'object'
      ? {
          prepare_script: typeof base.package_json.prepare_script === 'string' ? base.package_json.prepare_script : '',
        }
      : {
          prepare_script: '',
        },
  };
}

function getInstallStatePath(targetDir) {
  return path.join(targetDir, INSTALL_STATE_FILE);
}

function readInstallState(targetDir) {
  const filePath = getInstallStatePath(targetDir);
  if (!fs.existsSync(filePath)) {
    return normalizeInstallState(null);
  }
  return normalizeInstallState(readJson(filePath, 'install-state'));
}

function readPackageSnapshot(targetDir) {
  const pkgPath = path.join(targetDir, 'package.json');
  const pkg = readPackageJson(pkgPath);
  return {
    exists: Boolean(pkg),
    dependencies: new Set(Object.keys(pkg?.dependencies || {})),
    devDependencies: new Set(Object.keys(pkg?.devDependencies || {})),
    prepareScript: typeof pkg?.scripts?.prepare === 'string' ? pkg.scripts.prepare : '',
  };
}

function extractPackageName(spec) {
  const value = String(spec || '').trim();
  if (!value) return '';
  if (value.startsWith('@')) {
    const secondAt = value.indexOf('@', 1);
    return secondAt === -1 ? value : value.slice(0, secondAt);
  }
  const firstAt = value.indexOf('@');
  return firstAt === -1 ? value : value.slice(0, firstAt);
}

function collectNewPackageNames(beforeSnapshot, afterSnapshot, packageSpecs) {
  const afterNames = new Set([
    ...afterSnapshot.dependencies,
    ...afterSnapshot.devDependencies,
  ]);
  return normalizeList(packageSpecs.map((spec) => extractPackageName(spec))).filter((name) => (
    name &&
    afterNames.has(name) &&
    !beforeSnapshot.dependencies.has(name) &&
    !beforeSnapshot.devDependencies.has(name)
  ));
}

function detectExistingIdeDirs(targetDir) {
  return ALL_IDES.filter((ide) => fs.existsSync(path.join(targetDir, `.${ide}`)));
}

function detectInstalledManifestIdes(targetDir) {
  const manifestPath = path.join(targetDir, '.ai-spec', 'manifest.json');
  if (!fs.existsSync(manifestPath)) {
    return [];
  }
  const manifest = readJson(manifestPath, 'existing manifest');
  if (!manifest.ides) {
    return [];
  }
  return normalizeIdeFilter(manifest.ides);
}

function resolveTargetIdes(targetDir, options) {
  if (options.ideExplicit) {
    return normalizeIdeFilter(options.ideFilter);
  }
  const manifestIdes = detectInstalledManifestIdes(targetDir);
  if (manifestIdes.length > 0) {
    return manifestIdes;
  }
  const existingIdes = detectExistingIdeDirs(targetDir);
  if (existingIdes.length > 0) {
    return existingIdes;
  }
  return normalizeIdeFilter(options.ideFilter || DEFAULT_IDE_FILTER);
}

function listTemplateCommandFiles(sourceDir, ideName) {
  const commandFiles = new Set();
  for (const relDir of [
    path.join(sourceDir, '.agents', 'commands', 'common'),
    path.join(sourceDir, '.agents', 'commands', ideName),
  ]) {
    if (!fs.existsSync(relDir)) continue;
    for (const entry of fs.readdirSync(relDir)) {
      if (entry.endsWith('.md')) {
        commandFiles.add(`.${ideName}/commands/${entry}`);
      }
    }
  }
  return [...commandFiles].sort();
}

function isLinkToTarget(linkPath, expectedTargetPath) {
  try {
    if (!fs.lstatSync(linkPath).isSymbolicLink()) {
      return false;
    }
    const actualTarget = fs.readlinkSync(linkPath);
    const resolvedTarget = path.resolve(path.dirname(linkPath), actualTarget);
    return resolvedTarget === expectedTargetPath;
  } catch (error) {
    return false;
  }
}

function collectManagedIdePaths(targetDir, sourceDir) {
  const managed = [];
  for (const ide of ALL_IDES) {
    const ideDir = path.join(targetDir, `.${ide}`);
    if (!fs.existsSync(ideDir)) {
      continue;
    }
    const rulesPath = path.join(ideDir, 'rules');
    if (isLinkToTarget(rulesPath, path.join(targetDir, '.agents', 'rules'))) {
      managed.push(`.${ide}/rules`);
    }
    const skillsDir = path.join(ideDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        const fullPath = path.join(skillsDir, entry.name);
        if (!isLinkToTarget(fullPath, path.join(targetDir, '.agents', 'skills', entry.name))) continue;
        managed.push(`.${ide}/skills/${entry.name}`);
      }
    }
    for (const relPath of listTemplateCommandFiles(sourceDir, ide)) {
      if (fs.existsSync(path.join(targetDir, relPath))) {
        managed.push(relPath);
      }
    }
  }
  return managed;
}

function writeInstallState(targetDir, sourceDir, previousState, additions = {}) {
  const nextState = normalizeInstallState(previousState);
  nextState.generated_at = new Date().toISOString();
  nextState.managed_paths = normalizeList([
    ...(fs.existsSync(path.join(targetDir, '.agents')) ? ['.agents'] : []),
    ...collectManagedIdePaths(targetDir, sourceDir),
  ]);
  nextState.created_config_files = normalizeList([
    ...nextState.created_config_files.filter((filePath) => fs.existsSync(path.join(targetDir, filePath))),
    ...(additions.createdConfigFiles || []),
  ]);
  nextState.added_dev_dependencies = normalizeList([
    ...nextState.added_dev_dependencies,
    ...(additions.addedDevDependencies || []),
  ]);
  nextState.package_json = {
    prepare_script: additions.prepareScript || nextState.package_json.prepare_script || '',
  };
  writeJson(getInstallStatePath(targetDir), nextState);
}

function writeProfileManifest(targetDir, options) {
  const manifestPath = path.join(targetDir, '.ai-spec', 'manifest.json');
  const existing = fs.existsSync(manifestPath) ? readJson(manifestPath, 'manifest') : {};
  const profiles = options.profiles && options.profiles.length > 0 ? options.profiles : [options.profile];
  const next = {
    ...existing,
    profiles,
    profile: profiles[0],
    generated_at: new Date().toISOString(),
  };
  if (options.packages && options.packages.length > 0) {
    next.packages = options.packages;
  }
  ensureDir(path.dirname(manifestPath));
  writeJson(manifestPath, next);
}

function sortPathsForRemoval(paths) {
  return [...new Set(paths)].sort((left, right) => {
    const leftDepth = left.split('/').length;
    const rightDepth = right.split('/').length;
    if (leftDepth !== rightDepth) {
      return rightDepth - leftDepth;
    }
    return right.localeCompare(left);
  });
}

function removeManagedPaths(targetDir, relPaths) {
  for (const relPath of sortPathsForRemoval(relPaths)) {
    removePath(path.join(targetDir, relPath));
  }
}

const AI_SPEC_MANAGED_RUNTIME_PATHS = [
  '.ai-spec/current-run.json',
  '.ai-spec/repo-map.json',
  '.ai-spec/visual-bridge.json',
  '.ai-spec/checkpoints',
  '.ai-spec/internal',
  '.ai-spec/tmp',
  '.ai-spec/current-dispatch.json',
  '.ai-spec/current-execution.json',
  '.ai-spec/current-execution.md',
  '.ai-spec/current-runtime-action.json',
  '.ai-spec/current-runtime-action.md',
  '.ai-spec/runs',
  '.ai-spec/dispatches',
  '.ai-spec/executions',
  '.ai-spec/runtime-actions',
  '.ai-spec/runner',
];

function removeManagedAiSpecRuntime(targetDir) {
  removeManagedPaths(targetDir, AI_SPEC_MANAGED_RUNTIME_PATHS);
}

function listLegacyManagedPaths(targetDir, sourceDir) {
  const managed = [];
  if (fs.existsSync(path.join(targetDir, '.agents'))) {
    managed.push('.agents');
  }
  for (const ide of ALL_IDES) {
    const ideDir = path.join(targetDir, `.${ide}`);
    if (!fs.existsSync(ideDir)) {
      continue;
    }
    if (isLinkToTarget(path.join(ideDir, 'rules'), path.join(targetDir, '.agents', 'rules'))) {
      managed.push(`.${ide}/rules`);
    }
    const skillsDir = path.join(ideDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      for (const entry of fs.readdirSync(skillsDir, { withFileTypes: true })) {
        const fullPath = path.join(skillsDir, entry.name);
        if (!isLinkToTarget(fullPath, path.join(targetDir, '.agents', 'skills', entry.name))) continue;
        managed.push(`.${ide}/skills/${entry.name}`);
      }
    }
    managed.push(...listTemplateCommandFiles(sourceDir, ide).filter((relPath) => fs.existsSync(path.join(targetDir, relPath))));
  }
  return managed;
}

function cleanupEmptyIdeDirs(targetDir) {
  for (const ide of ALL_IDES) {
    const ideDir = path.join(targetDir, `.${ide}`);
    if (!fs.existsSync(ideDir)) {
      continue;
    }
    for (const child of ['commands', 'skills']) {
      const childDir = path.join(ideDir, child);
      if (fs.existsSync(childDir) && fs.readdirSync(childDir).filter((entry) => entry !== '.DS_Store').length === 0) {
        removePath(childDir);
      }
    }
    const remaining = fs.readdirSync(ideDir).filter((entry) => entry !== '.DS_Store');
    if (remaining.length === 0) {
      removePath(ideDir);
    }
  }
}

function pkgJsonHasWorkspaces(dir) {
  const pkg = readPackageJson(path.join(dir, 'package.json'));
  return Boolean(pkg && pkg.workspaces);
}

function findMonorepoWorkspaceRoot(startDir) {
  let current = path.resolve(startDir);
  while (true) {
    if (fs.existsSync(path.join(current, 'pnpm-workspace.yaml')) || pkgJsonHasWorkspaces(current)) {
      return current;
    }
    const parent = path.dirname(current);
    if (parent === current) {
      return null;
    }
    current = parent;
  }
}

function detectInstalledProfile(targetDir, profilesRegistry) {
  const manifestPath = path.join(targetDir, '.ai-spec', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    const manifest = readJson(manifestPath, 'existing manifest');
    // profiles 数组优先
    if (Array.isArray(manifest.profiles) && manifest.profiles.length > 0) {
      return manifest.profiles[0];
    }
    const resolved = resolveProfileId(profilesRegistry, manifest.profile);
    if (resolved) {
      return resolved;
    }
  }
  return DEFAULT_PROFILE;
}

function detectInstalledLevel(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'openspec'))) {
    return 'L3';
  }
  if (ALL_IDES.some((ide) => fs.existsSync(path.join(targetDir, `.${ide}`)))) {
    return 'L2';
  }
  return 'L1';
}

function isSyncManagedProject(targetDir) {
  return (
    fs.existsSync(path.join(targetDir, '.ai-spec', 'manifest.json')) ||
    fs.existsSync(path.join(targetDir, '.ai-spec', 'lock.json'))
  );
}

async function ask(question, defaultValue = '') {
  const rl = readlinePromises.createInterface({ input: process.stdin, output: process.stdout });
  try {
    const prompt = defaultValue ? `${question} [默认 ${defaultValue}]: ` : `${question}: `;
    const answer = await rl.question(prompt);
    return answer.trim() || defaultValue;
  } finally {
    rl.close();
  }
}

async function confirm(question, defaultYes = false) {
  const hint = defaultYes ? '(Y/n)' : '(y/N)';
  const answer = (await ask(`${question} ${hint}`, defaultYes ? 'Y' : 'N')).toLowerCase();
  if (!answer) {
    return defaultYes;
  }
  return answer === 'y' || answer === 'yes';
}

async function selectFromList(title, items, defaultIndex = 0) {
  if (isInteractive()) {
    return selectSingleFromList(title, items, defaultIndex);
  }

  console.log('');
  info(title);
  items.forEach((item, index) => {
    console.log(`  ${index + 1}) ${item.label}${item.desc ? ` — ${item.desc}` : ''}`);
  });
  console.log('');
  const answer = await ask(`请选择 (1-${items.length})`, String(defaultIndex + 1));
  const index = Number(answer) - 1;
  if (Number.isInteger(index) && index >= 0 && index < items.length) {
    return items[index].value;
  }
  return items[defaultIndex].value;
}

function formatSingleSelectLine(item, selectedIndex, cursorIndex, index) {
  const marker = index === selectedIndex ? '[✓]' : '[ ]';
  const prefix = index === cursorIndex ? color('❯', 'cyan') : ' ';
  return `  ${prefix} ${marker} ${item.label}${item.desc ? ` — ${item.desc}` : ''}`;
}

async function selectSingleFromList(title, items, defaultIndex = 0) {
  console.log('');
  info(title);
  console.log('  ↑/↓ 移动，空格选择，Enter 确认');
  console.log('');

  const stdin = process.stdin;
  if (typeof stdin.setRawMode !== 'function') {
    return items[defaultIndex]?.value;
  }

  let cursorIndex = Math.max(0, Math.min(defaultIndex, items.length - 1));
  let selectedIndex = cursorIndex;
  let renderedLines = 0;

  return await new Promise((resolve, reject) => {
    let finished = false;

    const cleanup = () => {
      stdin.removeListener('keypress', onKeypress);
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(false);
      }
      stdin.pause();
      process.stdout.write('\x1b[?25h');
    };

    const finish = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };

    const fail = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };

    const render = () => {
      if (renderedLines > 0) {
        process.stdout.write(`\x1b[${renderedLines}A`);
      }
      items.forEach((item, index) => {
        process.stdout.write(`\x1b[2K\r${formatSingleSelectLine(item, selectedIndex, cursorIndex, index)}\n`);
      });
      renderedLines = items.length;
    };

    const onKeypress = (_str, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        process.stdout.write('\n');
        fail(new Error('已取消选择'));
        return;
      }

      if (key.name === 'up') {
        cursorIndex = cursorIndex > 0 ? cursorIndex - 1 : cursorIndex;
        render();
        return;
      }

      if (key.name === 'down') {
        cursorIndex = cursorIndex < items.length - 1 ? cursorIndex + 1 : cursorIndex;
        render();
        return;
      }

      if (key.name === 'space') {
        selectedIndex = cursorIndex;
        render();
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        finish(items[selectedIndex]?.value);
      }
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write('\x1b[?25l');
    stdin.on('keypress', onKeypress);
    render();
  });
}

function formatMultiSelectLine(item, selectedValues, cursorIndex, index) {
  const marker = selectedValues.has(item.value) ? '[✓]' : '[ ]';
  const prefix = index === cursorIndex ? color('❯', 'cyan') : ' ';
  return `  ${prefix} ${marker} ${item.label}${item.desc ? ` — ${item.desc}` : ''}`;
}

async function selectMultipleFromList(title, items, config = {}) {
  if (!isInteractive()) {
    const defaultValues = new Set(normalizeList(config.defaultValues));
    return items.filter((item) => defaultValues.has(item.value)).map((item) => item.value);
  }

  console.log('');
  info(title);
  if (config.description) {
    console.log(`  ${config.description}`);
  }
  if (config.hint) {
    console.log(`  ${config.hint}`);
  }
  console.log(`  ${config.instructions || '↑/↓ 移动，空格选中/取消，Enter 确认'}`);
  console.log('');

  const stdin = process.stdin;
  const selectedValues = new Set(normalizeList(config.defaultValues));

  if (typeof stdin.setRawMode !== 'function') {
    return items.filter((item) => selectedValues.has(item.value)).map((item) => item.value);
  }

  let cursorIndex = 0;
  let renderedLines = 0;
  let statusMessage = '';

  return await new Promise((resolve, reject) => {
    let finished = false;

    const cleanup = () => {
      stdin.removeListener('keypress', onKeypress);
      if (typeof stdin.setRawMode === 'function') {
        stdin.setRawMode(false);
      }
      stdin.pause();
      process.stdout.write('\x1b[?25h');
    };

    const finish = (result) => {
      if (finished) return;
      finished = true;
      cleanup();
      resolve(result);
    };

    const fail = (error) => {
      if (finished) return;
      finished = true;
      cleanup();
      reject(error);
    };

    const render = () => {
      if (renderedLines > 0) {
        process.stdout.write(`\x1b[${renderedLines}A`);
      }
      items.forEach((item, index) => {
        process.stdout.write(`\x1b[2K\r${formatMultiSelectLine(item, selectedValues, cursorIndex, index)}\n`);
      });
      process.stdout.write(`\x1b[2K\r${statusMessage ? color(`⚠ ${statusMessage}`, 'yellow') : ''}\n`);
      renderedLines = items.length + 1;
    };

    const onKeypress = (_str, key = {}) => {
      if (key.ctrl && key.name === 'c') {
        process.stdout.write('\n');
        fail(new Error('已取消选择'));
        return;
      }

      if (key.name === 'up') {
        statusMessage = '';
        cursorIndex = cursorIndex > 0 ? cursorIndex - 1 : cursorIndex;
        render();
        return;
      }

      if (key.name === 'down') {
        statusMessage = '';
        cursorIndex = cursorIndex < items.length - 1 ? cursorIndex + 1 : cursorIndex;
        render();
        return;
      }

      if (key.name === 'space') {
        statusMessage = '';
        const current = items[cursorIndex];
        if (current) {
          if (selectedValues.has(current.value)) {
            selectedValues.delete(current.value);
          } else {
            selectedValues.add(current.value);
          }
          render();
        }
        return;
      }

      if (key.name === 'return' || key.name === 'enter') {
        const result = items.filter((item) => selectedValues.has(item.value)).map((item) => item.value);
        if (config.minSelection && result.length < config.minSelection) {
          statusMessage = config.minSelectionMessage || `至少选择 ${config.minSelection} 项`;
          render();
          return;
        }
        finish(result);
      }
    };

    readline.emitKeypressEvents(stdin);
    stdin.setRawMode(true);
    stdin.resume();
    process.stdout.write('\x1b[?25l');
    stdin.on('keypress', onKeypress);
    render();
  });
}

async function selectCustomRuleList(options, config = {}) {
  const defaultRules = normalizeCustomRulesSelection(config.defaultRules || DEFAULT_CUSTOM_RULE_SELECTION);
  if (!isInteractive()) {
    options.customRules = options.rulesStrategy === 'custom'
      ? normalizeCustomRulesSelection(options.customRules.length > 0 ? options.customRules : defaultRules)
      : [];
    return;
  }

  options.customRules = await selectMultipleFromList(
    config.title || '选择需要根据项目自定义的规则（空格选中/取消，Enter 确认）：',
    CUSTOMIZABLE_RULES.map(([fileName, desc]) => ({
      value: fileName,
      label: fileName.replace('.md', ''),
      desc,
    })),
    {
      defaultValues: defaultRules,
      description: config.description,
      hint: config.hint || '默认已勾选全部规则，可按空格取消',
    },
  );

  if (options.customRules.length === 0) {
    options.rulesStrategy = 'standard';
    warn(config.emptySelectionLabel || '未选择任何自定义规则，将使用标准规范。');
    return;
  }

  ok(`${config.resultLabel || '以下规则将根据项目自定义：'}${options.customRules.map((name) => `\n  • ${name}`).join('')}`);
}

async function selectRulesStrategy(options, config = {}) {
  const mode = config.mode || 'default';
  if (!isInteractive() || options.rulesStrategy !== 'ask') {
    options.rulesStrategy = options.rulesStrategy === 'ask' ? 'standard' : options.rulesStrategy;
    if (options.rulesStrategy === 'custom') {
      options.customRules = normalizeCustomRulesSelection(options.customRules.length > 0 ? options.customRules : DEFAULT_CUSTOM_RULE_SELECTION);
    } else {
      options.customRules = [];
    }
    return;
  }

  const strategy = await selectFromList(mode === 'manifest' ? '规则内容偏好：' : '规则安装策略：', [
    {
      value: 'standard',
      label: mode === 'manifest' ? '沿用安装模板' : '使用标准规范',
      desc: mode === 'manifest' ? '保持 manifest 安装下来的规则模板内容，后续 /project-init 只刷新 01/03' : '直接使用规范库中的规则，适合快速接入',
    },
    {
      value: 'custom',
      label: '根据项目自定义',
      desc: mode === 'manifest'
        ? '规则模板照常安装，后续由 /project-init 按项目实际情况生成或刷新所选规则'
        : '跳过部分规则，后续由 /project-init 按项目生成',
    },
  ], 0);
  options.rulesStrategy = strategy;
  if (strategy !== 'custom') {
    options.customRules = [];
    return;
  }

  await selectCustomRuleList(options, {
    defaultRules: DEFAULT_CUSTOM_RULE_SELECTION,
    title: mode === 'manifest'
      ? '选择需要在 /project-init 中根据项目自定义的规则（空格选中/取消，Enter 确认）：'
      : '选择需要根据项目自定义的规则（空格选中/取消，Enter 确认）：',
    hint: mode === 'manifest'
      ? '规则模板照常安装，后续由 /project-init 按项目实际情况生成或刷新所选规则'
      : '选中的规则将不从规范库复制，而是由 AI 根据项目实际情况生成',
    resultLabel: mode === 'manifest'
      ? '以下规则将在 /project-init 时根据项目自定义生成或刷新：'
      : '以下规则将根据项目自定义：',
    emptySelectionLabel: mode === 'manifest'
      ? '未选择任何需要在 /project-init 中自定义的规则，将沿用安装模板。'
      : '未选择任何自定义规则，将使用标准规范。',
  });
}

function getActiveProfiles(options) {
  return options.profiles && options.profiles.length > 0 ? options.profiles : [options.profile];
}

function listSelectableUpdateRules(sourceDir, profilesRegistry, options) {
  const items = [];
  const seen = new Set();
  const ruleSources = [
    {
      tag: 'common',
      label: '公共规则',
      dir: path.join(sourceDir, '.agents', 'rules', 'common'),
    },
    ...getActiveProfiles(options).map((profileId) => ({
      tag: profileId,
      label: `${profileId} 规则`,
      dir: getProfileDirs(sourceDir, profileId, profilesRegistry).rulesDir,
    })),
  ];

  for (const source of ruleSources) {
    if (!fs.existsSync(source.dir)) continue;
    for (const fileName of fs.readdirSync(source.dir).filter((name) => name.endsWith('.md')).sort()) {
      if (UPDATE_RULE_PROTECTED_FILES.has(fileName) || seen.has(fileName)) {
        continue;
      }
      seen.add(fileName);
      items.push({
        value: fileName,
        label: fileName.replace('.md', ''),
        desc: source.label,
      });
    }
  }

  return items;
}

async function selectUpdateModules(options) {
  const selected = await selectMultipleFromList(
    '请选择要更新的模块（空格选中/取消，Enter 确认）：',
    UPDATE_MODULE_ITEMS.map(([key, label]) => ({
      value: key,
      label,
    })),
    {
      defaultValues: UPDATE_MODULE_ITEMS
        .map(([key]) => (options[key] === 'yes' ? key : ''))
        .filter(Boolean),
      hint: '默认已勾选当前会更新的模块，可按空格取消或补选',
    },
  );

  const selectedSet = new Set(selected);
  UPDATE_MODULE_ITEMS.forEach(([key]) => {
    options[key] = selectedSet.has(key) ? 'yes' : 'no';
  });
}

async function selectUpdateRuleFiles(options, sourceDir, profilesRegistry) {
  const items = listSelectableUpdateRules(sourceDir, profilesRegistry, options);
  options.selectedUpdateRuleFiles = await selectMultipleFromList(
    '选择要更新的规则文件（空格选中/取消，Enter 确认）：',
    items,
    {
      defaultValues: options.selectedUpdateRuleFiles,
      hint: '默认不选，请按空格勾选要更新的规则文件',
      minSelection: 1,
      minSelectionMessage: '至少选择 1 个规则文件',
    },
  );
  ok(`以下规则将在 update 时按选择覆盖更新：${options.selectedUpdateRuleFiles.map((name) => `\n  • ${name}`).join('')}`);
}

async function selectUpdateRuleMode(options, sourceDir, profilesRegistry) {
  if (!isInteractive() || options.updateRules !== 'yes') {
    return;
  }

  const mode = await selectFromList('选择 Rules（规范规则）的更新方式：', [
    {
      value: UPDATE_RULE_MODES.STANDARD,
      label: '标准更新',
      desc: '仅补缺失规则，保留已有规则文件',
    },
    {
      value: UPDATE_RULE_MODES.SELECTED,
      label: '自定义选择',
      desc: '手动勾选要更新的规则文件，仅覆盖选中项',
    },
    {
      value: UPDATE_RULE_MODES.ALL,
      label: '全部更新',
      desc: '覆盖全部规则文件，但排除 README.md 和 12-Superpowers执行规范.md',
    },
  ], 0);

  options.updateRuleMode = mode;
  options.rulesStrategy = 'standard';
  options.forceUpdateRules = 'no';
  options.selectedUpdateRuleFiles = [];

  if (mode === UPDATE_RULE_MODES.SELECTED) {
    await selectUpdateRuleFiles(options, sourceDir, profilesRegistry);
  }
}

async function selectBootstrapChoices(options) {
  if (!isInteractive()) {
    if (options.installLint === 'ask') options.installLint = 'yes';
    if (options.installHusky === 'ask') options.installHusky = 'no';
    if (options.uipro === 'ask') options.uipro = 'no';
    return;
  }

  if (options.uipro === 'ask') {
    console.log('');
    info('是否安装 UI UX Pro Max 设计智能技能？');
    console.log('  提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则');
    options.uipro = (await confirm('安装 UI UX Pro Max?', true)) ? 'yes' : 'no';
    ok(options.uipro === 'yes' ? '将安装 UI UX Pro Max' : '跳过 UI UX Pro Max');
  }

  if (options.visualBridge === 'ask') {
    // 默认启用 visual bridge，不再提示用户
    options.visualBridge = 'yes';
  }

  if (options.superpowers === 'ask') {
    console.log('');
    info('是否启用 Superpowers 平台增强？');
    console.log('  启用后会生成项目级 superpowers bridge（超能力桥接）配置，并按 IDE 入口注入增强资产。');
    options.superpowers = (await confirm('启用 superpowers?', true)) ? 'yes' : 'no';
    ok(options.superpowers === 'yes' ? '将启用 superpowers 平台增强' : '跳过 superpowers 平台增强');
  }

  if (options.installLint === 'ask') {
    console.log('');
    info('是否安装 ESLint + Prettier + Stylelint 配置？');
    options.installLint = (await confirm('安装 lint/format 工具?', true)) ? 'yes' : 'no';
    ok(options.installLint === 'yes' ? '将安装 lint/format 工具' : '跳过 lint/format 工具');
  }

  if (options.installHusky === 'ask') {
    console.log('');
    info('是否安装 Husky 提交校验（husky + lint-staged + commitlint）？');
    options.installHusky = (await confirm('安装提交校验?', false)) ? 'yes' : 'no';
    ok(options.installHusky === 'yes' ? '将安装提交校验' : '跳过提交校验');
  }
}

async function selectInitChoices(options, profilesRegistry) {
  if (!isInteractive()) {
    if (options.rulesStrategy === 'ask') options.rulesStrategy = 'standard';
    await selectBootstrapChoices(options);
    return;
  }

  if (!options.profileExplicit) {
    const profileItems = Object.entries(getProfileEntries(profilesRegistry)).map(([id, entry]) => ({
      value: id,
      label: id,
      desc: PROFILE_SUMMARIES[id] || entry.label || id,
    }));
    options.profiles = await selectMultipleFromList('选择技术栈 Profile（可多选，空格选中，回车确认）：', profileItems, {
      minSelection: 1,
      defaultValues: options.profiles.length ? options.profiles : [],
    });
    options.profile = options.profiles[0] || DEFAULT_PROFILE;
    ok(`已选择 Profile: ${options.profiles.join(', ')}`);
  }

  await selectRulesStrategy(options);
  await selectBootstrapChoices(options);
}

async function resolveMonorepoTarget(targetDir, options) {
  const resolvedTarget = path.resolve(targetDir);
  const workspaceRoot = findMonorepoWorkspaceRoot(resolvedTarget);
  if (!workspaceRoot) {
    return resolvedTarget;
  }

  if (resolvedTarget !== workspaceRoot) {
    if (fs.existsSync(path.join(resolvedTarget, 'package.json'))) {
      info(`检测到 Monorepo，当前安装目标为子包: ${resolvedTarget}（工作区根: ${workspaceRoot}）`);
    }
    return resolvedTarget;
  }

  const requestedSubPath = options.workspacePackageSubpath || process.env.EX_AI_SPEC_WORKSPACE_PACKAGE || '';
  if (requestedSubPath) {
    const candidate = path.resolve(workspaceRoot, requestedSubPath);
    if (!fs.existsSync(candidate) || !fs.existsSync(path.join(candidate, 'package.json'))) {
      throw new Error(`Monorepo 子包路径无效: ${candidate}`);
    }
    ok(`已根据 --package / EX_AI_SPEC_WORKSPACE_PACKAGE 将安装目标设为: ${candidate}`);
    return candidate;
  }

  if (options.workspaceRoot) {
    return workspaceRoot;
  }

  if (!isInteractive()) {
    warn(`检测到 Monorepo（工作区根: ${workspaceRoot}），非交互模式将继续在根目录安装。`);
    warn(`如需安装到子包，请使用: npx @engineered/ai-spec-auto@latest init . --package packages/your-app`);
    return workspaceRoot;
  }

  console.log('');
  info(`检测到 Monorepo（pnpm / npm workspaces），工作区根目录: ${workspaceRoot}`);
  info('规范与 lint/husky 等依赖将写入「安装目标」目录及其 package.json。');
  console.log('  1) 在工作区根目录继续安装');
  console.log('  2) 改为在具体子包中安装（推荐）');
  console.log('  若仅在根 package.json 添加依赖，pnpm 可使用: pnpm add -w <包名>');
  const choice = await ask('请选择 [1/2]', '2');
  if (choice === '1') {
    return workspaceRoot;
  }
  for (let i = 0; i < 3; i += 1) {
    const rel = (await ask('请输入子包相对路径（相对工作区根，如 packages/web）', '')).replace(/^\/+|\/+$/g, '');
    if (!rel) {
      warn('路径不能为空');
      continue;
    }
    const candidate = path.resolve(workspaceRoot, rel);
    if (!fs.existsSync(candidate)) {
      warn(`目录不存在: ${candidate}`);
      continue;
    }
    if (!fs.existsSync(path.join(candidate, 'package.json'))) {
      warn(`该目录下缺少 package.json: ${candidate}`);
      continue;
    }
    ok(`安装目标已切换为: ${candidate}`);
    return candidate;
  }
  throw new Error('多次输入无效的子包路径，请使用 --package 显式指定');
}

function testNodeEnv() {
  const result = spawnSync('node', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    throw new Error('未检测到 Node.js 环境');
  }
  const version = result.stdout.trim();
  const major = Number(version.replace(/^v/, '').split('.')[0]);
  if (!Number.isFinite(major) || major < 18) {
    throw new Error(`Node.js 版本过低: ${version} (最低要求: v18)`);
  }
  ok(`Node.js ${version} 环境就绪`);
}

function detectPkgManager(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'pnpm-lock.yaml')) && commandExists('pnpm')) {
    return 'pnpm';
  }
  if (commandExists('pnpm')) {
    return 'pnpm';
  }
  if (commandExists('npm')) {
    return 'npm';
  }
  return '';
}

function readSourcePackageField(sourceDir, field) {
  const sourcePkgPath = path.join(sourceDir, 'package.json');
  if (!fs.existsSync(sourcePkgPath)) return null;
  const pkg = readJson(sourcePkgPath, 'source package.json');
  if (field === 'ident') {
    return pkg.name && pkg.version ? `${pkg.name}@${pkg.version}` : null;
  }
  if (field === 'name') return pkg.name || null;
  if (field === 'registry') return pkg.publishConfig?.registry || null;
  return null;
}

function isWorkspaceRootInstallTarget(targetDir) {
  const resolvedTarget = path.resolve(targetDir);
  return findMonorepoWorkspaceRoot(resolvedTarget) === resolvedTarget;
}

function buildDevDependencyInstallArgs(targetDir, pkgManager, packages) {
  if (pkgManager === 'pnpm') {
    const args = ['add'];
    if (isWorkspaceRootInstallTarget(targetDir)) {
      args.push('-w');
    }
    args.push('-D', ...packages);
    return args;
  }
  return ['install', '-D', ...packages];
}

function installDevDependencies(targetDir, pkgManager, packages) {
  if (!pkgManager) return { status: 1 };
  return runCommand(pkgManager, buildDevDependencyInstallArgs(targetDir, pkgManager, packages), { cwd: targetDir, stdio: 'inherit' });
}

function syncCommands(targetDir, sourceDir, ideName, overwrite) {
  const commonDir = path.join(sourceDir, '.agents', 'commands', 'common');
  const ideDir = path.join(sourceDir, '.agents', 'commands', ideName);
  const destDir = path.join(targetDir, `.${ideName}`, 'commands');
  const copiedInThisRun = new Set();
  ensureDir(destDir);
  for (const dir of [commonDir, ideDir]) {
    if (!fs.existsSync(dir)) continue;
    for (const entry of fs.readdirSync(dir)) {
      if (!entry.endsWith('.md')) continue;
      const sourcePath = path.join(dir, entry);
      const destPath = path.join(destDir, entry);
      const canReplaceCommonCopy = dir === ideDir && copiedInThisRun.has(destPath);
      if (fs.existsSync(destPath) && !overwrite && !canReplaceCommonCopy) {
        info(`  跳过已存在命令: ${entry}`);
        continue;
      }
      const rendered = readRenderedCommandTemplate(sourcePath, {
        forceLocalProtocol: process.env.ENGINEERED_SPEC_FORCE_LOCAL_CLI === '1',
      });
      ensureDir(path.dirname(destPath));
      fs.writeFileSync(destPath, rendered, 'utf8');
      copiedInThisRun.add(destPath);
    }
  }
  if (fs.existsSync(destDir)) {
    ok(`.${ideName}/commands/ 已同步`);
  }
}

function hasYamlFrontmatter(content) {
  return /^---\r?\n[\s\S]*?\r?\n---(?:\r?\n|$)/.test(content);
}

function collectStaleCursorProtocolCommands(targetDir) {
  const commandsDir = path.join(targetDir, '.cursor', 'commands');
  if (!fs.existsSync(commandsDir)) {
    return [];
  }

  const staleFiles = [];
  for (const [fileName, requiredSnippets] of CURSOR_PROTOCOL_COMMAND_EXPECTATIONS) {
    const filePath = path.join(commandsDir, fileName);
    if (!fs.existsSync(filePath)) {
      continue;
    }

    let content = '';
    try {
      content = fs.readFileSync(filePath, 'utf8');
    } catch (error) {
      staleFiles.push(fileName);
      continue;
    }

    if (!hasYamlFrontmatter(content) || requiredSnippets.some((snippet) => !content.includes(snippet))) {
      staleFiles.push(fileName);
    }
  }
  return staleFiles;
}

function getProfileDirs(sourceDir, profileId, profilesRegistry) {
  const entry = getProfileEntries(profilesRegistry)[profileId];
  if (!entry) {
    throw new Error(`Unsupported profile: ${profileId}. Supported profiles: ${formatSupportedProfiles(profilesRegistry)}`);
  }
  return {
    rulesDir: path.join(sourceDir, entry.rules_dir),
    skillsDir: path.join(sourceDir, entry.skills_dir),
    configsDir: path.join(sourceDir, entry.configs_dir),
  };
}

function isCustomRule(ruleName, options) {
  return options.rulesStrategy === 'custom' && options.customRules.includes(ruleName);
}

function syncRulesAssets(targetDir, sourceDir, profilesRegistry, options, copyMode = {}) {
  const rulesOut = path.join(targetDir, '.agents', 'rules');
  const profileList = getActiveProfiles(options);
  const commonRulesDir = path.join(sourceDir, '.agents', 'rules', 'common');
  const profileRulesDirs = profileList.map((profileId) => getProfileDirs(sourceDir, profileId, profilesRegistry).rulesDir);
  const sourceRuleDirs = [commonRulesDir, ...profileRulesDirs];
  const ruleMode = copyMode.updateRuleMode || UPDATE_RULE_MODES.LEGACY;
  const selectedRuleFiles = new Set(normalizeList(copyMode.selectedRuleFiles));

  info(`同步 rules (common + ${profileList.join(', ')}) ...`);

  if (ruleMode === UPDATE_RULE_MODES.SELECTED) {
    for (const sourceRuleDir of sourceRuleDirs) {
      if (!fs.existsSync(sourceRuleDir)) continue;
      for (const fileName of fs.readdirSync(sourceRuleDir).filter((name) => name.endsWith('.md'))) {
        if (UPDATE_RULE_PROTECTED_FILES.has(fileName) || !selectedRuleFiles.has(fileName)) {
          continue;
        }
        copyFile(path.join(sourceRuleDir, fileName), path.join(rulesOut, fileName));
      }
    }
    return;
  }

  if (ruleMode === UPDATE_RULE_MODES.ALL) {
    for (const sourceRuleDir of sourceRuleDirs) {
      if (!fs.existsSync(sourceRuleDir)) continue;
      for (const fileName of fs.readdirSync(sourceRuleDir).filter((name) => name.endsWith('.md'))) {
        if (UPDATE_RULE_PROTECTED_FILES.has(fileName)) {
          info(`跳过受保护规则: ${fileName}`);
          continue;
        }
        copyFile(path.join(sourceRuleDir, fileName), path.join(rulesOut, fileName));
      }
    }
    return;
  }

  for (const sourceRuleDir of sourceRuleDirs) {
    if (!fs.existsSync(sourceRuleDir)) continue;
    for (const fileName of fs.readdirSync(sourceRuleDir).filter((name) => name.endsWith('.md'))) {
      const sourcePath = path.join(sourceRuleDir, fileName);
      const destPath = path.join(rulesOut, fileName);
      if (isCustomRule(fileName, options)) {
        info(`跳过自定义规则: ${fileName}（保留项目自定义）`);
        continue;
      }
      if (PROJECT_SPECIFIC_RULES.has(fileName) && fs.existsSync(destPath)) {
        warn(`跳过项目特有规则: ${fileName}（已存在）`);
        continue;
      }
      if (copyMode.skipExistingRules && fs.existsSync(destPath)) {
        info(`  跳过已存在规则: ${fileName}（如需强制覆盖请使用 --force-update-rules）`);
        continue;
      }
      copyFile(sourcePath, destPath);
      if (PROJECT_SPECIFIC_RULES.has(fileName)) {
        info(`已生成模板: ${fileName} → 请根据项目实际情况修改`);
      }
    }
  }
  copyFile(path.join(sourceDir, '.agents', 'rules', 'README.md'), path.join(rulesOut, 'README.md'));
}

function copyAgents(targetDir, sourceDir, profilesRegistry, options, copyMode = {}) {
  const agentsDir = path.join(targetDir, '.agents');
  const rulesOut = path.join(agentsDir, 'rules');
  const skillsOut = path.join(agentsDir, 'skills');
  ensureDir(rulesOut);
  ensureDir(skillsOut);

  const profileList = getActiveProfiles(options);
  const commonSkillsDir = path.join(sourceDir, '.agents', 'skills', 'common');

  if (!copyMode.skipRules) {
    syncRulesAssets(targetDir, sourceDir, profilesRegistry, options, copyMode);
  } else {
    info('跳过 rules 同步（用户选择不更新规则）');
  }

  if (!copyMode.skipSkills) {
    const profileSkillsDirs = profileList.map((profileId) => getProfileDirs(sourceDir, profileId, profilesRegistry).skillsDir);
    info(`同步 skills (common + ${profileList.join(', ')}) ...`);
    for (const sourceSkillsDir of [commonSkillsDir, ...profileSkillsDirs]) {
      if (!fs.existsSync(sourceSkillsDir)) continue;
      for (const entry of fs.readdirSync(sourceSkillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        copyDirReplace(path.join(sourceSkillsDir, entry.name), path.join(skillsOut, entry.name));
      }
    }
    copyFile(path.join(sourceDir, '.agents', 'skills', 'README.md'), path.join(skillsOut, 'README.md'));
  } else {
    info('跳过 skills 同步（用户选择不更新技能）');
  }

  ok(`.agents/ 同步完成 (profiles: ${profileList.join(', ')})`);
}

function readInstallRegistry(sourceDir, fileName, objectKey) {
  const filePath = path.join(sourceDir, '.agents', 'registry', fileName);
  if (!fs.existsSync(filePath)) {
    throw new Error(`Registry file not found: ${filePath}`);
  }
  const data = readJson(filePath, fileName);
  if (!data || typeof data !== 'object' || !data[objectKey] || typeof data[objectKey] !== 'object') {
    throw new Error(`Registry ${fileName} is missing root key "${objectKey}"`);
  }
  return data;
}

function copyRequiredProtocolFile(sourceDir, targetDir, relPath, copiedPaths) {
  if (!relPath || copiedPaths.has(relPath)) {
    return;
  }

  const sourcePath = path.join(sourceDir, relPath);
  const targetPath = path.join(targetDir, relPath);
  if (!copyFile(sourcePath, targetPath)) {
    throw new Error(`Protocol asset missing: ${relPath}`);
  }
  copiedPaths.add(relPath);
}

function syncProtocolAssets(targetDir, sourceDir) {
  info('同步协议资产（roles / flows / orchestration）...');
  const rolesRegistry = readInstallRegistry(sourceDir, 'roles.json', 'roles');
  const flowsRegistry = readInstallRegistry(sourceDir, 'flows.json', 'flows');
  const copiedPaths = new Set();
  const activeRoles = Object.entries(rolesRegistry.roles || {})
    .filter(([, entry]) => entry?.status === 'active')
    .map(([id, entry]) => ({ id, ...entry }));
  const activeFlows = Object.entries(flowsRegistry.flows || {})
    .filter(([, entry]) => entry?.status === 'active')
    .map(([id, entry]) => ({ id, ...entry }));

  for (const relPath of normalizeList(rolesRegistry.support_files)) {
    copyRequiredProtocolFile(sourceDir, targetDir, relPath, copiedPaths);
  }
  for (const relPath of normalizeList(flowsRegistry.support_files)) {
    copyRequiredProtocolFile(sourceDir, targetDir, relPath, copiedPaths);
  }

  for (const role of activeRoles) {
    if (typeof role.source !== 'string' || !role.source.trim()) {
      throw new Error(`Active role is missing source: ${role.id}`);
    }
    copyRequiredProtocolFile(sourceDir, targetDir, role.source, copiedPaths);
    const domainMatch = role.source.match(/^\.agents\/roles\/domains\/([^/]+)\//);
    if (domainMatch) {
      copyRequiredProtocolFile(sourceDir, targetDir, `.agents/roles/domains/${domainMatch[1]}/README.md`, copiedPaths);
    }
  }

  for (const flow of activeFlows) {
    if (typeof flow.source !== 'string' || !flow.source.trim()) {
      throw new Error(`Active flow is missing source: ${flow.id}`);
    }
    copyRequiredProtocolFile(sourceDir, targetDir, flow.source, copiedPaths);
  }

  ok(`协议资产同步完成 (roles: ${activeRoles.length}, flows: ${activeFlows.length})`);
  return {
    roles: activeRoles.map((item) => item.id),
    flows: activeFlows.map((item) => item.id),
  };
}

function copyConfigs(targetDir, sourceDir, profilesRegistry, options, skipExisting = true) {
  const commonDir = path.join(sourceDir, 'configs', 'common');
  const { configsDir } = getProfileDirs(sourceDir, options.profile, profilesRegistry);
  let copied = false;
  const createdPaths = [];
  const skipHuskyArtifacts = options.installHusky !== 'yes' && !fs.existsSync(path.join(targetDir, '.husky'));

  if (skipHuskyArtifacts) {
    info('提交校验相关配置（.husky / .lintstagedrc / commitlint）将跳过同步');
  }

  if (fs.existsSync(commonDir)) {
    info('同步 lint/format 配置 (common) ...');
    const result = copyDirIncremental(commonDir, targetDir, { skipExisting, skipHuskyArtifacts });
    copied = result.copiedAny || copied;
    createdPaths.push(...result.createdPaths);
  }
  if (fs.existsSync(configsDir)) {
    info(`同步 lint/format 配置 (${path.relative(sourceDir, configsDir).split(path.sep).join('/')}) ...`);
    const result = copyDirIncremental(configsDir, targetDir, { skipExisting, skipHuskyArtifacts });
    copied = result.copiedAny || copied;
    createdPaths.push(...result.createdPaths);
  }

  if (copied) ok('lint/format 配置部署完成');
  else info('未找到 lint/format 配置模板，跳过');
  return normalizeList(createdPaths);
}

function installLocalCli(targetDir, sourceDir, pkgManager, pending, options = {}) {
  const targetPkg = path.join(targetDir, 'package.json');
  if (!fs.existsSync(targetPkg)) {
    warn('未找到 package.json，跳过本地 ai-spec-auto CLI 安装');
    return [];
  }
  if (!pkgManager) {
    warn('无可用的包管理器，跳过本地 ai-spec-auto CLI 安装');
    return [];
  }

  const mode = options.mode || 'init';
  const beforeSnapshot = readPackageSnapshot(targetDir);
  const forcedLocal = Boolean(process.env.ENGINEERED_SPEC_FORCE_LOCAL_CLI);
  const packageName = readSourcePackageField(sourceDir, 'name');
  const sourceIdent = readSourcePackageField(sourceDir, 'ident');
  // 解析 install spec：
  // 1. ENGINEERED_SPEC_FORCE_LOCAL_CLI=1 -> 用本地 sourceDir 路径（开发场景）
  // 2. ENGINEERED_SPEC_LOCAL_CLI_VERSION 显式指定版本/dist-tag -> name@<value>
  // 3. update 模式：默认 name@latest，确保从 registry 解析到最新版本
  // 4. init/default-init: use sourceDir current name@version (preserve original behavior, avoid breaking locked version scenarios)
  const explicitVersion = process.env.ENGINEERED_SPEC_LOCAL_CLI_VERSION;
  let installSpec;
  if (forcedLocal) {
    installSpec = sourceDir;
  } else if (explicitVersion && packageName) {
    installSpec = `${packageName}@${explicitVersion}`;
  } else if (mode === 'update' && packageName) {
    installSpec = `${packageName}@latest`;
  } else {
    installSpec = sourceIdent || sourceDir;
  }
  const registry = readSourcePackageField(sourceDir, 'registry');
  const scopeName = packageName && packageName.startsWith('@') ? packageName.split('/')[0] : '';
  const args = buildDevDependencyInstallArgs(targetDir, pkgManager, [installSpec]);
  if (registry) {
    args.push('--registry', registry);
    if (scopeName) {
      args.push(`--${scopeName}:registry=${registry}`);
    }
  }
  info(`正在使用 ${pkgManager} 安装项目内 ai-spec-auto CLI ...`);
  info(`  source: ${forcedLocal ? `${installSpec} (forced local path)` : `${installSpec}${registry ? ` via ${registry}` : ''}`}`);
  const result = runCommand(pkgManager, args, { cwd: targetDir, stdio: 'inherit' });
  if (result.status !== 0) {
    pending.failures.push(`本地 ai-spec-auto CLI 安装失败：请在 ${targetDir} 手动执行 ${pkgManager} ${args.join(' ')}`);
    return [];
  }
  ok('项目内 ai-spec-auto CLI 已就绪 (./node_modules/.bin/ai-spec-auto)');
  const afterSnapshot = readPackageSnapshot(targetDir);
  return collectNewPackageNames(beforeSnapshot, afterSnapshot, [packageName || installSpec]);
}

function installLintDeps(targetDir, pkgManager, options, pending) {
  if (!fs.existsSync(path.join(targetDir, 'package.json'))) {
    pending.failures.push('lint/format：未找到 package.json，已跳过依赖安装。');
    return { addedPackages: [], prepareScript: '' };
  }
  if (!pkgManager) {
    pending.failures.push('lint/format：无可用的包管理器，无法安装 ESLint 等依赖。');
    return { addedPackages: [], prepareScript: '' };
  }
  const deps = [...LINT_DEP_SPECS];
  const profileList = options.profiles && options.profiles.length > 0 ? options.profiles : [options.profile];
  if (profileList.includes('vue')) {
    deps.push(...VUE_LINT_DEP_SPECS);
  }
  const beforeSnapshot = readPackageSnapshot(targetDir);
  info(`正在使用 ${pkgManager} 安装 lint/format 依赖，请稍候 ...`);
  info(`  ${deps.join(' ')}`);
  const result = installDevDependencies(targetDir, pkgManager, deps);
  if (result.status !== 0) {
    pending.failures.push(`lint/format 依赖安装失败：请在 ${targetDir} 手动安装 ${deps.join(' ')}`);
    return { addedPackages: [], prepareScript: '' };
  }
  ok('lint/format 依赖安装完成');
  const afterSnapshot = readPackageSnapshot(targetDir);
  return {
    addedPackages: collectNewPackageNames(beforeSnapshot, afterSnapshot, deps),
    prepareScript: !beforeSnapshot.prepareScript && afterSnapshot.prepareScript ? afterSnapshot.prepareScript : '',
  };
}

function installCommitHooks(targetDir, pkgManager, pending) {
  if (!fs.existsSync(path.join(targetDir, 'package.json'))) {
    pending.failures.push('提交校验：未找到 package.json，已跳过依赖安装。');
    return { addedPackages: [], prepareScript: '' };
  }
  if (!pkgManager) {
    pending.failures.push('提交校验：无可用的包管理器，无法安装 husky 等依赖。');
    return { addedPackages: [], prepareScript: '' };
  }
  const deps = [...HUSKY_DEP_SPECS];
  const beforeSnapshot = readPackageSnapshot(targetDir);
  info(`正在使用 ${pkgManager} 安装提交校验依赖，请稍候 ...`);
  info(`  ${deps.join(' ')}`);
  const result = installDevDependencies(targetDir, pkgManager, deps);
  if (result.status !== 0) {
    pending.failures.push(`提交校验依赖安装失败：请在 ${targetDir} 手动安装 ${deps.join(' ')}`);
    return { addedPackages: [], prepareScript: '' };
  }
  info('初始化 husky ...');
  const huskyResult = runCommand('npx', ['husky', 'install'], { cwd: targetDir, stdio: 'inherit' });
  if (huskyResult.status !== 0) {
    pending.failures.push(`husky install 失败：请在 ${targetDir} 手动执行 npx husky install`);
    return { addedPackages: [], prepareScript: '' };
  }
  ok('提交校验工具链安装完成 (husky@8 + lint-staged + commitlint)');
  const afterSnapshot = readPackageSnapshot(targetDir);
  return {
    addedPackages: collectNewPackageNames(beforeSnapshot, afterSnapshot, deps),
    prepareScript: !beforeSnapshot.prepareScript && afterSnapshot.prepareScript ? afterSnapshot.prepareScript : '',
  };
}

function createIdeLinks(targetDir, sourceDir, options, superpowersEnabled = false) {
  for (const ide of normalizeIdeFilter(options.ideFilter)) {
    const ideDir = path.join(targetDir, `.${ide}`);
    ensureDir(ideDir);
    createDirLink(path.join(targetDir, '.agents', 'rules'), path.join(ideDir, 'rules'));
    const ideSkillsDir = path.join(ideDir, 'skills');
    ensureDir(ideSkillsDir);

    const agentsSkillsDir = path.join(targetDir, '.agents', 'skills');
    if (fs.existsSync(agentsSkillsDir)) {
      for (const entry of fs.readdirSync(agentsSkillsDir, { withFileTypes: true })) {
        if (!entry.isDirectory()) continue;
        if (entry.name === 'common' || entry.name === 'profiles') continue;
        const linkPath = path.join(ideSkillsDir, entry.name);
        if (!shouldExposeSkillToIde(entry.name, superpowersEnabled)) {
          removePath(linkPath);
          continue;
        }
        createDirLink(path.join(agentsSkillsDir, entry.name), linkPath);
      }
    }
    ok(`.${ide}/ 链接就绪`);
  }

  if (normalizeIdeFilter(options.ideFilter).includes('cursor')) {
    const mcpSrc = path.join(sourceDir, '.cursor', 'mcp.json');
    const mcpDest = path.join(targetDir, '.cursor', 'mcp.json');
    if (fs.existsSync(mcpSrc) && !fs.existsSync(mcpDest)) {
      copyFile(mcpSrc, mcpDest);
      info('.cursor/mcp.json 已生成（请在 Cursor「设置 → MCP」中按需启用并完成凭证配置）');
    }
  }

  for (const ide of normalizeIdeFilter(options.ideFilter)) {
    syncCommands(targetDir, sourceDir, ide, options.updateCommands === 'yes');
  }
}

function resolveSuperpowersEnabled(targetDir, options, manifestConfig = null) {
  if (options.superpowers === 'yes') {
    return true;
  }
  if (options.superpowers === 'no') {
    return false;
  }
  const normalizedManifest = normalizeSuperpowersManifest(manifestConfig, readInstalledManifestSuperpowers(targetDir));
  if (normalizedManifest) {
    return Boolean(normalizedManifest.enabled);
  }
  const existingState = readSuperpowersState(targetDir);
  return Boolean(existingState?.enabled);
}

function resolveVisualBridgeEnabled(targetDir, options, manifestConfig = null) {
  if (options.visualBridge === 'yes') {
    return true;
  }
  if (options.visualBridge === 'no') {
    return false;
  }
  const normalizedManifest = normalizeVisualBridgeManifest(manifestConfig, readInstalledManifestVisualBridge(targetDir));
  if (normalizedManifest) {
    return Boolean(normalizedManifest.enabled);
  }
  const existingState = readVisualBridgeState(targetDir);
  return Boolean(existingState?.enabled);
}

function applySuperpowersBridge(targetDir, options, source = 'init', manifestConfig = null) {
  const enabled = resolveSuperpowersEnabled(targetDir, options, manifestConfig);
  const state = buildSuperpowersState({
    targetDir,
    enabled,
    manifestConfig: normalizeSuperpowersManifest(manifestConfig, null),
    ides: normalizeIdeFilter(options.ideFilter),
    env: process.env,
    cliVersion: VERSION,
    source,
    previousState: readSuperpowersState(targetDir),
  });
  writeSuperpowersState(targetDir, state);
  upsertManagedAgentsBlock(targetDir, enabled && normalizeIdeFilter(options.ideFilter).includes('codex'));
  return state;
}

function applyVisualBridge(targetDir, options, source = 'init', manifestConfig = null) {
  const normalizedManifest = normalizeVisualBridgeManifest(manifestConfig, null) || {};
  const enabled = resolveVisualBridgeEnabled(targetDir, options, normalizedManifest);
  const state = buildVisualBridgeState({
    targetDir,
    manifestConfig: {
      ...normalizedManifest,
      enabled,
    },
    cliVersion: VERSION,
    source,
    previousState: readVisualBridgeState(targetDir),
  });
  if (state) {
    writeVisualBridgeState(targetDir, state);
  }
  return state;
}

function ensureOpenSpecDirs(targetDir) {
  ensureDir(path.join(targetDir, 'openspec', 'specs'));
  ensureDir(path.join(targetDir, 'openspec', 'changes', 'archive'));
  ensureDir(path.join(targetDir, 'openspec', 'schemas'));
}

function setupOpenSpec(targetDir, sourceDir, options, pkgManager, pending) {
  info('配置 OpenSpec ...');
  const openspecAvailable = spawnSync('npx', ['openspec', '--version'], { stdio: 'ignore' }).status === 0;
  if (!openspecAvailable) {
    if (!pkgManager) {
      pending.failures.push('OpenSpec CLI 不可用，且未检测到包管理器。请手动安装 @fission-ai/openspec。');
    } else {
      info('正在全局安装 @fission-ai/openspec ...');
      const install = pkgManager === 'pnpm'
        ? runCommand('pnpm', ['add', '-g', '@fission-ai/openspec@latest'], { stdio: 'inherit' })
        : runCommand('npm', ['install', '-g', '@fission-ai/openspec@latest'], { stdio: 'inherit' });
      if (install.status !== 0 || spawnSync('npx', ['openspec', '--version'], { stdio: 'ignore' }).status !== 0) {
        pending.failures.push('OpenSpec CLI 自动安装失败，请手动执行 npm install -g @fission-ai/openspec@latest');
      } else {
        ok('openspec CLI 已安装并可用');
      }
    }
  } else {
    ok('openspec CLI 可用');
  }

  ensureOpenSpecDirs(targetDir);
  const toolsArg = normalizeIdeFilter(options.ideFilter).join(',');
  const configYaml = path.join(targetDir, 'openspec', 'config.yaml');
  const configYml = path.join(targetDir, 'openspec', 'config.yml');
  if (spawnSync('npx', ['openspec', '--version'], { stdio: 'ignore' }).status === 0) {
    if (!fs.existsSync(configYaml) && !fs.existsSync(configYml)) {
      info('运行 openspec init ...');
      const init = runCommand('npx', ['openspec', 'init', '--tools', toolsArg, '--force'], { cwd: targetDir, stdio: 'inherit' });
      if (init.status !== 0) {
        pending.failures.push(`openspec init 失败：请在 ${targetDir} 手动执行 npx openspec init --tools "${toolsArg}"`);
      }
    } else {
      info('openspec/ 已存在，运行 openspec update ...');
      const update = runCommand('npx', ['openspec', 'update', '--force'], { cwd: targetDir, stdio: 'inherit' });
      if (update.status !== 0) {
        pending.failures.push(`openspec update 失败：请在 ${targetDir} 手动执行 npx openspec update --force`);
      }
    }
  }

  const schemaSrc = path.join(sourceDir, 'openspec', 'schemas');
  const schemaDst = path.join(targetDir, 'openspec', 'schemas');
  if (fs.existsSync(schemaSrc)) {
    for (const entry of fs.readdirSync(schemaSrc, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      copyDirReplace(path.join(schemaSrc, entry.name), path.join(schemaDst, entry.name));
    }
  }

  const template = path.join(sourceDir, 'openspec', 'config.yaml.template');
  if (fs.existsSync(template)) {
    const templateRaw = fs.readFileSync(template, 'utf8');
    const templateSchemaLine = templateRaw.split(/\r?\n/).find((line) => /^schema:\s*/.test(line)) || '';
    if (!fs.existsSync(configYaml)) {
      copyFile(template, configYaml);
      ok('openspec/config.yaml 已创建');
    } else {
      let current = fs.readFileSync(configYaml, 'utf8');
      if (!/^context:/m.test(current)) {
        const contextIdx = templateRaw.indexOf('context:');
        if (contextIdx >= 0) {
          current = `${current.replace(/\s*$/, '\n\n')}${templateRaw.slice(contextIdx)}`;
        }
        ok('config.yaml 已增量补充 rules 子键');
      }
      if (templateSchemaLine) {
        if (/^schema:\s*/m.test(current)) {
          current = current.replace(/^schema:\s*.*$/m, templateSchemaLine);
        } else {
          current = `${templateSchemaLine}\n\n${current}`;
        }
      }
      fs.writeFileSync(configYaml, current, 'utf8');
    }
  }
  ok('OpenSpec 配置完成');
}

function getUiproSkillPaths(targetDir) {
  const legacySkillDir = path.join(targetDir, '.agents', 'skills', 'ui-ux-pro-max');
  const skillDir = path.join(targetDir, '.agents', 'skills', 'domains', 'ui-ux-pro-max');
  return {
    legacySkillDir,
    skillDir,
    legacyDataDir: path.join(legacySkillDir, 'data'),
    skillDataDir: path.join(skillDir, 'data'),
  };
}

function hasInstalledUiproData(targetDir) {
  const { legacyDataDir, skillDataDir } = getUiproSkillPaths(targetDir);
  return fs.existsSync(skillDataDir) || fs.existsSync(legacyDataDir);
}

function hasAnyUiproAssets(targetDir) {
  const { legacySkillDir, skillDir } = getUiproSkillPaths(targetDir);
  return fs.existsSync(skillDir) || fs.existsSync(legacySkillDir);
}

function resolveUiproInstallOutput(tmpDir) {
  const sharedDataDir = path.join(tmpDir, '.shared', 'ui-ux-pro-max');
  const commandPromptFile = path.join(tmpDir, '.cursor', 'commands', 'ui-ux-pro-max.md');
  if (fs.existsSync(sharedDataDir)) {
    return {
      dataDir: sharedDataDir,
      promptFile: commandPromptFile,
    };
  }

  const cursorSkillDir = path.join(tmpDir, '.cursor', 'skills', 'ui-ux-pro-max');
  const cursorSkillDataDir = path.join(cursorSkillDir, 'data');
  const cursorSkillFile = path.join(cursorSkillDir, 'SKILL.md');
  if (fs.existsSync(cursorSkillDataDir)) {
    return {
      dataDir: cursorSkillDataDir,
      promptFile: cursorSkillFile,
    };
  }
  if (fs.existsSync(cursorSkillDir)) {
    return {
      dataDir: cursorSkillDir,
      promptFile: cursorSkillFile,
    };
  }

  return {
    dataDir: '',
    promptFile: commandPromptFile,
  };
}

function writeUiproSkillFile(skillDir, promptFile) {
  const defaultContent = `---\nname: ui-ux-pro-max\ndescription: AI 设计智能技能，提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则。当需要 AI 自主做出 UI/UX 设计决策时使用本技能。\n---\n\n# UI UX Pro Max\n\n本技能为 AI 注入专业 UI/UX 设计决策能力。\n`;
  if (!fs.existsSync(promptFile)) {
    fs.writeFileSync(path.join(skillDir, 'SKILL.md'), defaultContent, 'utf8');
    return;
  }

  const prompt = fs.readFileSync(promptFile, 'utf8')
    .replace(/\.shared\/ui-ux-pro-max\//g, 'data/')
    .replace(/\.cursor\/skills\/ui-ux-pro-max\/data\//g, 'data/')
    .replace(/\.cursor\/skills\/ui-ux-pro-max\//g, 'data/');
  const content = hasYamlFrontmatter(prompt)
    ? prompt
    : `---\nname: ui-ux-pro-max\ndescription: AI 设计智能技能，提供 67 种 UI 风格、161 套配色方案、57 组字体搭配、99 条 UX 准则。当需要 AI 自主做出 UI/UX 设计决策时使用本技能。\n---\n\n${prompt}`;
  fs.writeFileSync(path.join(skillDir, 'SKILL.md'), content, 'utf8');
}

function setupUipro(targetDir, pkgManager, pending) {
  const { legacySkillDir, skillDir, skillDataDir } = getUiproSkillPaths(targetDir);
  if (fs.existsSync(skillDataDir)) {
    ok('UI UX Pro Max 已安装，跳过');
    return;
  }
  if (fs.existsSync(legacySkillDir)) {
    removePath(legacySkillDir);
  }
  if (!pkgManager) {
    pending.failures.push('UI UX Pro Max：无可用的包管理器，无法全局安装 uipro-cli。');
    return;
  }

  const hasUipro = commandExists('uipro');
  if (!hasUipro) {
    info('安装 uipro-cli ...');
    const install = pkgManager === 'pnpm'
      ? runCommand('pnpm', ['add', '-g', 'uipro-cli'], { stdio: 'inherit' })
      : runCommand('npm', ['install', '-g', 'uipro-cli'], { stdio: 'inherit' });
    if (install.status !== 0 || !commandExists('uipro')) {
      pending.failures.push('uipro-cli 全局安装失败，请手动执行 npm install -g uipro-cli');
      return;
    }
    ok('uipro-cli 安装成功');
  }

  const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-uipro-'));
  info('下载 UI UX Pro Max 资源 ...');
  const init = runCommand('uipro', ['init', '--ai', 'cursor'], { cwd: tmpDir, stdio: 'inherit' });
  if (init.status !== 0) {
    pending.failures.push('uipro init 失败，请检查网络后重试。');
    removePath(tmpDir);
    return;
  }
  const output = resolveUiproInstallOutput(tmpDir);
  if (!output.dataDir || !fs.existsSync(output.dataDir)) {
    pending.failures.push('UI UX Pro Max 资源目录缺失，可能是 uipro-cli 版本或网络问题。');
    removePath(tmpDir);
    return;
  }
  ensureDir(skillDataDir);
  fs.cpSync(output.dataDir, skillDataDir, { recursive: true });
  writeUiproSkillFile(skillDir, output.promptFile);
  removePath(tmpDir);
  ok('UI UX Pro Max 安装完成');
}

function getSelectedAiInitRules(options) {
  const selected = new Set(['01-项目概述.md', '03-项目结构.md']);
  if (options.rulesStrategy === 'custom') {
    for (const name of options.customRules) {
      selected.add(name);
    }
  }
  return [...selected];
}

function buildManifestLocalPreferences(options, existingPreferences = null) {
  const base = existingPreferences && typeof existingPreferences === 'object'
    ? JSON.parse(JSON.stringify(existingPreferences))
    : {};
  if (options.rulesStrategy === 'custom') {
    const customRules = normalizeCustomRulesSelection(options.customRules.length > 0 ? options.customRules : DEFAULT_CUSTOM_RULE_SELECTION);
    base.project_init = { custom_rules: customRules };
  } else if (base.project_init) {
    delete base.project_init;
  }
  return Object.keys(base).length > 0 ? base : null;
}

function formatUpdateRulesSummary(options) {
  if (options.updateRules !== 'yes') {
    return '跳过';
  }
  if (options.updateRuleMode === UPDATE_RULE_MODES.STANDARD) {
    return '标准更新（仅补缺失，保留已有规则）';
  }
  if (options.updateRuleMode === UPDATE_RULE_MODES.SELECTED) {
    return `自定义选择（${options.selectedUpdateRuleFiles.length} 个文件）`;
  }
  if (options.updateRuleMode === UPDATE_RULE_MODES.ALL) {
    return '全部更新（排除 README.md 与 12-Superpowers执行规范.md）';
  }
  return options.forceUpdateRules === 'yes'
    ? '强制覆盖（保留项目特有 01/03 与自定义）'
    : '仅补充缺失（保留已有规则）';
}

function printTools(level, uiproSelected) {
  info('工具环境：');
  if (commandExists('git')) {
    const version = spawnSync('git', ['--version'], { encoding: 'utf8' }).stdout.trim().replace(/^git version\s+/, '');
    ok(`  git ${version}`);
  } else {
    warn('  git 未安装');
  }
  if (commandExists('node')) {
    ok(`  node ${spawnSync('node', ['--version'], { encoding: 'utf8' }).stdout.trim()}`);
  } else {
    warn('  node 未安装');
  }
  if (commandExists('npx')) {
    ok('  npx 可用');
  } else {
    warn('  npx 不可用');
  }
  if (level === 'L3') {
    if (spawnSync('npx', ['openspec', '--version'], { stdio: 'ignore' }).status === 0) {
      ok('  openspec 已安装');
    } else {
      warn('  openspec 未安装');
    }
  }
  if (uiproSelected === 'yes' || commandExists('python3')) {
    if (commandExists('python3')) {
      const py = spawnSync('python3', ['--version'], { encoding: 'utf8' });
      ok(`  python3 ${(py.stdout || py.stderr).trim().replace(/^Python\s+/, '')}`);
    } else if (uiproSelected === 'yes') {
      warn('  python3 未安装（UI UX Pro Max 搜索脚本需要）');
    }
  }
}

function printInstallReport(targetDir, options, pending) {
  const installMode = options.installMode || 'default-init';
  const resolvedIdes = normalizeIdeFilter(options.ideFilter);
  const ideSummary = resolvedIdes.length > 0 ? resolvedIdes.map((ide) => `.${ide}`).join(', ') : '(none)';
  const selectedAiInitRules = getSelectedAiInitRules(options);
  console.log('');
  console.log(color('════════════════════════════════════════', 'bold'));
  if (pending.failures.length > 0 || pending.configs.length > 0 || (pending.warnings || []).length > 0) {
    info('规范与配置文件已同步到项目。');
    warn(`存在 ${pending.failures.length + pending.configs.length + (pending.warnings || []).length} 项待处理（见文末汇总）。`);
  } else {
    ok('安装完成！');
  }
  console.log(color('════════════════════════════════════════', 'bold'));
  console.log('');
  info('安装配置：');
  console.log(`  Profile:  ${color((options.profiles && options.profiles.length > 0 ? options.profiles : [options.profile]).join(', '), 'bold')}`);
  console.log(`  安装模式: ${color(installMode, 'bold')}`);
  console.log(`  安装模型: ${color(options.level === DEFAULT_LEVEL ? 'default (full)' : 'compatibility override', 'bold')}`);
  if (options.level !== DEFAULT_LEVEL) {
    console.log(`  兼容层级: ${color(options.level, 'bold')}`);
  }
  console.log(`  IDE:      ${color(options.ideFilter, 'bold')}`);
  if (installMode === 'init-with-manifest') {
    console.log(`  Profile来源: ${color(options.profileSource || 'manifest', 'bold')}`);
    console.log(`  规则来源: ${color(options.rulesSource || 'manifest 安装 + 安装模板沿用', 'bold')}`);
    console.log(`  规则内容偏好: ${color(options.rulesStrategy === 'custom' ? '根据项目自定义' : '沿用安装模板', 'bold')}`);
  }
  console.log(`  UIPro:    ${color(options.uipro, 'bold')}`);
  console.log(`  AIInit:   ${color('no', 'bold')}`);
  if (options.manifestSource) {
    console.log(`  Manifest: ${color(options.manifestSource, 'bold')}`);
  }
  if (options.syncSummary) {
    console.log(`  首轮同步: roles ${options.syncSummary.roles}, skills ${options.syncSummary.skills}, rules ${options.syncSummary.rules}, flows ${options.syncSummary.flows}`);
  }
  console.log('');
  info('已部署内容：');
  console.log(`  ${color('✔', 'green')} .agents/rules + skills + roles + flows + orchestration (profiles: ${(options.profiles && options.profiles.length > 0 ? options.profiles : [options.profile]).join(', ')})`);
  console.log(`  ${options.installLint === 'yes' ? color('✔', 'green') : color('—', 'yellow')} lint/format 配置${options.installLint === 'yes' ? ' (.prettierrc, .eslintrc, .stylelintrc)' : '（已跳过）'}`);
  console.log(`  ${options.installHusky === 'yes' ? color('✔', 'green') : color('—', 'yellow')} 提交校验${options.installHusky === 'yes' ? ' (.husky, .lintstagedrc, commitlint.config.js)' : '（已跳过）'}`);
  if (hasInstalledUiproData(targetDir)) {
    console.log(`  ${color('✔', 'green')} UI UX Pro Max 设计智能技能 (67 styles, 161 palettes)`);
  }
  if (options.level !== 'L1') {
    console.log(`  ${color('✔', 'green')} IDE 适配 (${ideSummary})`);
  }
  console.log('');
  info('提醒事项：');
  console.log('  1. 当前包通过公共 npm 分发：npx @engineered/ai-spec-auto@latest <command>（内网遗留包见 README）');
  if (options.level !== 'L1' && resolvedIdes.includes('cursor')) {
    console.log('  2. 配置 .cursor/mcp.json（按需启用 MCP）');
    console.log(`     ${color('→', 'yellow')} Cursor 里各 MCP 默认关闭/未启用是预期行为，并非安装失败`);
    console.log(`     ${color('→', 'yellow')} 先在 Cursor 设置 → MCP 中按需启用目标服务，再补齐凭证`);
    console.log(`     ${color('→', 'yellow')} 将 project-id、access-token 等占位符替换成真实值，不需要的服务保持关闭即可`);
    console.log('  3. 首次运行 /spec-start / /spec-continue / /spec-update 时，如 Cursor 提示执行 ai-spec-auto 命令');
    console.log(`     ${color('→', 'yellow')} 请选择 Always allow for this workspace，避免宿主桥命令被权限弹窗打断`);
  }
  console.log('');
  console.log(color('────────────────────────────────────────────────────────────', 'bold'));
  console.log(`  ${color('★ 项目初始化不会在安装后自动执行，请在 AI IDE 中按下面顺序继续：', 'bold')}`);
  console.log(`    1. 先执行 ${color('/project-init', 'bold')}（或输入“初始化项目规范” / “project-init”）`);
  console.log(`    2. 再执行 ${color('/spec-start', 'bold')} 开始第一个需求`);
  console.log('    /project-init 将生成或刷新：');
  for (const rule of selectedAiInitRules) {
    console.log(`    • ${rule}`);
  }
  console.log(color('────────────────────────────────────────────────────────────', 'bold'));
  if (pending.failures.length > 0 || pending.configs.length > 0 || (pending.warnings || []).length > 0) {
    console.log('');
    if (pending.failures.length > 0) {
      console.log(color('════════════════════════════════════════', 'red'));
      console.log(color('  待处理事项（安装或命令失败，请逐项处理）', 'red'));
      console.log(color('════════════════════════════════════════', 'red'));
      for (const item of pending.failures) {
        console.log(`  ${color('•', 'red')} ${item}`);
      }
    }
    if ((pending.warnings || []).length > 0) {
      console.log(color('════════════════════════════════════════', 'yellow'));
      console.log(color('  安装提示（非阻断）', 'yellow'));
      console.log(color('════════════════════════════════════════', 'yellow'));
      for (const item of pending.warnings) {
        console.log(`  ${color('•', 'yellow')} ${item}`);
      }
    }
    if (pending.configs.length > 0) {
      console.log(color('════════════════════════════════════════', 'yellow'));
      console.log(color('  配置提醒（非安装失败）', 'yellow'));
      console.log(color('════════════════════════════════════════', 'yellow'));
      for (const item of pending.configs) {
        console.log(`  ${color('•', 'yellow')} ${item}`);
      }
    }
  }
}

async function handleInitWithManifest(options, sourceDir, profilesRegistry, targetDir, pkgManager) {
  const sync = require('./sync');
  const pending = { failures: [], configs: [], warnings: [] };
  const previousInstallState = readInstallState(targetDir);
  const installStateAdditions = {
    createdConfigFiles: [],
    addedDevDependencies: [],
    prepareScript: '',
  };
  const syncOptions = {
    target: targetDir,
    manifest: options.manifest,
    dryRun: false,
    force: false,
    hubFetch: options.hubFetch,
    ...(options.profileExplicit ? { profile: options.profile } : {}),
    ...(options.ideExplicit ? { ide: options.ideFilter } : {}),
    ...(options.superpowersExplicit ? { superpowers: options.superpowers === 'yes' } : {}),
    ...(options.visualBridgeExplicit
      ? {
          visualBridge: {
            enabled: options.visualBridge === 'yes',
          },
        }
      : {}),
    ...(options.hubOrigin ? { hubOrigin: options.hubOrigin } : {}),
  };
  info('预解析 manifest 与 registry ...');
  const prepared = await sync.prepareSync(syncOptions);
  ok('Manifest / registry 预校验通过');
  await selectRulesStrategy(options, { mode: 'manifest' });

  const manifestProfile = resolveProfileId(profilesRegistry, prepared.rawManifest?.profile || null);
  if (options.profileExplicit && manifestProfile && manifestProfile !== prepared.manifest.profile) {
    pending.warnings.push(`Manifest profile "${manifestProfile}" 已被显式参数 --profile ${options.profile} 覆盖，当前按 "${prepared.manifest.profile}" 安装。`);
  }

  if (options.ideExplicit && prepared.rawManifest?.ides !== undefined) {
    const requestedIdes = normalizeIdeFilter(options.ideFilter);
    const manifestIdes = normalizeIdes(prepared.rawManifest.ides);
    if (!sameStringList(requestedIdes, manifestIdes)) {
      pending.warnings.push(`Manifest ides "${manifestIdes.join(',') || 'default'}" 已被显式参数 --ide ${requestedIdes.join(',')} 覆盖。`);
    }
  }

  if (options.levelExplicit) {
    pending.warnings.push('init --manifest 固定按默认完整安装执行，--level 仅作兼容参数，当前不会影响场景资产同步。');
  }
  options.level = DEFAULT_LEVEL;
  options.profile = prepared.manifest.profile;
  options.ideFilter = prepared.manifest.ides.join(',');
  options.superpowers = prepared.manifest.superpowers?.enabled ? 'yes' : 'no';
  options.visualBridge = prepared.manifest.visual_bridge?.enabled ? 'yes' : 'no';
  options.installMode = 'init-with-manifest';
  options.manifestSource = prepared.manifestSource;
  options.profileSource = options.profileExplicit && manifestProfile
    ? `manifest（已由 --profile 覆盖，原值 ${manifestProfile}）`
    : 'manifest';
  options.rulesSource = options.rulesStrategy === 'custom'
    ? 'manifest 安装 + 本地 project-init 偏好'
    : 'manifest 安装 + 安装模板沿用';
  options.syncSummary = {
    roles: prepared.resolvedResult.resolved.roles.length,
    skills: prepared.resolvedResult.resolved.skills.length,
    rules: prepared.resolvedResult.resolved.rules.length,
    flows: prepared.resolvedResult.resolved.installed_flows.length,
  };
  const localPreferences = buildManifestLocalPreferences(options, prepared.manifest.local_preferences);
  if (localPreferences) {
    prepared.manifest.local_preferences = localPreferences;
  } else {
    delete prepared.manifest.local_preferences;
  }
  if (options.superpowersExplicit) {
    prepared.manifest.superpowers = normalizeSuperpowersManifest({
      ...(prepared.manifest.superpowers || {}),
      enabled: options.superpowers === 'yes',
    }, null);
  }
  if (options.visualBridgeExplicit) {
    prepared.manifest.visual_bridge = normalizeVisualBridgeManifest({
      ...(prepared.manifest.visual_bridge || {}),
      enabled: options.visualBridge === 'yes',
    }, null);
  }

  await selectBootstrapChoices(options);

  const syncResult = await sync.runSync(syncOptions, prepared);
  options.profile = syncResult.target.profile;
  options.ideFilter = syncResult.target.ides.join(',');
  options.syncSummary = {
    roles: syncResult.resolved.roles.length,
    skills: syncResult.resolved.skills.length,
    rules: syncResult.resolved.rules.length,
    flows: syncResult.resolved.installed_flows.length,
  };
  for (const warning of syncResult.warnings) {
    if (!pending.warnings.includes(warning)) {
      pending.warnings.push(warning);
    }
  }

  installStateAdditions.addedDevDependencies.push(...installLocalCli(targetDir, sourceDir, pkgManager, pending));
  if (options.installLint === 'yes') {
    installStateAdditions.createdConfigFiles.push(...copyConfigs(targetDir, sourceDir, profilesRegistry, options, true));
    const lintInstall = installLintDeps(targetDir, pkgManager, options, pending);
    installStateAdditions.addedDevDependencies.push(...lintInstall.addedPackages);
    installStateAdditions.prepareScript = installStateAdditions.prepareScript || lintInstall.prepareScript;
  }
  if (options.installHusky === 'yes') {
    const commitInstall = installCommitHooks(targetDir, pkgManager, pending);
    installStateAdditions.addedDevDependencies.push(...commitInstall.addedPackages);
    installStateAdditions.prepareScript = installStateAdditions.prepareScript || commitInstall.prepareScript;
  }
  if (options.uipro === 'yes') {
    setupUipro(targetDir, pkgManager, pending);
  }
  if (normalizeIdeFilter(options.ideFilter).includes('cursor')) {
    pending.configs.push('.cursor/mcp.json：在 Cursor 设置 → MCP 中按需启用服务后，再补齐 project-id、access-token 等凭证。');
  }
  setupOpenSpec(targetDir, sourceDir, options, pkgManager, pending);
  applySuperpowersBridge(targetDir, options, 'init-with-manifest', prepared.manifest.superpowers || null);
  applyVisualBridge(targetDir, options, 'init-with-manifest', prepared.manifest.visual_bridge || null);
  writeInstallState(targetDir, sourceDir, previousInstallState, installStateAdditions);
  printTools(options.level, options.uipro);
  printInstallReport(targetDir, options, pending);
  return pending.failures.length > 0 ? 1 : 0;
}

async function handleInit(options) {
  const sourceDir = getSourceDir();
  const profilesRegistry = readProfilesRegistry(sourceDir);
  const installStateAdditions = {
    createdConfigFiles: [],
    addedDevDependencies: [],
    prepareScript: '',
  };

  // 规范化 profiles：--profiles 优先，其次 --profile，最后 DEFAULT_PROFILE
  if (options.profiles && options.profiles.length > 0) {
    options.profiles = options.profiles.map((p) => resolveProfileId(profilesRegistry, p)).filter(Boolean);
  } else {
    const resolved = resolveProfileId(profilesRegistry, options.profile) || DEFAULT_PROFILE;
    options.profiles = [resolved];
  }
  options.profile = options.profiles[0];

  testNodeEnv();
  const targetDir = await resolveMonorepoTarget(options.target, options);
  console.log('');
  info(`ai-spec-auto  v${VERSION} | ${os.platform()} ${os.arch()} | Node ${process.version}`);
  info(`初始化项目: ${targetDir}`);
  console.log('');

  if (fs.existsSync(path.join(targetDir, '.agents'))) {
    warn('目标项目已包含 .agents/ 目录');
    console.log(`  如果只需更新规范，请使用: ${color('npx @engineered/ai-spec-auto@latest update .', 'bold')}`);
    console.log('');
    if (!options.force && isInteractive()) {
      const goOn = await confirm('继续初始化将覆盖现有规范（01/03 和自定义规则除外），确认？', false);
      if (!goOn) {
        info('已取消');
        return 0;
      }
    }
  }

  const pkgManager = detectPkgManager(targetDir);
  if (pkgManager) {
    ok(`使用包管理器: ${pkgManager}${commandExists(pkgManager) ? ` (${spawnSync(pkgManager, ['--version'], { encoding: 'utf8' }).stdout.trim()})` : ''}`);
  } else {
    warn('未检测到 npm 或 pnpm，后续依赖安装会跳过');
  }
  info(`使用 npm 包内规范库: ${sourceDir}`);

  if (options.manifest) {
    return handleInitWithManifest(options, sourceDir, profilesRegistry, targetDir, pkgManager);
  }

  await selectInitChoices(options, profilesRegistry);
  if (!['L1', 'L2', 'L3'].includes(options.level)) {
    options.level = DEFAULT_LEVEL;
  }

  options.installMode = 'default-init';
  const pending = { failures: [], configs: [], warnings: [] };
  const previousInstallState = readInstallState(targetDir);
  copyAgents(targetDir, sourceDir, profilesRegistry, options);
  syncProtocolAssets(targetDir, sourceDir);
  installStateAdditions.addedDevDependencies.push(...installLocalCli(targetDir, sourceDir, pkgManager, pending));
  if (options.installLint === 'yes') {
    installStateAdditions.createdConfigFiles.push(...copyConfigs(targetDir, sourceDir, profilesRegistry, options, true));
    const lintInstall = installLintDeps(targetDir, pkgManager, options, pending);
    installStateAdditions.addedDevDependencies.push(...lintInstall.addedPackages);
    installStateAdditions.prepareScript = installStateAdditions.prepareScript || lintInstall.prepareScript;
  }
  if (options.installHusky === 'yes') {
    const commitInstall = installCommitHooks(targetDir, pkgManager, pending);
    installStateAdditions.addedDevDependencies.push(...commitInstall.addedPackages);
    installStateAdditions.prepareScript = installStateAdditions.prepareScript || commitInstall.prepareScript;
  }
  if (options.uipro === 'yes') {
    setupUipro(targetDir, pkgManager, pending);
  }
  const superpowersEnabled = resolveSuperpowersEnabled(targetDir, options, null);
  if (options.level !== 'L1') {
    createIdeLinks(targetDir, sourceDir, options, superpowersEnabled);
    if (normalizeIdeFilter(options.ideFilter).includes('cursor')) {
      pending.configs.push('.cursor/mcp.json：在 Cursor 设置 → MCP 中按需启用服务后，再补齐 project-id、access-token 等凭证。');
    }
  }
  if (options.level === 'L3') {
    setupOpenSpec(targetDir, sourceDir, options, pkgManager, pending);
  }
  if (options.superpowers === 'yes') {
    applySuperpowersBridge(targetDir, options, 'init', null);
  }
  if (options.visualBridge === 'yes') {
    applyVisualBridge(targetDir, options, 'init', {
      enabled: true,
    });
  }
  writeInstallState(targetDir, sourceDir, previousInstallState, installStateAdditions);
  writeProfileManifest(targetDir, options);
  printTools(options.level, options.uipro);
  printInstallReport(targetDir, options, pending);
  return pending.failures.length > 0 ? 1 : 0;
}

async function handleUpdate(options) {
  const targetDir = path.resolve(options.target);
  const interactive = isInteractive();
  const useInteractiveRuleMode = interactive && options.rulesStrategy === 'ask' && options.forceUpdateRules === 'ask';
  const needsLegacyRuleStrategyPrompt = interactive && options.rulesStrategy === 'ask' && options.forceUpdateRules !== 'ask';
  if (!fs.existsSync(path.join(targetDir, '.agents'))) {
    throw new Error(`${targetDir} 未找到 .agents/，请先运行 init`);
  }
  const sourceDir = getSourceDir();
  const profilesRegistry = readProfilesRegistry(sourceDir);
  if (!options.profileExplicit) {
    options.profile = detectInstalledProfile(targetDir, profilesRegistry);
  } else {
    options.profile = resolveProfileId(profilesRegistry, options.profile) || DEFAULT_PROFILE;
  }
  if (!options.levelExplicit) {
    options.level = detectInstalledLevel(targetDir);
  }
  options.ideFilter = resolveTargetIdes(targetDir, options).join(',');
  const pkgManager = detectPkgManager(targetDir);
  info(`更新规范: ${targetDir}`);
  if (!interactive && options.rulesStrategy === 'ask') {
    await selectRulesStrategy(options);
  }
  if (options.rulesStrategy === 'ask') options.rulesStrategy = 'standard';
  if (hasAnyUiproAssets(targetDir) && options.updateUipro !== 'yes') {
    options.updateUipro = 'yes';
  }
  if (options.uipro === 'yes') {
    options.updateUipro = 'yes';
  }

  if (interactive) {
    await selectUpdateModules(options);
    if (options.updateRules === 'yes') {
      if (useInteractiveRuleMode) {
        options.rulesStrategy = 'ask';
        await selectUpdateRuleMode(options, sourceDir, profilesRegistry);
      } else if (needsLegacyRuleStrategyPrompt) {
        options.rulesStrategy = 'ask';
        await selectRulesStrategy(options);
      }
    }
  }

  if (options.updateRules === 'yes' && options.updateRuleMode === UPDATE_RULE_MODES.LEGACY && options.forceUpdateRules === 'ask') {
    if (interactive) {
      options.forceUpdateRules = await selectFromList(
        '是否强制更新已有规则？（默认否，已存在的规则文件将被保留）',
        [
          { value: 'no', label: '否（默认）', desc: '保留已存在的规则文件，仅补充缺失规则' },
          { value: 'yes', label: '是', desc: '覆盖所有已存在的规则文件（项目特有规则 01/03 仍保留）' },
        ],
        0,
      );
      ok(options.forceUpdateRules === 'yes' ? '将强制覆盖已有规则' : '保留已有规则，仅补充缺失项');
    } else {
      options.forceUpdateRules = 'no';
    }
  }
  if (options.forceUpdateRules === 'ask') options.forceUpdateRules = 'no';

  console.log('');
  console.log(color('── 变更摘要 ──', 'bold'));
  console.log(`  Skills:   ${options.updateSkills === 'yes' ? '更新' : '跳过'}`);
  console.log(`  Rules:    ${formatUpdateRulesSummary(options)}`);
  console.log(`  Configs:  ${options.updateConfigs === 'yes' ? '同步（已存在的不覆盖）' : '跳过'}`);
  console.log(`  Commands: ${options.updateCommands === 'yes' ? '同步（覆盖已有命令）' : '同步（仅补新增）'}`);
  console.log(`  IDE Links:${options.updateIdeLinks === 'yes' ? ' 重建' : ' 跳过'}`);
  console.log(`  OpenSpec: ${options.level === 'L3' && options.updateOpenSpec === 'yes' ? '更新' : '跳过'}`);
  console.log(`  UIPro:    ${options.updateUipro === 'yes' ? '重新安装' : '跳过'}`);
  console.log(`  Superpowers: ${options.refreshSuperpowers || options.superpowersExplicit ? '刷新/更新' : '保持当前状态'}`);
  console.log(`  VisualBridge: ${options.visualBridgeExplicit || readVisualBridgeState(targetDir) ? '刷新/更新' : '保持当前状态'}`);
  console.log('');

  const pending = { failures: [], configs: [] };
  const previousInstallState = readInstallState(targetDir);
  const installStateAdditions = {
    createdConfigFiles: [],
    addedDevDependencies: [],
    prepareScript: '',
  };
  if (options.updateSkills === 'yes' || options.updateRules === 'yes') {
    copyAgents(targetDir, sourceDir, profilesRegistry, options, {
      skipRules: options.updateRules !== 'yes',
      skipSkills: options.updateSkills !== 'yes',
      skipExistingRules: options.updateRules === 'yes'
        && options.forceUpdateRules !== 'yes'
        && options.updateRuleMode !== UPDATE_RULE_MODES.SELECTED
        && options.updateRuleMode !== UPDATE_RULE_MODES.ALL,
      updateRuleMode: options.updateRuleMode,
      selectedRuleFiles: options.selectedUpdateRuleFiles,
    });
  }
  syncProtocolAssets(targetDir, sourceDir);
  installStateAdditions.addedDevDependencies.push(...installLocalCli(targetDir, sourceDir, pkgManager, pending, { mode: 'update' }));
  if (options.updateConfigs === 'yes') {
    installStateAdditions.createdConfigFiles.push(...copyConfigs(targetDir, sourceDir, profilesRegistry, options, true));
  }
  if (options.level !== 'L1') {
    const superpowersEnabled = resolveSuperpowersEnabled(targetDir, options, null);
    if (options.updateIdeLinks === 'yes') {
      createIdeLinks(targetDir, sourceDir, options, superpowersEnabled);
    }
    for (const ide of normalizeIdeFilter(options.ideFilter)) {
      syncCommands(targetDir, sourceDir, ide, options.updateCommands === 'yes');
    }
  }
  if (options.level === 'L3' && options.updateOpenSpec === 'yes') {
    setupOpenSpec(targetDir, sourceDir, options, pkgManager, pending);
  }
  if (options.updateUipro === 'yes') {
    const { legacySkillDir, skillDir } = getUiproSkillPaths(targetDir);
    removePath(legacySkillDir);
    removePath(skillDir);
    setupUipro(targetDir, pkgManager, pending);
  }
  if (options.refreshSuperpowers || options.superpowersExplicit || readSuperpowersState(targetDir)) {
    applySuperpowersBridge(targetDir, options, 'update', null);
  }
  if (options.visualBridgeExplicit || readVisualBridgeState(targetDir)) {
    applyVisualBridge(targetDir, options, 'update', readInstalledManifestVisualBridge(targetDir));
  }
  writeInstallState(targetDir, sourceDir, previousInstallState, installStateAdditions);
  ok(`更新完成 (profile: ${options.profile}, compatibility level: ${options.level})`);
  if (pending.failures.length > 0) {
    pending.failures.forEach((item) => warn(item));
  }
  return pending.failures.length > 0 ? 1 : 0;
}

function handleCheck(options) {
  const targetDir = path.resolve(options.target);
  let hasIssue = false;
  const syncManaged = isSyncManagedProject(targetDir);
  console.log('');
  info(`═══ 安装状态检查: ${targetDir} ═══`);
  console.log('');
  const agentsDir = path.join(targetDir, '.agents');
  if (fs.existsSync(agentsDir)) {
    ok('.agents/ 存在');
    if (fs.existsSync(path.join(agentsDir, 'rules'))) ok('  rules/ 存在');
    else { err('  rules/ 缺失'); hasIssue = true; }
    if (fs.existsSync(path.join(agentsDir, 'skills'))) ok('  skills/ 存在');
    else { err('  skills/ 缺失'); hasIssue = true; }
  } else {
    err('.agents/ 不存在');
    hasIssue = true;
  }
  const localCli = path.join(targetDir, 'node_modules', '.bin', isWindows() ? 'ai-spec-auto.cmd' : 'ai-spec-auto');
  if (fs.existsSync(localCli)) ok('./node_modules/.bin/ai-spec-auto 可用');
  else if (syncManaged) {
    warn('./node_modules/.bin/ai-spec-auto 缺失（当前项目已通过 sync --manifest 同步资源；仅在需要本地运行协议命令时再安装 CLI）');
  } else {
    err('./node_modules/.bin/ai-spec-auto 缺失');
    hasIssue = true;
  }

  for (const ide of ALL_IDES) {
    const ideDir = path.join(targetDir, `.${ide}`);
    if (!fs.existsSync(ideDir)) {
      warn(`.${ide}/ 不存在`);
      continue;
    }
    const rulesLink = path.join(ideDir, 'rules');
    if (fs.existsSync(rulesLink)) ok(`.${ide}/rules 链接有效`);
    else { err(`.${ide}/rules 链接无效`); hasIssue = true; }
    const skillsDir = path.join(ideDir, 'skills');
    if (fs.existsSync(skillsDir)) {
      ok(`.${ide}/skills (${fs.readdirSync(skillsDir).length} 个链接)`);
    } else {
      warn(`.${ide}/skills 不存在`);
    }
  }

  if (fs.existsSync(path.join(targetDir, 'openspec'))) {
    ok('openspec/ 存在');
  } else {
    info('openspec/ 不存在（默认完整安装会生成；兼容 L1/L2 可无）');
  }
  const hasProtocolCommandEntry = ALL_IDES.some((ide) => (
    fs.existsSync(path.join(targetDir, `.${ide}`, 'commands', 'spec-start.md')) ||
    fs.existsSync(path.join(targetDir, `.${ide}`, 'commands', 'spec-continue.md')) ||
    fs.existsSync(path.join(targetDir, `.${ide}`, 'commands', 'spec-update.md')) ||
    fs.existsSync(path.join(targetDir, `.${ide}`, 'commands', 'spec-orchestrate.md'))
  ));
  const requiresProtocolAssets = fs.existsSync(path.join(targetDir, 'openspec')) || hasProtocolCommandEntry;
  if (requiresProtocolAssets) {
    const missingProtocolAssets = [];
    if (!fs.existsSync(path.join(agentsDir, 'roles'))) missingProtocolAssets.push('.agents/roles');
    if (!fs.existsSync(path.join(agentsDir, 'flows'))) missingProtocolAssets.push('.agents/flows');
    if (!fs.existsSync(path.join(agentsDir, 'orchestration'))) missingProtocolAssets.push('.agents/orchestration');
    if (missingProtocolAssets.length > 0) {
      warn(`检测到 OpenSpec 或协议命令入口，但缺少 ${missingProtocolAssets.join('、')}；建议运行: npx @engineered/ai-spec-auto@latest update .`);
    }
  }
  const staleCursorProtocolCommands = collectStaleCursorProtocolCommands(targetDir);
  if (staleCursorProtocolCommands.length > 0) {
    warn(`检测到 Cursor 协议命令模板可能过旧：${staleCursorProtocolCommands.join('、')}；建议运行: npx @engineered/ai-spec-auto@latest update . 或重新执行 sync`);
  }
  printTools(detectInstalledLevel(targetDir), hasInstalledUiproData(targetDir) ? 'yes' : 'no');
  console.log('');
  if (hasIssue) {
    err('存在问题，建议运行: npx @engineered/ai-spec-auto@latest init .');
    return 1;
  }
  ok('全部检查通过');
  return 0;
}

function uninstallPackageDeps(targetDir, packages) {
  const pkgManager = detectPkgManager(targetDir);
  if (!pkgManager) return;
  runCommand(pkgManager, ['uninstall', ...packages], { cwd: targetDir, stdio: 'ignore' });
}

async function handleUninstall(options) {
  const targetDir = path.resolve(options.target);
  const sourceDir = getSourceDir();
  const installStatePath = getInstallStatePath(targetDir);
  const hasInstallState = fs.existsSync(installStatePath);
  const installState = hasInstallState ? readInstallState(targetDir) : normalizeInstallState(null);
  warn(`将移除 ${targetDir} 下的规范库文件`);
  console.log('  包括: .agents/、IDE 链接、命令模板、.ai-spec/ 运行态，以及可证明由本工具创建的共享配置/依赖');
  console.log('');
  if (!options.force && isInteractive()) {
    const goOn = await confirm('确认？', false);
    if (!goOn) {
      info('已取消');
      return 0;
    }
  }
  const managedPaths = hasInstallState ? installState.managed_paths : listLegacyManagedPaths(targetDir, sourceDir);
  removeManagedPaths(targetDir, managedPaths);
  removeManagedAiSpecRuntime(targetDir);
  removePath(path.join(targetDir, '.ai-spec', 'manifest.json'));
  removePath(path.join(targetDir, '.ai-spec', 'lock.json'));
  removePath(path.join(targetDir, '.ai-spec', 'sources.json'));
  removePath(installStatePath);

  if (hasInstallState) {
    removeManagedPaths(targetDir, installState.created_config_files);
  }

  const pkgPath = path.join(targetDir, 'package.json');
  if (fs.existsSync(pkgPath)) {
    const pkg = readJson(pkgPath, 'package.json');
    if (hasInstallState && installState.package_json.prepare_script && pkg.scripts?.prepare === installState.package_json.prepare_script) {
      delete pkg.scripts.prepare;
      if (Object.keys(pkg.scripts).length === 0) delete pkg.scripts;
      writeJson(pkgPath, pkg);
    }
  }
  if (hasInstallState && installState.added_dev_dependencies.length > 0) {
    uninstallPackageDeps(targetDir, installState.added_dev_dependencies);
  }
  const huskyDir = path.join(targetDir, '.husky');
  if (fs.existsSync(huskyDir) && walkFiles(huskyDir).length === 0) {
    removePath(huskyDir);
  }
  cleanupEmptyIdeDirs(targetDir);
  upsertManagedAgentsBlock(targetDir, false);
  const aiSpecDir = path.join(targetDir, '.ai-spec');
  if (fs.existsSync(aiSpecDir)) {
    removePath(aiSpecDir);
  }
  ok('卸载完成');
  return 0;
}

function printUsage() {
  console.log(`${color('ai-spec-auto', 'bold')} 安装工具\n`);
  console.log('推荐入口：');
  console.log('  npx @engineered/ai-spec-auto@latest init .');
  console.log('  npx @engineered/ai-spec-auto@latest init . --manifest <file-or-url>');
  console.log('  npx @engineered/ai-spec-auto@latest update .');
  console.log('  npx @engineered/ai-spec-auto@latest sync .');
  console.log('  npx @engineered/ai-spec-auto@latest check .');
  console.log('');
  console.log('说明：');
  console.log('  - 默认安装为完整安装（规范 + IDE 适配 + OpenSpec）');
  console.log('  - L1/L2/L3 仅保留为兼容参数，不再作为主路径概念');
  console.log('  - 公共 npm：npx @engineered/ai-spec-auto@latest <command>；内网 @ex 包见 README 折叠说明');
  console.log('');
  console.log('命令：');
  console.log('  init [dir]        首次安装到目标项目（支持 --manifest 首装即同步）');
  console.log('  update [dir]      更新规范，支持细粒度模块选择');
  console.log('  sync [dir]        按 manifest / profile 同步规范资产');
  console.log('  check [dir]       检查安装状态');
  console.log('  uninstall [dir]   卸载规范库');
  console.log('');
  console.log('常用选项：');
  console.log('  --profile <name>           技术栈（vue | react | nestjs | springboot | node-tooling）');
  console.log('  --profiles <a,b,...>       多技术栈（逗号分隔，如 vue,nestjs）');
  console.log('  --level <L1|L2|L3>         兼容参数，默认仍等价完整安装');
  console.log('  --standard-rules           使用标准规则集（manifest 模式下表示沿用安装模板）');
  console.log('  --custom-rules             启用自定义规则模式（manifest 模式下表示 /project-init 刷新偏好）');
  console.log('  --package <path>           Monorepo 下指定子包');
  console.log('  --workspace-root           Monorepo 下显式在根目录安装');
  console.log('  --uipro / --no-uipro       安装或跳过 UI UX Pro Max');
  console.log('  --superpowers / --no-superpowers  启用或关闭 superpowers 平台增强');
  console.log('  --visual-bridge / --no-visual-bridge  启用或关闭 visual 平台桥接配置');
  console.log('  --refresh-superpowers      update 时仅刷新 superpowers 绑定状态');
  console.log('  --lint / --no-lint         安装或跳过 lint/format');
  console.log('  --husky / --no-husky       安装或跳过提交校验');
  console.log('  --manifest <path|url>      init/sync 时指定安装清单');
  console.log('  --hub-origin <origin>      本地 manifest 缺失资产时指定 Hub 补充来源');
  console.log('  --no-hub-fetch             禁止通过 Hub 补充下载缺失资产');
  console.log('  --skip-skills              update 时跳过 skills');
  console.log('  --force-update-rules       update 时强制覆盖已有规则（默认保留）');
  console.log('  --no-force-update-rules    update 时保留已有规则（默认行为）');
  console.log('  --skip-configs             update 时跳过 configs');
  console.log('  --skip-commands            update 时仅补新增命令模板');
  console.log('  --skip-ide-links           update 时跳过 IDE 链接');
  console.log('  --skip-openspec            update 时跳过 OpenSpec 更新');
  console.log('  --skip-uipro               update 时跳过 UI UX Pro Max 更新');
  console.log('  --dry-run                  sync 时仅预览，不落盘');
  console.log('');
}

async function main(argv) {
  try {
    if (argv[0] === 'sync') {
      const sync = require('./sync');
      return await sync.main(argv.slice(1));
    }

    const options = parseArgs(argv);
    switch (options.command) {
      case 'help':
        printUsage();
        return 0;
      case 'init':
        return await handleInit(options);
      case 'update':
        return await handleUpdate(options);
      case 'check':
        return handleCheck(options);
      case 'uninstall':
        return await handleUninstall(options);
      default:
        printUsage();
        return 1;
    }
  } catch (error) {
    err(error.message);
    return 1;
  }
}

module.exports = {
  main,
  __test__: {
    CUSTOMIZABLE_RULES,
    DEFAULT_CUSTOM_RULE_SELECTION,
    normalizeCustomRulesSelection,
    selectFromList,
    selectCustomRuleList,
    selectMultipleFromList,
    selectUpdateModules,
    selectUpdateRuleMode,
    selectUpdateRuleFiles,
    listSelectableUpdateRules,
    selectBootstrapChoices,
    buildDevDependencyInstallArgs,
    copyAgents,
  },
};

if (require.main === module) {
  main(process.argv.slice(2)).then((code) => process.exit(code));
}
