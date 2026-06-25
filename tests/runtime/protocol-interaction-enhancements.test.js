const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const protocolWorkflow = require('../../internal/ai-protocol-workflow');
const runtimeState = require('../../bin/runtime-state');
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

function createWorkspace(prefix) {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'protocol-interaction-enhancements',
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

function bootstrapRun(targetDir, userInput = '创建一个商品组件') {
  const start = protocolWorkflow.advanceProtocolStep({
    target: targetDir,
    userInput,
  });
  assert.strictEqual(start.turn.mode, 'start');
  copyFixture(targetDir, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  const report = runner.advanceRunner({ target: targetDir });
  assert.strictEqual(report.applied.adapter_action, 'bootstrap');
  return report;
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
  return runner.advanceRunner({ target: targetDir });
}

function setupRequirementGateRun(targetDir, userInput = '创建一个订单列表页面，接真实接口，支持分页和状态筛选') {
  bootstrapRun(targetDir, userInput);
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# 变更提案：runtime-smoke-demo',
    '',
    '## 目标',
    '- 新增一个商品组件演示页，验证协议链与页面落点约定。',
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
    '系统必须提供一个最小商品演示页，用于协议链验证。',
    '',
    '#### 场景：查看商品演示页',
    '',
    '- **已知** 当前仅提供 mock 数据',
    '- **当** 用户进入商品演示页',
    '- **则** 页面展示本地 mock 列表且不请求真实接口',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/specs/api/spec.md', [
    '## 新增需求',
    '',
    '### 需求：数据来源约束',
    '',
    '系统必须明确页面只读取本地 mock 数据，不请求真实接口。',
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
  copyFixture(targetDir, 'current-execution-requirement-analyst.json', 'current-execution.json');
  const report = runner.advanceRunner({ target: targetDir });
  assert.strictEqual(report.applied.pending_gate, 'before-implementation');
  return report;
}

function setupFrontendRun(targetDir) {
  setupRequirementGateRun(targetDir);
  const report = approveGate(targetDir, 'before-implementation', 'frontend-implementer', 'implementation approved');
  assert.strictEqual(report.applied.current_role, 'frontend-implementer');
}

function setupRunToArchiveGate(targetDir) {
  bootstrapRun(targetDir, '创建一个支付页面，但支付流程、安全约束、风控规则我先不说');
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# Proposal',
    '',
    '## Goal',
    '- Validate before-archive fast path with a complete compact proposal.',
    '',
    '## Scope',
    '- Keep the demo page in the current mock-only delivery boundary.',
    '- Reuse the repository layout instead of introducing unrelated refactors.',
    '',
    '## Risk',
    '- No real API integration in this verification workspace.',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/specs/product-demo/spec.md', [
    '## 新增需求',
    '',
    '### 需求：商品演示页',
    '',
    '系统必须提供一个最小商品演示页，用于 fast path 验证。',
    '',
    '#### 场景：进入演示页',
    '',
    '- **已知** 当前场景只使用本地 mock 数据',
    '- **当** 用户进入商品演示页',
    '- **则** 页面展示本地 mock 内容，不请求真实接口',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/design.md', [
    '# 技术设计',
    '',
    '## 实现落点',
    '- 页面保留最小 mock 结构',
    '- 不引入真实接口层与额外状态管理',
    '',
    '## 约束',
    '- 只验证归档门禁 fast path，不扩展本次变更范围',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/tasks.md', [
    '# Tasks',
    '',
    '- [ ] Create mock page',
    '- [ ] Wire route placeholder',
    '- [ ] Prepare review notes',
  ].join('\n'));

  copyFixture(targetDir, 'current-execution-requirement-analyst.json', 'current-execution.json');
  let report = runner.advanceRunner({ target: targetDir });
  assert.strictEqual(report.applied.pending_gate, 'before-implementation');
  report = approveGate(targetDir, 'before-implementation', 'frontend-implementer', 'implementation approved');
  assert.strictEqual(report.applied.current_role, 'frontend-implementer');

  copyFixture(targetDir, 'current-execution-frontend-implementer.json', 'current-execution.json');
  report = runner.advanceRunner({ target: targetDir });
  assert.strictEqual(report.applied.pending_gate, 'before-guardian');
  report = approveGate(targetDir, 'before-guardian', 'code-guardian', 'guardian review approved');
  assert.strictEqual(report.applied.current_role, 'code-guardian');

  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/checklist.md', '# Checklist');
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/iterations.md', '# Iterations');
  copyFixture(targetDir, 'current-execution-code-guardian.json', 'current-execution.json');
  report = runner.advanceRunner({ target: targetDir });
  assert.strictEqual(report.applied.pending_gate, 'before-archive');
}

