const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const protocolWorkflow = require('../../internal/ai-protocol-workflow');
const runner = require('../../bin/task-orchestrator-runner');
const expertExecutor = require('../../bin/expert-executor');
const expertDispatch = require('../../bin/expert-dispatch');

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

function writeJsonFile(targetDir, relPath, value) {
  writeProjectFile(targetDir, relPath, JSON.stringify(value, null, 2));
}

function buildArchiveDispatch(runId) {
  return {
    schema_version: 1,
    kind: 'expert-dispatch',
    run_id: runId,
    role: {
      id: 'archive-change',
      name: '归档专家',
      source: '.agents/roles/common/archive-change.md',
    },
    task: {
      raw_goal: 'archive runtime smoke demo',
      change_id: 'runtime-smoke-demo',
    },
    flow: {
      id: 'prd-to-delivery',
    },
    execution: {
      profile: 'vue',
      delivery_profile: 'micro',
      artifact_profile: 'compact',
      current_role: 'archive-change',
      next_role: null,
      pending_gate: null,
      expected_output: ['合并当前增量规范', '完成当前变更归档'],
      skills: [{ id: 'archive-change' }],
    },
    anchor: {
      schema_version: 1,
      kind: 'task-anchor',
      task: {
        raw_goal: 'archive runtime smoke demo',
        change_id: 'runtime-smoke-demo',
        input_kind: 'natural-language',
      },
      stage: {
        flow_id: 'prd-to-delivery',
        current_role: 'archive-change',
        next_role: null,
      },
      artifacts: {
        proposal: 'openspec/changes/runtime-smoke-demo/proposal.md',
        specs: 'openspec/changes/runtime-smoke-demo/specs/',
        design: 'openspec/changes/runtime-smoke-demo/design.md',
        tasks: 'openspec/changes/runtime-smoke-demo/tasks.md',
        checklist: 'openspec/changes/runtime-smoke-demo/checklist.md',
        iterations: 'openspec/changes/runtime-smoke-demo/iterations.md',
      },
      expected_output: ['完成归档'],
    },
    instructions: {
      source: '.agents/roles/common/archive-change.md',
      markdown: '# archive-change',
    },
  };
}

function writeRequirementArtifacts(targetDir) {
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# Proposal',
    '',
    '## Goal',
    '- Build a demo product card page for runtime smoke validation.',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/specs/ui/spec.md', [
    '## 新增需求',
    '',
    '### 需求：商品演示页',
    '',
    '系统必须提供一个最小商品演示页。',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/specs/api/spec.md', [
    '## 新增需求',
    '',
    '### 需求：接口约束',
    '',
    '系统必须明确当前示例不请求真实接口。',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/design.md', [
    '# 技术设计',
    '',
    '## 实现落点',
    '- 页面放在 src/views/products/mock/index.vue',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/tasks.md', [
    '# Tasks',
    '',
    '- [ ] Create the page container and component structure',
  ].join('\n'));
}

function createWorkspace() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-executor-test-'));
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'executor-smoke',
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

function bootstrapRun(targetDir) {
  copyFixture(targetDir, 'task-orchestrator-bootstrap-reply.md', 'task-orchestrator-turn.json');
  return runner.advanceRunner({ target: targetDir });
}

function readCurrentRun(targetDir) {
  return JSON.parse(fs.readFileSync(path.join(targetDir, '.ai-spec', 'current-run.json'), 'utf8'));
}

function assertMissingCurrentArtifacts(targetDir) {
  assert.ok(!fs.existsSync(path.join(targetDir, '.ai-spec', 'internal', 'current-dispatch.json')));
  assert.ok(!fs.existsSync(path.join(targetDir, '.ai-spec', 'internal', 'current-execution.json')));
  assert.ok(!fs.existsSync(path.join(targetDir, '.ai-spec', 'internal', 'current-runtime-action.json')));
}

