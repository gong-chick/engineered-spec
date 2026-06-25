#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const runtimeState = require('./runtime-state');
const extractor = require('./task-orchestrator-extractor');
const expertDispatch = require('./expert-dispatch');
const expertExecutor = require('./expert-executor');
const {
  buildAutoRuntimeAction,
  guardRuntimeActionForIncompleteExecution,
  getRuntimeTransition,
} = require('./execution-semantics');
const {
  resolveRuntimePaths,
  getCandidatePaths,
  shouldPersistHistory,
} = require('./runtime-paths');

const INBOX_SPECS = [
  {
    kind: 'task-orchestrator-turn',
    pathKey: 'tmpTaskOrchestratorTurn',
    producer: 'task-orchestrator',
  },
  {
    kind: 'expert-dispatch',
    pathKey: 'tmpCurrentDispatch',
    producer: 'task-orchestrator',
  },
  {
    kind: 'expert-execution',
    pathKey: 'tmpCurrentExecution',
    producer: 'current-expert',
  },
  {
    kind: 'task-orchestrator-runtime-action',
    pathKey: 'tmpCurrentRuntimeAction',
    producer: 'task-orchestrator',
  },
];

const TERMINAL_STATUSES = new Set(['success', 'failed', 'cancelled']);
const AUTO_DISPATCH_ALLOWED_ACTIONS = new Set(['bootstrap', 'handoff', 'approve', 'resume']);
const ROLE_METADATA = {
  'requirement-analyst': {
    name: '需求解析专家',
    source: '.agents/roles/common/requirement-analyst.md',
  },
  'frontend-implementer': {
    name: '前端实现专家',
    source: '.agents/roles/common/frontend-implementer.md',
  },
  'code-guardian': {
    name: '规范守护者',
    source: '.agents/roles/common/code-guardian.md',
  },
  'archive-change': {
    name: '归档专家',
    source: '.agents/roles/common/archive-change.md',
  },
  'design-collaborator': {
    name: '设计协作专家',
    source: '.agents/roles/domains/demand-design/design-collaborator.md',
  },
  'api-contract-specialist': {
    name: 'API 契约专家',
    source: '.agents/roles/domains/demand-design/api-contract-specialist.md',
  },
  'unit-test-specialist': {
    name: '单元测试专家',
    source: '.agents/roles/domains/testing/unit-test-specialist.md',
  },
  'verification-reviewer': {
    name: '验证评审专家',
    source: '.agents/roles/domains/testing/verification-reviewer.md',
  },
  'performance-auditor': {
    name: '性能审计专家',
    source: '.agents/roles/domains/performance/performance-auditor.md',
  },
};
const ROLE_EXPECTED_OUTPUTS = {
  'requirement-analyst': {
    compact: ['完成短版 proposal.md', '完成短版 spec.md', '完成短版 tasks.md'],
    full: ['完成 proposal.md', '完成 spec.md', '完成 tasks.md'],
  },
  'frontend-implementer': {
    compact: ['完成最小必要实现', '保持改动最小化并记录验证结果'],
    full: ['完成当前范围内代码实现', '记录实现说明与验证结果'],
  },
  'code-guardian': {
    compact: ['完成短版 checklist.md', '完成短版 iterations.md', '给出交付结论'],
    full: ['完成 checklist.md', '完成 iterations.md', '给出交付结论'],
  },
  'archive-change': {
    compact: ['合并当前增量规范', '完成变更归档', '结束本次运行'],
    full: ['合并当前增量规范到 openspec/specs', '完成变更归档', '结束本次运行'],
  },
  'design-collaborator': {
    compact: ['补充最小 UI 约束与设计疑问'],
    full: ['补充 UI 分析清单与设计待确认项'],
  },
  'api-contract-specialist': {
    compact: ['补充最小接口契约约束'],
    full: ['补充接口契约说明与待确认字段'],
  },
  'unit-test-specialist': {
    compact: ['补充关键测试建议'],
    full: ['补充单元测试策略与高风险边界场景'],
  },
  'verification-reviewer': {
    compact: ['补充关键验收结论'],
    full: ['补充验证评审意见与验收风险'],
  },
  'performance-auditor': {
    compact: ['补充关键性能风险'],
    full: ['补充性能审计结论与优化优先级'],
  },
};

