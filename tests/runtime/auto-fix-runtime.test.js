const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const protocolWorkflow = require('../../internal/ai-protocol-workflow');
const runner = require('../../bin/task-orchestrator-runner');

const fixturesDir = path.join(__dirname, 'fixtures');

function copyFixture(targetDir, fixtureName, inboxName) {
  const inboxDir = path.join(targetDir, '.ai-spec', 'internal', 'tmp');
  fs.mkdirSync(inboxDir, { recursive: true });
  fs.copyFileSync(path.join(fixturesDir, fixtureName), path.join(inboxDir, inboxName));
}

function writeProjectFile(targetDir, relPath, content) {
  const filePath = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function writePackageJson(targetDir, buildCommand) {
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'auto-fix-runtime',
    scripts: {
      build: buildCommand,
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
}

function createWorkspace(buildCommand = 'node -e "process.exit(1)"') {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-auto-fix-test-'));
  writePackageJson(targetDir, buildCommand);
  writeProjectFile(targetDir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0');
  writeProjectFile(targetDir, 'src/router/index.ts', 'export const router = {}');
  writeProjectFile(targetDir, 'src/router/modules/demo.ts', 'export default []');
  writeProjectFile(targetDir, 'src/views/demo/index.vue', '<template><div /></template>');
  writeProjectFile(targetDir, 'src/api/order.ts', 'export function getOrderListApi() {}');
  writeProjectFile(targetDir, 'src/api/types/order.ts', 'export interface Order {}');
  writeProjectFile(targetDir, 'src/mock/order.ts', 'export const orderMock = [];');
  writeProjectFile(targetDir, 'src/store/modules/demo/index.ts', 'export const useDemoStore = () => ({})');
  writeProjectFile(targetDir, 'src/styles/variables.scss', ':root {}');
  writeProjectFile(targetDir, 'context/PROJECT.md', '# PROJECT');
  return targetDir;
}

function advance(targetDir) {
  return runner.advanceRunner({ target: targetDir });
}

function step(targetDir, userInput = null) {
  return protocolWorkflow.advanceProtocolStep({
    target: targetDir,
    userInput,
  });
}

function readCurrentRun(targetDir) {
  return JSON.parse(fs.readFileSync(path.join(targetDir, '.ai-spec', 'current-run.json'), 'utf8'));
}

function approveGate(targetDir, gate, toRole, message) {
  writeProjectFile(targetDir, '.ai-spec/internal/tmp/current-runtime-action.json', JSON.stringify({
    schema_version: 1,
    kind: 'task-orchestrator-runtime-action',
    action: 'approve',
    gate,
    to_role: toRole,
    message,
  }, null, 2));
  return advance(targetDir);
}

function seedOpenSpecArtifacts(targetDir) {
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# 变更提案：runtime-smoke-demo',
    '',
    '## 目标',
    '- 新增一个商品组件演示页，验证 auto-fix 回环。',
    '',
    '## 范围',
    '- 页面放在 src/views，保留最小 mock 数据与组件结构。',
    '',
    '## 风险',
    '- 当前仅演示协议流，不接真实 API。',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/specs/ui/spec.md', [
    '## 新增需求',
    '',
    '### 需求：商品演示页',
    '',
    '系统必须提供一个最小商品演示页，用于 auto-fix 验证。',
    '',
    '#### 场景：查看商品演示页',
    '',
    '- **已知** 当前仅提供 mock 数据',
    '- **当** 用户进入商品演示页',
    '- **则** 页面展示本地 mock 列表且不请求真实接口',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/design.md', [
    '# 技术设计',
    '',
    '## 实现落点',
    '- 页面落在 src/views',
    '- 路由落在 src/router/modules',
    '- mock 数据落在 src/mock',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/tasks.md', [
    '# 实施任务',
    '',
    '- [ ] 创建页面与基础组件结构',
    '- [ ] 补齐路由入口与懒加载配置',
    '- [ ] 保持 mock 数据与样式变量约定',
  ].join('\n'));
}

function bootstrapToFrontend(targetDir) {
  copyFixture(targetDir, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  let report = advance(targetDir);
  assert.strictEqual(report.recorded.dispatch.role, 'requirement-analyst');
  seedOpenSpecArtifacts(targetDir);
  copyFixture(targetDir, 'current-execution-requirement-analyst.json', 'current-execution.json');
  report = advance(targetDir);
  assert.strictEqual(report.applied.pending_gate, 'before-implementation');
  report = approveGate(targetDir, 'before-implementation', 'frontend-implementer', 'implementation approved');
  assert.strictEqual(report.applied.current_role, 'frontend-implementer');
  assert.strictEqual(report.recorded.dispatch.role, 'frontend-implementer');
  return report;
}

function main() {
  const successAfterFixTarget = createWorkspace('node -e "process.exit(1)"');
  bootstrapToFrontend(successAfterFixTarget);

  copyFixture(successAfterFixTarget, 'current-execution-frontend-implementer.json', 'current-execution.json');
  let report = advance(successAfterFixTarget);
  assert.strictEqual(report.recorded.execution.role, 'frontend-implementer');
  assert.strictEqual(report.recorded.runtime_action.action, 'handoff');
  assert.strictEqual(report.applied.current_role, 'frontend-implementer');
  assert.strictEqual(report.recorded.dispatch.role, 'frontend-implementer');

  let currentRun = readCurrentRun(successAfterFixTarget);
  assert.strictEqual(currentRun.auto_fix.active, true);
  assert.strictEqual(currentRun.auto_fix.attempts, 1);
  assert.strictEqual(currentRun.auto_fix.max_attempts, 1);
  assert.strictEqual(currentRun.verification.overall_status, 'failed');
  assert.strictEqual(currentRun.auto_fix.last_failed_steps[0].name, 'build');
  assert.strictEqual(currentRun.checkpoint_count, 0);
  assert.strictEqual(currentRun.last_checkpoint, null);

  let workflow = step(successAfterFixTarget);
  assert.strictEqual(workflow.turn.actor.id, 'frontend-implementer');
  assert.ok(workflow.turn.guidance.implementation_contract.auto_fix);
  assert.strictEqual(workflow.turn.guidance.implementation_contract.auto_fix.active, true);
  assert.strictEqual(workflow.turn.guidance.implementation_contract.auto_fix.failed_steps[0].name, 'build');
  assert.ok(workflow.turn.guidance.implementation_contract.auto_fix.context_fragments.tasks);
  assert.ok(workflow.turn.guidance.implementation_contract.latest_verification);
  assert.ok(!workflow.turn.reads.some((item) => item.rel_path === 'openspec/changes/runtime-smoke-demo/proposal.md'));

  writePackageJson(successAfterFixTarget, 'node -e "process.exit(0)"');
  copyFixture(successAfterFixTarget, 'current-execution-frontend-implementer.json', 'current-execution.json');
  report = advance(successAfterFixTarget);
  assert.strictEqual(report.applied.pending_gate, 'before-guardian');
  report = approveGate(successAfterFixTarget, 'before-guardian', 'code-guardian', 'guardian review approved');
  assert.strictEqual(report.applied.current_role, 'code-guardian');
  assert.strictEqual(report.recorded.dispatch.role, 'code-guardian');

  currentRun = readCurrentRun(successAfterFixTarget);
  assert.strictEqual(currentRun.auto_fix.active, true);
  assert.strictEqual(currentRun.auto_fix.attempts, 1);
  assert.strictEqual(currentRun.verification.overall_status, 'passed');

  workflow = step(successAfterFixTarget);
  assert.strictEqual(workflow.turn.actor.id, 'code-guardian');
  assert.strictEqual(workflow.turn.guidance.review_contract.latest_auto_fix.attempts, 1);
  assert.strictEqual(workflow.turn.guidance.review_contract.latest_verification.overall_status, 'passed');

  const failureAfterFixTarget = createWorkspace('node -e "process.exit(1)"');
  bootstrapToFrontend(failureAfterFixTarget);

  copyFixture(failureAfterFixTarget, 'current-execution-frontend-implementer.json', 'current-execution.json');
  report = advance(failureAfterFixTarget);
  assert.strictEqual(report.applied.current_role, 'frontend-implementer');
  assert.strictEqual(report.recorded.dispatch.role, 'frontend-implementer');

  copyFixture(failureAfterFixTarget, 'current-execution-frontend-implementer.json', 'current-execution.json');
  report = advance(failureAfterFixTarget);
  assert.strictEqual(report.applied.current_role, 'code-guardian');
  assert.strictEqual(report.recorded.dispatch.role, 'code-guardian');

  currentRun = readCurrentRun(failureAfterFixTarget);
  assert.strictEqual(currentRun.auto_fix.active, false);
  assert.strictEqual(currentRun.auto_fix.attempts, 1);
  assert.strictEqual(currentRun.verification.overall_status, 'failed');
  assert.strictEqual(currentRun.auto_fix.last_failed_steps[0].name, 'build');
  assert.strictEqual(currentRun.checkpoint_count, 0);
  assert.strictEqual(currentRun.last_checkpoint, null);

  workflow = step(failureAfterFixTarget);
  assert.strictEqual(workflow.turn.actor.id, 'code-guardian');
  assert.strictEqual(workflow.turn.guidance.review_contract.latest_auto_fix.attempts, 1);
  assert.strictEqual(workflow.turn.guidance.review_contract.latest_verification.overall_status, 'failed');

  console.log('auto-fix runtime test passed: failed verification retries frontend once, then falls through to guardian');
}

main();
