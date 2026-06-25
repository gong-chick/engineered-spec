const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const runtimeLauncher = require('../../bin/runtime-launcher');
const runtimeBootstrap = require('../../bin/runtime-bootstrap');

function createHome(prefix = 'ai-spec-launcher-home-') {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeExecutable(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
  fs.chmodSync(filePath, 0o755);
}

function main() {
  const homeDir = createHome();
  const env = {
    ...process.env,
    HOME: homeDir,
    AI_SPEC_HOME: path.join(homeDir, '.ai-spec-auto'),
    ENGINEERED_SPEC_FORCE_LOCAL_CLI: '1',
    AI_SPEC_DISABLE_RUNTIME_REFRESH: '1',
  };
  const repoRoot = path.join(__dirname, '..', '..');
  const launcherPaths = runtimeLauncher.ensureGlobalLauncher({
    pkgRoot: repoRoot,
    env,
    now: Date.parse('2026-04-20T12:00:00.000Z'),
  });

  assert.ok(fs.existsSync(launcherPaths.launcherFile));
  assert.ok(fs.existsSync(launcherPaths.launcherBootstrapFile));
  const embeddedEntry = path.join(homeDir, '.ai-spec-auto', 'runtime', 'embedded', 'bin', process.platform === 'win32' ? 'ai-spec-auto.cmd' : 'ai-spec-auto');
  assert.ok(fs.existsSync(embeddedEntry));
  assert.ok(fs.existsSync(path.join(homeDir, '.ai-spec-auto', 'runtime', 'embedded', 'package', 'bin', 'visual-bridge.js')));
  assert.ok(fs.existsSync(path.join(homeDir, '.ai-spec-auto', 'runtime', 'embedded', 'package', 'bin', 'visual-bridge-config.js')));

  const bootstrapConfig = runtimeBootstrap.__test__.readBootstrapConfig(env);
  assert.strictEqual(bootstrapConfig.install_spec, repoRoot);

  const runtimePaths = runtimeBootstrap.__test__.getRuntimePaths(env);
  const releaseId = 'release_launcher_001';
  const binName = process.platform === 'win32' ? 'ai-spec-auto.cmd' : 'ai-spec-auto';
  const entryPath = path.join(runtimePaths.releasesDir, releaseId, 'node_modules', '.bin', binName);
  const markerPath = path.join(homeDir, 'launcher-marker.txt');
  writeExecutable(entryPath, `#!/bin/sh\nprintf '%s\\n' "$*" > "${markerPath}"\nexit 0\n`);
  runtimeBootstrap.__test__.writeRuntimeState(env, {
    active_release: releaseId,
    last_checked_at: '2026-04-20T11:30:00.000Z',
    last_successful_refresh_at: '2026-04-20T11:30:00.000Z',
    last_error: '',
  });

  const result = spawnSync('node', [launcherPaths.launcherFile, 'protocol-status', '--json'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
  assert.strictEqual(result.status, 0, result.stderr);
  assert.strictEqual(fs.readFileSync(markerPath, 'utf8').trim(), 'protocol-status --json');

  fs.rmSync(path.join(homeDir, '.ai-spec-auto', 'runtime', 'releases', releaseId), { recursive: true, force: true });
  writeExecutable(embeddedEntry, `#!/bin/sh\nprintf '%s\\n' "$*" > "${markerPath}"\nexit 0\n`);
  const fallbackResult = spawnSync('node', [launcherPaths.launcherFile, 'protocol-step', '--json'], {
    cwd: repoRoot,
    env: {
      ...env,
      AI_SPEC_DISABLE_RUNTIME_REFRESH: '1',
    },
    encoding: 'utf8',
  });
  assert.strictEqual(fallbackResult.status, 0, fallbackResult.stderr);
  assert.strictEqual(fs.readFileSync(markerPath, 'utf8').trim(), 'protocol-step --json');

  writeExecutable(entryPath, `#!/bin/sh\nprintf '%s\\n' "$*" > "${markerPath}"\nexit 0\n`);
  runtimeBootstrap.__test__.writeRuntimeState(env, {
    active_release: releaseId,
    last_checked_at: '2026-04-20T11:30:00.000Z',
    last_successful_refresh_at: '2026-04-20T11:30:00.000Z',
    last_error: '',
  });
  const visualBridgeResult = spawnSync('node', [launcherPaths.launcherFile, 'visual-bridge', 'push-current', '--json'], {
    cwd: repoRoot,
    env,
    encoding: 'utf8',
  });
  assert.strictEqual(visualBridgeResult.status, 0, visualBridgeResult.stderr);
  assert.strictEqual(fs.readFileSync(markerPath, 'utf8').trim(), 'visual-bridge push-current --json');

  console.log('runtime launcher test passed: global launcher files and runtime forwarding all work');
}

main();
