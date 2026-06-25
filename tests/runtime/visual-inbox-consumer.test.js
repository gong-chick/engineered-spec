const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { consumeInbox } = require('../../internal/visual-hooks/inbox-consumer');

function writeJson(filePath, value) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function createWorkspace() {
  const targetDir = fs.mkdtempSync(path.join(os.tmpdir(), 'visual-inbox-consumer-'));
  writeJson(path.join(targetDir, '.ai-spec', 'visual-bridge.json'), {
    enabled: true,
    server_url: 'http://127.0.0.1:18780',
    workspace_id: 'ws-inbox-test',
    connect_token: '',
    inbox_transport: 'file-only',
  });
  writeJson(path.join(targetDir, '.ai-spec', 'current-run.json'), {
    schema_version: 1,
    kind: 'run-state',
    run_id: 'run_gate_reject',
    status: 'waiting-approval',
    current_role: 'code-guardian',
    pending_gate: 'before-archive',
    gate_context: {
      gate_id: 'before-archive',
      blocked_by_role: 'code-guardian',
      resume_to_role: 'archive-change',
      required_user_action: '确认是否归档',
      blocked_reason: '等待归档确认',
    },
    task: {
      change_id: 'gate-reject-change',
    },
    events: [],
    timestamps: {
      updated_at: '2026-04-22T12:00:00.000Z',
    },
  });
  return targetDir;
}

async function testRejectGateKeepsPendingGate() {
  const targetDir = createWorkspace();
  const inboxDir = path.join(targetDir, '.ai-spec', 'inbox');
  const command = {
    outbox_id: 'outbox-reject-1',
    command: 'reject_gate',
    payload: {
      gate: 'before-archive',
      run_id: 'run_gate_reject',
      decision: 'rejected',
      reason: '不要归档',
    },
  };
  writeJson(path.join(inboxDir, 'control-outbox-reject-1.json'), command);

  const result = await consumeInbox({
    targetDir,
    skipPull: true,
    skipPush: true,
    timeoutMs: 500,
  });

  assert.strictEqual(result.processed, 1);
  assert.strictEqual(result.receipts[0].result, 'rejected');

  const state = readJson(path.join(targetDir, '.ai-spec', 'current-run.json'));
  assert.strictEqual(state.status, 'waiting-approval');
  assert.strictEqual(state.pending_gate, 'before-archive');
  assert.strictEqual(state.current_role, 'code-guardian');
  assert.ok(state.gate_context.blocked_reason.includes('不要归档'));
  assert.ok(state.events.some((event) => event.type === 'gate-rejected'));
  assert.strictEqual(fs.existsSync(path.join(inboxDir, 'control-outbox-reject-1.json')), false);
}

async function testApproveGateDoesNotUseConnectTokenAsHmacSecret() {
  const targetDir = createWorkspace();
  const bridgePath = path.join(targetDir, '.ai-spec', 'visual-bridge.json');
  const bridge = readJson(bridgePath);
  writeJson(bridgePath, {
    ...bridge,
    connect_token: 'visual-connect-token-is-not-hmac-secret',
  });
  const inboxDir = path.join(targetDir, '.ai-spec', 'inbox');
  writeJson(path.join(inboxDir, 'control-outbox-approve-1.json'), {
    outbox_id: 'outbox-approve-1',
    command: 'approve_gate',
    payload: {
      gate: 'before-archive',
      run_id: 'run_gate_reject',
      decision: 'approved',
    },
    signature: 'signature-from-visual-server-secret',
  });

  const result = await consumeInbox({
    targetDir,
    skipPull: true,
    skipPush: true,
    timeoutMs: 500,
  });

  assert.strictEqual(result.processed, 1);
  assert.strictEqual(result.receipts[0].result, 'applied');
  const state = readJson(path.join(targetDir, '.ai-spec', 'current-run.json'));
  assert.strictEqual(state.pending_gate, null);
  assert.strictEqual(state.current_role, 'archive-change');
}

