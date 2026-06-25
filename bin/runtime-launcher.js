const fs = require('fs');
const path = require('path');

const runtimeBootstrap = require('./runtime-bootstrap');
const runtimeEmbedded = require('./runtime-embedded');

function getLauncherPaths(env = process.env) {
  const { aiSpecHome } = runtimeBootstrap.__test__.getRuntimePaths(env);
  return {
    aiSpecHome,
    binDir: path.join(aiSpecHome, 'bin'),
    libDir: path.join(aiSpecHome, 'lib'),
    launcherFile: path.join(aiSpecHome, 'bin', 'ai-spec-auto'),
    launcherCmdFile: path.join(aiSpecHome, 'bin', 'ai-spec-auto.cmd'),
    launcherBootstrapFile: path.join(aiSpecHome, 'lib', 'runtime-bootstrap.js'),
  };
}

function renderLauncherScript() {
  return `#!/usr/bin/env node
const path = require('path');
const runtimeBootstrap = require(path.join(__dirname, '..', 'lib', 'runtime-bootstrap.js'));

(async () => {
  try {
    const result = await runtimeBootstrap.maybeHandOffToRuntime({
      pkgRoot: path.join(__dirname, '..'),
      args: process.argv.slice(2),
      env: process.env,
      cwd: process.cwd(),
      stdio: 'inherit',
      manageAllCommands: true,
    });
    if (result.handedOff) {
      process.exit(result.status);
    }
    throw new Error('未找到可用的 ai-spec-auto runtime，请先检查用户级缓存与 registry 配置。');
  } catch (error) {
    if (error && error.message) {
      console.error(error.message);
    }
    process.exit(error && Number.isInteger(error.status) ? error.status : 1);
  }
})();
`;
}

function renderLauncherCmd() {
  return `@echo off
node "%~dp0ai-spec-auto" %*
`;
}

function ensureExecutable(filePath) {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch (_error) {
    // ignore on unsupported platforms
  }
}

function ensureGlobalLauncher({
  pkgRoot,
  env = process.env,
  now = Date.now(),
} = {}) {
  const launcherPaths = getLauncherPaths(env);
  fs.mkdirSync(launcherPaths.binDir, { recursive: true });
  fs.mkdirSync(launcherPaths.libDir, { recursive: true });

  const sourceBootstrap = path.join(pkgRoot, 'bin', 'runtime-bootstrap.js');
  fs.copyFileSync(sourceBootstrap, launcherPaths.launcherBootstrapFile);
  const sourceFallback = path.join(pkgRoot, 'bin', 'runtime-fallback.js');
  if (fs.existsSync(sourceFallback)) {
    fs.copyFileSync(sourceFallback, path.join(launcherPaths.libDir, 'runtime-fallback.js'));
  }
  const sourceEmbedded = path.join(pkgRoot, 'bin', 'runtime-embedded.js');
  if (fs.existsSync(sourceEmbedded)) {
    fs.copyFileSync(sourceEmbedded, path.join(launcherPaths.libDir, 'runtime-embedded.js'));
  }
  fs.writeFileSync(launcherPaths.launcherFile, renderLauncherScript(), 'utf8');
  ensureExecutable(launcherPaths.launcherFile);
  fs.writeFileSync(launcherPaths.launcherCmdFile, renderLauncherCmd(), 'utf8');
  runtimeEmbedded.syncEmbeddedRuntime({
    pkgRoot,
    env,
  });

  const packageJsonPath = path.join(pkgRoot, 'package.json');
  const packageJson = fs.existsSync(packageJsonPath)
    ? JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'))
    : {};
  const installSpec = env.ENGINEERED_SPEC_FORCE_LOCAL_CLI
    ? pkgRoot
    : env.AI_SPEC_RUNTIME_INSTALL_SPEC || (packageJson.name ? `${packageJson.name}@latest` : pkgRoot);
  const registry = env.AI_SPEC_RUNTIME_REGISTRY || packageJson.publishConfig?.registry || '';
  const packageName = packageJson.name || '';

  runtimeBootstrap.__test__.writeBootstrapConfig(env, {
    install_spec: installSpec,
    registry,
    package_name: packageName,
    updated_at: new Date(now).toISOString(),
  });

  return launcherPaths;
}

module.exports = {
  ensureGlobalLauncher,
  __test__: {
    getLauncherPaths,
    renderLauncherScript,
    renderLauncherCmd,
  },
};