function printUsage() {
  console.log(`Internal usage:
  require('./task-orchestrator-runner').advanceRunner({ target })
  require('./task-orchestrator-runner').buildStatus(target)
  require('./task-orchestrator-runner').replayReplies({ target, replies })

Options:
  --reply <file>         Path to a task-orchestrator Markdown reply file; can be repeated
  --target <dir>         Target project directory (default: .)
  --json                 Print JSON result
  --pretty               Print readable summary (default)
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {
    target: '.',
    replies: [],
    pretty: true,
    json: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--reply':
        options.replies.push(args.shift());
        break;
      case '--target':
        options.target = args.shift();
        break;
      case '--json':
        options.json = true;
        options.pretty = false;
        break;
      case '--pretty':
        options.pretty = true;
        options.json = false;
        break;
      case '--help':
      case '-h':
        options.help = true;
        break;
      default:
        throw new Error(`Unknown argument: ${arg}`);
    }
  }

  return { command, options };
}

function readTextFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    throw new Error(`${label} is empty: ${filePath}`);
  }
  return raw;
}

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function loadJsonIfExists(filePath, label) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJsonFile(filePath, label);
}

function parseScalar(value) {
  const trimmed = value.trim();
  if (trimmed === '') {
    return '';
  }
  if (trimmed === '[]') {
    return [];
  }
  if (
    (trimmed.startsWith('"') && trimmed.endsWith('"')) ||
    (trimmed.startsWith("'") && trimmed.endsWith("'"))
  ) {
    return trimmed.slice(1, -1);
  }
  return trimmed;
}

function parseFrontmatter(fileContent) {
  const lines = fileContent.split('\n');
  if (lines[0] !== '---') {
    return {};
  }

  const endIndex = lines.indexOf('---', 1);
  if (endIndex === -1) {
    return {};
  }

  const frontmatterLines = lines.slice(1, endIndex);
  const data = {};
  let currentKey = null;

  for (const line of frontmatterLines) {
    const listMatch = line.match(/^\s*-\s+(.*)$/);
    if (listMatch && currentKey) {
      if (!Array.isArray(data[currentKey])) {
        data[currentKey] = [];
      }
      data[currentKey].push(parseScalar(listMatch[1]));
      continue;
    }

    const keyMatch = line.match(/^([A-Za-z0-9_-]+):\s*(.*)$/);
    if (!keyMatch) {
      currentKey = null;
      continue;
    }

    const [, key, rawValue] = keyMatch;
    if (rawValue.trim() === '') {
      data[key] = [];
      currentKey = key;
      continue;
    }

    data[key] = parseScalar(rawValue);
    currentKey = null;
  }

  return data;
}

function loadRoleMetadata(targetDir, roleId) {
  const fallback = ROLE_METADATA[roleId] || {
    name: roleId,
    source: null,
  };

  if (!fallback.source) {
    return {
      id: roleId,
      name: fallback.name,
      source: null,
      preferred_skills: [],
    };
  }

  const sourcePath = path.join(targetDir, fallback.source);
  if (!fs.existsSync(sourcePath)) {
    return {
      id: roleId,
      name: fallback.name,
      source: fallback.source,
      preferred_skills: [],
    };
  }

  const frontmatter = parseFrontmatter(fs.readFileSync(sourcePath, 'utf8'));
  return {
    id: roleId,
    name: frontmatter.name || fallback.name,
    source: fallback.source,
    preferred_skills: Array.isArray(frontmatter.preferred_skills) ? frontmatter.preferred_skills : [],
  };
}

function inferProjectProfile(targetDir) {
  const manifestCandidates = [
    path.join(targetDir, '.ai-spec', 'manifest.json'),
    path.join(targetDir, 'manifest.json'),
  ];

  for (const filePath of manifestCandidates) {
    if (!fs.existsSync(filePath)) {
      continue;
    }
    try {
      const json = readJsonFile(filePath, 'manifest');
      if (json.profile) {
        return json.profile;
      }
    } catch (error) {
      // ignore malformed local manifest during runtime inference
    }
  }

  const packagePath = path.join(targetDir, 'package.json');
  if (fs.existsSync(packagePath)) {
    try {
      const pkg = readJsonFile(packagePath, 'package.json');
      const deps = {
        ...(pkg.dependencies || {}),
        ...(pkg.devDependencies || {}),
      };
      if (deps.vue) {
        return 'vue';
      }
      if (deps.react) {
        return 'react';
      }
    } catch (error) {
      // ignore
    }
  }

  return 'unknown';
}

function resolveExistingRuntimeEntry(entry) {
  for (const candidatePath of getCandidatePaths(entry)) {
    if (!fs.existsSync(candidatePath)) {
      continue;
    }

    return {
      path: candidatePath,
      relPath: candidatePath === entry.path ? entry.relPath : entry.legacyRelPath,
      exists: true,
    };
  }

  return {
    path: entry.path,
    relPath: entry.relPath,
    exists: false,
  };
}

function createRunnerSnapshot(targetDir) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const currentDispatchEntry = resolveExistingRuntimeEntry(runtimePaths.currentDispatch);
  const currentExecutionEntry = resolveExistingRuntimeEntry(runtimePaths.currentExecutionJson);
  const currentRuntimeActionEntry = resolveExistingRuntimeEntry(runtimePaths.currentRuntimeActionJson);

  const pendingInputs = [];
  for (const spec of INBOX_SPECS) {
    const entry = resolveExistingRuntimeEntry(runtimePaths[spec.pathKey]);
    if (!entry.exists) {
      continue;
    }

    pendingInputs.push({
      ...spec,
      path: entry.path,
      relPath: entry.relPath,
      exists: true,
    });
  }

  return {
    targetDir,
    runtimePaths,
    pendingInputs,
    current: {
      run: loadJsonIfExists(runtimePaths.currentRun.path, 'current run-state'),
      dispatch: currentDispatchEntry.exists ? readJsonFile(currentDispatchEntry.path, 'current dispatch') : null,
      execution: currentExecutionEntry.exists ? readJsonFile(currentExecutionEntry.path, 'current execution') : null,
      runtimeAction: currentRuntimeActionEntry.exists ? readJsonFile(currentRuntimeActionEntry.path, 'current runtime action') : null,
    },
  };
}

function resolvePendingInputs(targetDir, snapshot = null) {
  const activeSnapshot = snapshot || createRunnerSnapshot(targetDir);
  return activeSnapshot.pendingInputs.map((item) => ({ ...item }));
}

function loadCurrentArtifacts(targetDir, snapshot = null) {
  const activeSnapshot = snapshot || createRunnerSnapshot(targetDir);
  return {
    run: activeSnapshot.current.run,
    dispatch: activeSnapshot.current.dispatch,
    execution: activeSnapshot.current.execution,
    runtimeAction: activeSnapshot.current.runtimeAction,
  };
}

function buildNextExpectedFromSnapshot(snapshot) {
  const pendingInputs = snapshot.pendingInputs;
  const runtimePaths = snapshot.runtimePaths;
  if (pendingInputs.length > 0) {
    return {
      producer: 'runner',
      files: pendingInputs.map((item) => item.relPath),
      reason: 'runner inbox still has pending input; consume it before requesting new AI output',
    };
  }

  const current = snapshot.current;

  if (!current.run) {
    return {
      producer: 'task-orchestrator',
      files: [runtimePaths.tmpTaskOrchestratorTurn.relPath],
      reason: 'no current run-state yet; waiting for task-orchestrator bootstrap turn',
    };
  }

  if (TERMINAL_STATUSES.has(current.run.status)) {
    return {
      producer: null,
      files: [],
      reason: 'run is already in terminal state',
    };
  }

  if (String(current.run.status || '').trim().toLowerCase() === 'paused') {
    return {
      producer: 'task-orchestrator',
      files: [],
      reason: 'run is paused and waiting for resume',
    };
  }

  if (String(current.run.status || '').trim().toLowerCase() === 'waiting-confirm') {
    return {
      producer: 'task-orchestrator',
      files: [],
      reason: 'run is waiting at confirm gate before continuing',
    };
  }

  if (current.execution) {
    return {
      producer: 'task-orchestrator',
      files: [
        runtimePaths.tmpTaskOrchestratorTurn.relPath,
        runtimePaths.tmpCurrentRuntimeAction.relPath,
      ],
      reason: 'expert execution has been recorded; waiting for task-orchestrator runtime action',
    };
  }

  if (current.dispatch) {
    return {
      producer: current.dispatch.role?.id || 'current-expert',
      files: [runtimePaths.tmpCurrentExecution.relPath],
      reason: 'current expert dispatch is active; waiting for expert execution output',
    };
  }

  if (current.run.pending_gate) {
    return {
      producer: 'task-orchestrator',
      files: [
        runtimePaths.tmpTaskOrchestratorTurn.relPath,
        runtimePaths.tmpCurrentRuntimeAction.relPath,
      ],
      reason: `run is waiting at approval gate "${current.run.pending_gate}"`,
    };
  }

  return {
    producer: 'task-orchestrator',
    files: [runtimePaths.tmpCurrentDispatch.relPath],
    reason: 'run-state is ready for the next expert dispatch',
  };
}

function buildNextExpected(targetDir, snapshot = null) {
  return buildNextExpectedFromSnapshot(snapshot || createRunnerSnapshot(targetDir));
}

function buildStatus(targetDir) {
  const snapshot = createRunnerSnapshot(targetDir);
  const pendingInputs = snapshot.pendingInputs;
  const current = snapshot.current;
  const nextExpected = buildNextExpectedFromSnapshot(snapshot);

  return {
    kind: 'task-orchestrator-runner-status',
    status: pendingInputs.length > 1 ? 'blocked' : 'ready',
    target: targetDir,
    pending_inputs: pendingInputs.map((item) => ({
      kind: item.kind,
      producer: item.producer,
      path: item.relPath,
    })),
    current: {
      run_id: current.run?.run_id || null,
      run_status: current.run?.status || null,
      mode: current.run?.mode || null,
      review_policy: current.run?.review_policy || null,
      current_role: current.run?.current_role || null,
      pending_gate: current.run?.pending_gate || null,
      dispatch_role: current.dispatch?.role?.id || null,
      execution_role: current.execution?.role?.id || null,
      runtime_action: current.runtimeAction?.action || null,
    },
    next_expected: nextExpected,
  };
}

function archiveConsumedInput(targetDir, filePath, kind) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  if (!shouldPersistHistory()) {
    fs.unlinkSync(filePath);
    return null;
  }

  const runtimePaths = resolveRuntimePaths(targetDir);
  const consumedDir = runtimePaths.runnerConsumedDir.path;
  ensureDir(consumedDir);

  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const archivedPath = path.join(consumedDir, `${stamp}__${kind}__${path.basename(filePath)}`);
  fs.renameSync(filePath, archivedPath);

  return archivedPath;
}

function summarizeAppliedState(applied) {
  if (!applied || !applied.result || !applied.result.state) {
    return null;
  }

  return {
    adapter_action: applied.adapter_action,
    run_id: applied.result.state.run_id || null,
    status: applied.result.state.status || null,
    current_role: applied.result.state.current_role || null,
    pending_gate: applied.result.state.pending_gate || null,
  };
}

function buildRuntimeOptionsFromPayload(payload, targetDir) {
  const options = {
    target: targetDir,
  };
  const mappings = [
    ['runId', ['run_id', 'runId']],
    ['toRole', ['to_role', 'toRole']],
    ['nextRole', ['next_role', 'nextRole']],
    ['fromRole', ['from_role', 'fromRole']],
    ['gate', ['gate']],
    ['pendingGate', ['pending_gate', 'pendingGate']],
    ['blockedByRole', ['blocked_by_role', 'blockedByRole']],
    ['resumeToRole', ['resume_to_role', 'resumeToRole']],
    ['requiredUserAction', ['required_user_action', 'requiredUserAction']],
    ['blockedReason', ['blocked_reason', 'blockedReason']],
    ['message', ['message']],
    ['error', ['error']],
    ['eventType', ['event_type', 'eventType']],
    ['status', ['status']],
  ];

  for (const [targetKey, sourceKeys] of mappings) {
    for (const sourceKey of sourceKeys) {
      if (Object.prototype.hasOwnProperty.call(payload, sourceKey)) {
        options[targetKey] = payload[sourceKey];
        break;
      }
    }
  }

  if (Object.prototype.hasOwnProperty.call(payload, 'clear_pending_gate') || Object.prototype.hasOwnProperty.call(payload, 'clearPendingGate')) {
    options.clearPendingGate = Boolean(
      Object.prototype.hasOwnProperty.call(payload, 'clear_pending_gate')
        ? payload.clear_pending_gate
        : payload.clearPendingGate,
    );
  }

  if (payload.task_anchor || payload.taskAnchor) {
    options.taskAnchorData = payload.task_anchor || payload.taskAnchor;
  }
  if (payload.artifacts && typeof payload.artifacts === 'object') {
    options.artifactsData = payload.artifacts;
  }
  if (payload.verification && typeof payload.verification === 'object') {
    options.verificationData = payload.verification;
  }
  if (payload.auto_fix && typeof payload.auto_fix === 'object') {
    options.autoFixData = payload.auto_fix;
  }
  if (Object.prototype.hasOwnProperty.call(payload, 'skip_artifact_check') || Object.prototype.hasOwnProperty.call(payload, 'skipArtifactCheck')) {
    options.skipArtifactCheck = Boolean(
      Object.prototype.hasOwnProperty.call(payload, 'skip_artifact_check')
        ? payload.skip_artifact_check
        : payload.skipArtifactCheck
    );
  }

  return options;
}

function clearCurrentExpertArtifacts(targetDir) {
  return {
    dispatch: expertDispatch.clearDispatch({ target: targetDir }),
    execution: expertExecutor.clearExecution({ target: targetDir }),
    runtime_action: expertExecutor.clearRuntimeAction({ target: targetDir }),
  };
}

function applyRuntimeMutation({ targetDir, action, payload, payloadSource }) {
  const guardedPayload = guardRuntimeActionForIncompleteExecution(targetDir, payload);
  const normalizedAction = String(guardedPayload.action || action || '').toLowerCase();
  let result = null;

  if (normalizedAction === 'bootstrap') {
    result = runtimeState.bootstrapRunState({
      target: targetDir,
      payloadData: guardedPayload,
    });
  } else {
    const runtimeOptions = buildRuntimeOptionsFromPayload(guardedPayload, targetDir);
    switch (normalizedAction) {
      case 'handoff':
        result = runtimeState.handoffRunState(runtimeOptions);
        break;
      case 'approve':
        result = runtimeState.approveRunState(runtimeOptions);
        break;
      case 'resume':
        result = runtimeState.resumeRunState(runtimeOptions);
        break;
      case 'pause':
      case 'paused':
        result = runtimeState.pauseRunState(runtimeOptions);
        break;
      case 'gate-blocked':
      case 'blocked':
        result = runtimeState.gateBlockedRunState(runtimeOptions);
        break;
      case 'status':
        result = runtimeState.statusRunState(runtimeOptions);
        break;
      case 'complete':
      case 'completed':
        result = runtimeState.completeRunState(runtimeOptions);
        break;
      case 'fail':
      case 'failed':
        result = runtimeState.failRunState(runtimeOptions);
        break;
      case 'cancel':
      case 'cancelled':
        result = runtimeState.cancelRunState(runtimeOptions);
        break;
      default:
        throw new Error(`Unsupported runtime action: ${action}`);
    }
  }

  const applied = {
    adapter_action: normalizedAction === 'completed' ? 'complete' : normalizedAction,
    adapter_source: payloadSource,
    result,
  };

  if (['bootstrap', 'handoff', 'approve', 'resume', 'pause', 'gate-blocked', 'complete', 'fail', 'cancel'].includes(applied.adapter_action)) {
    return {
      ...applied,
      ...clearCurrentExpertArtifacts(targetDir),
    };
  }

  return applied;
}

function tryReadJsonValue(filePath) {
  try {
    return readJsonFile(filePath, 'task-orchestrator turn');
  } catch (error) {
    return null;
  }
}

function resolveTaskOrchestratorTurn(filePath) {
  const parsed = tryReadJsonValue(filePath);
  if (parsed && typeof parsed === 'object') {
    if (parsed.kind === 'run-plan' || parsed.kind === 'task-orchestrator-bootstrap' || parsed.run_plan || parsed.runPlan) {
      return {
        action: 'bootstrap',
        payload: parsed,
      };
    }

    if (parsed.kind === 'task-orchestrator-runtime-action' || parsed.kind === 'task-orchestrator-runtime-event') {
      return {
        action: parsed.action || parsed.event,
        payload: parsed,
      };
    }
  }

  const replyText = readTextFile(filePath, 'task-orchestrator turn');
  const extracted = extractor.extractPayloadFromText(replyText, filePath);
  return {
    action: extracted.action,
    payload: extracted.payload,
  };
}

function readCurrentRun(targetDir) {
  return createRunnerSnapshot(targetDir).current.run;
}

function buildTaskAnchorForRole(currentRun, currentRole, nextRole) {
  const anchor = currentRun.anchor || {};
  return {
    schema_version: 1,
    kind: 'task-anchor',
    task: {
      ...(anchor.task || {}),
      raw_goal: anchor.task?.raw_goal || currentRun.trigger?.raw_input || null,
      change_id: anchor.task?.change_id || currentRun.task?.change_id || null,
      input_kind: anchor.task?.input_kind || currentRun.task?.input_kind || 'natural-language',
    },
    stage: {
      ...(anchor.stage || {}),
      flow_id: anchor.stage?.flow_id || currentRun.flow?.id || null,
      current_role: currentRole,
      next_role: nextRole,
    },
    constraints: anchor.constraints || null,
    artifacts: anchor.artifacts || currentRun.artifacts || null,
    expected_output: anchor.expected_output || [],
  };
}

function buildAutoDispatch(targetDir, currentRun) {
  if (!currentRun || !currentRun.current_role || TERMINAL_STATUSES.has(currentRun.status)) {
    return null;
  }
  if (currentRun.pending_gate) {
    return null;
  }

  const roleId = currentRun.current_role;
  const transition = getRuntimeTransition(targetDir, currentRun.flow?.id || '', roleId);
  const role = loadRoleMetadata(targetDir, roleId);
  const artifactProfile = currentRun.artifact_profile || 'full';
  const deliveryProfile = currentRun.delivery_profile || null;
  const expectedOutput = ROLE_EXPECTED_OUTPUTS[roleId]?.[artifactProfile] || ROLE_EXPECTED_OUTPUTS[roleId]?.full || [];
  const immediateNextRole = transition?.action === 'handoff'
    ? transition.to_role || null
    : transition?.next_role || null;
  const nextRole = currentRun.anchor?.stage?.next_role !== undefined
    ? currentRun.anchor?.stage?.next_role
    : immediateNextRole;
  const preferredSkills = Array.isArray(role.preferred_skills)
    ? role.preferred_skills.filter((id) => {
        if (deliveryProfile !== 'micro') {
          return true;
        }
        const microAllowlist = {
          'requirement-analyst': new Set(['create-proposal', 'design-analysis']),
          'frontend-implementer': new Set(['create-view', 'create-route', 'create-api', 'theme-variables', 'create-component', 'create-store']),
          'code-guardian': new Set(['ui-verification', 'web-design-guidelines']),
        };
        return microAllowlist[roleId]?.has(id) ?? true;
      })
    : [];

  return {
    schema_version: 1,
    kind: 'expert-dispatch',
    run_id: currentRun.run_id,
    status: currentRun.status === 'planned' ? 'planned' : 'running',
    role,
    task: {
      raw_goal: currentRun.anchor?.task?.raw_goal || currentRun.trigger?.raw_input || null,
      change_id: currentRun.task?.change_id || currentRun.anchor?.task?.change_id || null,
    },
    flow: {
      id: currentRun.flow?.id || null,
    },
    execution: {
      profile: inferProjectProfile(targetDir),
      delivery_profile: deliveryProfile,
      artifact_profile: currentRun.artifact_profile || null,
      current_role: roleId,
      next_role: nextRole,
      pending_gate: currentRun.pending_gate || null,
      expected_output: expectedOutput,
      skills: preferredSkills.map((id) => ({ id })),
    },
    anchor: buildTaskAnchorForRole(currentRun, roleId, nextRole),
    instructions: {
      source: role.source,
      markdown: `# ${roleId}`,
    },
  };
}