async function testDuplicateOutboxIdIsOnlyAppliedOnce() {
  const targetDir = createWorkspace();
  const inboxDir = path.join(targetDir, '.ai-spec', 'inbox');
  const command = {
    outbox_id: 'outbox-approve-duplicate',
    command: 'approve_gate',
    payload: {
      gate: 'before-archive',
      run_id: 'run_gate_reject',
      decision: 'approved',
    },
  };
  writeJson(path.join(inboxDir, 'control-a.json'), command);
  writeJson(path.join(inboxDir, 'control-b.json'), command);

  const result = await consumeInbox({
    targetDir,
    skipPull: true,
    skipPush: true,
    timeoutMs: 500,
  });

  assert.strictEqual(result.processed, 1);
  assert.strictEqual(result.receipts.length, 1);
  assert.strictEqual(result.receipts[0].result, 'applied');
  assert.strictEqual(fs.existsSync(path.join(inboxDir, 'control-a.json')), false);
  assert.strictEqual(fs.existsSync(path.join(inboxDir, 'control-b.json')), false);
}

async function testRejectGateMismatchReturnsConflict() {
  const targetDir = createWorkspace();
  const inboxDir = path.join(targetDir, '.ai-spec', 'inbox');
  writeJson(path.join(inboxDir, 'control-outbox-reject-2.json'), {
    outbox_id: 'outbox-reject-2',
    command: 'reject_gate',
    payload: {
      gate: 'before-guardian',
      run_id: 'run_gate_reject',
      decision: 'rejected',
    },
  });

  const result = await consumeInbox({
    targetDir,
    skipPull: true,
    skipPush: true,
    timeoutMs: 500,
  });

  assert.strictEqual(result.processed, 1);
  assert.strictEqual(result.receipts[0].result, 'conflict');

  const state = readJson(path.join(targetDir, '.ai-spec', 'current-run.json'));
  assert.strictEqual(state.status, 'waiting-approval');
  assert.strictEqual(state.pending_gate, 'before-archive');
  assert.strictEqual(state.current_role, 'code-guardian');
}

async function testRequestChangesKeepsGateAndWritesDedicatedSignal() {
  const targetDir = createWorkspace();
  const inboxDir = path.join(targetDir, '.ai-spec', 'inbox');
  writeJson(path.join(inboxDir, 'control-outbox-request-changes.json'), {
    outbox_id: 'outbox-request-changes-1',
    command: 'reject_gate',
    payload: {
      gate: 'before-archive',
      run_id: 'run_gate_reject',
      decision: 'request_changes',
      reason: '请补齐归档说明与 checklist',
    },
  });

  const result = await consumeInbox({
    targetDir,
    skipPull: true,
    skipPush: true,
    timeoutMs: 500,
  });

  assert.strictEqual(result.processed, 1);
  assert.strictEqual(result.receipts[0].result, 'rejected');

  const state = readJson(path.join(targetDir, '.ai-spec', 'current-run.json'));
  assert.strictEqual(state.status, 'waiting-approval');
  assert.strictEqual(state.pending_gate, 'before-archive');
  assert.ok(state.gate_context.blocked_reason.includes('请补齐归档说明与 checklist'));
  assert.ok(state.gate_context.required_user_action.includes('补齐'));
  assert.ok(state.events.some((event) => event.type === 'gate-request-changes'));

  const gateSignal = readJson(path.join(targetDir, '.ai-spec', 'gate-signal.json'));
  assert.strictEqual(gateSignal.decision, 'request_changes');

  const nextStep = fs.readFileSync(
    path.join(targetDir, '.ai-spec', 'next-step.md'),
    'utf8',
  );
  assert.ok(nextStep.includes('补齐资产后重新提交审批'));
}

async function main() {
  await testRejectGateKeepsPendingGate();
  await testApproveGateDoesNotUseConnectTokenAsHmacSecret();
  await testDuplicateOutboxIdIsOnlyAppliedOnce();
  await testRejectGateMismatchReturnsConflict();
  await testRequestChangesKeepsGateAndWritesDedicatedSignal();
  console.log('visual inbox consumer test passed: reject_gate blocks without clearing gate');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