function main() {
  const stopTarget = createWorkspace('ai-spec-auto-stop-');
  bootstrapRun(stopTarget, '创建一个欢迎页面，mock 数据即可');

  let result = protocolWorkflow.stopProtocolStep({ target: stopTarget });
  let currentRun = readCurrentRun(stopTarget);
  assert.strictEqual(result.stopped.state.status, 'paused');
  assert.strictEqual(result.runner_status.current.run_status, 'paused');
  assert.strictEqual(result.turn.mode, 'paused');
  assert.strictEqual(currentRun.status, 'paused');

  let statusResult = protocolWorkflow.statusProtocolStep({ target: stopTarget });
  assert.strictEqual(statusResult.turn.mode, 'paused');
  assert.strictEqual(statusResult.turn.guidance.pause_contract.status, 'paused');

  result = protocolWorkflow.updateProtocolInput({
    target: stopTarget,
    userInput: '继续',
  });
  currentRun = readCurrentRun(stopTarget);
  assert.strictEqual(result.fast_path.executed, true);
  assert.strictEqual(result.fast_path.action, 'resume-paused-run');
  assert.strictEqual(result.turn.mode, 'execute');
  assert.strictEqual(result.turn.actor.id, 'requirement-analyst');
  assert.strictEqual(currentRun.status, 'running');

  const gateUpdateTarget = createWorkspace('ai-spec-auto-gate-update-');
  setupRequirementGateRun(gateUpdateTarget);
  result = protocolWorkflow.updateProtocolInput({
    target: gateUpdateTarget,
    userInput: '管理页面增加一个验证码的功能',
  });
  currentRun = readCurrentRun(gateUpdateTarget);
  assert.strictEqual(result.fast_path.executed, false);
  assert.strictEqual(result.turn.mode, 'update-review');
  assert.strictEqual(result.turn.guidance.update_contract.route_decision, 'scope-delta');
  assert.strictEqual(result.turn.guidance.update_contract.change_impact, 'scope-delta');
  assert.strictEqual(result.turn.guidance.update_contract.reconcile_strategy, 'rewind-to-requirement');
  assert.strictEqual(result.turn.guidance.update_contract.target_role, 'requirement-analyst');
  assert.ok(result.turn.guidance.update_contract.artifacts_to_update.includes('proposal.md'));
  assert.ok(result.turn.guidance.update_contract.artifacts_to_update.includes('specs/'));
  assert.ok(result.turn.guidance.update_contract.artifacts_to_update.includes('design.md'));
  assert.ok(result.turn.guidance.update_contract.artifacts_to_update.includes('tasks.md'));
  assert.strictEqual(currentRun.incremental_update.change_impact, 'scope-delta');

  writeProjectFile(gateUpdateTarget, '.ai-spec/internal/tmp/current-runtime-action.json', JSON.stringify({
    schema_version: 1,
    kind: 'task-orchestrator-runtime-action',
    action: 'handoff',
    from_role: 'requirement-analyst',
    to_role: 'requirement-analyst',
    next_role: 'frontend-implementer',
    status: 'running',
    message: 'rewind to requirement-analyst for captcha delta reconciliation',
  }, null, 2));
  let report = runner.advanceRunner({ target: gateUpdateTarget });
  assert.strictEqual(report.applied.adapter_action, 'handoff');
  assert.strictEqual(report.applied.current_role, 'requirement-analyst');
  assert.strictEqual(report.applied.pending_gate, null);
  assert.strictEqual(report.recorded.dispatch.role, 'requirement-analyst');
  currentRun = readCurrentRun(gateUpdateTarget);
  assert.strictEqual(currentRun.pending_gate, null);
  assert.strictEqual(currentRun.pending_input_update, false);
  statusResult = protocolWorkflow.advanceProtocolStep({ target: gateUpdateTarget });
  assert.strictEqual(statusResult.turn.mode, 'execute');
  assert.strictEqual(statusResult.turn.actor.id, 'requirement-analyst');

  const patchTarget = createWorkspace('ai-spec-auto-patch-');
  setupFrontendRun(patchTarget);
  result = protocolWorkflow.updateProtocolInput({
    target: patchTarget,
    userInput: '这个列表标题文案改一下，按钮也更简洁一点',
  });
  assert.strictEqual(result.fast_path.executed, false);
  assert.strictEqual(result.turn.mode, 'update-review');
  assert.strictEqual(result.turn.guidance.update_contract.change_context, 'active-change');
  assert.strictEqual(result.turn.guidance.update_contract.route_decision, 'patch');
  assert.strictEqual(result.turn.guidance.update_contract.trace_mode, 'same-change');
  assert.strictEqual(result.turn.guidance.update_contract.change_impact, 'patch');
  assert.strictEqual(result.turn.guidance.update_contract.reconcile_strategy, 'in-place');
  assert.ok(result.turn.guidance.update_contract.artifacts_to_update.includes('tasks.md'));
  assert.ok(result.turn.guidance.update_contract.artifacts_to_update.includes('code'));

  const archiveFixTarget = createWorkspace('ai-spec-auto-archive-fix-');
  setupRunToArchiveGate(archiveFixTarget);
  result = protocolWorkflow.updateProtocolInput({
    target: archiveFixTarget,
    userInput: '先别归档，这个实现不对，改成卡片布局',
  });
  currentRun = readCurrentRun(archiveFixTarget);
  assert.strictEqual(result.fast_path.executed, false);
  assert.strictEqual(result.turn.mode, 'update-review');
  assert.strictEqual(result.turn.guidance.update_contract.change_context, 'active-change');
  assert.strictEqual(result.turn.guidance.update_contract.route_decision, 'archive-fix');
  assert.strictEqual(result.turn.guidance.update_contract.trace_mode, 'same-change');
  assert.strictEqual(result.turn.guidance.update_contract.change_impact, 'archive-fix');
  assert.strictEqual(result.turn.guidance.update_contract.reconcile_strategy, 'rewind-to-frontend');
  assert.strictEqual(result.turn.guidance.update_contract.target_role, 'frontend-implementer');
  assert.strictEqual(result.turn.guidance.approval_gate.archive_fix_intent_detected, true);
  assert.strictEqual(currentRun.incremental_update.change_impact, 'archive-fix');

  result = protocolWorkflow.updateProtocolInput({
    target: archiveFixTarget,
    userInput: '归档',
  });
  currentRun = readCurrentRun(archiveFixTarget);
  assert.strictEqual(result.fast_path.executed, true);
  assert.strictEqual(result.fast_path.action, 'archive-approved');
  assert.strictEqual(currentRun.status, 'success');

  result = protocolWorkflow.updateProtocolInput({
    target: archiveFixTarget,
    userInput: '给上个归档变更补一个修正，补一条关键回归测试',
  });
  currentRun = readCurrentRun(archiveFixTarget);
  assert.strictEqual(result.fast_path.executed, true);
  assert.strictEqual(result.fast_path.action, 'followup-patch-opened');
  assert.strictEqual(currentRun.task.change_context, 'archived-change');
  assert.strictEqual(currentRun.task.route_decision, 'followup-patch');
  assert.strictEqual(currentRun.task.trace_mode, 'followup-change');
  assert.strictEqual(currentRun.task.type, 'followup-patch');
  assert.strictEqual(currentRun.task.parent_change_id, 'runtime-smoke-demo');
  assert.strictEqual(currentRun.task.change_impact, 'followup-patch');
  assert.strictEqual(currentRun.incremental_update.change_context, 'archived-change');
  assert.strictEqual(currentRun.incremental_update.route_decision, 'followup-patch');
  assert.strictEqual(currentRun.incremental_update.trace_mode, 'followup-change');
  assert.strictEqual(currentRun.incremental_update.reconcile_strategy, 'followup-patch');
  assert.ok(currentRun.plan.activated_optional_roles.includes('unit-test-specialist'));

  const confirmTarget = createWorkspace('ai-spec-auto-confirm-');
  bootstrapRun(confirmTarget, '创建一个带复杂交互的报表页');
  runtimeState.gateBlockedRunState({
    target: confirmTarget,
    status: 'waiting-confirm',
    gate: 'requirement-analyst->frontend-implementer',
    toRole: 'requirement-analyst',
    resumeToRole: 'frontend-implementer',
    requiredUserAction: '确认是否按当前方案继续到实现阶段',
    blockedReason: '当前方案存在两种可选实现，需要轻确认后再推进',
    message: 'waiting for lightweight confirm gate',
  });
  statusResult = protocolWorkflow.statusProtocolStep({ target: confirmTarget });
  assert.strictEqual(statusResult.turn.mode, 'confirm-gate');
  assert.strictEqual(statusResult.turn.guidance.confirm_gate.status, 'waiting-confirm');
  assert.strictEqual(statusResult.turn.guidance.confirm_gate.resume_to_role, 'frontend-implementer');

  result = protocolWorkflow.updateProtocolInput({
    target: confirmTarget,
    userInput: '按当前方案继续',
  });
  currentRun = readCurrentRun(confirmTarget);
  assert.strictEqual(result.fast_path.executed, true);
  assert.strictEqual(result.fast_path.action, 'confirm-resume');
  assert.strictEqual(currentRun.status, 'running');

  const optionalRoleTarget = createWorkspace('ai-spec-auto-optional-');
  statusResult = protocolWorkflow.advanceProtocolStep({
    target: optionalRoleTarget,
    userInput: '根据设计稿创建一个大列表页，涉及接口字段调整、性能优化，并补充关键回归测试',
  });
  assert.strictEqual(statusResult.turn.mode, 'start');
  assert.ok(statusResult.turn.guidance.orchestration_contract.activated_optional_roles.includes('design-collaborator'));
  assert.ok(statusResult.turn.guidance.orchestration_contract.activated_optional_roles.includes('api-contract-specialist'));
  assert.ok(statusResult.turn.guidance.orchestration_contract.activated_optional_roles.includes('unit-test-specialist'));
  assert.ok(statusResult.turn.guidance.orchestration_contract.activated_optional_roles.includes('performance-auditor'));
  copyFixture(optionalRoleTarget, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  runner.advanceRunner({ target: optionalRoleTarget });
  const requirementTurn = protocolWorkflow.advanceProtocolStep({
    target: optionalRoleTarget,
  });
  assert.strictEqual(requirementTurn.turn.actor.id, 'requirement-analyst');
  assert.ok(requirementTurn.turn.guidance.optional_role_triggers.some((item) => item.role_id === 'design-collaborator'));
  assert.ok(requirementTurn.turn.guidance.optional_role_triggers.some((item) => item.role_id === 'api-contract-specialist'));

  console.log('protocol interaction enhancements test passed: pause/status, delta update review, archive-fix, followup patch, confirm gate, and optional experts all behave as expected');
}

main();