function maybeAutoDispatchCurrentRole(targetDir, applied) {
  if (!applied || !AUTO_DISPATCH_ALLOWED_ACTIONS.has(applied.adapter_action)) {
    return null;
  }

  const snapshot = createRunnerSnapshot(targetDir);
  const currentRun = snapshot.current.run;
  if (
    !currentRun ||
    !currentRun.current_role ||
    currentRun.pending_gate ||
    String(currentRun.status || '').trim().toLowerCase() === 'waiting-confirm' ||
    TERMINAL_STATUSES.has(currentRun.status)
  ) {
    return null;
  }

  if (snapshot.current.dispatch) {
    return null;
  }

  const payload = buildAutoDispatch(targetDir, currentRun);
  if (!payload) {
    return null;
  }

  return expertDispatch.applyDispatchData({
    target: targetDir,
    payloadData: payload,
    source: 'runner-auto-dispatch',
  });
}

function formatAdvanceRecorded(recorded) {
  if (!recorded) {
    return null;
  }

  return {
    dispatch: recorded.dispatch
      ? {
          run_id: recorded.dispatch.payload.run_id,
          role: recorded.dispatch.payload.role.id,
          dispatch_id: recorded.dispatch.payload.dispatch_id,
        }
      : null,
    execution: recorded.execution
      ? {
          run_id: recorded.execution.payload.run_id,
          role: recorded.execution.payload.role.id,
          execution_id: recorded.execution.payload.execution_id,
        }
      : null,
    runtime_action: recorded.runtime_action
      ? {
          run_id: recorded.runtime_action.payload.run_id || null,
          action: recorded.runtime_action.payload.action || null,
          action_id: recorded.runtime_action.payload.action_id || null,
        }
      : null,
  };
}

