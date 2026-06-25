const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const protocolWorkflow = require('../../internal/ai-protocol-workflow');
const runner = require('../../bin/task-orchestrator-runner');

function writeProjectFile(targetDir, relPath, content) {
  const filePath = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function createWorkspace(prefix = 'ai-spec-auto-small-routing-') {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'small-request-routing',
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
  }, null, 2));
  writeProjectFile(targetDir, 'pnpm-lock.yaml', 'lockfileVersion: 9.0');
  writeProjectFile(targetDir, 'src/router/index.ts', 'export const router = {}');
  writeProjectFile(targetDir, 'src/router/modules/demo.ts', 'export default []');
  writeProjectFile(targetDir, 'src/views/demo/index.vue', '<template><div /></template>');
  writeProjectFile(targetDir, 'src/api/order.ts', 'export function getOrderListApi() {}');
  writeProjectFile(targetDir, 'src/api/types/order.ts', 'export interface Order {}');
  writeProjectFile(targetDir, 'src/store/modules/demo/index.ts', 'export const useDemoStore = () => ({})');
  writeProjectFile(targetDir, 'src/styles/variables.scss', ':root {}');
  writeProjectFile(targetDir, 'context/PROJECT.md', '# PROJECT');
  return targetDir;
}

function listTurnTargets(turn) {
  return turn.writes.map((item) => item.rel_path || item.value);
}

function writeOpenChange(targetDir, changeId) {
  writeProjectFile(targetDir, `openspec/changes/${changeId}/proposal.md`, `# ${changeId}`);
  writeProjectFile(targetDir, `openspec/changes/${changeId}/design.md`, `# ${changeId} design`);
  writeProjectFile(targetDir, `openspec/changes/${changeId}/tasks.md`, `# ${changeId} tasks`);
  writeProjectFile(targetDir, `openspec/changes/${changeId}/specs/ui/spec.md`, `# ${changeId} spec`);
}

function bootstrapQuickFixRun(targetDir, runId, rawInput, options = {}) {
  const firstHandoff = options.first_handoff || 'frontend-implementer';
  const activatedOptionalRoles = Array.isArray(options.activated_optional_roles)
    ? options.activated_optional_roles
    : [];
  const skippedOptionalRoles = Array.isArray(options.skipped_optional_roles)
    ? options.skipped_optional_roles
    : ['unit-test-specialist', 'verification-reviewer', 'performance-auditor']
      .filter((roleId) => !activatedOptionalRoles.includes(roleId));
  writeProjectFile(targetDir, '.ai-spec/internal/tmp/task-orchestrator-turn.json', JSON.stringify({
    kind: 'run-plan',
    schema_version: 1,
    run_id: runId,
    mode: 'auto',
    status: 'planned',
    delivery_profile: 'micro',
    artifact_profile: 'compact',
    complexity: 'low',
    task: {
      type: 'bugfix',
      raw_input: rawInput,
      risk_level: 'low',
      change_context: 'no-change',
      route_decision: 'quick-fix',
      trace_mode: 'direct-fix',
    },
    flow: {
      id: 'bugfix-to-verification',
      name: '缺陷修复到验证',
      source: '.agents/flows/common/bugfix-to-verification.md',
    },
    plan: {
      required_roles: ['frontend-implementer', 'code-guardian'],
      activated_optional_roles: activatedOptionalRoles,
      skipped_optional_roles: skippedOptionalRoles,
      approval_gates: [],
      first_handoff: firstHandoff,
      delivery_profile: 'micro',
      artifact_profile: 'compact',
    },
    assumptions: ['当前输入属于低风险小修正，默认走 direct-fix 轻链路。'],
    missing_inputs: [],
  }, null, 2));

  return runner.advanceRunner({ target: targetDir });
}

