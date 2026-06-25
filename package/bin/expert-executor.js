#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const runtimeState = require('./runtime-state');
const expertDispatch = require('./expert-dispatch');
const { archiveChange } = require('./archive-change');
const {
  getRoleArtifactRequirements,
  inferExecutionOpenSpecAction,
  inferRuntimeActionOpenSpecAction,
  buildAutoRuntimeAction,
  guardRuntimeActionForIncompleteExecution,
} = require('./execution-semantics');
const {
  resolveRuntimePaths,
  getCandidatePaths,
  getExistingPath,
  shouldPersistHistory,
} = require('./runtime-paths');
const { drainVisualRuntimeStatePushes } = require('../internal/visual-hooks/runtime-state-pusher');

function printUsage() {
  console.log(`Usage:
  ai-spec-auto expert-executor apply --payload <file> [options]
  ai-spec-auto expert-executor apply --stdin [options]
  ai-spec-auto expert-executor apply-action --payload <file> [options]
  ai-spec-auto expert-executor apply-action --stdin [options]
  ai-spec-auto expert-executor clear [options]
  ai-spec-auto expert-executor clear-action [options]

Options:
  --target <dir>         Target project directory (default: .)
  --payload <file>       Path to payload JSON file
  --stdin                Read payload JSON from stdin
  --advance-runtime      Persist payload and apply inferred runtime-state mutation
  --json                 Print JSON result only
  --pretty               Print readable summary (default)
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {
    target: '.',
    pretty: true,
    json: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--target':
        options.target = args.shift();
        break;
      case '--payload':
        options.payload = args.shift();
        break;
      case '--stdin':
        options.stdin = true;
        break;
      case '--advance-runtime':
        options.advanceRuntime = true;
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

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJson(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function writeText(filePath, value) {
  fs.writeFileSync(filePath, `${value}\n`, 'utf8');
}

function readJson(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function readJsonFromStdin(label) {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw.trim()) {
    throw new Error(`${label} stdin is empty`);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} stdin is not valid JSON`);
  }
}

function createStampedId(prefix, suffix = '', now = new Date()) {
  const iso = now.toISOString().replace(/[:.]/g, '-');
  return suffix ? `${iso}__${suffix}` : `${prefix}_${iso}`;
}

function normalizeList(value) {
  if (!value) return [];
  if (Array.isArray(value)) return value.filter(Boolean);
  return [String(value)].filter(Boolean);
}

function loadPackageManifest(targetDir) {
  const packagePath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  return readJson(packagePath, 'package.json');
}

function detectPackageManager(targetDir) {
  if (fs.existsSync(path.join(targetDir, 'pnpm-lock.yaml'))) {
    return 'pnpm';
  }
  if (fs.existsSync(path.join(targetDir, 'yarn.lock'))) {
    return 'yarn';
  }
  if (fs.existsSync(path.join(targetDir, 'package-lock.json'))) {
    return 'npm';
  }
  return 'npm';
}

function trimOutput(value, maxLength = 400) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function buildVerificationCommand(packageManager, stepName) {
  if (packageManager === 'yarn') {
    return {
      command: 'yarn',
      args: [stepName],
      printable: `yarn ${stepName}`,
    };
  }

  return {
    command: packageManager,
    args: ['run', stepName],
    printable: `${packageManager} run ${stepName}`,
  };
}

function runVerificationSuite(targetDir) {
  const pkg = loadPackageManifest(targetDir);
  const scripts = pkg?.scripts && typeof pkg.scripts === 'object' ? pkg.scripts : {};
  const packageManager = detectPackageManager(targetDir);
  const stepNames = ['build', 'lint', 'test'];
  const steps = [];

  for (const stepName of stepNames) {
    if (typeof scripts[stepName] !== 'string' || !scripts[stepName].trim()) {
      steps.push({
        name: stepName,
        status: 'skipped',
        reason: `package.json scripts.${stepName} 未定义`,
      });
      continue;
    }

    const command = buildVerificationCommand(packageManager, stepName);
    const result = spawnSync(command.command, command.args, {
      cwd: targetDir,
      encoding: 'utf8',
      env: process.env,
    });

    if (result.error) {
      steps.push({
        name: stepName,
        command: command.printable,
        status: 'failed',
        exit_code: typeof result.status === 'number' ? result.status : null,
        error: result.error.message,
      });
      continue;
    }

    steps.push({
      name: stepName,
      command: command.printable,
      status: result.status === 0 ? 'passed' : 'failed',
      exit_code: typeof result.status === 'number' ? result.status : null,
      stdout_excerpt: trimOutput(result.stdout),
      stderr_excerpt: trimOutput(result.stderr),
    });
  }

  const summary = steps.reduce((accumulator, step) => {
    const key = step.status === 'passed' || step.status === 'failed' ? step.status : 'skipped';
    accumulator[key] += 1;
    return accumulator;
  }, { passed: 0, failed: 0, skipped: 0 });

  return {
    schema_version: 1,
    kind: 'verification',
    auto_generated: true,
    generated_at: new Date().toISOString(),
    package_manager: packageManager,
    overall_status: summary.failed > 0 ? 'failed' : summary.passed > 0 ? 'passed' : 'skipped',
    steps,
    summary,
  };
}