function advanceRunner(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const pendingInputs = resolvePendingInputs(targetDir);

  if (pendingInputs.length === 0) {
    return {
      kind: 'task-orchestrator-runner-advance-result',
      status: 'idle',
      target: targetDir,
      consumed: null,
      recorded: null,
      applied: null,
      next_expected: buildNextExpected(targetDir),
    };
  }

  if (pendingInputs.length > 1) {
    const pendingLabels = pendingInputs.map((item) => item.relPath).join(', ');
    throw new Error(`runner inbox has multiple pending inputs: ${pendingLabels}`);
  }

  const pending = pendingInputs[0];
  let recorded = null;
  let applied = null;

  if (pending.kind === 'task-orchestrator-turn') {
    const orchestratorTurn = resolveTaskOrchestratorTurn(pending.path);
    if (orchestratorTurn.action !== 'bootstrap') {
      recorded = {
        runtime_action: {
          payload: orchestratorTurn.payload,
          source: pending.path,
        },
      };
    }
    applied = applyRuntimeMutation({
      targetDir,
      action: orchestratorTurn.action,
      payload: orchestratorTurn.payload,
      payloadSource: pending.path,
    });
  } else if (pending.kind === 'expert-dispatch') {
    recorded = {
      dispatch: expertDispatch.applyDispatch({
        target: targetDir,
        payload: pending.path,
      }),
    };
  } else if (pending.kind === 'expert-execution') {
    recorded = {
      execution: expertExecutor.applyExecution({
        target: targetDir,
        payload: pending.path,
      }),
    };
    const autoRuntimeAction = buildAutoRuntimeAction(targetDir, recorded.execution.payload);
    if (autoRuntimeAction) {
      if (recorded.execution.archive_result?.archived_artifacts) {
        autoRuntimeAction.artifacts = recorded.execution.archive_result.archived_artifacts;
        autoRuntimeAction.skip_artifact_check = true;
      }
      recorded.runtime_action = {
        payload: autoRuntimeAction,
        source: 'runner-auto-transition',
      };
      applied = applyRuntimeMutation({
        targetDir,
        action: autoRuntimeAction.action,
        payload: autoRuntimeAction,
        payloadSource: 'runner-auto-transition',
      });
    }
  } else if (pending.kind === 'task-orchestrator-runtime-action') {
    const runtimeActionPayload = readJsonFile(pending.path, 'runtime action');
    recorded = {
      runtime_action: {
        payload: runtimeActionPayload,
        source: pending.path,
      },
    };
    applied = applyRuntimeMutation({
      targetDir,
      action: runtimeActionPayload.action,
      payload: runtimeActionPayload,
      payloadSource: pending.path,
    });
  } else {
    throw new Error(`unsupported runner input kind: ${pending.kind}`);
  }

  if (!recorded) {
    recorded = {};
  }

  if (applied) {
    const autoDispatch = maybeAutoDispatchCurrentRole(targetDir, applied);
    if (autoDispatch) {
      recorded.dispatch = autoDispatch;
    }
  }

  const archivedTo = archiveConsumedInput(targetDir, pending.path, pending.kind);

  return {
    kind: 'task-orchestrator-runner-advance-result',
    status: 'success',
    target: targetDir,
    consumed: {
      kind: pending.kind,
      producer: pending.producer,
      path: pending.relPath,
      archived_to: archivedTo,
    },
    recorded: formatAdvanceRecorded(recorded),
    applied: summarizeAppliedState(applied),
    next_expected: buildNextExpected(targetDir),
  };
}

