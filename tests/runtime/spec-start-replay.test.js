const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '../..');
const cliPath = path.join(repoRoot, 'bin', 'cli.js');
const fixturesDir = path.join(__dirname, 'fixtures');

function writeProjectFile(targetDir, relPath, content) {
  const filePath = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function writeJsonFile(targetDir, relPath, value) {
  writeProjectFile(targetDir, relPath, JSON.stringify(value, null, 2));
}

function createWorkspace() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-spec-start-replay-'));
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'spec-start-replay',
    scripts: {
      build: 'node -e "process.exit(0)"',
      lint: 'node -e "process.exit(0)"',
      test: 'node -e "process.exit(0)"',
    },
    dependencies: {
      vue: '^3.5.0',
      'vue-router': '^4.4.0',
      pinia: '^3.0.0',
      vite: '^6.0.0',
    },
    devDependencies: {
      typescript: '^5.0.0',
    },
  }, null, 2));
  writeProjectFile(targetDir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0');
  writeProjectFile(targetDir, 'src/router/index.ts', 'export const router = {};');
  writeProjectFile(targetDir, 'src/router/modules/demo.ts', 'export default [];');
  writeProjectFile(targetDir, 'src/views/demo/index.vue', '<template><div /></template>');
  writeProjectFile(targetDir, 'src/api/order.ts', 'export function getOrderListApi() {}');
  writeProjectFile(targetDir, 'src/api/types/order.ts', 'export interface Order {}');
  writeProjectFile(targetDir, 'src/mock/order.ts', 'export const orderMock = [];');
  writeProjectFile(targetDir, 'src/store/modules/demo/index.ts', 'export const useDemoStore = () => ({})');
  writeProjectFile(targetDir, 'src/styles/variables.scss', ':root {}');
  writeProjectFile(targetDir, 'context/PROJECT.md', '# PROJECT');
  writeJsonFile(targetDir, '.ai-spec/superpowers.json', {
    schema_version: 1,
    enabled: true,
    mode: 'host-enhanced',
    bindings: {
      cursor: { enabled: true, entry_mode: 'project-minimal' },
      claude: { enabled: true, entry_mode: 'host-enhanced' },
      codex: { enabled: true, entry_mode: 'agents-skill-wrapper' },
    },
    host: {
      capabilities: {
        cursor: false,
        claude: true,
        codex: true,
      },
    },
    allowed_roles: ['requirement-analyst', 'frontend-implementer', 'code-guardian'],
    fallback_strategy: 'graceful-degrade',
    last_fallback_reason: null,
    cli_version: '2.0.0',
  });
  return targetDir;
}

function runCli(targetDir, args, envOverrides = {}) {
  const homeDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-spec-start-home-'));
  return spawnSync(process.execPath, [cliPath, ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      HOME: homeDir,
      AI_SPEC_HOME: path.join(homeDir, '.ai-spec-auto'),
      ENGINEERED_SPEC_LOCAL: repoRoot,
      ENGINEERED_SPEC_FORCE_LOCAL_CLI: '1',
      AI_SPEC_SKIP_LAUNCHER_SYNC: '1',
      AI_SPEC_SKIP_RUNTIME_REFRESH: '1',
      ...envOverrides,
    },
  });
}

function copyFixture(targetDir, fixtureName, inboxName) {
  const inboxDir = path.join(targetDir, '.ai-spec', 'internal', 'tmp');
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.copyFileSync(path.join(fixturesDir, fixtureName), path.join(inboxDir, inboxName));
}

function main() {
  const targetDir = createWorkspace();

  const startResult = runCli(targetDir, [
    'protocol-step',
    '--target',
    targetDir,
    '--user-input',
    '新增一个订单详情页，接真实接口并补状态流转说明',
    '--json',
  ]);
  assert.strictEqual(startResult.status, 0, startResult.stderr);
  const startPayload = JSON.parse(startResult.stdout);
  assert.strictEqual(startPayload.turn.command, '/spec-start');
  assert.strictEqual(startPayload.turn.actor.id, 'task-orchestrator');
  assert.strictEqual(startPayload.turn.guidance.superpowers_contract.mode, 'host-enhanced');
  assert.ok(startPayload.turn.writes.some((item) => item.rel_path === '.ai-spec/internal/tmp/task-orchestrator-turn.json'));

  copyFixture(targetDir, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');

  const advanceResult = runCli(targetDir, [
    'protocol-advance',
    '--target',
    targetDir,
    '--json',
  ]);
  assert.strictEqual(advanceResult.status, 0, advanceResult.stderr);
  const advancePayload = JSON.parse(advanceResult.stdout);
  assert.strictEqual(advancePayload.turn.actor.id, 'requirement-analyst');
  assert.strictEqual(advancePayload.turn.guidance.superpowers_contract.mode, 'host-enhanced');
  assert.deepStrictEqual(
    advancePayload.turn.guidance.role_skill_contract.primary_skills.slice(0, 3),
    ['using-superpowers', 'create-proposal', 'design-analysis'],
  );
  assert.ok(advancePayload.turn.guidance.superpowers_contract.host_enhanced_hints.includes('using-superpowers'));
  assert.deepStrictEqual(
    advancePayload.turn.guidance.superpowers_contract.recommended_sequence,
    ['using-superpowers', 'brainstorming', 'plan', 'create-proposal'],
  );
  assert.ok(advancePayload.turn.guidance.superpowers_contract.user_prompt.includes('using-superpowers'));
  assert.ok(advancePayload.turn.announcements.enter.includes('using-superpowers'));

  console.log('spec-start replay test passed: CLI path keeps using-superpowers in requirement analysis');
}

main();