function shouldWriteRuntimeMarkdown() {
  return shouldPersistHistory() || process.env.AI_SPEC_WRITE_RUNTIME_MD === '1';
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }

  return readJson(filePath, 'json');
}

function resolveRuntimeContext(targetDir) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  return {
    runtimePaths,
    currentRun: readJsonIfExists(runtimePaths.currentRun.path),
    currentDispatch: readJsonIfExists(getExistingPath(runtimePaths.currentDispatch)),
  };
}

function shouldAdvanceRuntime(options = {}) {
  return options.advanceRuntime === true;
}

function buildExecutionArtifactMap(changeId, artifacts = {}, options = {}) {
  const flowId = String(options.flowId || '').trim();
  const runId = String(options.runId || '').trim();
  const traceMode = String(options.traceMode || '').trim();
  const implementationNotes = artifacts.implementation_notes || artifacts.implementationNotes || null;

  if ((flowId === 'bugfix-to-verification' || traceMode === 'direct-fix') && runId) {
    const historyDir = `.ai-spec/history/${runId}`;
    return {
      proposal: null,
      specs: null,
      design: null,
      tasks: null,
      bugfix: artifacts.bugfix || `${historyDir}/bugfix.md`,
      implementation_notes: implementationNotes || `${historyDir}/implementation-notes.md`,
      checklist: artifacts.checklist || `${historyDir}/checklist.md`,
      iterations: artifacts.iterations || `${historyDir}/iterations.md`,
    };
  }

  if (!changeId) {
    return {
      proposal: null,
      specs: null,
      design: null,
      tasks: null,
      bugfix: artifacts.bugfix || null,
      implementation_notes: implementationNotes,
      checklist: artifacts.checklist || null,
      iterations: artifacts.iterations || null,
    };
  }

  const baseDir = `openspec/changes/${changeId}`;
  return {
    proposal: artifacts.proposal || `${baseDir}/proposal.md`,
    specs: runtimeState.normalizeSpecsArtifactPath(artifacts.specs || `${baseDir}/specs`),
    design: artifacts.design || `${baseDir}/design.md`,
    tasks: artifacts.tasks || `${baseDir}/tasks.md`,
    bugfix: artifacts.bugfix || null,
    implementation_notes: implementationNotes,
    checklist: artifacts.checklist || `${baseDir}/checklist.md`,
    iterations: artifacts.iterations || `${baseDir}/iterations.md`,
  };
}

function hydrateExecutionPayload(targetDir, payload) {
  const hydrated = JSON.parse(JSON.stringify(payload || {}));
  const context = resolveRuntimeContext(targetDir);
  const { currentRun, currentDispatch } = context;

  hydrated.run_id = hydrated.run_id || currentDispatch?.run_id || currentRun?.run_id || null;
  hydrated.dispatch_id = hydrated.dispatch_id || currentDispatch?.dispatch_id || null;
  hydrated.role = typeof hydrated.role === 'object' && hydrated.role ? hydrated.role : {};
  hydrated.role.id = hydrated.role.id || currentDispatch?.role?.id || null;
  hydrated.role.name = hydrated.role.name || currentDispatch?.role?.name || null;
  hydrated.flow = typeof hydrated.flow === 'object' && hydrated.flow ? hydrated.flow : {};
  hydrated.flow.id = hydrated.flow.id || currentDispatch?.flow?.id || currentRun?.flow?.id || null;
  hydrated.task = typeof hydrated.task === 'object' && hydrated.task ? hydrated.task : {};
  hydrated.task.change_id =
    hydrated.task.change_id ||
    currentDispatch?.task?.change_id ||
    currentRun?.task?.change_id ||
    currentRun?.anchor?.task?.change_id ||
    null;
  hydrated.task.trace_mode =
    hydrated.task.trace_mode ||
    currentRun?.task?.trace_mode ||
    currentRun?.incremental_update?.trace_mode ||
    null;

  const artifactMap = buildExecutionArtifactMap(
    hydrated.task.change_id,
    currentRun?.artifacts || {},
    {
      flowId: hydrated.flow.id,
      runId: hydrated.run_id,
      traceMode: hydrated.task.trace_mode,
    },
  );
  hydrated.artifacts = {
    ...artifactMap,
    ...(typeof hydrated.artifacts === 'object' && hydrated.artifacts ? hydrated.artifacts : {}),
  };
  hydrated.openspec_action = hydrated.openspec_action || inferExecutionOpenSpecAction(hydrated, targetDir);

  return {
    payload: hydrated,
    context,
  };
}

