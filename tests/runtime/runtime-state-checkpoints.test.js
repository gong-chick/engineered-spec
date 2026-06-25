const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const runtimeState = require('../../bin/runtime-state');

function writeProjectFile(targetDir, relPath, content) {
  const filePath = path.join(targetDir, relPath);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${content}\n`, 'utf8');
}

function createWorkspace() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ai-spec-auto-runtime-state-'));
  writeProjectFile(targetDir, 'package.json', JSON.stringify({
    name: 'runtime-state-smoke',
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
  writeProjectFile(targetDir, 'src/views/demo/index.vue', '<template><div>demo</div></template>');
  writeProjectFile(targetDir, 'src/api/order.ts', 'export function getOrderListApi() {}');
  writeProjectFile(targetDir, 'src/api/types/order.ts', 'export interface Order {}');
  writeProjectFile(targetDir, 'src/mock/order.ts', 'export const orderMock = [];');
  writeProjectFile(targetDir, 'src/store/modules/demo/index.ts', 'export const useDemoStore = () => ({})');
  writeProjectFile(targetDir, 'src/styles/variables.scss', ':root {}');
  writeProjectFile(targetDir, 'context/PROJECT.md', '# PROJECT');
  return targetDir;
}

function buildBootstrapPayload(runId, changeId) {
  return {
    schema_version: 1,
    kind: 'task-orchestrator-bootstrap',
    run_plan: {
      schema_version: 1,
      kind: 'run-plan',
      run_id: runId,
      status: 'planned',
      task: {
        type: 'page-development',
        raw_input: '新增一个商品演示页',
        input_kind: 'natural-language',
        risk_level: 'low',
      },
      flow: {
        id: 'prd-to-delivery',
        name: '需求到交付',
        source: 'runtime-state-test',
      },
      artifacts: [
        `openspec/changes/${changeId}/proposal.md`,
        `openspec/changes/${changeId}/specs/`,
        `openspec/changes/${changeId}/design.md`,
        `openspec/changes/${changeId}/tasks.md`,
        `openspec/changes/${changeId}/checklist.md`,
        `openspec/changes/${changeId}/iterations.md`,
      ],
      plan: {
        required_roles: ['requirement-analyst', 'frontend-implementer', 'code-guardian'],
        activated_optional_roles: [],
        skipped_optional_roles: [],
        first_handoff: 'requirement-analyst',
        approval_gates: ['before-implementation', 'before-archive'],
      },
      missing_inputs: [],
      warnings: [],
      errors: [],
    },
    task_anchor: {
      schema_version: 1,
      kind: 'task-anchor',
      run_id: runId,
      task: {
        raw_goal: '新增一个商品演示页',
        change_id: changeId,
        input_kind: 'natural-language',
      },
      stage: {
        flow_id: 'prd-to-delivery',
        current_role: 'requirement-analyst',
        next_role: 'frontend-implementer',
      },
      artifacts: {
        proposal: `openspec/changes/${changeId}/proposal.md`,
        specs: `openspec/changes/${changeId}/specs/`,
        design: `openspec/changes/${changeId}/design.md`,
        tasks: `openspec/changes/${changeId}/tasks.md`,
        checklist: `openspec/changes/${changeId}/checklist.md`,
        iterations: `openspec/changes/${changeId}/iterations.md`,
      },
    },
  };
}

function writeOpenSpecArtifacts(targetDir, changeId) {
  writeProjectFile(targetDir, `openspec/changes/${changeId}/proposal.md`, '# Proposal');
  writeProjectFile(targetDir, `openspec/changes/${changeId}/specs/ui/spec.md`, '## 新增需求');
  writeProjectFile(targetDir, `openspec/changes/${changeId}/design.md`, '# Design');
  writeProjectFile(targetDir, `openspec/changes/${changeId}/tasks.md`, '- [x] step one');
  writeProjectFile(targetDir, `openspec/changes/${changeId}/checklist.md`, '# Checklist');
  writeProjectFile(targetDir, `openspec/changes/${changeId}/iterations.md`, '# Iterations');
}

function readCurrentRun(targetDir) {
  return JSON.parse(fs.readFileSync(path.join(targetDir, '.ai-spec', 'current-run.json'), 'utf8'));
}

function readCheckpoint(targetDir, checkpointRelPath) {
  return JSON.parse(fs.readFileSync(path.join(targetDir, checkpointRelPath), 'utf8'));
}

function withCheckpointPersistence(fn) {
  const previousPersist = process.env.AI_SPEC_PERSIST_CHECKPOINTS;
  const previousDebug = process.env.ENGINEERED_SPEC_DEBUG_CHECKPOINTS;
  process.env.AI_SPEC_PERSIST_CHECKPOINTS = '1';
  delete process.env.ENGINEERED_SPEC_DEBUG_CHECKPOINTS;

  try {
    fn();
  } finally {
    if (previousPersist === undefined) {
      delete process.env.AI_SPEC_PERSIST_CHECKPOINTS;
    } else {
      process.env.AI_SPEC_PERSIST_CHECKPOINTS = previousPersist;
    }

    if (previousDebug === undefined) {
      delete process.env.ENGINEERED_SPEC_DEBUG_CHECKPOINTS;
    } else {
      process.env.ENGINEERED_SPEC_DEBUG_CHECKPOINTS = previousDebug;
    }
  }
}

function main() {
  const lightweightTargetDir = createWorkspace();
  const lightweightChangeId = 'runtime-events-default-demo';
  const lightweightRunId = 'run_20260409_095000_events';

  let result = runtimeState.bootstrapRunState({
    target: lightweightTargetDir,
    payloadData: buildBootstrapPayload(lightweightRunId, lightweightChangeId),
  });
  let currentRun = readCurrentRun(lightweightTargetDir);
  assert.strictEqual(result.state.run_id, lightweightRunId);
  assert.strictEqual(currentRun.checkpoint_count, 0);
  assert.strictEqual(currentRun.last_checkpoint, null);
  assert.ok(!fs.existsSync(path.join(lightweightTargetDir, '.ai-spec', 'checkpoints')));
  assert.ok(Array.isArray(currentRun.events));
  assert.strictEqual(currentRun.events[0].type, 'run-created');

  const repoMap = JSON.parse(fs.readFileSync(path.join(lightweightTargetDir, '.ai-spec/repo-map.json'), 'utf8'));
  assert.strictEqual(repoMap.paths.views_dir, 'src/views');
  assert.strictEqual(repoMap.paths.route_modules_dir, 'src/router/modules');
  assert.strictEqual(repoMap.paths.mock_dir, 'src/mock');

  withCheckpointPersistence(() => {
    const targetDir = createWorkspace();
    const changeId = 'runtime-checkpoint-demo';
    const runId = 'run_20260409_100000_checkpoint';

    result = runtimeState.bootstrapRunState({
      target: targetDir,
      payloadData: buildBootstrapPayload(runId, changeId),
    });
    currentRun = readCurrentRun(targetDir);
    assert.strictEqual(result.state.run_id, runId);
    assert.strictEqual(currentRun.checkpoint_count, 1);
    assert.strictEqual(currentRun.last_checkpoint.event, 'bootstrap');
    assert.ok(fs.existsSync(path.join(targetDir, '.ai-spec/repo-map.json')));

    writeOpenSpecArtifacts(targetDir, changeId);

    result = runtimeState.handoffRunState({
      target: targetDir,
      runId,
      fromRole: 'requirement-analyst',
      toRole: 'frontend-implementer',
      nextRole: 'code-guardian',
    });
    currentRun = readCurrentRun(targetDir);
    assert.strictEqual(currentRun.current_role, 'frontend-implementer');
    assert.strictEqual(currentRun.checkpoint_count, 2);
    assert.strictEqual(currentRun.last_checkpoint.event, 'handoff');

    result = runtimeState.gateBlockedRunState({
      target: targetDir,
      runId,
      gate: 'before-archive',
      toRole: 'code-guardian',
      nextRole: 'archive-change',
      blockedByRole: 'code-guardian',
      resumeToRole: 'archive-change',
      requiredUserAction: '明确是否执行归档',
      blockedReason: '归档前需要人工确认',
    });
    currentRun = readCurrentRun(targetDir);
    assert.strictEqual(currentRun.status, 'waiting-approval');
    assert.strictEqual(currentRun.pending_gate, 'before-archive');
    assert.strictEqual(currentRun.gate_context.gate_id, 'before-archive');
    assert.strictEqual(currentRun.gate_context.blocked_by_role, 'code-guardian');
    assert.strictEqual(currentRun.gate_context.resume_to_role, 'archive-change');
    assert.strictEqual(currentRun.checkpoint_count, 3);
    assert.strictEqual(currentRun.last_checkpoint.event, 'gate-blocked');
    const blockedCheckpointRelPath = currentRun.last_checkpoint.file;
    const blockedCheckpoint = readCheckpoint(targetDir, blockedCheckpointRelPath);
    assert.strictEqual(blockedCheckpoint.event, 'gate-blocked');
    assert.strictEqual(blockedCheckpoint.state.pending_gate, 'before-archive');

    result = runtimeState.approveRunState({
      target: targetDir,
      runId,
      gate: 'before-archive',
      toRole: 'archive-change',
    });
    currentRun = readCurrentRun(targetDir);
    assert.strictEqual(currentRun.current_role, 'archive-change');
    assert.strictEqual(currentRun.pending_gate, null);
    assert.strictEqual(currentRun.checkpoint_count, 4);
    assert.strictEqual(currentRun.last_checkpoint.event, 'approve');

    result = runtimeState.completeRunState({
      target: targetDir,
      runId,
      toRole: 'archive-change',
      status: 'success',
    });
    currentRun = readCurrentRun(targetDir);
    assert.strictEqual(currentRun.status, 'success');
    assert.strictEqual(currentRun.checkpoint_count, 5);
    assert.strictEqual(currentRun.last_checkpoint.event, 'complete');

    const status = runtimeState.statusRunState({
      target: targetDir,
      runId,
    });
    assert.strictEqual(status.summary.checkpoint_count, 5);
    assert.strictEqual(status.summary.last_checkpoint.event, 'complete');

    result = runtimeState.restoreRunState({
      target: targetDir,
      runId,
      checkpoint: path.join(targetDir, blockedCheckpointRelPath),
    });
    currentRun = readCurrentRun(targetDir);
    assert.strictEqual(currentRun.status, 'waiting-approval');
    assert.strictEqual(currentRun.pending_gate, 'before-archive');
    assert.strictEqual(currentRun.gate_context.resume_to_role, 'archive-change');
    assert.strictEqual(currentRun.checkpoint_count, 3);
    assert.strictEqual(currentRun.last_checkpoint.event, 'gate-blocked');
    assert.strictEqual(result.state.events.at(-1).type, 'run-restored');

    const checkpointFiles = fs.readdirSync(path.join(targetDir, '.ai-spec', 'checkpoints', runId));
    assert.deepStrictEqual(checkpointFiles, [
      '001-bootstrap.json',
      '002-handoff.json',
      '003-gate-blocked.json',
      '004-approve.json',
      '005-complete.json',
    ]);
  });

  console.log('runtime-state checkpoints test passed: default mode stays lightweight, checkpoint mode still supports restore');
}

main();