function advanceRunnerWithRuntimeActionData(options = {}) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const payload = options.payloadData;
  if (!payload || typeof payload !== 'object') {
    throw new Error('Missing runtime-action payloadData for in-memory runner advance');
  }
  if (payload.kind !== 'task-orchestrator-runtime-action') {
    throw new Error(`Expected kind "task-orchestrator-runtime-action" but got "${payload.kind || 'undefined'}"`);
  }

  const recorded = {
    runtime_action: {
      payload,
      source: options.source || 'memory-runtime-action',
    },
  };
  const applied = applyRuntimeMutation({
    targetDir,
    action: payload.action,
    payload,
    payloadSource: recorded.runtime_action.source,
  });

  if (applied) {
    const autoDispatch = maybeAutoDispatchCurrentRole(targetDir, applied);
    if (autoDispatch) {
      recorded.dispatch = autoDispatch;
    }
  }

  return {
    kind: 'task-orchestrator-runner-advance-result',
    status: 'success',
    target: targetDir,
    consumed: null,
    recorded: formatAdvanceRecorded(recorded),
    applied: summarizeAppliedState(applied),
    next_expected: buildNextExpected(targetDir),
  };
}

function replayReplies(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const steps = [];
  let lastApplied = null;

  for (let index = 0; index < options.replies.length; index += 1) {
    const replyPath = path.resolve(process.cwd(), options.replies[index]);
    const orchestratorTurn = resolveTaskOrchestratorTurn(replyPath);
    const applied = applyRuntimeMutation({
      targetDir,
      action: orchestratorTurn.action,
      payload: orchestratorTurn.payload,
      payloadSource: replyPath,
    });

    lastApplied = applied;
    steps.push({
      index: index + 1,
      reply: replyPath,
      action_source: orchestratorTurn.payload.kind || null,
      action: applied.adapter_action,
      run_id: applied.result?.state?.run_id || null,
      status: applied.result?.state?.status || null,
      current_role: applied.result?.state?.current_role || null,
      pending_gate: applied.result?.state?.pending_gate || null,
    });
  }

  const finalState = lastApplied?.result?.state || null;
  return {
    kind: 'task-orchestrator-runner-result',
    status: 'success',
    target: targetDir,
    steps,
    summary: {
      step_count: steps.length,
      run_id: finalState?.run_id || null,
      status: finalState?.status || null,
      current_role: finalState?.current_role || null,
      pending_gate: finalState?.pending_gate || null,
    },
    state: finalState,
  };
}