function hydrateRuntimeActionPayload(targetDir, payload) {
  const hydrated = JSON.parse(JSON.stringify(payload || {}));
  const context = resolveRuntimeContext(targetDir);
  const { currentRun } = context;

  hydrated.run_id = hydrated.run_id || currentRun?.run_id || null;
  hydrated.from_role = hydrated.from_role || currentRun?.current_role || null;
  hydrated.to_role = hydrated.to_role || null;
  hydrated.openspec_action = hydrated.openspec_action || inferRuntimeActionOpenSpecAction(hydrated);

  return {
    payload: hydrated,
    context,
  };
}

function collectMissingArtifacts(targetDir, artifactMap, keys) {
  return keys
    .map((key) => artifactMap[key])
    .filter((relPath) => !relPath || !fs.existsSync(path.join(targetDir, relPath)));
}

function validateExecutionArtifacts(targetDir, payload) {
  const flowId = payload.flow?.id || null;
  const changeId = payload.task?.change_id || null;
  if (flowId === 'prd-to-delivery' && !changeId) {
    throw new Error(
      `Execution payload for ${payload.role.id} requires task.change_id or current-run.task.change_id to resolve OpenSpec artifacts`,
    );
  }

  const artifactMap = buildExecutionArtifactMap(changeId, payload.artifacts || {}, {
    flowId,
    runId: payload.run_id,
    traceMode: payload.task?.trace_mode || null,
  });
  const requirements = getRoleArtifactRequirements(targetDir, payload.role.id, flowId);
  const requiredInputs = requirements.required_inputs;
  const requiredOutputs = requirements.required_outputs;
  const missingInputs = collectMissingArtifacts(targetDir, artifactMap, requiredInputs);
  const missingOutputs = collectMissingArtifacts(targetDir, artifactMap, requiredOutputs);

  if (missingInputs.length > 0) {
    throw new Error(
      `Execution payload for ${payload.role.id} is missing required inputs: ${missingInputs.join(', ')}`,
    );
  }
  if (missingOutputs.length > 0) {
    throw new Error(
      `Execution payload for ${payload.role.id} is missing required artifacts: ${missingOutputs.join(', ')}`,
    );
  }

  return {
    change_id: changeId,
    openspec_action: payload.openspec_action || null,
    required_inputs: requiredInputs.map((key) => artifactMap[key]),
    required_outputs: requiredOutputs.map((key) => artifactMap[key]),
    artifact_map: artifactMap,
  };
}

function shouldTriggerArchiveChange(payload) {
  const roleId = payload?.role?.id || null;
  const status = String(payload?.status || '').trim().toLowerCase();
  return roleId === 'archive-change' && ['done', 'success', 'completed'].includes(status);
}

function maybeApplyArchiveChange(targetDir, payload) {
  if (!shouldTriggerArchiveChange(payload)) {
    return null;
  }

  return archiveChange({
    target: targetDir,
    changeId: payload.task?.change_id || null,
  });
}

function renderExecutionMarkdown(payload) {
  if (payload.markdown && typeof payload.markdown === 'string') {
    return payload.markdown.trim();
  }

  const lines = [];
  lines.push('# 当前专家执行载荷');
  lines.push('');
  lines.push(`- run_id（运行 ID）: ${payload.run_id || 'n/a'}`);
  lines.push(`- role（专家角色）: ${payload.role?.id || 'n/a'}${payload.role?.name ? `（${payload.role.name}）` : ''}`);
  if (payload.openspec_action) {
    lines.push(`- openspec_action（OpenSpec 动作）: ${payload.openspec_action}`);
  }
  lines.push(`- execution_id（执行 ID）: ${payload.execution_id || 'n/a'}`);
  lines.push(`- status（状态）: ${payload.status || 'n/a'}`);
  if (payload.flow?.id) lines.push(`- flow（流程模板）: ${payload.flow.id}`);
  lines.push('');
  lines.push('## 执行摘要');
  const steps = normalizeList(payload.execution_plan?.execution_steps);
  if (steps.length === 0) {
    lines.push('- 无');
  } else {
    for (const step of steps) {
      lines.push(`- ${step}`);
    }
  }
  return lines.join('\n').trim();
}

function renderRuntimeActionMarkdown(payload) {
  if (payload.markdown && typeof payload.markdown === 'string') {
    return payload.markdown.trim();
  }

  const lines = [];
  lines.push('# 当前运行动作草案');
  lines.push('');
  lines.push(`- run_id（运行 ID）: ${payload.run_id || 'n/a'}`);
  lines.push(`- action（动作）: ${payload.action || 'n/a'}`);
  if (payload.openspec_action) {
    lines.push(`- openspec_action（OpenSpec 动作）: ${payload.openspec_action}`);
  }
  lines.push(`- from_role（来源专家）: ${payload.from_role || 'n/a'}`);
  if (payload.to_role) lines.push(`- to_role（目标专家）: ${payload.to_role}`);
  if (payload.next_role) lines.push(`- next_role（下一位专家）: ${payload.next_role}`);
  lines.push(`- status（状态）: ${payload.status || 'n/a'}`);
  if (payload.message) lines.push(`- message（说明）: ${payload.message}`);
  return lines.join('\n').trim();
}

