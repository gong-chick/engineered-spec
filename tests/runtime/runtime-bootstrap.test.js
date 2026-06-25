const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const runtimeBootstrap = require('../../bin/runtime-bootstrap');

const {
  DEFAULT_RUNTIME_REFRESH_TTL_MINUTES,
  getRuntimePaths,
  writeRuntimeState,
  readRuntimeState,
  shouldRefreshRuntime,
  resolveInstallSpec,
  buildInstallArgs,
  refreshRuntime,
  writeBootstrapConfig,
} = runtimeBootstrap.__test__;

function createHome(prefix = 'ai-spec-runtime-home-') {
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
  };
  const now = Date.parse('2026-04-20T10:00:00.000Z');

  assert.strictEqual(DEFAULT_RUNTIME_REFRESH_TTL_MINUTES, 180);
  assert.strictEqual(shouldRefreshRuntime(null, env, now), true);

  writeRuntimeState(env, {
    active_release: 'release_keep',
    last_checked_at: '2026-04-20T08:30:01.000Z',
    last_successful_refresh_at: '2026-04-20T08:30:01.000Z',
    last_error: '',
  });
  assert.strictEqual(shouldRefreshRuntime(readRuntimeState(env), env, now), false);

  writeRuntimeState(env, {
    active_release: 'release_stale',
    last_checked_at: '2026-04-20T06:59:59.000Z',
    last_successful_refresh_at: '2026-04-20T06:59:59.000Z',
    last_error: '',
  });
  assert.strictEqual(shouldRefreshRuntime(readRuntimeState(env), env, now), true);

  const pkgRoot = path.join(__dirname, '..', '..');
  assert.strictEqual(resolveInstallSpec(pkgRoot, {
    ...env,
    ENGINEERED_SPEC_FORCE_LOCAL_CLI: '1',
  }), pkgRoot);
  assert.ok(buildInstallArgs('pnpm', pkgRoot, {
    ...env,
    AI_SPEC_RUNTIME_INSTALL_SPEC: '@engineered/ai-spec-auto@latest',
    AI_SPEC_RUNTIME_REGISTRY: 'https://registry.npmjs.org/',
  }).includes('@engineered/ai-spec-auto@latest'));

  const refreshed = refreshRuntime({
    pkgRoot,
    env: {
      ...env,
      AI_SPEC_RUNTIME_INSTALL_SPEC: 'mock-spec',
    },
    now,
    installReleaseFn({ env: installEnv }) {
      const paths = getRuntimePaths(installEnv);
      const releaseId = 'release_mock_001';
      const entryPath = path.join(paths.releasesDir, releaseId, 'node_modules', '.bin', process.platform === 'win32' ? 'ai-spec-auto.cmd' : 'ai-spec-auto');
      writeExecutable(entryPath, '#!/bin/sh\nexit 0\n');
      return { releaseId, entryPath };
    },
  });
  assert.strictEqual(refreshed.refreshed, true);
  assert.strictEqual(refreshed.state.active_release, 'release_mock_001');
  assert.strictEqual(refreshed.state.last_known_good_release, 'release_mock_001');
  assert.strictEqual(refreshed.state.last_error, '');

  const handoffCalls = [];
  const handoffResult = runtimeBootstrap.maybeHandOffToRuntime({
    pkgRoot,
    args: ['protocol-step', '--target', '.', '--json'],
    env,
    now,
    spawnFn(command, commandArgs, options) {
      handoffCalls.push({
        command,
        commandArgs,
        options,
      });
      return { status: 0 };
    },
  });
  return Promise.resolve(handoffResult).then((result) => {
    assert.strictEqual(result.handedOff, true);
    assert.strictEqual(result.status, 0);
    assert.strictEqual(handoffCalls.length, 1);
    assert.ok(handoffCalls[0].command.includes(path.join('release_mock_001', 'node_modules')));
    assert.strictEqual(handoffCalls[0].options.env.AI_SPEC_SKIP_RUNTIME_REFRESH, '1');

    const forcedLocalCalls = [];
    return runtimeBootstrap.maybeHandOffToRuntime({
      pkgRoot,
      args: ['protocol-step', '--target', '.', '--json'],
      env: {
        ...env,
        ENGINEERED_SPEC_FORCE_LOCAL_PROTOCOL: '1',
      },
      now,
      spawnFn(command, commandArgs, options) {
        forcedLocalCalls.push({ command, commandArgs, options });
        throw new Error('should not spawn when local protocol is forced');
      },
    }).then((forcedResult) => {
      assert.strictEqual(forcedResult.handedOff, false);
      assert.strictEqual(forcedLocalCalls.length, 0);
    });
  }).then(() => {
    return runtimeBootstrap.maybeHandOffToRuntime({
      pkgRoot,
      args: ['init', '.'],
      env: {
        ...env,
        ENGINEERED_SPEC_FORCE_LOCAL_PROTOCOL: '1',
      },
      now,
      spawnFn() {
        throw new Error('should not spawn for install commands');
      },
    });
  }).then((result) => {
    assert.strictEqual(result.handedOff, false);

    return runtimeBootstrap.maybeHandOffToRuntime({
      pkgRoot,
      args: ['init', '.'],
      env,
      now,
      spawnFn() {
        throw new Error('should not spawn for install commands');
      },
    });
  }).then((result) => {
    assert.strictEqual(result.handedOff, false);

    const fallbackEnv = {
      ...env,
      AI_SPEC_DISABLE_RUNTIME_REFRESH: '1',
    };
    const fallbackPaths = getRuntimePaths(fallbackEnv);
    const lastKnownGoodEntry = path.join(fallbackPaths.releasesDir, 'release_lkg_001', 'node_modules', '.bin', process.platform === 'win32' ? 'ai-spec-auto.cmd' : 'ai-spec-auto');
    writeExecutable(lastKnownGoodEntry, '#!/bin/sh\nexit 0\n');
    writeRuntimeState(fallbackEnv, {
      active_release: '',
      last_known_good_release: 'release_lkg_001',
      last_checked_at: '2026-04-20T09:59:59.000Z',
      last_successful_refresh_at: '2026-04-20T09:00:00.000Z',
      last_error: '',
    });

    const disabledCalls = [];
    return runtimeBootstrap.maybeHandOffToRuntime({
      pkgRoot,
      args: ['protocol-status', '--json'],
      env: fallbackEnv,
      now,
      spawnFn(command, commandArgs, options) {
        disabledCalls.push({ command, commandArgs, options });
        return { status: 0 };
      },
    }).then((disabledResult) => {
      assert.strictEqual(disabledResult.handedOff, true);
      assert.strictEqual(disabledCalls.length, 1);
      assert.ok(disabledCalls[0].command.includes(path.join('release_lkg_001', 'node_modules')));

      const failedRefreshEnv = {
        ...env,
        AI_SPEC_RUNTIME_INSTALL_SPEC: 'mock-spec',
      };
      writeRuntimeState(failedRefreshEnv, {
        active_release: '',
        last_known_good_release: 'release_lkg_001',
        last_checked_at: '2026-04-20T06:00:00.000Z',
        last_successful_refresh_at: '2026-04-20T06:00:00.000Z',
        last_error: '',
      });
      const failedCalls = [];
      return runtimeBootstrap.maybeHandOffToRuntime({
        pkgRoot,
        args: ['protocol-status', '--json'],
        env: failedRefreshEnv,
        now,
        spawnFn(command, commandArgs, options) {
          failedCalls.push({ command, commandArgs, options });
          if (command === 'pnpm' || command === 'npm') {
            return { status: 1, stderr: 'mock refresh failure' };
          }
          return { status: 0 };
        },
      }).then((failedResult) => {
        assert.strictEqual(failedResult.handedOff, true);
        assert.ok(failedCalls.some((item) => item.command.includes(path.join('release_lkg_001', 'node_modules'))));

        const embeddedEnv = {
          ...env,
          AI_SPEC_DISABLE_RUNTIME_REFRESH: '1',
        };
        writeBootstrapConfig(embeddedEnv, {
          install_spec: pkgRoot,
          registry: '',
          package_name: '@engineered/ai-spec-auto',
          updated_at: '2026-04-20T10:00:00.000Z',
        });
        const embeddedEntry = path.join(embeddedEnv.AI_SPEC_HOME, 'runtime', 'embedded', 'bin', process.platform === 'win32' ? 'ai-spec-auto.cmd' : 'ai-spec-auto');
        writeExecutable(embeddedEntry, '#!/bin/sh\nexit 0\n');
        writeRuntimeState(embeddedEnv, {
          active_release: '',
          last_known_good_release: '',
          last_checked_at: '',
          last_successful_refresh_at: '',
          last_error: '',
        });
        const embeddedCalls = [];
        return runtimeBootstrap.maybeHandOffToRuntime({
          pkgRoot,
          args: ['protocol-status', '--json'],
          env: embeddedEnv,
          now,
          spawnFn(command, commandArgs, options) {
            embeddedCalls.push({ command, commandArgs, options });
            return { status: 0 };
          },
        }).then((embeddedResult) => {
          assert.strictEqual(embeddedResult.handedOff, true);
          assert.ok(embeddedCalls.some((item) => item.command.includes(path.join('runtime', 'embedded', 'bin'))));
        });
      });
    });
  }).then((result) => {
    console.log('runtime bootstrap test passed: ttl=180, refresh state, and protocol handoff all work');
  });
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