function printPretty(result) {
  if (result.kind === 'task-orchestrator-runner-status') {
    console.log('task-orchestrator runner status');
    console.log(`  target: ${result.target}`);
    console.log(`  run_id: ${result.current.run_id || 'n/a'}`);
    console.log(`  run_status: ${result.current.run_status || 'n/a'}`);
    console.log(`  current_role: ${result.current.current_role || 'n/a'}`);
    console.log(`  pending_gate: ${result.current.pending_gate || 'n/a'}`);
    console.log(`  pending_inputs: ${result.pending_inputs.length}`);
    for (const pending of result.pending_inputs) {
      console.log(`  pending -> ${pending.kind} @ ${pending.path}`);
    }
    console.log(`  next_expected: ${result.next_expected.producer || 'none'}`);
    for (const file of result.next_expected.files) {
      console.log(`    - ${file}`);
    }
    return;
  }

  if (result.kind === 'task-orchestrator-runner-advance-result') {
    console.log('task-orchestrator runner advanced');
    console.log(`  target: ${result.target}`);
    console.log(`  status: ${result.status}`);
    if (result.consumed) {
      console.log(`  consumed: ${result.consumed.kind} <- ${result.consumed.path}`);
      console.log(`  archived_to: ${result.consumed.archived_to}`);
    }
    if (result.applied) {
      console.log(`  adapter_action: ${result.applied.adapter_action}`);
      console.log(`  run_id: ${result.applied.run_id || 'n/a'}`);
      console.log(`  run_status: ${result.applied.status || 'n/a'}`);
      console.log(`  current_role: ${result.applied.current_role || 'n/a'}`);
    }
    console.log(`  next_expected: ${result.next_expected.producer || 'none'}`);
    for (const file of result.next_expected.files) {
      console.log(`    - ${file}`);
    }
    return;
  }

  console.log('task-orchestrator runner replayed');
  console.log(`  target: ${result.target}`);
  console.log(`  steps: ${result.summary.step_count}`);
  console.log(`  run_id: ${result.summary.run_id || 'n/a'}`);
  console.log(`  status: ${result.summary.status || 'n/a'}`);
  console.log(`  current_role: ${result.summary.current_role || 'n/a'}`);
  console.log(`  pending_gate: ${result.summary.pending_gate || 'n/a'}`);

  for (const step of result.steps) {
    console.log(`  [${step.index}] ${step.action} <- ${step.reply}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return 0;
  }

  if (command === 'status') {
    const result = buildStatus(path.resolve(process.cwd(), options.target || '.'));
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result);
    }
    return 0;
  }

  if (command === 'advance') {
    const result = advanceRunner(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result);
    }
    return 0;
  }

  if (command !== 'replay') {
    throw new Error(`Unsupported task-orchestrator-runner command: ${command}`);
  }

  if (options.replies.length === 0) {
    throw new Error('Missing runner input: use --reply <file> at least once');
  }

  const result = replayReplies(options);

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printPretty(result);
  }

  return 0;
}

if (require.main === module) {
  try {
    const exitCode = main();
    process.exit(exitCode);
  } catch (error) {
    console.error(`task-orchestrator-runner error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  main,
  parseArgs,
  buildStatus,
  advanceRunner,
  advanceRunnerWithRuntimeActionData,
  replayReplies,
};