function validateExecutionPayload(payload, sourceLabel, context = {}) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Invalid execution payload: ${sourceLabel}`);
  }
  if (payload.kind !== 'expert-execution') {
    throw new Error(`Expected kind "expert-execution" but got "${payload.kind || 'undefined'}": ${sourceLabel}`);
  }
  if (!payload.run_id) {
    throw new Error(`Execution payload is missing run_id: ${sourceLabel}`);
  }
  if (!payload.role || typeof payload.role !== 'object' || !payload.role.id) {
    throw new Error(`Execution payload is missing role.id: ${sourceLabel}`);
  }

  const currentDispatch = context.currentDispatch || null;
  if (currentDispatch?.run_id && payload.run_id && currentDispatch.run_id !== payload.run_id) {
    throw new Error(
      `Execution payload run_id does not match current-dispatch: expected ${currentDispatch.run_id}, got ${payload.run_id}`,
    );
  }
  if (currentDispatch?.dispatch_id && payload.dispatch_id && currentDispatch.dispatch_id !== payload.dispatch_id) {
    throw new Error(
      `Execution payload dispatch_id does not match current-dispatch: expected ${currentDispatch.dispatch_id}, got ${payload.dispatch_id}`,
    );
  }
  if (currentDispatch?.role?.id && payload.role.id && currentDispatch.role.id !== payload.role.id) {
    throw new Error(
      `Execution payload role.id does not match current-dispatch: expected ${currentDispatch.role.id}, got ${payload.role.id}`,
    );
  }
}

function validateRuntimeActionPayload(payload, sourceLabel) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Invalid runtime-action payload: ${sourceLabel}`);
  }
  if (payload.kind !== 'task-orchestrator-runtime-action') {
    throw new Error(`Expected kind "task-orchestrator-runtime-action" but got "${payload.kind || 'undefined'}": ${sourceLabel}`);
  }
  if (!payload.run_id) {
    throw new Error(`Runtime-action payload is missing run_id: ${sourceLabel}`);
  }
  if (!payload.action) {
    throw new Error(`Runtime-action payload is missing action: ${sourceLabel}`);
  }
}

function normalizeExecutionPayload(payload) {
  const normalized = JSON.parse(JSON.stringify(payload));
  normalized.schema_version = normalized.schema_version || 1;
  normalized.kind = 'expert-execution';
  normalized.openspec_action = normalized.openspec_action || inferExecutionOpenSpecAction(normalized);
  normalized.execution_id = normalized.execution_id || createStampedId('execution', normalized.role.id);
  normalized.generated_at = normalized.generated_at || new Date().toISOString();
  if (normalized.markdown || shouldWriteRuntimeMarkdown()) {
    normalized.markdown = renderExecutionMarkdown(normalized);
  } else {
    delete normalized.markdown;
  }
  return normalized;
}

function attachVerificationIfNeeded(targetDir, payload) {
  if (payload?.role?.id !== 'frontend-implementer') {
    return payload;
  }

  const normalizedStatus = String(payload.status || '').trim().toLowerCase();
  if (!['done', 'success', 'completed'].includes(normalizedStatus)) {
    return payload;
  }

  if (payload.verification && Array.isArray(payload.verification.steps) && payload.verification.steps.length > 0) {
    return payload;
  }

  return {
    ...payload,
    verification: runVerificationSuite(targetDir),
  };
}

function normalizeRuntimeActionPayload(payload) {
  const normalized = JSON.parse(JSON.stringify(payload));
  normalized.schema_version = normalized.schema_version || 1;
  normalized.kind = 'task-orchestrator-runtime-action';
  normalized.openspec_action = normalized.openspec_action || inferRuntimeActionOpenSpecAction(normalized);
  normalized.action_id = normalized.action_id || createStampedId('action', normalized.action);
  normalized.generated_at = normalized.generated_at || new Date().toISOString();
  if (normalized.markdown || shouldWriteRuntimeMarkdown()) {
    normalized.markdown = renderRuntimeActionMarkdown(normalized);
  } else {
    delete normalized.markdown;
  }
  return normalized;
}