function bootstrapMainFlowRun(targetDir, runId, rawInput, options = {}) {
  const mode = options.mode || 'auto';
  const flowId = options.flow_id || 'prd-to-delivery';
  const payload = {
    kind: 'run-plan',
    schema_version: 1,
    run_id: runId,
    mode,
    status: 'planned',
    delivery_profile: 'standard',
    artifact_profile: 'full',
    complexity: 'medium',
    task: {
      type: 'page-development',
      raw_input: rawInput,
      risk_level: 'medium',
      change_context: 'no-change',
      route_decision: 'full-change',
      trace_mode: 'full-openspec',
    },
    flow: {
      id: flowId,
      name: '需求到交付',
      source: '.agents/flows/common/prd-to-delivery.md',
    },
    plan: {
      required_roles: ['requirement-analyst', 'frontend-implementer', 'code-guardian'],
      activated_optional_roles: [],
      skipped_optional_roles: ['design-collaborator', 'api-contract-specialist', 'unit-test-specialist', 'verification-reviewer', 'performance-auditor'],
      first_handoff: 'requirement-analyst',
      delivery_profile: 'standard',
      artifact_profile: 'full',
    },
    assumptions: ['默认沿用当前项目的页面目录、路由和主题变量约定。'],
    missing_inputs: [],
  };

  if (Object.prototype.hasOwnProperty.call(options, 'review_policy')) {
    payload.review_policy = options.review_policy;
    payload.plan.review_policy = options.review_policy;
  }

  if (Object.prototype.hasOwnProperty.call(options, 'approval_gates')) {
    payload.plan.approval_gates = Array.isArray(options.approval_gates) ? options.approval_gates : [];
  }

  writeProjectFile(targetDir, '.ai-spec/internal/tmp/task-orchestrator-turn.json', JSON.stringify(payload, null, 2));

  return runner.advanceRunner({ target: targetDir });
}

function writeExecutionInbox(targetDir, value) {
  writeProjectFile(targetDir, '.ai-spec/internal/tmp/current-execution.json', JSON.stringify(value, null, 2));
}

function readCurrentRun(targetDir) {
  return JSON.parse(fs.readFileSync(path.join(targetDir, '.ai-spec', 'current-run.json'), 'utf8'));
}