function main() {
  const targetDir = createWorkspace();
  const bootstrap = bootstrapRun(targetDir);
  assert.strictEqual(bootstrap.applied.adapter_action, 'bootstrap');
  assert.strictEqual(bootstrap.recorded.dispatch.role, 'requirement-analyst');
  assert.ok(fs.existsSync(path.join(targetDir, '.ai-spec', 'repo-map.json')));

  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# Proposal',
    '',
    '## Goal',
    '- Build a demo product card page for runtime smoke validation.',
    '',
    '## Scope',
    '- Keep the page small and aligned with repository conventions.',
    '',
    '## Risk',
    '- No real API integration in this smoke case.',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/specs/ui/spec.md', [
    '## 新增需求',
    '',
    '### 需求：商品演示页',
    '',
    '系统必须提供一个最小商品演示页，用于 runtime smoke 验证。',
    '',
    '#### 场景：进入演示页',
    '',
    '- **已知** 当前变更仅用于 mock 演示',
    '- **当** 用户访问商品演示页',
    '- **则** 页面展示本地 mock 商品列表，不请求真实接口',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/specs/api/spec.md', [
    '## 新增需求',
    '',
    '### 需求：接口约束',
    '',
    '系统必须明确当前示例不请求真实接口，只读取本地 mock 数据。',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/design.md', [
    '# 技术设计',
    '',
    '## 实现落点',
    '- 页面放在 src/views/products/mock/index.vue',
    '- 路由模块放在 src/router/modules/products.ts',
    '- mock 数据放在 src/mock/products.ts',
  ].join('\n'));
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/tasks.md', [
    '# Tasks',
    '',
    '- [ ] Create the page container and component structure',
    '- [ ] Register the route and lazy loading entry',
    '- [ ] Keep mock data and style variables aligned',
    '- [ ] Capture implementation notes for review',
  ].join('\n'));

  let result = expertExecutor.applyExecution({
    target: targetDir,
    payload: path.join(fixturesDir, 'current-execution-requirement-analyst.json'),
    advanceRuntime: true,
  });
  assert.strictEqual(result.payload.openspec_action, 'propose');
  assert.deepStrictEqual(result.validation.required_outputs, [
    'openspec/changes/runtime-smoke-demo/proposal.md',
    'openspec/changes/runtime-smoke-demo/specs',
    'openspec/changes/runtime-smoke-demo/design.md',
    'openspec/changes/runtime-smoke-demo/tasks.md',
  ]);
  assert.strictEqual(result.runtime_transition.payload.action, 'gate-blocked');
  assert.strictEqual(result.runtime_transition.payload.pending_gate, 'before-implementation');
  assert.strictEqual(result.runtime_transition.applied.current_role, 'requirement-analyst');
  let currentRun = readCurrentRun(targetDir);
  assert.strictEqual(currentRun.pending_gate, 'before-implementation');
  assertMissingCurrentArtifacts(targetDir);

  result = expertExecutor.applyRuntimeActionData({
    target: targetDir,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'approve',
      gate: 'before-implementation',
      to_role: 'frontend-implementer',
      next_role: 'code-guardian',
      message: 'implementation approved',
    },
  });
  currentRun = readCurrentRun(targetDir);
  assert.strictEqual(currentRun.status, 'running');
  assert.strictEqual(currentRun.current_role, 'frontend-implementer');
  assert.strictEqual(currentRun.pending_gate, null);

  expertDispatch.applyDispatch({
    target: targetDir,
    payload: path.join(fixturesDir, 'current-dispatch-frontend-implementer.json'),
  });
  result = expertExecutor.applyExecution({
    target: targetDir,
    payload: path.join(fixturesDir, 'current-execution-frontend-implementer.json'),
    advanceRuntime: true,
  });
  assert.strictEqual(result.payload.openspec_action, 'apply');
  assert.deepStrictEqual(result.validation.required_inputs, [
    'openspec/changes/runtime-smoke-demo/proposal.md',
    'openspec/changes/runtime-smoke-demo/specs',
    'openspec/changes/runtime-smoke-demo/design.md',
    'openspec/changes/runtime-smoke-demo/tasks.md',
  ]);
  assert.strictEqual(result.runtime_transition.payload.action, 'gate-blocked');
  assert.strictEqual(result.runtime_transition.payload.pending_gate, 'before-guardian');
  currentRun = readCurrentRun(targetDir);
  assert.strictEqual(currentRun.current_role, 'frontend-implementer');
  assert.strictEqual(currentRun.pending_gate, 'before-guardian');
  assert.ok(result.payload.verification, 'expected auto-generated verification on frontend delivery');
  assert.strictEqual(result.payload.verification.kind, 'verification');
  assert.strictEqual(result.payload.verification.steps.length, 3);
  assert.ok(currentRun.verification, 'expected verification to be persisted into current-run');
  assert.strictEqual(currentRun.verification.kind, 'verification');
  assertMissingCurrentArtifacts(targetDir);

  result = expertExecutor.applyRuntimeActionData({
    target: targetDir,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'approve',
      gate: 'before-guardian',
      to_role: 'code-guardian',
      next_role: null,
      message: 'guardian review approved',
    },
  });
  currentRun = readCurrentRun(targetDir);
  assert.strictEqual(currentRun.status, 'running');
  assert.strictEqual(currentRun.current_role, 'code-guardian');
  assert.strictEqual(currentRun.pending_gate, null);

  expertDispatch.applyDispatch({
    target: targetDir,
    payload: path.join(fixturesDir, 'current-dispatch-code-guardian.json'),
  });
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/checklist.md', '# checklist');
  writeProjectFile(targetDir, 'openspec/changes/runtime-smoke-demo/iterations.md', '# iterations');
  result = expertExecutor.applyExecution({
    target: targetDir,
    payload: path.join(fixturesDir, 'current-execution-code-guardian.json'),
    advanceRuntime: true,
  });
  assert.strictEqual(result.payload.openspec_action, 'verify');
  assert.deepStrictEqual(result.validation.required_outputs, [
    'openspec/changes/runtime-smoke-demo/checklist.md',
    'openspec/changes/runtime-smoke-demo/iterations.md',
  ]);
  assert.strictEqual(result.runtime_transition.payload.action, 'gate-blocked');
  assert.strictEqual(result.runtime_transition.payload.pending_gate, 'before-archive');
  currentRun = readCurrentRun(targetDir);
  assert.strictEqual(currentRun.status, 'waiting-approval');
  assert.strictEqual(currentRun.current_role, 'code-guardian');
  assert.strictEqual(currentRun.pending_gate, 'before-archive');
  assert.strictEqual(currentRun.gate_context.resume_to_role, 'archive-change');
  assertMissingCurrentArtifacts(targetDir);

  result = expertExecutor.applyRuntimeActionData({
    target: targetDir,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'approve',
      gate: 'before-archive',
      to_role: 'archive-change',
      next_role: null,
      message: 'archive approved',
    },
  });
  currentRun = readCurrentRun(targetDir);
  assert.strictEqual(currentRun.status, 'running');
  assert.strictEqual(currentRun.current_role, 'archive-change');
  assert.strictEqual(currentRun.pending_gate, null);

  expertDispatch.applyDispatchData({
    target: targetDir,
    payloadData: buildArchiveDispatch(currentRun.run_id),
  });
  result = expertExecutor.applyExecutionData({
    target: targetDir,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'expert-execution',
      run_id: currentRun.run_id,
      status: 'completed',
      role: {
        id: 'archive-change',
        name: '归档专家',
      },
      task: {
        change_id: 'runtime-smoke-demo',
      },
      flow: {
        id: 'prd-to-delivery',
      },
      execution_plan: {
        execution_steps: ['合并增量规范', '归档当前变更'],
      },
    },
  });
  assert.strictEqual(result.payload.openspec_action, 'archive');
  assert.ok(result.archive_result, 'expected archive_result after archive-change execution');
  assert.strictEqual(result.runtime_transition.payload.action, 'complete');
  assert.strictEqual(result.runtime_transition.payload.skip_artifact_check, true);
  currentRun = readCurrentRun(targetDir);
  assert.strictEqual(currentRun.status, 'success');
  assert.strictEqual(currentRun.current_role, 'archive-change');
  assert.ok(currentRun.artifacts.proposal.includes('openspec/changes/archive/'));
  assert.ok(fs.existsSync(path.join(targetDir, 'openspec/specs/ui/spec.md')));
  assert.ok(fs.existsSync(path.join(targetDir, 'openspec/specs/api/spec.md')));
  assertMissingCurrentArtifacts(targetDir);

  const runtimeActionTarget = createWorkspace();
  bootstrapRun(runtimeActionTarget);
  writeProjectFile(runtimeActionTarget, 'openspec/changes/runtime-smoke-demo/proposal.md', '# Proposal');
  writeProjectFile(runtimeActionTarget, 'openspec/changes/runtime-smoke-demo/specs/ui/spec.md', '# Spec');
  writeProjectFile(runtimeActionTarget, 'openspec/changes/runtime-smoke-demo/design.md', '# Design');
  writeProjectFile(runtimeActionTarget, 'openspec/changes/runtime-smoke-demo/tasks.md', '# Tasks');
  writeProjectFile(runtimeActionTarget, 'openspec/changes/runtime-smoke-demo/checklist.md', '# checklist');
  writeProjectFile(runtimeActionTarget, 'openspec/changes/runtime-smoke-demo/iterations.md', '# iterations');
  result = expertExecutor.applyRuntimeActionData({
    target: runtimeActionTarget,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'complete',
      status: 'success',
      to_role: 'archive-change',
      message: 'manual archive closeout',
    },
  });
  assert.ok(result.payload.run_id, 'expected run_id to be hydrated from current-run');
  assert.strictEqual(result.payload.openspec_action, 'archive');
  currentRun = readCurrentRun(runtimeActionTarget);
  assert.strictEqual(currentRun.status, 'success');
  assert.strictEqual(currentRun.current_role, 'archive-change');

  const partialRuntimeActionTarget = createWorkspace();
  bootstrapRun(partialRuntimeActionTarget);
  writeRequirementArtifacts(partialRuntimeActionTarget);
  expertExecutor.applyExecution({
    target: partialRuntimeActionTarget,
    payload: path.join(fixturesDir, 'current-execution-requirement-analyst.json'),
    advanceRuntime: true,
  });
  expertExecutor.applyRuntimeActionData({
    target: partialRuntimeActionTarget,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'approve',
      gate: 'before-implementation',
      to_role: 'frontend-implementer',
      message: 'implementation approved',
    },
  });
  expertDispatch.applyDispatch({
    target: partialRuntimeActionTarget,
    payload: path.join(fixturesDir, 'current-dispatch-frontend-implementer.json'),
  });
  result = expertExecutor.applyExecutionData({
    target: partialRuntimeActionTarget,
    payloadData: {
      schema_version: 1,
      kind: 'expert-execution',
      run_id: 'run_20260331_160700_smoke',
      status: 'partial',
      role: {
        id: 'frontend-implementer',
        name: '前端实现专家',
      },
      flow: {
        id: 'prd-to-delivery',
      },
      summary: '仅完成部分页面，剩余页面待继续处理。',
    },
  });
  assert.strictEqual(result.payload.status, 'partial');
  result = expertExecutor.applyRuntimeActionData({
    target: partialRuntimeActionTarget,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'handoff',
      run_id: 'run_20260331_160700_smoke',
      from_role: 'frontend-implementer',
      to_role: 'code-guardian',
      next_role: null,
      status: 'running',
      message: 'frontend-implementer 已部分交付，交给 code-guardian',
    },
  });
  currentRun = readCurrentRun(partialRuntimeActionTarget);
  assert.strictEqual(result.runtime_transition.applied.current_role, 'frontend-implementer');
  assert.strictEqual(currentRun.current_role, 'frontend-implementer');
  assert.ok(currentRun.events.some((event) => String(event.message || '').includes('当前专家状态为 partial')));

  const partialCompleteActionTarget = createWorkspace();
  bootstrapRun(partialCompleteActionTarget);
  writeRequirementArtifacts(partialCompleteActionTarget);
  expertExecutor.applyExecution({
    target: partialCompleteActionTarget,
    payload: path.join(fixturesDir, 'current-execution-requirement-analyst.json'),
    advanceRuntime: true,
  });
  expertExecutor.applyRuntimeActionData({
    target: partialCompleteActionTarget,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'approve',
      gate: 'before-implementation',
      to_role: 'frontend-implementer',
      message: 'implementation approved',
    },
  });
  expertDispatch.applyDispatch({
    target: partialCompleteActionTarget,
    payload: path.join(fixturesDir, 'current-dispatch-frontend-implementer.json'),
  });
  expertExecutor.applyExecutionData({
    target: partialCompleteActionTarget,
    payloadData: {
      schema_version: 1,
      kind: 'expert-execution',
      run_id: 'run_20260331_160700_smoke',
      status: 'partial',
      role: {
        id: 'frontend-implementer',
        name: '前端实现专家',
      },
      flow: {
        id: 'prd-to-delivery',
      },
      summary: '仅完成部分页面，不能完成运行。',
    },
  });
  result = expertExecutor.applyRuntimeActionData({
    target: partialCompleteActionTarget,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'complete',
      run_id: 'run_20260331_160700_smoke',
      from_role: 'frontend-implementer',
      to_role: 'archive-change',
      status: 'success',
      message: '错误地尝试完成运行',
    },
  });
  currentRun = readCurrentRun(partialCompleteActionTarget);
  assert.strictEqual(result.runtime_transition.applied.current_role, 'frontend-implementer');
  assert.strictEqual(currentRun.status, 'running');
  assert.strictEqual(currentRun.current_role, 'frontend-implementer');
  assert.ok(currentRun.events.some((event) => String(event.message || '').includes('当前专家状态为 partial')));

  const examplePayloadTarget = createWorkspace();
  bootstrapRun(examplePayloadTarget);
  writeRequirementArtifacts(examplePayloadTarget);
  let turn = protocolWorkflow.advanceProtocolStep({
    target: examplePayloadTarget,
  }).turn;
  result = expertExecutor.applyExecutionData({
    target: examplePayloadTarget,
    payloadData: turn.execution_contract.example_payload,
  });
  assert.strictEqual(result.payload.kind, 'expert-execution');
  assert.strictEqual(result.payload.role.id, 'requirement-analyst');

  const frontendExampleTarget = createWorkspace();
  bootstrapRun(frontendExampleTarget);
  writeRequirementArtifacts(frontendExampleTarget);
  result = expertExecutor.applyExecution({
    target: frontendExampleTarget,
    payload: path.join(fixturesDir, 'current-execution-requirement-analyst.json'),
    advanceRuntime: true,
  });
  assert.strictEqual(result.runtime_transition.payload.pending_gate, 'before-implementation');
  expertExecutor.applyRuntimeActionData({
    target: frontendExampleTarget,
    advanceRuntime: true,
    payloadData: {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'approve',
      gate: 'before-implementation',
      to_role: 'frontend-implementer',
      message: 'implementation approved',
    },
  });
  expertDispatch.applyDispatch({
    target: frontendExampleTarget,
    payload: path.join(fixturesDir, 'current-dispatch-frontend-implementer.json'),
  });
  turn = protocolWorkflow.advanceProtocolStep({
    target: frontendExampleTarget,
  }).turn;
  const frontendExamplePayload = JSON.parse(JSON.stringify(turn.execution_contract.example_payload));
  delete frontendExamplePayload.run_id;
  delete frontendExamplePayload.dispatch_id;
  delete frontendExamplePayload.verification;
  if (frontendExamplePayload.role) {
    delete frontendExamplePayload.role.name;
  }
  result = expertExecutor.applyExecutionData({
    target: frontendExampleTarget,
    advanceRuntime: true,
    payloadData: frontendExamplePayload,
  });
  currentRun = readCurrentRun(frontendExampleTarget);
  assert.ok(result.payload.verification, 'expected frontend example payload to auto-generate verification');
  assert.strictEqual(result.payload.verification.kind, 'verification');
  assert.strictEqual(currentRun.pending_gate, 'before-guardian');

  const registryOverrideTarget = createWorkspace();
  bootstrapRun(registryOverrideTarget);
  const registryOverrideRun = readCurrentRun(registryOverrideTarget);
  registryOverrideRun.review_policy = 'none';
  if (registryOverrideRun.plan && typeof registryOverrideRun.plan === 'object') {
    registryOverrideRun.plan.review_policy = 'none';
  }
  writeJsonFile(registryOverrideTarget, '.ai-spec/current-run.json', registryOverrideRun);
  writeJsonFile(registryOverrideTarget, '.agents/registry/roles.json', {
    version: 1,
    roles: {
      'requirement-analyst': {
        runtime_transition: {
          action: 'handoff',
          to_role: 'frontend-implementer',
          next_role: 'code-guardian',
          status: 'running',
          message: 'registry override handoff message',
        },
      },
    },
  });
  writeProjectFile(registryOverrideTarget, 'openspec/changes/runtime-smoke-demo/proposal.md', [
    '# Proposal',
    '',
    '## Goal',
    '- Override transition message from project registry.',
    '',
    '## Scope',
    '- Keep compact proposal sufficient for the micro gate.',
  ].join('\n'));
  writeProjectFile(registryOverrideTarget, 'openspec/changes/runtime-smoke-demo/specs/ui/spec.md', [
    '## 新增需求',
    '',
    '### 需求：覆盖 transition',
    '',
    '系统必须支持本地注册表覆盖。',
  ].join('\n'));
  writeProjectFile(registryOverrideTarget, 'openspec/changes/runtime-smoke-demo/design.md', [
    '# 技术设计',
    '',
    '## 目标',
    '- 验证本地 registry override 时 design 也被纳入 requirement 产物检查。',
  ].join('\n'));
  writeProjectFile(registryOverrideTarget, 'openspec/changes/runtime-smoke-demo/tasks.md', [
    '# Tasks',
    '',
    '- [ ] Step one',
    '- [ ] Step two',
    '- [ ] Step three',
  ].join('\n'));
  result = expertExecutor.applyExecution({
    target: registryOverrideTarget,
    payload: path.join(fixturesDir, 'current-execution-requirement-analyst.json'),
    advanceRuntime: true,
  });
  assert.strictEqual(result.runtime_transition.payload.action, 'handoff');
  assert.strictEqual(result.runtime_transition.payload.to_role, 'frontend-implementer');
  assert.ok(!Object.prototype.hasOwnProperty.call(result.runtime_transition.payload, 'pending_gate'));
  assert.strictEqual(result.runtime_transition.payload.message, 'registry override handoff message');

  const autoArchiveTarget = createWorkspace();
  bootstrapRun(autoArchiveTarget);
  const autoArchiveRun = readCurrentRun(autoArchiveTarget);
  autoArchiveRun.review_policy = 'none';
  if (autoArchiveRun.plan && typeof autoArchiveRun.plan === 'object') {
    autoArchiveRun.plan.review_policy = 'none';
    autoArchiveRun.plan.approval_gates = [];
  }
  autoArchiveRun.current_role = 'code-guardian';
  autoArchiveRun.status = 'running';
  autoArchiveRun.pending_gate = null;
  autoArchiveRun.gate_context = null;
  writeJsonFile(autoArchiveTarget, '.ai-spec/current-run.json', autoArchiveRun);
  expertDispatch.applyDispatch({
    target: autoArchiveTarget,
    payload: path.join(fixturesDir, 'current-dispatch-code-guardian.json'),
  });
  writeRequirementArtifacts(autoArchiveTarget);
  writeProjectFile(autoArchiveTarget, 'openspec/changes/runtime-smoke-demo/checklist.md', '# checklist');
  writeProjectFile(autoArchiveTarget, 'openspec/changes/runtime-smoke-demo/iterations.md', '# iterations');
  result = expertExecutor.applyExecution({
    target: autoArchiveTarget,
    payload: path.join(fixturesDir, 'current-execution-code-guardian.json'),
    advanceRuntime: true,
  });
  assert.strictEqual(result.runtime_transition.payload.action, 'handoff');
  assert.strictEqual(result.runtime_transition.payload.to_role, 'archive-change');
  currentRun = readCurrentRun(autoArchiveTarget);
  assert.strictEqual(currentRun.current_role, 'archive-change');
  assert.strictEqual(currentRun.pending_gate, null);

  console.log('expert-executor test passed: execution semantics advance runtime-state with specs and archive confirmation linkage');
}

main();