function writeExecutionArtifacts(targetDir, payload) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const currentExecutionJson = runtimePaths.currentExecutionJson.path;
  const currentExecutionMd = runtimePaths.currentExecutionMd.path;
  const persistHistory = shouldPersistHistory();
  const writeCurrentMarkdown = shouldWriteRuntimeMarkdown();
  let recordJson = null;
  let recordMd = null;
  if (persistHistory) {
    const executionsDir = path.join(runtimePaths.executionsDir.path, payload.run_id);
    ensureDir(executionsDir);
    recordJson = path.join(executionsDir, `${payload.execution_id}.json`);
    recordMd = path.join(executionsDir, `${payload.execution_id}.md`);
  }

  if (runtimePaths.currentExecutionJson.legacyPath && fs.existsSync(runtimePaths.currentExecutionJson.legacyPath)) {
    fs.unlinkSync(runtimePaths.currentExecutionJson.legacyPath);
  }
  if (runtimePaths.currentExecutionMd.legacyPath && fs.existsSync(runtimePaths.currentExecutionMd.legacyPath)) {
    fs.unlinkSync(runtimePaths.currentExecutionMd.legacyPath);
  }
  writeJson(currentExecutionJson, payload);
  if (writeCurrentMarkdown && payload.markdown) {
    writeText(currentExecutionMd, payload.markdown);
  }
  if (recordJson && recordMd && payload.markdown) {
    writeJson(recordJson, payload);
    writeText(recordMd, payload.markdown);
  } else if (recordJson) {
    writeJson(recordJson, payload);
  }

  return {
    current_execution_json: currentExecutionJson,
    current_execution_md: writeCurrentMarkdown && payload.markdown ? currentExecutionMd : null,
    execution_record_json: recordJson,
    execution_record_md: recordMd && payload.markdown ? recordMd : null,
  };
}

function writeRuntimeActionArtifacts(targetDir, payload) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const currentActionJson = runtimePaths.currentRuntimeActionJson.path;
  const currentActionMd = runtimePaths.currentRuntimeActionMd.path;
  const persistHistory = shouldPersistHistory();
  const writeCurrentMarkdown = shouldWriteRuntimeMarkdown();
  let recordJson = null;
  let recordMd = null;
  if (persistHistory) {
    const actionDir = path.join(runtimePaths.runtimeActionsDir.path, payload.run_id);
    ensureDir(actionDir);
    recordJson = path.join(actionDir, `${payload.action_id}.json`);
    recordMd = path.join(actionDir, `${payload.action_id}.md`);
  }

  if (runtimePaths.currentRuntimeActionJson.legacyPath && fs.existsSync(runtimePaths.currentRuntimeActionJson.legacyPath)) {
    fs.unlinkSync(runtimePaths.currentRuntimeActionJson.legacyPath);
  }
  if (runtimePaths.currentRuntimeActionMd.legacyPath && fs.existsSync(runtimePaths.currentRuntimeActionMd.legacyPath)) {
    fs.unlinkSync(runtimePaths.currentRuntimeActionMd.legacyPath);
  }
  writeJson(currentActionJson, payload);
  if (writeCurrentMarkdown && payload.markdown) {
    writeText(currentActionMd, payload.markdown);
  }
  if (recordJson && recordMd && payload.markdown) {
    writeJson(recordJson, payload);
    writeText(recordMd, payload.markdown);
  } else if (recordJson) {
    writeJson(recordJson, payload);
  }

  return {
    current_runtime_action_json: currentActionJson,
    current_runtime_action_md: writeCurrentMarkdown && payload.markdown ? currentActionMd : null,
    runtime_action_record_json: recordJson,
    runtime_action_record_md: recordMd && payload.markdown ? recordMd : null,
  };
}

function readPayloadFromOptions(options, label) {
  const inputCount = [Boolean(options.payload), Boolean(options.stdin)].filter(Boolean).length;
  if (inputCount === 0) {
    throw new Error(`Missing ${label} input: use --payload <file> or --stdin`);
  }
  if (inputCount > 1) {
    throw new Error('Use either --payload <file> or --stdin, not both');
  }

  const sourcePath = options.payload
    ? path.resolve(process.cwd(), options.payload)
    : 'stdin';

  const rawPayload = options.payload
    ? readJson(sourcePath, label)
    : readJsonFromStdin(label);

  return { sourcePath, rawPayload };
}

function cleanupTmpSource(targetDir, sourcePath) {
  if (!sourcePath || sourcePath === 'stdin' || !fs.existsSync(sourcePath)) {
    return null;
  }

  const runtimePaths = resolveRuntimePaths(path.resolve(targetDir));
  for (const candidate of getCandidatePaths(runtimePaths.tmpDir)) {
    const relative = path.relative(candidate, sourcePath);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      fs.unlinkSync(sourcePath);
      return sourcePath;
    }
  }
  return null;
}

function clearCurrentExpertArtifacts(targetDir) {
  return {
    dispatch: expertDispatch.clearDispatch({ target: targetDir }),
    execution: clearExecution({ target: targetDir }),
    runtime_action: clearRuntimeAction({ target: targetDir }),
  };
}

