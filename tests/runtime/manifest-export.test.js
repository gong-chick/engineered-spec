const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function runCli(args, options = {}) {
  return spawnSync(process.execPath, [path.join(__dirname, '../../bin/cli.js'), ...args], {
    cwd: options.cwd || path.join(__dirname, '../..'),
    env: {
      ...process.env,
      ENGINEERED_SPEC_LOCAL: path.join(__dirname, '../..'),
      AI_SPEC_SKIP_LAUNCHER_SYNC: '1',
    },
    encoding: 'utf8',
  });
}

function main() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-manifest-export-'));
  const manifestPath = path.join(targetDir, 'manifest.json');
  writeJson(manifestPath, {
    profile: 'vue',
    ides: ['cursor'],
    manifest_type: 'hub-install',
    scenario_packages: [],
    roles: [],
    skills: [],
    rules: [],
    visual_bridge: {
      enabled: true,
      server_url: 'http://127.0.0.1:3200',
      workspace_id: 'workspace-demo',
      agent_id: 'visual-demo',
      push_on_runtime_state: true,
      push_on_sync: false,
      fail_open: true,
    },
  });

  const result = runCli(['manifest-export', targetDir, '--manifest', manifestPath]);
  assert.strictEqual(result.status, 0, result.stderr);

  const exported = JSON.parse(result.stdout);
  assert.strictEqual(exported.profile, 'vue');
  assert.strictEqual(exported.visual_bridge.enabled, true);
  assert.strictEqual(exported.visual_bridge.workspace_id, 'workspace-demo');
  assert.strictEqual(exported.visual_bridge.server_url, 'http://127.0.0.1:3200');

  const outPath = path.join(targetDir, 'exported-manifest.json');
  const outResult = runCli([
    'manifest-export',
    targetDir,
    '--manifest',
    manifestPath,
    '--out',
    outPath,
  ]);
  assert.strictEqual(outResult.status, 0, outResult.stderr);
  assert.ok(fs.existsSync(outPath));
  const persisted = JSON.parse(fs.readFileSync(outPath, 'utf8'));
  assert.strictEqual(persisted.visual_bridge.fail_open, true);

  console.log('manifest-export test passed: normalized manifest keeps visual_bridge and can be written to disk');
}

main();
