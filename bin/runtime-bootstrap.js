const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');
const runtimeFallback = require('./runtime-fallback');
const runtimeEmbedded = require('./runtime-embedded');

const PROTOCOL_COMMANDS = new Set([
  'protocol-step',
  'protocol-update',
  'protocol-advance',
  'protocol-stop',
  'protocol-status',
]);
const DEFAULT_RUNTIME_REFRESH_TTL_MINUTES = 180;
const STATE_SCHEMA_VERSION = 1;
const BOOTSTRAP_CONFIG_SCHEMA_VERSION = 1;

function resolveHomeDir(env = process.env) {
  return env.HOME || env.USERPROFILE || os.homedir();
}

function resolveAiSpecHome(env = process.env) {
  return env.AI_SPEC_HOME || path.join(resolveHomeDir(env), '.ai-spec-auto');
}

function getRuntimePaths(env = process.env) {
  const aiSpecHome = resolveAiSpecHome(env);
  return {
    aiSpecHome,
    runtimeRoot: path.join(aiSpecHome, 'runtime'),
    releasesDir: path.join(aiSpecHome, 'runtime', 'releases'),
    stateDir: path.join(aiSpecHome, 'state'),
    stateFile: path.join(aiSpecHome, 'state', 'runtime-refresh.json'),
    lockFile: path.join(aiSpecHome, 'state', 'runtime-refresh.lock'),
    bootstrapConfigFile: path.join(aiSpecHome, 'state', 'runtime-bootstrap-config.json'),
  };
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function readJson(filePath, label) {
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

function readRuntimeState(env = process.env) {
  const { stateFile } = getRuntimePaths(env);
  if (!fs.existsSync(stateFile)) {
    return null;
  }
  return readJson(stateFile, 'runtime bootstrap state');
}

function normalizeBootstrapConfig(config) {
  const base = config && typeof config === 'object' ? config : {};
  return {
    schema_version: BOOTSTRAP_CONFIG_SCHEMA_VERSION,
    install_spec: typeof base.install_spec === 'string' ? base.install_spec : '',
    registry: typeof base.registry === 'string' ? base.registry : '',
    package_name: typeof base.package_name === 'string' ? base.package_name : '',
    updated_at: typeof base.updated_at === 'string' ? base.updated_at : '',
  };
}

function readBootstrapConfig(env = process.env) {
  const { bootstrapConfigFile } = getRuntimePaths(env);
  if (!fs.existsSync(bootstrapConfigFile)) {
    return null;
  }
  return normalizeBootstrapConfig(readJson(bootstrapConfigFile, 'runtime bootstrap config'));
}

function writeBootstrapConfig(env, config) {
  const { bootstrapConfigFile } = getRuntimePaths(env);
  const normalized = normalizeBootstrapConfig(config);
  writeJson(bootstrapConfigFile, normalized);
  return normalized;
}

function normalizeRuntimeState(state) {
  return {
    ...runtimeFallback.normalizeRuntimeState(state),
    schema_version: STATE_SCHEMA_VERSION,
  };
}

function writeRuntimeState(env, state) {
  const { stateFile } = getRuntimePaths(env);
  const normalized = normalizeRuntimeState(state);
  writeJson(stateFile, normalized);
  return normalized;
}

function getRefreshTtlMinutes(env = process.env) {
  const raw = Number(env.AI_SPEC_RUNTIME_REFRESH_TTL_MINUTES);
  if (Number.isFinite(raw) && raw > 0) {
    return raw;
  }
  return DEFAULT_RUNTIME_REFRESH_TTL_MINUTES;
}

function shouldForceLocalProtocol(command, env = process.env) {
  try {
    return env.ENGINEERED_SPEC_FORCE_LOCAL_PROTOCOL === '1' && PROTOCOL_COMMANDS.has(command);
  } catch (_error) {
    return false;
  }
}

function hasActiveRuntime(state) {
  return Boolean(state && typeof state.active_release === 'string' && state.active_release.trim());
}

function shouldRefreshRuntime(state, env = process.env, now = Date.now()) {
  const normalized = normalizeRuntimeState(state);
  if (!hasActiveRuntime(normalized)) {
    return true;
  }
  if (!normalized.last_checked_at) {
    return true;
  }
  const lastCheckedAt = Date.parse(normalized.last_checked_at);
  if (!Number.isFinite(lastCheckedAt)) {
    return true;
  }
  const ttlMs = getRefreshTtlMinutes(env) * 60 * 1000;
  return now - lastCheckedAt >= ttlMs;
}

function getBinName() {
  return process.platform === 'win32' ? 'ai-spec-auto.cmd' : 'ai-spec-auto';
}

function resolveRuntimeEntry(env = process.env, state = null) {
  const entry = runtimeFallback.resolveReleaseEntry({
    env,
    state: state || readRuntimeState(env),
    getRuntimePaths,
    getBinName,
  });
  return entry ? entry.entryPath : null;
}

function commandExists(name, spawnFn = spawnSync, env = process.env) {
  const probe = spawnFn(name, ['--version'], {
    stdio: 'ignore',
    env,
    encoding: 'utf8',
  });
  return probe && probe.status === 0;
}

function detectPkgManager(spawnFn = spawnSync, env = process.env) {
  if (commandExists('pnpm', spawnFn, env)) {
    return 'pnpm';
  }
  if (commandExists('npm', spawnFn, env)) {
    return 'npm';
  }
  return null;
}

function readSourcePackageField(pkgRoot, field) {
  const pkgPath = path.join(pkgRoot, 'package.json');
  if (!fs.existsSync(pkgPath)) {
    return null;
  }
  const pkg = readJson(pkgPath, 'runtime source package');
  if (field === 'name') {
    return pkg.name || null;
  }
  if (field === 'registry') {
    return pkg.publishConfig?.registry || null;
  }
  return null;
}

function resolveInstallSpec(pkgRoot, env = process.env) {
  if (env.AI_SPEC_RUNTIME_INSTALL_SPEC) {
    return env.AI_SPEC_RUNTIME_INSTALL_SPEC;
  }
  const bootstrapConfig = readBootstrapConfig(env);
  if (bootstrapConfig?.install_spec) {
    return bootstrapConfig.install_spec;
  }
  if (env.ENGINEERED_SPEC_FORCE_LOCAL_CLI) {
    return pkgRoot;
  }
  const packageName = readSourcePackageField(pkgRoot, 'name');
  return packageName ? `${packageName}@latest` : pkgRoot;
}

function buildInstallArgs(pkgManager, pkgRoot, env = process.env) {
  const installSpec = resolveInstallSpec(pkgRoot, env);
  const bootstrapConfig = readBootstrapConfig(env);
  const registry = env.AI_SPEC_RUNTIME_REGISTRY || bootstrapConfig?.registry || readSourcePackageField(pkgRoot, 'registry');
  const packageName = bootstrapConfig?.package_name || readSourcePackageField(pkgRoot, 'name') || '';
  const scopeName = packageName.startsWith('@') ? packageName.split('/')[0] : '';
  const args = pkgManager === 'pnpm'
    ? ['add', '-D', installSpec]
    : ['install', '-D', installSpec];
  if (registry) {
    args.push('--registry', registry);
    if (scopeName) {
      args.push(`--${scopeName}:registry=${registry}`);
    }
  }
  return args;
}

function acquireRefreshLock(lockFile) {
  ensureDir(path.dirname(lockFile));
  return fs.openSync(lockFile, 'wx');
}

function releaseRefreshLock(lockFd, lockFile) {
  if (typeof lockFd === 'number') {
    fs.closeSync(lockFd);
  }
  if (lockFile && fs.existsSync(lockFile)) {
    fs.unlinkSync(lockFile);
  }
}

function createReleaseId(now = Date.now()) {
  const stamp = new Date(now).toISOString().replace(/[-:.TZ]/g, '').slice(0, 14);
  return `release_${stamp}_${process.pid}`;
}

function installRuntimeRelease({
  pkgRoot,
  env = process.env,
  spawnFn = spawnSync,
  now = Date.now(),
}) {
  const pkgManager = detectPkgManager(spawnFn, env);
  if (!pkgManager) {
    throw new Error('未检测到可用的 npm 或 pnpm，无法刷新用户级 runtime');
  }

  const { releasesDir } = getRuntimePaths(env);
  const releaseId = createReleaseId(now);
  const releaseDir = path.join(releasesDir, releaseId);
  ensureDir(releaseDir);
  writeJson(path.join(releaseDir, 'package.json'), {
    name: 'ai-spec-auto-runtime-cache',
    private: true,
  });

  const args = buildInstallArgs(pkgManager, pkgRoot, env);
  const result = spawnFn(pkgManager, args, {
    cwd: releaseDir,
    env,
    stdio: 'pipe',
    encoding: 'utf8',
  });
  if (!result || result.status !== 0) {
    const stderr = (result && (result.stderr || result.stdout)) || '';
    throw new Error(`用户级 runtime 刷新失败：${stderr.trim() || `${pkgManager} ${args.join(' ')}`}`);
  }

  const entryPath = path.join(releaseDir, 'node_modules', '.bin', getBinName());
  if (!fs.existsSync(entryPath)) {
    throw new Error(`用户级 runtime 缺少 CLI 入口: ${entryPath}`);
  }

  return { releaseId, entryPath };
}

function refreshRuntime({
  pkgRoot,
  env = process.env,
  now = Date.now(),
  spawnFn = spawnSync,
  installReleaseFn = installRuntimeRelease,
} = {}) {
  const paths = getRuntimePaths(env);
  ensureDir(paths.releasesDir);
  ensureDir(paths.stateDir);

  const existingState = normalizeRuntimeState(readRuntimeState(env));
  if (!shouldRefreshRuntime(existingState, env, now)) {
    return { refreshed: false, state: existingState };
  }

  let lockFd = null;
  try {
    lockFd = acquireRefreshLock(paths.lockFile);
  } catch (_error) {
    const latestState = normalizeRuntimeState(readRuntimeState(env));
    return { refreshed: false, state: latestState };
  }

  try {
    const latestState = normalizeRuntimeState(readRuntimeState(env));
    if (!shouldRefreshRuntime(latestState, env, now)) {
      return { refreshed: false, state: latestState };
    }

    const installResult = installReleaseFn({
      pkgRoot,
      env,
      spawnFn,
      now,
    });
    const nextState = writeRuntimeState(env, runtimeFallback.buildSuccessfulRefreshState(
      latestState,
      installResult.releaseId,
      now,
    ));
    return { refreshed: true, state: nextState, entryPath: installResult.entryPath };
  } catch (error) {
    const failedState = writeRuntimeState(env, runtimeFallback.buildFailedRefreshState(
      existingState,
      error.message || String(error),
      now,
    ));
    return { refreshed: false, state: failedState, error };
  } finally {
    releaseRefreshLock(lockFd, paths.lockFile);
  }
}

async function maybeHandOffToRuntime({
  pkgRoot,
  args,
  env = process.env,
  cwd = process.cwd(),
  stdio = 'inherit',
  spawnFn = spawnSync,
  now = Date.now(),
  manageAllCommands = false,
} = {}) {
  const command = Array.isArray(args) && args.length > 0 ? args[0] : '';
  if (!manageAllCommands && !PROTOCOL_COMMANDS.has(command)) {
    return { handedOff: false, state: normalizeRuntimeState(readRuntimeState(env)) };
  }
  if (shouldForceLocalProtocol(command, env)) {
    return {
      handedOff: false,
      state: normalizeRuntimeState(readRuntimeState(env)),
      reason: 'force-local-protocol',
    };
  }
  if (env.AI_SPEC_SKIP_RUNTIME_REFRESH === '1') {
    return { handedOff: false, state: normalizeRuntimeState(readRuntimeState(env)) };
  }

  let refreshResult = {
    refreshed: false,
    state: normalizeRuntimeState(readRuntimeState(env)),
    error: null,
  };

  if (!runtimeFallback.shouldDisableRuntimeRefresh(env)) {
    refreshResult = refreshRuntime({
      pkgRoot,
      env,
      now,
      spawnFn,
    });
  }

  const fallbackEntry = runtimeFallback.resolveFallbackEntry({
    env,
    state: refreshResult.state,
    getRuntimePaths,
    getBinName,
    resolveEmbeddedEntry: runtimeEmbedded.resolveEmbeddedEntry,
  });
  if (!fallbackEntry) {
    return { handedOff: false, state: refreshResult.state, error: refreshResult.error || null };
  }

  const childEnv = {
    ...env,
    AI_SPEC_SKIP_RUNTIME_REFRESH: '1',
  };
  const result = spawnFn(fallbackEntry.entryPath, args, {
    cwd,
    env: childEnv,
    stdio,
    encoding: 'utf8',
  });

  if (result && result.error) {
    throw result.error;
  }

  return {
    handedOff: true,
    status: result && Number.isInteger(result.status) ? result.status : 1,
    state: refreshResult.state,
  };
}

module.exports = {
  maybeHandOffToRuntime,
  __test__: {
    PROTOCOL_COMMANDS,
    DEFAULT_RUNTIME_REFRESH_TTL_MINUTES,
    BOOTSTRAP_CONFIG_SCHEMA_VERSION,
    resolveAiSpecHome,
    getRuntimePaths,
    readRuntimeState,
    writeRuntimeState,
    readBootstrapConfig,
    writeBootstrapConfig,
    shouldRefreshRuntime,
    resolveRuntimeEntry,
    resolveInstallSpec,
    buildInstallArgs,
    refreshRuntime,
    normalizeRuntimeState,
    shouldForceLocalProtocol,
  },
};