function applyRuntimeMutation(targetDir, payload, payloadSource) {
  const guardedPayload = guardRuntimeActionForIncompleteExecution(targetDir, payload);
  const requestedAction = String(guardedPayload.action || '').trim().toLowerCase();
  const runtimeAction = requestedAction === 'archive'
    ? 'complete'
    : requestedAction === 'completed'
    ? 'complete'
    : requestedAction === 'blocked'
    ? 'gate-blocked'
    : requestedAction;
  const options = {
    target: targetDir,
    runId: guardedPayload.run_id,
    toRole: guardedPayload.to_role,
    nextRole: guardedPayload.next_role,
    fromRole: guardedPayload.from_role,
    gate: guardedPayload.gate,
    pendingGate: guardedPayload.pending_gate,
    blockedByRole: guardedPayload.blocked_by_role,
    resumeToRole: guardedPayload.resume_to_role,
    requiredUserAction: guardedPayload.required_user_action,
    blockedReason: guardedPayload.blocked_reason,
    message: guardedPayload.message,
    error: guardedPayload.error,
    eventType: guardedPayload.event_type || guardedPayload.eventType,
    status: guardedPayload.status,
    artifactsData: guardedPayload.artifacts || null,
    verificationData: guardedPayload.verification || null,
    autoFixData: guardedPayload.auto_fix || null,
    skipArtifactCheck:
      Object.prototype.hasOwnProperty.call(guardedPayload, 'skip_artifact_check') ||
      Object.prototype.hasOwnProperty.call(guardedPayload, 'skipArtifactCheck')
        ? Boolean(
          Object.prototype.hasOwnProperty.call(guardedPayload, 'skip_artifact_check')
            ? guardedPayload.skip_artifact_check
            : guardedPayload.skipArtifactCheck
        )
        : undefined,
    clearPendingGate:
      Object.prototype.hasOwnProperty.call(guardedPayload, 'clear_pending_gate') ||
      Object.prototype.hasOwnProperty.call(guardedPayload, 'clearPendingGate')
        ? Boolean(
          Object.prototype.hasOwnProperty.call(guardedPayload, 'clear_pending_gate')
            ? guardedPayload.clear_pending_gate
            : guardedPayload.clearPendingGate
        )
        : undefined,
    taskAnchorData: guardedPayload.task_anchor || guardedPayload.taskAnchor || null,
  };

  let result = null;
  switch (runtimeAction) {
    case 'handoff':
      result = runtimeState.handoffRunState(options);
      break;
    case 'approve':
      result = runtimeState.approveRunState(options);
      break;
    case 'resume':
      result = runtimeState.resumeRunState(options);
      break;
    case 'gate-blocked':
      result = runtimeState.gateBlockedRunState(options);
      break;
    case 'status':
      result = runtimeState.statusRunState(options);
      break;
    case 'complete':
      result = runtimeState.completeRunState(options);
      break;
    case 'fail':
      result = runtimeState.failRunState(options);
      break;
    case 'cancel':
      result = runtimeState.cancelRunState(options);
      break;
    default:
      throw new Error(`Unsupported runtime action for expert-executor: ${guardedPayload.action}`);
  }

  const clearableActions = new Set([
    'handoff',
    'approve',
    'resume',
    'gate-blocked',
    'complete',
    'fail',
    'cancel',
  ]);
  const cleared = clearableActions.has(runtimeAction)
    ? clearCurrentExpertArtifacts(targetDir)
    : null;

  return {
    requested_action: requestedAction,
    applied_action: runtimeAction,
    adapter_source: payloadSource,
    result,
    cleared,
  };
}

function applyExecution(options) {
  const targetDir = path.resolve(options.target || '.');
  const { sourcePath, rawPayload } = readPayloadFromOptions(options, 'expert-execution');
  const hydrated = hydrateExecutionPayload(targetDir, rawPayload);
  validateExecutionPayload(hydrated.payload, sourcePath, hydrated.context);
  const validation = validateExecutionArtifacts(targetDir, hydrated.payload);
  const archive_result = maybeApplyArchiveChange(targetDir, hydrated.payload);
  const payload = normalizeExecutionPayload(attachVerificationIfNeeded(targetDir, hydrated.payload));
  const artifacts = writeExecutionArtifacts(targetDir, payload);
  let runtime_transition = null;
  if (shouldAdvanceRuntime(options)) {
    const runtimeActionPayload = buildAutoRuntimeAction(targetDir, payload);
    if (runtimeActionPayload) {
      if (archive_result?.archived_artifacts) {
        runtimeActionPayload.artifacts = archive_result.archived_artifacts;
        runtimeActionPayload.skip_artifact_check = true;
      }
      const runtimePayload = normalizeRuntimeActionPayload(runtimeActionPayload);
      const runtimeArtifacts = writeRuntimeActionArtifacts(targetDir, runtimePayload);
      const applied = applyRuntimeMutation(targetDir, runtimePayload, 'expert-executor:auto-runtime');
      runtime_transition = {
        payload: runtimePayload,
        artifacts: {
          ...runtimeArtifacts,
          current_runtime_action_json: applied.cleared ? null : runtimeArtifacts.current_runtime_action_json,
          current_runtime_action_md: applied.cleared ? null : runtimeArtifacts.current_runtime_action_md,
        },
        applied: {
          requested_action: applied.requested_action,
          applied_action: applied.applied_action,
          run_id: applied.result?.state?.run_id || null,
          status: applied.result?.state?.status || null,
          current_role: applied.result?.state?.current_role || null,
          pending_gate: applied.result?.state?.pending_gate || null,
        },
      };
    }
  }
  const cleanedSource = cleanupTmpSource(targetDir, sourcePath);

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts: {
      ...artifacts,
      current_execution_json: runtime_transition?.applied ? null : artifacts.current_execution_json,
      current_execution_md: runtime_transition?.applied ? null : artifacts.current_execution_md,
    },
    payload,
    validation,
    archive_result,
    runtime_transition,
    cleaned_source: cleanedSource,
  };
}

