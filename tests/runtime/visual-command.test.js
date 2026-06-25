const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

async function main() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-visual-command-'));
  const cliFile = path.join(__dirname, '..', '..', 'bin', 'cli.js');

  const result = spawnSync(
    process.execPath,
    [
      cliFile,
      'visual',
      '--target',
      targetDir,
      'init',
      '--server',
      'http://127.0.0.1:3000',
      '--workspace-id',
      'ws-demo',
      '--agent-id',
      'collector_ws-demo',
      '--connect-token',
      'token-demo-123',
      '--yes',
    ],
    {
      encoding: 'utf8',
    },
  );

  assert.strictEqual(result.status, 0, result.stderr || result.stdout);

  const bridge = readJson(path.join(targetDir, '.ai-spec', 'visual-bridge.json'));
  assert.strictEqual(bridge.server_url, 'http://127.0.0.1:3000');
  assert.strictEqual(bridge.workspace_id, 'ws-demo');
  assert.strictEqual(bridge.agent_id, 'collector_ws-demo');
  assert.strictEqual(bridge.connect_token, 'token-demo-123');
  assert.strictEqual(bridge.enabled, true);

  console.log('visual-command test passed: init accepts agent-id/connect-token overrides');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