function main() {
  const smallRequestGuide = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'four', '小需求与补丁修正指南.md'), 'utf8');
  const bestPracticeGuide = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'four', '开发最佳实践指南.md'), 'utf8');
  const deliveryExampleGuide = fs.readFileSync(path.join(__dirname, '..', '..', 'docs', 'four', '需求示例-从发起到归档.md'), 'utf8');

  assert.ok(smallRequestGuide.includes('完整主流程默认是 `auto（自动） + none（无阻塞审核）`'));
  assert.ok(bestPracticeGuide.includes('`review_policy（审核策略） = none（无阻塞审核）`'));
  assert.ok(deliveryExampleGuide.includes('`review_policy（审核策略） = none（无阻塞审核）`'));

  const quickFixTarget = createWorkspace('ai-spec-auto-quick-fix-');
  let result = protocolWorkflow.advanceProtocolStep({
    target: quickFixTarget,
    userInput: '把列表标题文案改一下，按钮也更简洁一点',
  });
  assert.strictEqual(result.turn.mode, 'start');
  assert.strictEqual(result.turn.guidance.route_decision.change_context, 'no-change');
  assert.strictEqual(result.turn.guidance.route_decision.route_decision, 'quick-fix');
  assert.strictEqual(result.turn.guidance.route_decision.trace_mode, 'direct-fix');
  assert.strictEqual(result.turn.guidance.route_decision.selected_flow, 'bugfix-to-verification');
  assert.strictEqual(result.turn.guidance.route_decision.enter_openspec, false);
  assert.strictEqual(result.turn.guidance.route_decision.next_expert, 'frontend-implementer');
  assert.ok(Array.isArray(result.turn.guidance.bugfix_route_contract.allowed_as_quick_fix));
  assert.ok(result.turn.guidance.quick_fix_boundary.some((item) => item.includes('单页面')));
  assert.ok(result.turn.guidance.upgrade_to_full_change_when.some((item) => item.includes('真实 API')));

  const mockPageTarget = createWorkspace('ai-spec-auto-mock-page-');
  result = protocolWorkflow.advanceProtocolStep({
    target: mockPageTarget,
    userInput: '创建一个商品详情 mock 页面，只做演示版，数据本地 mock',
  });
  assert.strictEqual(result.turn.mode, 'start');
  assert.strictEqual(result.turn.guidance.route_decision.change_context, 'no-change');
  assert.strictEqual(result.turn.guidance.route_decision.route_decision, 'full-change');
  assert.strictEqual(result.turn.guidance.route_decision.selected_flow, 'prd-to-delivery');
  assert.strictEqual(result.turn.guidance.route_decision.enter_openspec, true);
  assert.strictEqual(result.turn.guidance.route_decision.next_expert, 'requirement-analyst');

  const fullChangeTarget = createWorkspace('ai-spec-auto-full-change-');
  result = protocolWorkflow.advanceProtocolStep({
    target: fullChangeTarget,
    userInput: '新增一个订单详情路由，接真实接口并补一个全局状态 store',
  });
  assert.strictEqual(result.turn.mode, 'start');
  assert.strictEqual(result.turn.guidance.route_decision.change_context, 'no-change');
  assert.strictEqual(result.turn.guidance.route_decision.route_decision, 'full-change');
  assert.strictEqual(result.turn.guidance.route_decision.selected_flow, 'prd-to-delivery');
  assert.strictEqual(result.turn.guidance.route_decision.enter_openspec, true);
  assert.strictEqual(result.turn.guidance.route_decision.next_expert, 'requirement-analyst');
  assert.strictEqual(result.turn.summary.review_policy, 'none');
  assert.strictEqual(result.turn.guidance.routing.review_policy, 'none');
  assert.deepStrictEqual(result.turn.guidance.approval_contract.gates, []);

  const openPatchTarget = createWorkspace('ai-spec-auto-open-patch-');
  writeOpenChange(openPatchTarget, 'copy-adjustment');
  result = protocolWorkflow.advanceProtocolStep({
    target: openPatchTarget,
    userInput: '把这个列表页标题改短一点，按钮样式再轻一点',
  });
  assert.strictEqual(result.turn.mode, 'start');
  assert.strictEqual(result.turn.guidance.route_decision.change_context, 'open-change');
  assert.strictEqual(result.turn.guidance.route_decision.route_decision, 'patch');
  assert.strictEqual(result.turn.guidance.route_decision.trace_mode, 'same-change');
  assert.strictEqual(result.turn.guidance.route_decision.reuse_change_id, 'copy-adjustment');
  assert.strictEqual(result.turn.guidance.route_decision.next_expert, 'frontend-implementer');

  const openScopeTarget = createWorkspace('ai-spec-auto-open-scope-');
  writeOpenChange(openScopeTarget, 'orders-rework');
  result = protocolWorkflow.advanceProtocolStep({
    target: openScopeTarget,
    userInput: '这个变更再补一个接口字段调整，并改一下验收口径',
  });
  assert.strictEqual(result.turn.mode, 'start');
  assert.strictEqual(result.turn.guidance.route_decision.change_context, 'open-change');
  assert.strictEqual(result.turn.guidance.route_decision.route_decision, 'scope-delta');
  assert.strictEqual(result.turn.guidance.route_decision.reuse_change_id, 'orders-rework');
  assert.strictEqual(result.turn.guidance.route_decision.next_expert, 'requirement-analyst');

  const ambiguousTarget = createWorkspace('ai-spec-auto-ambiguous-open-');
  writeOpenChange(ambiguousTarget, 'change-a');
  writeOpenChange(ambiguousTarget, 'change-b');
  result = protocolWorkflow.advanceProtocolStep({
    target: ambiguousTarget,
    userInput: '这个按钮颜色再调一下',
  });
  assert.strictEqual(result.turn.mode, 'confirm-gate');
  assert.strictEqual(result.turn.guidance.confirm_gate.status, 'waiting-confirm');
  assert.strictEqual(result.turn.guidance.route_decision.waiting_confirm_required, true);
  assert.strictEqual(result.turn.guidance.route_decision.candidate_changes.length, 2);

  const manualTarget = createWorkspace('ai-spec-auto-manual-start-');
  result = protocolWorkflow.advanceProtocolStep({
    target: manualTarget,
    userInput: '新增一个订单详情路由，接真实接口并补一个全局状态 store',
    mode: 'manual',
  });
  assert.strictEqual(result.turn.mode, 'confirm-gate');
  assert.strictEqual(result.turn.guidance.confirm_gate.gate, 'manual-flow-required');
  assert.strictEqual(result.turn.input.requested_mode, 'manual');
  assert.strictEqual(result.turn.summary.review_policy, 'none');

  const manualFlowTarget = createWorkspace('ai-spec-auto-manual-flow-');
  result = protocolWorkflow.advanceProtocolStep({
    target: manualFlowTarget,
    userInput: '新增一个订单详情路由，接真实接口并补一个全局状态 store',
    mode: 'manual',
    flowId: 'prd-to-delivery',
  });
  assert.strictEqual(result.turn.mode, 'start');
  assert.strictEqual(result.turn.input.requested_mode, 'manual');
  assert.strictEqual(result.turn.input.requested_flow, 'prd-to-delivery');
  assert.strictEqual(result.turn.guidance.routing.selected_flow, 'prd-to-delivery');
  assert.strictEqual(result.turn.guidance.routing.review_policy, 'none');

  const suggestTarget = createWorkspace('ai-spec-auto-suggest-start-');
  result = protocolWorkflow.advanceProtocolStep({
    target: suggestTarget,
    userInput: '新增一个订单详情路由，接真实接口并补一个全局状态 store',
    mode: 'suggest',
  });
  assert.strictEqual(result.turn.mode, 'start');
  assert.strictEqual(result.turn.input.requested_mode, 'suggest');
  assert.strictEqual(result.turn.guidance.routing.review_policy, 'none');

  let report = bootstrapMainFlowRun(
    suggestTarget,
    'run_20260415_100000_suggest',
    '新增一个订单详情路由，接真实接口并补一个全局状态 store',
    { mode: 'suggest' },
  );
  assert.strictEqual(report.applied.adapter_action, 'bootstrap');
  let currentRun = readCurrentRun(suggestTarget);
  assert.strictEqual(currentRun.mode, 'suggest');
  assert.strictEqual(currentRun.status, 'waiting-confirm');
  assert.strictEqual(currentRun.review_policy, 'none');
  assert.deepStrictEqual(currentRun.plan.approval_gates, []);

  let workflow = protocolWorkflow.advanceProtocolStep({ target: suggestTarget });
  assert.strictEqual(workflow.turn.mode, 'confirm-gate');
  assert.strictEqual(workflow.turn.guidance.confirm_gate.gate, 'start-review');
  assert.strictEqual(workflow.turn.guidance.confirm_gate.resume_to_role, 'requirement-analyst');
  assert.strictEqual(workflow.turn.summary.run_status, 'waiting-confirm');

  const blockingPolicyTarget = createWorkspace('ai-spec-auto-blocking-review-');
  report = bootstrapMainFlowRun(
    blockingPolicyTarget,
    'run_20260415_100001_blocking',
    '新增一个订单详情路由，接真实接口并补一个全局状态 store',
    {
      review_policy: 'main-flow-blocking',
    },
  );
  assert.strictEqual(report.applied.adapter_action, 'bootstrap');
  currentRun = readCurrentRun(blockingPolicyTarget);
  assert.strictEqual(currentRun.review_policy, 'main-flow-blocking');
  assert.deepStrictEqual(currentRun.plan.approval_gates, ['before-implementation', 'before-guardian', 'before-archive']);

  const noReviewPolicyTarget = createWorkspace('ai-spec-auto-none-review-');
  report = bootstrapMainFlowRun(
    noReviewPolicyTarget,
    'run_20260415_100002_noreview',
    '新增一个订单详情路由，接真实接口并补一个全局状态 store',
    {
      review_policy: 'none',
      approval_gates: ['before-implementation', 'before-archive'],
    },
  );
  assert.strictEqual(report.applied.adapter_action, 'bootstrap');
  currentRun = readCurrentRun(noReviewPolicyTarget);
  assert.strictEqual(currentRun.review_policy, 'none');
  assert.deepStrictEqual(currentRun.plan.approval_gates, ['before-implementation', 'before-archive']);

  const runtimeTarget = createWorkspace('ai-spec-auto-quick-fix-runtime-');
  const runId = 'run_20260414_100000_bugfix';
  report = bootstrapQuickFixRun(runtimeTarget, runId, '把列表标题文案改一下，按钮也更简洁一点');
  assert.strictEqual(report.applied.adapter_action, 'bootstrap');
  assert.strictEqual(report.recorded.dispatch.role, 'frontend-implementer');

  workflow = protocolWorkflow.advanceProtocolStep({ target: runtimeTarget });
  assert.strictEqual(workflow.turn.mode, 'execute');
  assert.strictEqual(workflow.turn.actor.id, 'frontend-implementer');
  assert.deepStrictEqual(listTurnTargets(workflow.turn), [
    '.ai-spec/internal/tmp/current-execution.json',
    'code',
    `.ai-spec/history/${runId}/bugfix.md`,
    `.ai-spec/history/${runId}/implementation-notes.md`,
  ]);
  assert.strictEqual(workflow.turn.guidance.openspec_rules.enabled, false);
  assert.ok(workflow.turn.guidance.quick_fix_boundary.some((item) => item.includes('单页面')));
  assert.ok(workflow.turn.guidance.upgrade_to_full_change_when.some((item) => item.includes('全局状态')));
  assert.ok(workflow.turn.guidance.optional_role_triggers.some((item) => item.role_id === 'unit-test-specialist'));

  writeProjectFile(runtimeTarget, `.ai-spec/history/${runId}/bugfix.md`, '# Bugfix');
  writeProjectFile(runtimeTarget, `.ai-spec/history/${runId}/implementation-notes.md`, '# Notes');
  writeExecutionInbox(runtimeTarget, {
    kind: 'expert-execution',
    schema_version: 1,
    run_id: runId,
    status: 'completed',
    role: {
      id: 'frontend-implementer',
      name: '前端实现专家',
    },
    flow: {
      id: 'bugfix-to-verification',
    },
    execution_plan: {
      execution_steps: [
        '完成最小修复',
        '准备交接 code-guardian',
      ],
    },
  });
  report = runner.advanceRunner({ target: runtimeTarget });
  assert.strictEqual(report.applied.current_role, 'code-guardian');

  workflow = protocolWorkflow.advanceProtocolStep({ target: runtimeTarget });
  assert.strictEqual(workflow.turn.mode, 'execute');
  assert.strictEqual(workflow.turn.actor.id, 'code-guardian');
  assert.deepStrictEqual(listTurnTargets(workflow.turn), [
    '.ai-spec/internal/tmp/current-execution.json',
    `.ai-spec/history/${runId}/checklist.md`,
    `.ai-spec/history/${runId}/iterations.md`,
  ]);
  assert.strictEqual(workflow.turn.guidance.route_decision.route_decision, 'quick-fix');
  assert.ok(workflow.turn.guidance.bugfix_blocking_checks.some((item) => item.includes('低风险小需求')));
  assert.ok(workflow.turn.guidance.quick_fix_boundary.some((item) => item.includes('低风险小需求')));
  assert.ok(workflow.turn.guidance.optional_role_triggers.some((item) => item.role_id === 'verification-reviewer'));

  writeProjectFile(runtimeTarget, `.ai-spec/history/${runId}/checklist.md`, '# Checklist');
  writeProjectFile(runtimeTarget, `.ai-spec/history/${runId}/iterations.md`, '# Iterations');
  writeExecutionInbox(runtimeTarget, {
    kind: 'expert-execution',
    schema_version: 1,
    run_id: runId,
    status: 'completed',
    role: {
      id: 'code-guardian',
      name: '规范守护专家',
    },
    flow: {
      id: 'bugfix-to-verification',
    },
    execution_plan: {
      execution_steps: [
        '完成轻量守护检查',
        '结束当前运行',
      ],
    },
  });
  report = runner.advanceRunner({ target: runtimeTarget });
  currentRun = readCurrentRun(runtimeTarget);
  assert.strictEqual(report.applied.status, 'success');
  assert.strictEqual(currentRun.status, 'success');
  assert.strictEqual(currentRun.pending_gate, null);
  assert.strictEqual(currentRun.flow.id, 'bugfix-to-verification');
  assert.strictEqual(currentRun.task.route_decision, 'quick-fix');
  assert.strictEqual(currentRun.artifacts.bugfix, `.ai-spec/history/${runId}/bugfix.md`);
  assert.strictEqual(currentRun.artifacts.checklist, `.ai-spec/history/${runId}/checklist.md`);

  const quickFixOptionalCases = [
    {
      roleId: 'unit-test-specialist',
      rawInput: '这个 store 的边界逻辑修一下，顺便看看回归风险',
      activatedOptionalRoles: ['unit-test-specialist'],
      expectedReadPaths: [` .ai-spec/history/__RUN__/bugfix.md`, ` .ai-spec/history/__RUN__/implementation-notes.md`],
      assertGuidance(workflowTurn) {
        assert.ok(workflowTurn.guidance.quick_fix_boundary.some((item) => item.includes('store')));
        assert.ok(workflowTurn.guidance.skill_selection_policy.use_when.some((item) => item.skills.includes('create-test')));
      },
    },
    {
      roleId: 'verification-reviewer',
      rawInput: '这个小修正我需要再复核一下验收证据',
      activatedOptionalRoles: ['verification-reviewer'],
      expectedReadPaths: [
        ` .ai-spec/history/__RUN__/bugfix.md`,
        ` .ai-spec/history/__RUN__/implementation-notes.md`,
        ` .ai-spec/history/__RUN__/checklist.md`,
      ],
      assertGuidance(workflowTurn) {
        assert.ok(workflowTurn.guidance.quick_fix_boundary.some((item) => item.includes('bugfix.md')));
        assert.ok(workflowTurn.guidance.skill_selection_policy.use_when.some((item) => item.skills.includes('ui-verification')));
      },
    },
    {
      roleId: 'performance-auditor',
      rawInput: '这个列表滚动有点掉帧，先做个轻量性能判断',
      activatedOptionalRoles: ['performance-auditor'],
      expectedReadPaths: [` .ai-spec/history/__RUN__/bugfix.md`, ` .ai-spec/history/__RUN__/implementation-notes.md`],
      assertGuidance(workflowTurn) {
        assert.ok(workflowTurn.guidance.quick_fix_boundary.some((item) => item.includes('性能症状')));
        assert.ok(workflowTurn.guidance.upgrade_to_full_change_when.some((item) => item.includes('跨模块重构')));
      },
    },
  ];

  for (const item of quickFixOptionalCases) {
    const optionalTarget = createWorkspace(`ai-spec-auto-${item.roleId}-`);
    const optionalRunId = `run_20260414_${item.roleId.replace(/[^a-z]/g, '').slice(0, 8)}_quickfix`;
    report = bootstrapQuickFixRun(optionalTarget, optionalRunId, item.rawInput, {
      first_handoff: item.roleId,
      activated_optional_roles: item.activatedOptionalRoles,
    });
    assert.strictEqual(report.applied.adapter_action, 'bootstrap');
    workflow = protocolWorkflow.advanceProtocolStep({ target: optionalTarget });
    assert.strictEqual(workflow.turn.mode, 'execute');
    assert.strictEqual(workflow.turn.actor.id, item.roleId);
    assert.strictEqual(workflow.turn.guidance.openspec_rules.enabled, false);
    const readPaths = workflow.turn.reads.map((target) => target.rel_path).filter(Boolean);
    for (const rawPath of item.expectedReadPaths) {
      const expectedPath = rawPath.trim().replace('__RUN__', optionalRunId);
      assert.ok(readPaths.includes(expectedPath), `${item.roleId} should read ${expectedPath}`);
    }
    item.assertGuidance(workflow.turn);
  }

  console.log('small request routing test passed: quick-fix, manual/suggest mode, review-policy, waiting-confirm, and lightweight runtime flow all work');
}

main();