function applyExecutionData(options) {
  const targetDir = path.resolve(options.target || '.');
  const sourcePath = options.source || 'memory-payload';
  const hydrated = hydrateExecutionPayload(targetDir, options.payloadData);
  validateExecutionPayload(hydrated.payload, sourcePath, hydrated.context);
  const validation = validateExecutionArtifacts(targetDir, hydrated.payload);
  const archive_result = maybeApplyArchiveChange(targetDir, hydrated.payload);
  const payload = normalizeExecutionPayload(attachVerificationIfNeeded(targetDir, hydrated.payload));
  const artifacts = writeExecutionArtifacts(targetDir, payload);
  let runtime_transition = null;
  if (shouldAdvanceRuntime(options)) {
    const runtimeActionPayload = buildAutoRuntimeAction(targetDir, payload);
    if (runtimeActionPayload) {
      if (archive_result?.archived_artifacts) {
        runtimeActionPayload.artifacts = archive_result.archived_artifacts;
        runtimeActionPayload.skip_artifact_check = true;
      }
      const runtimePayload = normalizeRuntimeActionPayload(runtimeActionPayload);
      const runtimeArtifacts = writeRuntimeActionArtifacts(targetDir, runtimePayload);
      const applied = applyRuntimeMutation(targetDir, runtimePayload, 'expert-executor:auto-runtime');
      runtime_transition = {
        payload: runtimePayload,
        artifacts: {
          ...runtimeArtifacts,
          current_runtime_action_json: applied.cleared ? null : runtimeArtifacts.current_runtime_action_json,
          current_runtime_action_md: applied.cleared ? null : runtimeArtifacts.current_runtime_action_md,
        },
        applied: {
          requested_action: applied.requested_action,
          applied_action: applied.applied_action,
          run_id: applied.result?.state?.run_id || null,
          status: applied.result?.state?.status || null,
          current_role: applied.result?.state?.current_role || null,
          pending_gate: applied.result?.state?.pending_gate || null,
        },
      };
    }
  }

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts: {
      ...artifacts,
      current_execution_json: runtime_transition?.applied ? null : artifacts.current_execution_json,
      current_execution_md: runtime_transition?.applied ? null : artifacts.current_execution_md,
    },
    payload,
    validation,
    archive_result,
    runtime_transition,
  };
}

function applyRuntimeAction(options) {
  const targetDir = path.resolve(options.target || '.');
  const { sourcePath, rawPayload } = readPayloadFromOptions(options, 'runtime-action');
  const hydrated = hydrateRuntimeActionPayload(targetDir, rawPayload);
  validateRuntimeActionPayload(hydrated.payload, sourcePath);
  const payload = normalizeRuntimeActionPayload(hydrated.payload);
  const artifacts = writeRuntimeActionArtifacts(targetDir, payload);
  let runtime_transition = null;
  if (shouldAdvanceRuntime(options)) {
    const applied = applyRuntimeMutation(targetDir, payload, sourcePath);
    runtime_transition = {
      applied: {
        requested_action: applied.requested_action,
        applied_action: applied.applied_action,
        run_id: applied.result?.state?.run_id || null,
        status: applied.result?.state?.status || null,
        current_role: applied.result?.state?.current_role || null,
        pending_gate: applied.result?.state?.pending_gate || null,
      },
    };
  }
  const cleanedSource = cleanupTmpSource(targetDir, sourcePath);

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts: {
      ...artifacts,
      current_runtime_action_json: runtime_transition?.applied ? null : artifacts.current_runtime_action_json,
      current_runtime_action_md: runtime_transition?.applied ? null : artifacts.current_runtime_action_md,
    },
    payload,
    runtime_transition,
    cleaned_source: cleanedSource,
  };
}

function applyRuntimeActionData(options) {
  const targetDir = path.resolve(options.target || '.');
  const sourcePath = options.source || 'memory-payload';
  const hydrated = hydrateRuntimeActionPayload(targetDir, options.payloadData);
  validateRuntimeActionPayload(hydrated.payload, sourcePath);
  const payload = normalizeRuntimeActionPayload(hydrated.payload);
  const artifacts = writeRuntimeActionArtifacts(targetDir, payload);
  let runtime_transition = null;
  if (shouldAdvanceRuntime(options)) {
    const applied = applyRuntimeMutation(targetDir, payload, sourcePath);
    runtime_transition = {
      applied: {
        requested_action: applied.requested_action,
        applied_action: applied.applied_action,
        run_id: applied.result?.state?.run_id || null,
        status: applied.result?.state?.status || null,
        current_role: applied.result?.state?.current_role || null,
        pending_gate: applied.result?.state?.pending_gate || null,
      },
    };
  }

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts: {
      ...artifacts,
      current_runtime_action_json: runtime_transition?.applied ? null : artifacts.current_runtime_action_json,
      current_runtime_action_md: runtime_transition?.applied ? null : artifacts.current_runtime_action_md,
    },
    payload,
    runtime_transition,
  };
}

function clearExecution(options) {
  const targetDir = path.resolve(options.target || '.');
  const runtimePaths = resolveRuntimePaths(targetDir);

  for (const currentExecutionJson of getCandidatePaths(runtimePaths.currentExecutionJson)) {
    if (fs.existsSync(currentExecutionJson)) {
      fs.unlinkSync(currentExecutionJson);
    }
  }
  for (const currentExecutionMd of getCandidatePaths(runtimePaths.currentExecutionMd)) {
    if (fs.existsSync(currentExecutionMd)) {
      fs.unlinkSync(currentExecutionMd);
    }
  }

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_execution_json: runtimePaths.currentExecutionJson.path,
      current_execution_md: runtimePaths.currentExecutionMd.path,
    },
  };
}

function clearRuntimeAction(options) {
  const targetDir = path.resolve(options.target || '.');
  const runtimePaths = resolveRuntimePaths(targetDir);

  for (const currentActionJson of getCandidatePaths(runtimePaths.currentRuntimeActionJson)) {
    if (fs.existsSync(currentActionJson)) {
      fs.unlinkSync(currentActionJson);
    }
  }
  for (const currentActionMd of getCandidatePaths(runtimePaths.currentRuntimeActionMd)) {
    if (fs.existsSync(currentActionMd)) {
      fs.unlinkSync(currentActionMd);
    }
  }

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_runtime_action_json: runtimePaths.currentRuntimeActionJson.path,
      current_runtime_action_md: runtimePaths.currentRuntimeActionMd.path,
    },
  };
}

function printPretty(result, command) {
  console.log(`expert-executor ${command}`);
  console.log(`  target: ${result.target}`);
  if (result.payload) {
    console.log(`  run_id: ${result.payload.run_id}`);
    if (result.payload.kind === 'expert-execution') {
      console.log(`  role: ${result.payload.role.id}`);
      console.log(`  openspec_action: ${result.payload.openspec_action || 'n/a'}`);
      console.log(`  execution_id: ${result.payload.execution_id}`);
      console.log(`  current_execution: ${result.artifacts.current_execution_json}`);
    } else {
      console.log(`  action: ${result.payload.action}`);
      console.log(`  openspec_action: ${result.payload.openspec_action || 'n/a'}`);
      console.log(`  current_runtime_action: ${result.artifacts.current_runtime_action_json}`);
    }
    if (result.runtime_transition?.applied) {
      console.log(`  runtime_action: ${result.runtime_transition.applied.requested_action || 'n/a'}`);
      console.log(`  runtime_status: ${result.runtime_transition.applied.status || 'n/a'}`);
      console.log(`  runtime_current_role: ${result.runtime_transition.applied.current_role || 'n/a'}`);
    }
  } else {
    if (result.artifacts.current_execution_json) {
      console.log(`  current_execution: ${result.artifacts.current_execution_json}`);
    }
    if (result.artifacts.current_runtime_action_json) {
      console.log(`  current_runtime_action: ${result.artifacts.current_runtime_action_json}`);
    }
  }
}

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return 0;
  }

  if (command === 'apply' || command === 'run') {
    const result = applyExecution(options);
    await drainVisualRuntimeStatePushes();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  if (command === 'apply-action' || command === 'finish') {
    const result = applyRuntimeAction(options);
    await drainVisualRuntimeStatePushes();
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  if (command === 'clear') {
    const result = clearExecution(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  if (command === 'clear-action') {
    const result = clearRuntimeAction(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  throw new Error(`Unsupported expert-executor command: ${command}`);
}

module.exports = {
  main,
  applyExecution,
  applyExecutionData,
  applyRuntimeAction,
  applyRuntimeActionData,
  clearExecution,
  clearRuntimeAction,
  validateExecutionPayload,
  validateRuntimeActionPayload,
  normalizeExecutionPayload,
  normalizeRuntimeActionPayload,
};

if (require.main === module) {
  try {
    main().then((code) => process.exit(code));
  } catch (error) {
    console.error(`expert-executor error: ${error.message}`);
    process.exit(1);
  }
}
