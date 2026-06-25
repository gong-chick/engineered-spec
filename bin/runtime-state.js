#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const {
  resolveRuntimePaths,
  getExistingPath,
  getCandidatePaths,
  shouldPersistHistory,
  shouldPersistCheckpoints,
} = require('./runtime-paths');
const { syncRepoMap } = require('./repo-map');

function printUsage() {
  console.log(`Usage:
  ai-spec-auto runtime-state init --run-plan <file> [options]
  ai-spec-auto runtime-state bootstrap --payload <file> [options]
  ai-spec-auto runtime-state bootstrap --stdin [options]
  ai-spec-auto runtime-state handoff --to-role <role> [options]
  ai-spec-auto runtime-state approve [options]
  ai-spec-auto runtime-state pause [options]
  ai-spec-auto runtime-state resume [options]
  ai-spec-auto runtime-state restore --checkpoint <file> [options]
  ai-spec-auto runtime-state gate-blocked [options]
  ai-spec-auto runtime-state complete [options]
  ai-spec-auto runtime-state fail [options]
  ai-spec-auto runtime-state cancel [options]
  ai-spec-auto runtime-state status [options]

Options:
  --target <dir>           Target project directory (default: .)
  --run-plan <file>        Path to run-plan JSON file
  --task-anchor <file>     Optional path to task-anchor JSON file
  --payload <file>         Path to task-orchestrator bootstrap payload JSON file
  --stdin                  Read bootstrap payload JSON from stdin
  --run-id <id>            Override generated run id
  --to-role <role>         Target role for handoff update
  --next-role <role>       Next role after current handoff
  --from-role <role>       Explicit source role override
  --gate <id>              Expected approval gate id
  --checkpoint <file>      Restore source checkpoint JSON file
  --pending-gate <id>      Pending approval gate id
  --clear-pending-gate     Clear current pending gate
  --blocked-by-role <id>   Role that raised the current gate
  --resume-to-role <id>    Role to resume into after approval
  --required-user-action <text>
                           Explicit user action required by the gate
  --blocked-reason <text>  Human-readable reason for the gate
  --message <text>         Event message override
  --error <text>           Failure detail appended to errors list
  --event-type <type>      Event type override (default: role-handoff)
  --status <status>        planned | running | paused | waiting-confirm | waiting-approval | blocked | success | failed | cancelled
  --trigger-source <src>   Trigger source (default: ide-skill)
  --entry <entry>          Entry role (default: task-orchestrator)
  --raw-input <text>       Raw user input override
  --change-id <id>         Change id override
  --change-impact <kind>   patch | scope-delta | re-scope | archive-fix | followup-patch
  --reconcile-strategy <strategy>
                           in-place | rewind-to-requirement | rewind-to-frontend | rewind-to-guardian | suggest-new-change | followup-patch
  --reopen-reason <text>   Human-readable reopen / repair reason
  --parent-change-id <id>  Parent change id for follow-up patch runs
  --artifacts-to-update <items>
                           Comma-separated artifact hints to update incrementally
  --json                   Print JSON result
  --pretty                 Print readable summary (default)
  --help                   Show this help

Environment:
  AI_SPEC_PERSIST_CHECKPOINTS=1
                           Persist .ai-spec/checkpoints/<run-id>/*.json for restore/debug
`);
}

function parseArgs(argv) {
  const args = [...argv];
  const command = args.shift();
  const options = {
    target: '.',
    triggerSource: 'ide-skill',
    entry: 'task-orchestrator',
    pretty: true,
    json: false,
  };

  while (args.length > 0) {
    const arg = args.shift();
    switch (arg) {
      case '--target':
        options.target = args.shift();
        break;
      case '--run-plan':
        options.runPlan = args.shift();
        break;
      case '--task-anchor':
      case '--anchor':
        options.taskAnchor = args.shift();
        break;
      case '--payload':
        options.payload = args.shift();
        break;
      case '--stdin':
        options.stdin = true;
        break;
      case '--run-id':
        options.runId = args.shift();
        break;
      case '--to-role':
        options.toRole = args.shift();
        break;
      case '--next-role':
        options.nextRole = args.shift();
        break;
      case '--from-role':
        options.fromRole = args.shift();
        break;
      case '--gate':
        options.gate = args.shift();
        break;
      case '--checkpoint':
        options.checkpoint = args.shift();
        break;
      case '--pending-gate':
        options.pendingGate = args.shift();
        break;
      case '--clear-pending-gate':
        options.clearPendingGate = true;
        break;
      case '--blocked-by-role':
        options.blockedByRole = args.shift();
        break;
      case '--resume-to-role':
        options.resumeToRole = args.shift();
        break;
      case '--required-user-action':
        options.requiredUserAction = args.shift();
        break;
      case '--blocked-reason':
        options.blockedReason = args.shift();
        break;
      case '--message':
        options.message = args.shift();
        break;
      case '--error':
        options.error = args.shift();
        break;
      case '--event-type':
        options.eventType = args.shift();
        break;
      case '--status':
        options.status = args.shift();
        break;
      case '--trigger-source':
        options.triggerSource = args.shift();
        break;
      case '--entry':
        options.entry = args.shift();
        break;
      case '--raw-input':
        options.rawInput = args.shift();
        break;
      case '--change-id':
        options.changeId = args.shift();
        break;
      case '--change-impact':
        options.changeImpact = args.shift();
        break;
      case '--reconcile-strategy':
        options.reconcileStrategy = args.shift();
        break;
      case '--reopen-reason':
        options.reopenReason = args.shift();
        break;
      case '--parent-change-id':
        options.parentChangeId = args.shift();
        break;
      case '--artifacts-to-update':
        options.artifactsToUpdate = String(args.shift() || '')
          .split(',')
          .map((item) => item.trim())
          .filter(Boolean);
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

const DEFAULT_RUN_MODE = 'auto';
const DEFAULT_REVIEW_POLICY = 'none';
const RUN_MODES = new Set(['auto', 'suggest', 'manual']);
const REVIEW_POLICIES = new Set(['none', 'main-flow-blocking']);

function normalizeRunMode(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return RUN_MODES.has(normalized) ? normalized : DEFAULT_RUN_MODE;
}

function normalizeReviewPolicy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return REVIEW_POLICIES.has(normalized) ? normalized : DEFAULT_REVIEW_POLICY;
}

function buildEffectiveApprovalGates(flowId, gates, reviewPolicy) {
  const normalizedPolicy = normalizeReviewPolicy(reviewPolicy);
  const deduped = Array.isArray(gates)
    ? [...new Set(gates.map((item) => String(item || '').trim()).filter(Boolean))]
    : [];
  if (flowId !== 'prd-to-delivery' || normalizedPolicy !== 'main-flow-blocking') {
    return deduped;
  }
  const supportedMainFlowGates = new Set(['before-implementation', 'before-guardian', 'before-archive']);
  const shouldInjectMainFlowGates = deduped.length === 0 || deduped.every((gate) => supportedMainFlowGates.has(gate));
  if (!shouldInjectMainFlowGates) {
    return deduped;
  }

  const ordered = [];
  for (const gate of ['before-implementation', 'before-guardian', 'before-archive']) {
    if (!ordered.includes(gate)) {
      ordered.push(gate);
    }
  }
  for (const gate of deduped) {
    if (!ordered.includes(gate)) {
      ordered.push(gate);
    }
  }
  return ordered;
}

function readJsonFile(filePath, label) {
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

function assertRunPlan(runPlan, filePath) {
  if (!runPlan || typeof runPlan !== 'object') {
    throw new Error(`Invalid run-plan object: ${filePath}`);
  }
  if (runPlan.kind !== 'run-plan') {
    throw new Error(`Expected kind "run-plan" but got "${runPlan.kind || 'undefined'}": ${filePath}`);
  }
  if (!runPlan.flow || !runPlan.flow.id) {
    throw new Error(`run-plan is missing flow.id: ${filePath}`);
  }
  if (!runPlan.plan || !runPlan.plan.first_handoff) {
    throw new Error(`run-plan is missing plan.first_handoff: ${filePath}`);
  }
}

function pad2(value) {
  return String(value).padStart(2, '0');
}

function createRunId(now = new Date()) {
  const y = now.getFullYear();
  const m = pad2(now.getMonth() + 1);
  const d = pad2(now.getDate());
  const hh = pad2(now.getHours());
  const mm = pad2(now.getMinutes());
  const ss = pad2(now.getSeconds());
  const rand = Math.random().toString(36).slice(2, 6);
  return `run_${y}${m}${d}_${hh}${mm}${ss}_${rand}`;
}

function slugifyValue(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .replace(/-{2,}/g, '-');
}

function deriveChangeId({ explicitChangeId, rawInput, taskType, runId }) {
  const normalizedExplicit = slugifyValue(explicitChangeId);
  if (normalizedExplicit) {
    return normalizedExplicit;
  }

  const normalizedInput = slugifyValue(rawInput);
  if (normalizedInput) {
    return normalizedInput.slice(0, 64);
  }

  const normalizedTaskType = slugifyValue(taskType) || 'change';
  const normalizedRunId = slugifyValue(runId) || 'run';
  return `${normalizedTaskType}-${normalizedRunId}`.slice(0, 96);
}

const FLOW_APPROVAL_RESUME_ROLE_HINTS = {
  'prd-to-delivery': {
    'requirement-analyst': 'frontend-implementer',
    'frontend-implementer': 'code-guardian',
    'code-guardian': 'archive-change',
    'archive-change': 'archive-change',
  },
};

function inferApprovalResumeRole(state, options = {}) {
  if (options.toRole || options.nextRole) {
    return options.toRole || options.nextRole;
  }

  const gateResumeRole = state.gate_context?.resume_to_role || null;
  if (gateResumeRole) {
    return gateResumeRole;
  }

  const anchorNextRole = state.anchor?.stage?.next_role || null;
  if (anchorNextRole) {
    return anchorNextRole;
  }

  const flowId = state.flow?.id || null;
  const currentRole = state.current_role || null;
  const hintedRole = flowId && currentRole
    ? FLOW_APPROVAL_RESUME_ROLE_HINTS[flowId]?.[currentRole] || null
    : null;
  if (hintedRole) {
    return hintedRole;
  }

  return state.current_role || state.anchor?.stage?.current_role || state.plan?.first_handoff || null;
}

const CHECKPOINT_EVENTS = new Set([
  'bootstrap',
  'handoff',
  'gate-blocked',
  'approve',
  'pause',
  'complete',
  'fail',
  'cancel',
]);

function buildGateContext(state, options = {}, fallbackGate = null) {
  const gateId = options.gateId || options.gate || options.pendingGate || fallbackGate || state?.pending_gate || null;
  if (!gateId) {
    return null;
  }

  return {
    gate_id: gateId,
    blocked_by_role: options.blockedByRole || options.fromRole || state?.current_role || null,
    resume_to_role: options.resumeToRole || options.nextRole || options.toRole || inferApprovalResumeRole(state || {}, options) || null,
    required_user_action: options.requiredUserAction || state?.gate_context?.required_user_action || null,
    blocked_reason: options.blockedReason || state?.gate_context?.blocked_reason || null,
  };
}

function buildIncrementalUpdateState(state, options = {}, defaults = {}) {
  const previous = state?.incremental_update && typeof state.incremental_update === 'object'
    ? state.incremental_update
    : {};
  const next = {
    change_context: options.changeContext || defaults.changeContext || previous.change_context || null,
    route_decision: options.routeDecision || defaults.routeDecision || previous.route_decision || null,
    trace_mode: options.traceMode || defaults.traceMode || previous.trace_mode || null,
    change_impact: options.changeImpact || defaults.changeImpact || previous.change_impact || null,
    reconcile_strategy: options.reconcileStrategy || defaults.reconcileStrategy || previous.reconcile_strategy || null,
    artifacts_to_update: Array.isArray(options.artifactsToUpdate)
      ? options.artifactsToUpdate
      : Array.isArray(defaults.artifactsToUpdate)
      ? defaults.artifactsToUpdate
      : Array.isArray(previous.artifacts_to_update)
      ? previous.artifacts_to_update
      : [],
    reopen_reason: options.reopenReason || defaults.reopenReason || previous.reopen_reason || null,
    parent_change_id: options.parentChangeId || defaults.parentChangeId || previous.parent_change_id || null,
    target_role: options.toRole || options.nextRole || defaults.targetRole || previous.target_role || null,
    handoff_gate: options.handoffGate || defaults.handoffGate || previous.handoff_gate || null,
    updated_at: defaults.updatedAt || previous.updated_at || null,
  };

  if (
    !next.change_context &&
    !next.route_decision &&
    !next.trace_mode &&
    !next.change_impact &&
    !next.reconcile_strategy &&
    next.artifacts_to_update.length === 0 &&
    !next.reopen_reason &&
    !next.parent_change_id &&
    !next.target_role &&
    !next.handoff_gate
  ) {
    return null;
  }

  return next;
}

function buildDefaultAutoFixState() {
  return {
    attempts: 0,
    max_attempts: 1,
    active: false,
    last_failed_steps: [],
  };
}

function normalizeAutoFixStep(step) {
  if (!step || typeof step !== 'object') {
    return null;
  }

  return {
    name: typeof step.name === 'string' && step.name.trim() ? step.name.trim() : 'unknown',
    status: typeof step.status === 'string' && step.status.trim() ? step.status.trim() : null,
    command: typeof step.command === 'string' && step.command.trim() ? step.command.trim() : null,
    exit_code: typeof step.exit_code === 'number' ? step.exit_code : null,
    reason: typeof step.reason === 'string' && step.reason.trim() ? step.reason.trim() : null,
    error: typeof step.error === 'string' && step.error.trim() ? step.error.trim() : null,
    stdout_excerpt: typeof step.stdout_excerpt === 'string' && step.stdout_excerpt.trim() ? step.stdout_excerpt.trim() : null,
    stderr_excerpt: typeof step.stderr_excerpt === 'string' && step.stderr_excerpt.trim() ? step.stderr_excerpt.trim() : null,
  };
}

function normalizeAutoFixState(value) {
  const defaults = buildDefaultAutoFixState();
  const merged = value && typeof value === 'object'
    ? { ...defaults, ...value }
    : defaults;
  const maxAttempts = Number.isFinite(Number(merged.max_attempts))
    ? Math.max(1, Number(merged.max_attempts))
    : defaults.max_attempts;
  const attempts = Number.isFinite(Number(merged.attempts))
    ? Math.max(0, Math.min(Number(merged.attempts), maxAttempts))
    : defaults.attempts;
  const lastFailedSteps = Array.isArray(merged.last_failed_steps)
    ? merged.last_failed_steps
      .map((item) => normalizeAutoFixStep(item))
      .filter(Boolean)
    : [];

  return {
    attempts,
    max_attempts: maxAttempts,
    active: Boolean(merged.active),
    last_failed_steps: lastFailedSteps,
  };
}

function buildNextAutoFixState(state, options = {}, defaults = {}) {
  const current = normalizeAutoFixState(state?.auto_fix);
  if (options.autoFixData && typeof options.autoFixData === 'object') {
    return normalizeAutoFixState({
      ...current,
      ...options.autoFixData,
    });
  }

  if (defaults && typeof defaults === 'object' && Object.keys(defaults).length > 0) {
    return normalizeAutoFixState({
      ...current,
      ...defaults,
    });
  }

  return current;
}

function buildCheckpointMetadata(state, eventName, relPath, timestamp) {
  return {
    sequence: (Number(state?.checkpoint_count) || 0) + 1,
    event: eventName,
    at: timestamp,
    file: relPath,
  };
}

const MICRO_TASK_TYPES = new Set([
  'page-development',
  'component-development',
  'bugfix',
  'bug-fix',
  'problem-fix',
  'issue-fix',
  'style-update',
  'route-update',
]);

const MICRO_INPUT_PATTERNS = [
  /mock/i,
  /mock数据/,
  /示例数据/,
  /静态/,
  /单页/,
  /单一页面/,
  /简单页面/,
  /简单组件/,
  /列表页面/,
  /登录页面/,
  /注册页面/,
  /商品列表页面/,
  /原型/,
];

const STANDARD_INPUT_PATTERNS = [
  /重构/,
  /权限/,
  /支付/,
  /认证/,
  /oauth/i,
  /短信/,
  /多步骤/,
  /多页面/,
  /复杂/,
  /真实接口/,
  /核心模块/,
  /状态联动/,
  /合规/,
  /安全/,
];

const HIGH_RISK_INPUT_PATTERNS = [
  /支付/,
  /认证/,
  /oauth/i,
  /短信/,
  /权限/,
  /安全/,
  /合规/,
  /风控/,
  /收款/,
  /交易/,
];

const DEFERRED_DETAIL_PATTERNS = [
  /先不说/,
  /先不提供/,
  /暂不说/,
  /暂不提供/,
  /暂未确定/,
  /未明确/,
  /待定/,
  /后续再说/,
  /后面再说/,
];

function inferRiskLevel({ explicitRiskLevel, rawInput, taskType, deliveryProfile }) {
  const normalizedExplicit = String(explicitRiskLevel || '').trim().toLowerCase();
  if (normalizedExplicit === 'low' || normalizedExplicit === 'medium' || normalizedExplicit === 'high') {
    return normalizedExplicit;
  }

  let score = 0;
  const input = String(rawInput || '');
  const normalizedTaskType = String(taskType || '').trim().toLowerCase();

  if (deliveryProfile === 'standard') {
    score += 1;
  }

  if (normalizedTaskType.includes('payment') || normalizedTaskType.includes('auth') || normalizedTaskType.includes('security')) {
    score += 2;
  }

  for (const pattern of HIGH_RISK_INPUT_PATTERNS) {
    if (pattern.test(input)) {
      score += 2;
      break;
    }
  }

  for (const pattern of DEFERRED_DETAIL_PATTERNS) {
    if (pattern.test(input)) {
      score += 2;
      break;
    }
  }

  if (score >= 4) {
    return 'high';
  }
  if (score >= 2) {
    return 'medium';
  }
  return 'low';
}

function inferDeliveryProfile({ explicitProfile, flowId, taskType, rawInput, riskLevel }) {
  const normalizedExplicit = String(explicitProfile || '').trim().toLowerCase();
  if (normalizedExplicit === 'micro' || normalizedExplicit === 'standard') {
    return normalizedExplicit;
  }

  let score = 0;

  if (MICRO_TASK_TYPES.has(String(taskType || '').trim().toLowerCase())) {
    score += 1;
  }

  const input = String(rawInput || '');
  for (const pattern of MICRO_INPUT_PATTERNS) {
    if (pattern.test(input)) {
      score += 2;
      break;
    }
  }

  for (const pattern of STANDARD_INPUT_PATTERNS) {
    if (pattern.test(input)) {
      score -= 2;
      break;
    }
  }

  const normalizedRisk = String(riskLevel || '').trim().toLowerCase();
  if (normalizedRisk === 'low') {
    score += 1;
  } else if (normalizedRisk === 'high') {
    score -= 2;
  }

  if (flowId && flowId !== 'prd-to-delivery') {
    score -= 1;
  }

  return score >= 2 ? 'micro' : 'standard';
}

function inferArtifactProfile({ explicitProfile, deliveryProfile }) {
  const normalizedExplicit = String(explicitProfile || '').trim().toLowerCase();
  if (normalizedExplicit === 'compact' || normalizedExplicit === 'full') {
    return normalizedExplicit;
  }

  return deliveryProfile === 'micro' ? 'compact' : 'full';
}

function inferComplexity({ explicitComplexity, deliveryProfile, riskLevel }) {
  const normalizedExplicit = String(explicitComplexity || '').trim().toLowerCase();
  if (normalizedExplicit === 'low' || normalizedExplicit === 'medium' || normalizedExplicit === 'high') {
    return normalizedExplicit;
  }

  const normalizedRisk = String(riskLevel || '').trim().toLowerCase();
  if (normalizedRisk === 'high') {
    return 'high';
  }
  if (normalizedRisk === 'medium') {
    return 'medium';
  }

  return deliveryProfile === 'micro' ? 'low' : 'medium';
}

function normalizeSpecsArtifactPath(relPath) {
  const value = String(relPath || '').trim();
  if (!value) {
    return null;
  }

  const normalized = value.replace(/[\\/]+$/, '');
  if (/[\\/]specs$/.test(normalized)) {
    return normalized;
  }

  const match = normalized.match(/^(.*[\\/]specs)(?:[\\/].+)?$/);
  return match ? match[1] : normalized;
}

function buildDefaultArtifacts(changeId, options = {}) {
  const flowId = String(options.flowId || '').trim();
  const runId = String(options.runId || '').trim();
  const traceMode = String(options.traceMode || '').trim();

  if ((flowId === 'bugfix-to-verification' || traceMode === 'direct-fix') && runId) {
    const historyDir = `.ai-spec/history/${runId}`;
    return {
      proposal: null,
      specs: null,
      design: null,
      tasks: null,
      bugfix: `${historyDir}/bugfix.md`,
      implementation_notes: `${historyDir}/implementation-notes.md`,
      checklist: `${historyDir}/checklist.md`,
      iterations: `${historyDir}/iterations.md`,
      additional: [],
    };
  }

  if (!changeId) {
    return {
      proposal: null,
      specs: null,
      design: null,
      tasks: null,
      bugfix: null,
      implementation_notes: null,
      checklist: null,
      iterations: null,
      additional: [],
    };
  }

  const baseDir = `openspec/changes/${changeId}`;
  return {
    proposal: `${baseDir}/proposal.md`,
    specs: `${baseDir}/specs`,
    design: `${baseDir}/design.md`,
    tasks: `${baseDir}/tasks.md`,
    bugfix: null,
    implementation_notes: null,
    checklist: `${baseDir}/checklist.md`,
    iterations: `${baseDir}/iterations.md`,
    additional: [],
  };
}

function mergeArtifacts(baseArtifacts, inferredArtifacts) {
  const proposal = inferredArtifacts?.proposal || baseArtifacts?.proposal || null;
  const specs = normalizeSpecsArtifactPath(inferredArtifacts?.specs || baseArtifacts?.specs || null);
  const design = inferredArtifacts?.design || baseArtifacts?.design || null;
  const tasks = inferredArtifacts?.tasks || baseArtifacts?.tasks || null;
  const bugfix = inferredArtifacts?.bugfix || baseArtifacts?.bugfix || null;
  const implementationNotes = inferredArtifacts?.implementation_notes || baseArtifacts?.implementation_notes || null;
  const checklist = inferredArtifacts?.checklist || baseArtifacts?.checklist || null;
  const iterations = inferredArtifacts?.iterations || baseArtifacts?.iterations || null;
  const primaryArtifacts = new Set(
    [proposal, specs, design, tasks, bugfix, implementationNotes, checklist, iterations]
      .map((item) => (typeof item === 'string' ? item.trim().replace(/[\\/]+$/, '') : null))
      .filter(Boolean),
  );
  const additional = [
    ...(Array.isArray(baseArtifacts?.additional) ? baseArtifacts.additional : []),
    ...(Array.isArray(inferredArtifacts?.additional) ? inferredArtifacts.additional : []),
  ]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => item.replace(/[\\/]+$/, ''))
    .filter((item) => !primaryArtifacts.has(item));

  const merged = {
    proposal,
    specs,
    design,
    tasks,
    bugfix,
    implementation_notes: implementationNotes,
    checklist,
    iterations,
    additional: Array.from(new Set(additional.filter(Boolean))),
  };

  if (merged.additional.length === 0) {
    delete merged.additional;
  }

  return merged;
}

function inferArtifacts(artifacts) {
  const normalized = {
    proposal: null,
    specs: null,
    design: null,
    tasks: null,
    bugfix: null,
    implementation_notes: null,
    checklist: null,
    iterations: null,
    additional: [],
  };

  if (!artifacts) {
    return normalized;
  }

  if (artifacts && typeof artifacts === 'object' && !Array.isArray(artifacts)) {
    const directKeys = ['proposal', 'specs', 'design', 'tasks', 'bugfix', 'implementation_notes', 'checklist', 'iterations'];
    for (const key of directKeys) {
      if (typeof artifacts[key] === 'string' && artifacts[key].trim()) {
        normalized[key] = key === 'specs'
          ? normalizeSpecsArtifactPath(artifacts[key])
          : artifacts[key];
      }
    }

    const additional = artifacts.additional;
    if (typeof additional === 'string' && additional.trim()) {
      normalized.additional.push(additional);
    } else if (Array.isArray(additional)) {
      normalized.additional.push(...additional.filter((item) => typeof item === 'string' && item.trim()));
    }

    if (normalized.additional.length === 0) {
      delete normalized.additional;
    }

    return normalized;
  }

  if (!Array.isArray(artifacts)) {
    return normalized;
  }

  for (const item of artifacts) {
    if (typeof item !== 'string') {
      continue;
    }
    if (item.endsWith('/proposal.md')) {
      normalized.proposal = item;
      continue;
    }
    if (/[\\/]specs(?:[\\/].+)?$/.test(item)) {
      normalized.specs = normalizeSpecsArtifactPath(item);
      continue;
    }
    if (item.endsWith('/design.md')) {
      normalized.design = item;
      continue;
    }
    if (item.endsWith('/tasks.md')) {
      normalized.tasks = item;
      continue;
    }
    if (item.endsWith('/bugfix.md')) {
      normalized.bugfix = item;
      continue;
    }
    if (item.endsWith('/implementation-notes.md')) {
      normalized.implementation_notes = item;
      continue;
    }
    if (item.endsWith('/checklist.md')) {
      normalized.checklist = item;
      continue;
    }
    if (item.endsWith('/iterations.md')) {
      normalized.iterations = item;
      continue;
    }
    normalized.additional.push(item);
  }

  if (normalized.additional.length === 0) {
    delete normalized.additional;
  }

  return normalized;
}

function sanitizeAnchor(taskAnchor) {
  if (!taskAnchor || typeof taskAnchor !== 'object') {
    return null;
  }
  return {
    kind: taskAnchor.kind || 'task-anchor',
    task: taskAnchor.task || null,
    stage: taskAnchor.stage || null,
    constraints: taskAnchor.constraints || null,
    artifacts: taskAnchor.artifacts || null,
    expected_output: taskAnchor.expected_output || [],
  };
}

function normalizeBootstrapPayload(payload, sourceLabel) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Invalid bootstrap payload: ${sourceLabel}`);
  }

  if (payload.kind === 'run-plan') {
    return {
      runPlan: payload,
      taskAnchor: null,
    };
  }

  const runPlan = payload.run_plan || payload.runPlan || null;
  const taskAnchor = payload.task_anchor || payload.taskAnchor || null;

  if (!runPlan) {
    throw new Error(`Bootstrap payload is missing run_plan: ${sourceLabel}`);
  }

  return { runPlan, taskAnchor };
}

function buildRunState({ runPlan, taskAnchor, options, now, source }) {
  const runId = options.runId || runPlan.run_id || createRunId(now);
  const createdAt = now.toISOString();
  const runMode = normalizeRunMode(runPlan.mode);
  const reviewPolicy = normalizeReviewPolicy(runPlan.review_policy || runPlan.plan?.review_policy || null);
  const rawInput =
    options.rawInput ||
    runPlan.task?.raw_input ||
    taskAnchor?.task?.raw_goal ||
    null;
  const changeId = deriveChangeId({
    explicitChangeId: options.changeId || runPlan.task?.change_id || taskAnchor?.task?.change_id || null,
    rawInput,
    taskType: runPlan.task?.type || null,
    runId,
  });
  const deliveryProfile = inferDeliveryProfile({
    explicitProfile: runPlan.delivery_profile || runPlan.flow?.delivery_profile || runPlan.plan?.delivery_profile || null,
    flowId: runPlan.flow?.id || null,
    taskType: runPlan.task?.type || null,
    rawInput,
    riskLevel: runPlan.task?.risk_level || null,
  });
  const riskLevel = inferRiskLevel({
    explicitRiskLevel: runPlan.task?.risk_level || null,
    rawInput,
    taskType: runPlan.task?.type || null,
    deliveryProfile,
  });
  const artifactProfile = inferArtifactProfile({
    explicitProfile: runPlan.artifact_profile || runPlan.plan?.artifact_profile || null,
    deliveryProfile,
  });
  const complexity = inferComplexity({
    explicitComplexity: runPlan.complexity || runPlan.task?.complexity || null,
    deliveryProfile,
    riskLevel,
  });
  const changeContext = options.changeContext || runPlan.task?.change_context || null;
  const routeDecision = options.routeDecision || runPlan.task?.route_decision || null;
  const traceMode = options.traceMode || runPlan.task?.trace_mode || null;
  const artifacts = mergeArtifacts(buildDefaultArtifacts(changeId, {
    flowId: runPlan.flow?.id || null,
    runId,
    traceMode,
  }), inferArtifacts(runPlan.artifacts));
  const currentRole = runPlan.plan?.first_handoff || null;
  const approvalGates = buildEffectiveApprovalGates(
    runPlan.flow?.id || null,
    Array.isArray(runPlan.plan?.approval_gates) ? runPlan.plan.approval_gates : [],
    reviewPolicy,
  );
  const normalizedRunPlanStatus = String(runPlan.status || '').trim().toLowerCase();
  const initialStatus = options.status
    || (runMode === 'suggest'
      ? (normalizedRunPlanStatus && normalizedRunPlanStatus !== 'planned' ? runPlan.status : 'waiting-confirm')
      : runPlan.status || 'planned');
  const pendingGate =
    options.pendingGate ||
    runPlan.pending_gate ||
    runPlan.plan?.pending_gate ||
    null;
  const sanitizedAnchor = sanitizeAnchor(taskAnchor);
  const anchor = sanitizedAnchor
    ? {
        ...sanitizedAnchor,
        task: {
          ...(sanitizedAnchor.task || {}),
          change_id: sanitizedAnchor.task?.change_id || changeId,
        },
        artifacts: mergeArtifacts(
          buildDefaultArtifacts(changeId, {
            flowId: runPlan.flow?.id || null,
            runId,
            traceMode,
          }),
          inferArtifacts(sanitizedAnchor.artifacts || artifacts),
        ),
      }
    : null;
  const initMessage = source?.bootstrapPayload
    ? 'runtime-state initialized from task-orchestrator bootstrap payload'
    : 'runtime-state initialized from run-plan';
  const initialGateContext = runPlan.gate_context && typeof runPlan.gate_context === 'object'
    ? {
        gate_id: runPlan.gate_context.gate_id || null,
        blocked_by_role: runPlan.gate_context.blocked_by_role || null,
        resume_to_role: runPlan.gate_context.resume_to_role || currentRole,
        required_user_action: runPlan.gate_context.required_user_action || null,
        blocked_reason: runPlan.gate_context.blocked_reason || null,
      }
    : null;
  const suggestGateContext = runMode === 'suggest' && initialStatus === 'waiting-confirm' && !pendingGate
    ? {
        gate_id: 'start-review',
        blocked_by_role: 'task-orchestrator',
        resume_to_role: currentRole,
        required_user_action: '请先确认建议执行计划，再启动第一位专家。',
        blocked_reason: '当前以 suggest（建议）模式启动，首轮 run-plan 需要先经过人工确认。',
      }
    : null;

  return {
    schema_version: 1,
    kind: 'run-state',
    run_id: runId,
    mode: runMode,
    review_policy: reviewPolicy,
    delivery_profile: deliveryProfile,
    artifact_profile: artifactProfile,
    complexity,
    status: initialStatus,
    trigger: {
      source: options.triggerSource,
      entry: options.entry,
      raw_input: rawInput,
      latest_user_input: rawInput,
      latest_input_at: rawInput ? createdAt : null,
    },
    task: {
      change_id: changeId,
      parent_change_id: options.parentChangeId || runPlan.task?.parent_change_id || taskAnchor?.task?.parent_change_id || null,
      input_kind: runPlan.task?.input_kind || taskAnchor?.task?.input_kind || 'unknown',
      risk_level: riskLevel,
      type: runPlan.task?.type || null,
      complexity,
      change_context: changeContext,
      route_decision: routeDecision,
      trace_mode: traceMode,
      change_impact: options.changeImpact || runPlan.task?.change_impact || null,
    },
    flow: {
      id: runPlan.flow?.id || null,
      name: runPlan.flow?.name || null,
      source: runPlan.flow?.source || null,
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
    },
    plan: {
      required_roles: runPlan.plan?.required_roles || [],
      activated_optional_roles: runPlan.plan?.activated_optional_roles || [],
      skipped_optional_roles: runPlan.plan?.skipped_optional_roles || [],
      approval_gates: approvalGates,
      first_handoff: currentRole,
      delivery_profile: deliveryProfile,
      artifact_profile: artifactProfile,
      review_policy: reviewPolicy,
    },
    current_role: currentRole,
    pending_input_update: false,
    pending_gate: pendingGate,
    gate_context: pendingGate
      ? buildGateContext(null, options, pendingGate)
      : initialGateContext || suggestGateContext,
    incremental_update: buildIncrementalUpdateState(null, options, {
      changeContext,
      routeDecision,
      traceMode,
      changeImpact: options.changeImpact || runPlan.task?.change_impact || null,
      reconcileStrategy: options.reconcileStrategy || runPlan.task?.reconcile_strategy || null,
      artifactsToUpdate: options.artifactsToUpdate || runPlan.task?.artifacts_to_update || [],
      reopenReason: options.reopenReason || runPlan.task?.reopen_reason || null,
      parentChangeId: options.parentChangeId || runPlan.task?.parent_change_id || null,
      updatedAt: createdAt,
    }),
    artifacts,
    verification: null,
    auto_fix: buildDefaultAutoFixState(),
    last_checkpoint: null,
    checkpoint_count: 0,
    assumptions: Array.isArray(runPlan.assumptions) ? runPlan.assumptions : [],
    missing_inputs: runPlan.missing_inputs || [],
    warnings: runPlan.warnings || [],
    errors: runPlan.errors || [],
    input_updates: [],
    anchor,
    events: [
      {
        at: createdAt,
        type: 'run-created',
        status: options.status || runPlan.status || 'planned',
        message: initMessage,
      },
    ],
    timestamps: {
      created_at: createdAt,
      updated_at: createdAt,
    },
  };
}

function listMissingOpenSpecArtifacts(targetDir, state, artifactKeys) {
  const artifactMap = mergeArtifacts(
    buildDefaultArtifacts(state.task?.change_id || state.anchor?.task?.change_id || null),
    inferArtifacts(state.artifacts || null),
  );
  const missing = [];

  for (const key of artifactKeys) {
    const relPath = artifactMap[key];
    if (!relPath) {
      missing.push(`artifact:${key}`);
      continue;
    }

    const absolutePath = path.join(targetDir, relPath);
    if (!fs.existsSync(absolutePath)) {
      missing.push(relPath);
    }
  }

  return missing;
}

function assertRequiredOpenSpecArtifacts(targetDir, state, action, toRole) {
  if (state.flow?.id !== 'prd-to-delivery') {
    return;
  }

  if (!state.task?.change_id) {
    throw new Error(`Cannot ${action} prd-to-delivery run without task.change_id`);
  }

  let requiredArtifacts = [];
  if (action === 'handoff' && toRole === 'frontend-implementer') {
    requiredArtifacts = ['proposal', 'specs', 'design', 'tasks'];
  } else if (action === 'complete') {
    requiredArtifacts = ['proposal', 'specs', 'design', 'tasks', 'checklist', 'iterations'];
  }

  if (requiredArtifacts.length === 0) {
    return;
  }

  const missingArtifacts = listMissingOpenSpecArtifacts(targetDir, state, requiredArtifacts);
  if (missingArtifacts.length > 0) {
    throw new Error(
      `Cannot ${action} prd-to-delivery run; missing required OpenSpec artifacts: ${missingArtifacts.join(', ')}`,
    );
  }
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonFile(filePath, value) {
  fs.writeFileSync(filePath, `${JSON.stringify(value, null, 2)}\n`, 'utf8');
}

function readRunStateFile(filePath) {
  const state = readJsonFile(filePath, 'run-state');
  if (!state || typeof state !== 'object' || state.kind !== 'run-state') {
    throw new Error(`Invalid run-state object: ${filePath}`);
  }
  if (!state.run_id) {
    throw new Error(`run-state is missing run_id: ${filePath}`);
  }
  return state;
}

function loadTaskAnchor(taskAnchorPath, taskAnchorData = null) {
  if (taskAnchorData) {
    return taskAnchorData;
  }
  return taskAnchorPath ? readJsonFile(taskAnchorPath, 'task-anchor') : null;
}

function maybeAttachCheckpoint(targetDir, state, checkpointEvent) {
  if (!shouldPersistCheckpoints() || !checkpointEvent || !CHECKPOINT_EVENTS.has(checkpointEvent)) {
    return state;
  }

  const runtimePaths = resolveRuntimePaths(targetDir);
  const checkpointDir = path.join(runtimePaths.checkpointsDir.path, state.run_id);
  ensureDir(checkpointDir);

  const timestamp = state.timestamps?.updated_at || new Date().toISOString();
  const sequence = (Number(state.checkpoint_count) || 0) + 1;
  const checkpointFileName = `${String(sequence).padStart(3, '0')}-${checkpointEvent}.json`;
  const checkpointPath = path.join(checkpointDir, checkpointFileName);
  const checkpointRelPath = path.relative(targetDir, checkpointPath);
  const metadata = buildCheckpointMetadata(state, checkpointEvent, checkpointRelPath, timestamp);
  const nextState = {
    ...state,
    checkpoint_count: sequence,
    last_checkpoint: metadata,
  };

  writeJsonFile(checkpointPath, {
    schema_version: 1,
    kind: 'runtime-checkpoint',
    run_id: state.run_id,
    sequence,
    event: checkpointEvent,
    created_at: timestamp,
    state: nextState,
  });

  return nextState;
}

function saveUpdatedRunState({
  targetDir,
  historyRunPath,
  currentRunPath,
  syncCurrent,
  forceSyncCurrent = false,
  state,
  checkpointEvent = null,
}) {
  syncRepoMap(targetDir);
  const nextState = maybeAttachCheckpoint(targetDir, state, checkpointEvent);

  if (historyRunPath) {
    writeJsonFile(historyRunPath, nextState);
  }
  if (syncCurrent || forceSyncCurrent) {
    writeJsonFile(currentRunPath, nextState);
  }

  try {
    const bridgePath = path.join(__dirname, 'visual-bridge.js');
    if (fs.existsSync(bridgePath)) {
      const child = spawnSync(process.execPath, [bridgePath, 'push-current', '--target', targetDir, '--event-name', checkpointEvent || 'runtime-state-updated', '--json'], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (child.status !== 0 && process.env.AI_SPEC_VISUAL_BRIDGE_DEBUG === '1') {
        console.warn(`visual bridge skipped: ${child.stderr || child.stdout || 'unknown error'}`);
      }
    }
  } catch (error) {
    if (process.env.AI_SPEC_VISUAL_BRIDGE_DEBUG === '1') {
      console.warn(`visual bridge error: ${error.message}`);
    }
  }

  return nextState;
}

function recordRunInputUpdate(options) {
  if (!options.userInput || !String(options.userInput).trim()) {
    throw new Error('Missing required argument: userInput');
  }

  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);

  if (['success', 'failed', 'cancelled'].includes(String(state.status || '').toLowerCase())) {
    throw new Error(`Cannot update terminal run: ${state.run_id}`);
  }

  const now = new Date();
  const userInput = String(options.userInput).trim();
  const update = {
    at: now.toISOString(),
    text: userInput,
    source: options.source || 'protocol-update',
    change_context: options.changeContext || null,
    route_decision: options.routeDecision || null,
    trace_mode: options.traceMode || null,
    change_impact: options.changeImpact || null,
    reconcile_strategy: options.reconcileStrategy || null,
    artifacts_to_update: Array.isArray(options.artifactsToUpdate) ? options.artifactsToUpdate : [],
    reopen_reason: options.reopenReason || null,
    parent_change_id: options.parentChangeId || null,
    target_role: options.toRole || options.nextRole || null,
    handoff_gate: options.handoffGate || null,
  };

  const nextInputUpdates = [...(Array.isArray(state.input_updates) ? state.input_updates : []), update].slice(-20);
  const event = buildStateEvent({
    state,
    options: {
      ...options,
      toRole: state.current_role || state.plan?.first_handoff || null,
      clearPendingGate: false,
      message: `user input updated: ${userInput}`,
    },
    now,
    defaults: {
      status: state.status || 'running',
      eventType: 'user-input-updated',
      message: `user input updated: ${userInput}`,
      pendingGate: state.pending_gate ?? null,
    },
  });

  const updatedState = {
    ...state,
    pending_input_update: true,
    trigger: {
      ...(state.trigger || {}),
      latest_user_input: userInput,
      latest_input_at: now.toISOString(),
      latest_change_context: options.changeContext || null,
      latest_route_decision: options.routeDecision || null,
      latest_trace_mode: options.traceMode || null,
      latest_change_impact: options.changeImpact || null,
      latest_reconcile_strategy: options.reconcileStrategy || null,
    },
    incremental_update: buildIncrementalUpdateState(state, options, {
      updatedAt: now.toISOString(),
    }),
    input_updates: nextInputUpdates,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent,
    state: updatedState,
    checkpointEvent: 'pause',
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: persistedState,
    update,
  };
}

function writeRunState({ targetDir, runPlan, taskAnchor, options, source }) {
  const now = new Date();
  const state = buildRunState({ runPlan, taskAnchor, options, now, source });
  const runtimePaths = resolveRuntimePaths(targetDir);
  const persistHistory = shouldPersistHistory();
  if (persistHistory) {
    ensureDir(runtimePaths.runsDir.path);
  }
  ensureDir(path.dirname(runtimePaths.currentRun.path));

  const currentRunPath = runtimePaths.currentRun.path;
  const historyRunPath = persistHistory
    ? path.join(runtimePaths.runsDir.path, `${state.run_id}.json`)
    : null;

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent: true,
    forceSyncCurrent: true,
    state,
    checkpointEvent: 'bootstrap',
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: currentRunPath,
      run_history: historyRunPath,
    },
    state: persistedState,
    source: {
      run_plan: source.runPlan || null,
      task_anchor: source.taskAnchor || null,
      bootstrap_payload: source.bootstrapPayload || null,
    },
  };
}

function resolveRunStatePaths(targetDir, runId) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const aiSpecDir = runtimePaths.aiSpecDir.path;
  const currentRunPath = runtimePaths.currentRun.path;
  let historyRunPath = null;
  let state = null;
  const currentState = fs.existsSync(currentRunPath)
    ? readRunStateFile(currentRunPath)
    : null;

  if (runId) {
    if (currentState && currentState.run_id === runId) {
      state = currentState;
    }
    for (const candidateDir of getCandidatePaths(runtimePaths.runsDir)) {
      const candidatePath = path.join(candidateDir, `${runId}.json`);
      if (fs.existsSync(candidatePath)) {
        historyRunPath = candidatePath;
        if (!state) {
          state = readRunStateFile(historyRunPath);
        }
        break;
      }
    }
    if (!state) {
      throw new Error(`run-state history file not found for run_id: ${runId}`);
    }
  } else {
    if (!fs.existsSync(currentRunPath)) {
      throw new Error(`current run-state file not found: ${currentRunPath}`);
    }
    state = currentState;
    const candidateHistory = getExistingPath({
      path: path.join(runtimePaths.runsDir.path, `${state.run_id}.json`),
      legacyPaths: getCandidatePaths(runtimePaths.runsDir).map((dirPath) => path.join(dirPath, `${state.run_id}.json`)).slice(1),
    });
    historyRunPath = fs.existsSync(candidateHistory) ? candidateHistory : null;
  }

  return {
    aiSpecDir,
    currentRunPath,
    historyRunPath,
    state,
    syncCurrent: Boolean(currentState && currentState.run_id === state.run_id),
  };
}

function buildHandoffEvent({ state, options, now }) {
  const fromRole = options.fromRole || state.current_role || state.plan?.first_handoff || null;
  const toRole = options.toRole;
  const eventType = options.eventType || 'role-handoff';
  const message =
    options.message ||
    `handoff from ${fromRole || 'unknown'} to ${toRole}`;

  return {
    at: now.toISOString(),
    type: eventType,
    status: options.status || state.status || 'running',
    from_role: fromRole,
    to_role: toRole,
    pending_gate:
      options.clearPendingGate ? null :
      (Object.prototype.hasOwnProperty.call(options, 'pendingGate') ? options.pendingGate || null : state.pending_gate || null),
    gate_context: options.clearPendingGate ? null : buildGateContext(state, options),
    message,
  };
}

function buildStateEvent({ state, options, now, defaults = {} }) {
  const fromRole = options.fromRole || defaults.fromRole || state.current_role || state.plan?.first_handoff || null;
  const toRole = options.toRole || defaults.toRole || null;
  const pendingGate = options.clearPendingGate
    ? null
    : (Object.prototype.hasOwnProperty.call(options, 'pendingGate')
      ? options.pendingGate || null
      : defaults.pendingGate ?? state.pending_gate ?? null);
  const status = options.status || defaults.status || state.status || 'running';
  const eventType = options.eventType || defaults.eventType || 'state-updated';
  const message = options.message || defaults.message || eventType;

  return {
    at: now.toISOString(),
    type: eventType,
    status,
    from_role: fromRole,
    to_role: toRole,
    pending_gate: pendingGate,
    gate_context: pendingGate ? buildGateContext(state, options, pendingGate) : null,
    message,
  };
}

function shouldClearPendingGateForHandoff(state, options = {}) {
  if (Object.prototype.hasOwnProperty.call(options, 'clearPendingGate')) {
    return Boolean(options.clearPendingGate);
  }

  if (Object.prototype.hasOwnProperty.call(options, 'pendingGate')) {
    return false;
  }

  return Boolean(state?.pending_gate && state?.pending_input_update);
}

function updateAnchorForRole(existingAnchor, taskAnchor, toRole, nextRole) {
  const sanitizedAnchor = taskAnchor ? sanitizeAnchor(taskAnchor) : existingAnchor || null;
  if (!sanitizedAnchor) {
    return null;
  }
  return {
    ...sanitizedAnchor,
    stage: {
      ...(sanitizedAnchor.stage || {}),
      current_role: toRole ?? sanitizedAnchor.stage?.current_role ?? null,
      next_role: nextRole ?? sanitizedAnchor.stage?.next_role ?? null,
    },
  };
}

function handoffRunState(options) {
  if (!options.toRole) {
    throw new Error('Missing required argument: --to-role <role>');
  }

  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  assertRequiredOpenSpecArtifacts(targetDir, state, 'handoff', options.toRole);
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const sanitizedAnchor = updateAnchorForRole(
    state.anchor || null,
    taskAnchor,
    options.toRole,
    options.nextRole,
  );
  const now = new Date();
  const clearPendingGate = shouldClearPendingGateForHandoff(state, options);
  const event = buildHandoffEvent({
    state,
    options: {
      ...options,
      clearPendingGate,
    },
    now,
  });
  const updatedState = {
    ...state,
    status: options.status || 'running',
    current_role: options.toRole,
    pending_input_update: false,
    pending_gate: clearPendingGate
      ? null
      : (Object.prototype.hasOwnProperty.call(options, 'pendingGate') ? options.pendingGate || null : state.pending_gate || null),
    gate_context: clearPendingGate
      ? null
      : buildGateContext(state, options),
    verification: options.verificationData || state.verification || null,
    auto_fix: buildNextAutoFixState(state, options),
    anchor: sanitizedAnchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent,
    state: updatedState,
    checkpointEvent: 'handoff',
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: persistedState,
    source: {
      task_anchor: taskAnchorPath,
    },
    handoff: {
      from_role: event.from_role || null,
      to_role: options.toRole,
      next_role: options.nextRole || null,
    },
  };
}

function approveRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const activeGate = state.pending_gate || null;
  const requestedGate = options.gate || activeGate;

  if (!activeGate) {
    throw new Error('No pending approval gate found');
  }
  if (options.gate && activeGate && options.gate !== activeGate) {
    throw new Error(`Pending gate mismatch: current is "${activeGate}", requested "${options.gate}"`);
  }

  const toRole = inferApprovalResumeRole(state, options);
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: true },
    now,
    defaults: {
      status: 'running',
      eventType: 'gate-cleared',
      message: `approval cleared for ${requestedGate}`,
      pendingGate: null,
    },
  });

  const updatedState = {
    ...state,
    status: options.status || 'running',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: null,
    gate_context: null,
    incremental_update: buildIncrementalUpdateState(state, options, {
      updatedAt: now.toISOString(),
    }),
    auto_fix: buildNextAutoFixState(state, options),
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent,
    state: updatedState,
    checkpointEvent: 'approve',
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: persistedState,
    source: {
      task_anchor: taskAnchorPath,
      gate: requestedGate,
    },
    handoff: {
      from_role: event.from_role || null,
      to_role: toRole,
      next_role: options.nextRole || null,
    },
  };
}

function pauseRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  if (['success', 'failed', 'cancelled'].includes(String(state.status || '').toLowerCase())) {
    throw new Error(`Cannot pause terminal run: ${state.run_id}`);
  }

  const toRole = options.toRole || state.current_role || state.anchor?.stage?.current_role || state.plan?.first_handoff || null;
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: false },
    now,
    defaults: {
      status: 'paused',
      eventType: 'run-paused',
      message: options.message || 'run paused',
      pendingGate: state.pending_gate || null,
    },
  });

  const updatedState = {
    ...state,
    status: options.status || 'paused',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: options.clearPendingGate ? null : state.pending_gate || null,
    gate_context: options.clearPendingGate ? null : state.gate_context || null,
    incremental_update: buildIncrementalUpdateState(state, options, {
      updatedAt: now.toISOString(),
    }),
    auto_fix: buildNextAutoFixState(state, options),
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent,
    state: updatedState,
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: persistedState,
    source: {
      task_anchor: taskAnchorPath,
    },
  };
}

function resumeRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const toRole = state.pending_gate
    ? inferApprovalResumeRole(state, options)
    : (options.toRole || state.current_role || state.anchor?.stage?.current_role || state.plan?.first_handoff || null);
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: true },
    now,
    defaults: {
      status: 'running',
      eventType: 'run-resumed',
      message: `resumed run at ${toRole || 'unknown'}`,
      pendingGate: null,
    },
  });

  const updatedState = {
    ...state,
    status: options.status || 'running',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: options.clearPendingGate === false ? state.pending_gate || null : null,
    gate_context: options.clearPendingGate === false ? state.gate_context || null : null,
    incremental_update: buildIncrementalUpdateState(state, options, {
      updatedAt: now.toISOString(),
    }),
    auto_fix: buildNextAutoFixState(state, options),
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent,
    state: updatedState,
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: persistedState,
    source: {
      task_anchor: taskAnchorPath,
    },
  };
}

function restoreRunState(options) {
  if (!options.checkpoint) {
    throw new Error('Missing required argument: --checkpoint <file>');
  }

  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const checkpointPath = path.resolve(process.cwd(), options.checkpoint);
  const checkpoint = readJsonFile(checkpointPath, 'runtime checkpoint');

  if (checkpoint.kind !== 'runtime-checkpoint' || !checkpoint.state || checkpoint.state.kind !== 'run-state') {
    throw new Error(`Invalid runtime checkpoint: ${checkpointPath}`);
  }

  const runId = options.runId || checkpoint.run_id || checkpoint.state.run_id || null;
  if (!runId) {
    throw new Error(`Checkpoint is missing run_id: ${checkpointPath}`);
  }
  if (checkpoint.run_id && checkpoint.run_id !== runId) {
    throw new Error(`Checkpoint run_id mismatch: expected ${runId}, got ${checkpoint.run_id}`);
  }

  const { currentRunPath, historyRunPath } = resolveRunStatePaths(targetDir, runId);
  const currentRun = fs.existsSync(currentRunPath) ? readRunStateFile(currentRunPath) : null;
  if (currentRun && currentRun.run_id !== runId) {
    throw new Error(`Restore only supports the current active run; current run is ${currentRun.run_id}, requested ${runId}`);
  }

  const now = new Date();
  const restoredState = {
    ...checkpoint.state,
    events: [
      ...(Array.isArray(checkpoint.state.events) ? checkpoint.state.events : []),
      {
        at: now.toISOString(),
        type: 'run-restored',
        status: checkpoint.state.status || 'running',
        from_role: checkpoint.state.current_role || null,
        to_role: checkpoint.state.current_role || null,
        pending_gate: checkpoint.state.pending_gate || null,
        message: `restored from checkpoint ${path.relative(targetDir, checkpointPath)}`,
      },
    ],
    timestamps: {
      ...(checkpoint.state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent: true,
    forceSyncCurrent: true,
    state: restoredState,
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: currentRunPath,
      run_history: historyRunPath,
      checkpoint: checkpointPath,
    },
    state: persistedState,
    source: {
      checkpoint: checkpointPath,
    },
  };
}

function statusRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const events = Array.isArray(state.events) ? state.events : [];
  const lastEvent = events.length > 0 ? events[events.length - 1] : null;

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    summary: {
      run_id: state.run_id,
      mode: state.mode || null,
      delivery_profile: state.delivery_profile || null,
      artifact_profile: state.artifact_profile || null,
      complexity: state.complexity || state.task?.complexity || null,
      status: state.status || null,
      flow_id: state.flow?.id || null,
      current_role: state.current_role || null,
      pending_input_update: Boolean(state.pending_input_update),
      input_update_count: Array.isArray(state.input_updates) ? state.input_updates.length : 0,
      pending_gate: state.pending_gate || null,
      gate_context: state.gate_context || null,
      incremental_update: state.incremental_update || null,
      auto_fix: normalizeAutoFixState(state.auto_fix),
      checkpoint_count: Number(state.checkpoint_count) || 0,
      last_checkpoint: state.last_checkpoint || null,
      updated_at: state.timestamps?.updated_at || null,
      last_event: lastEvent,
    },
    state,
  };
}

function gateBlockedRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const requestedGate = options.gate || options.pendingGate || state.pending_gate || null;
  const nextStatus = options.status || (requestedGate ? 'waiting-approval' : 'blocked');
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const toRole = options.toRole || state.current_role || null;
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const event = buildStateEvent({
    state,
    options: { ...options, pendingGate: requestedGate, toRole },
    now,
    defaults: {
      status: nextStatus,
      eventType: 'gate-blocked',
      message: requestedGate
        ? `waiting for ${requestedGate} approval`
        : 'run blocked',
      pendingGate: requestedGate,
    },
  });

  const updatedState = {
    ...state,
    status: nextStatus,
    current_role: toRole,
    pending_input_update: false,
    pending_gate: requestedGate,
    gate_context: buildGateContext(state, options, requestedGate),
    incremental_update: buildIncrementalUpdateState(state, options, {
      updatedAt: now.toISOString(),
    }),
    verification: options.verificationData || state.verification || null,
    auto_fix: buildNextAutoFixState(state, options),
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
    },
  };

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent,
    state: updatedState,
    checkpointEvent: 'gate-blocked',
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: persistedState,
    source: {
      task_anchor: taskAnchorPath,
      gate: requestedGate,
    },
  };
}

function completeRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  if (options.skipArtifactCheck !== true) {
    assertRequiredOpenSpecArtifacts(targetDir, state, 'complete', options.toRole || state.current_role || null);
  }
  const toRole = options.toRole || state.current_role || null;
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const nextArtifacts = options.artifactsData
    ? mergeArtifacts(
        mergeArtifacts(buildDefaultArtifacts(state.task?.change_id || state.anchor?.task?.change_id || null), inferArtifacts(state.artifacts || null)),
        inferArtifacts(options.artifactsData),
      )
    : state.artifacts;
  const now = new Date();
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: true },
    now,
    defaults: {
      status: 'success',
      eventType: 'run-completed',
      message: 'run completed',
      pendingGate: null,
    },
  });

  const updatedState = {
    ...state,
    status: options.status || 'success',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: null,
    gate_context: null,
    incremental_update: buildIncrementalUpdateState(state, options, {
      updatedAt: now.toISOString(),
    }),
    artifacts: nextArtifacts,
    auto_fix: buildNextAutoFixState(state, options, { active: false }),
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
      finished_at: now.toISOString(),
    },
  };

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent,
    state: updatedState,
    checkpointEvent: 'complete',
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: persistedState,
    source: {
      task_anchor: taskAnchorPath,
    },
  };
}

function failRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const toRole = options.toRole || state.current_role || null;
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const errorMessage = options.error || options.message || 'run failed';
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: true, message: errorMessage },
    now,
    defaults: {
      status: 'failed',
      eventType: 'run-failed',
      message: errorMessage,
      pendingGate: null,
    },
  });

  const updatedErrors = [...(Array.isArray(state.errors) ? state.errors : [])];
  if (errorMessage) {
    updatedErrors.push(errorMessage);
  }

  const updatedState = {
    ...state,
    status: options.status || 'failed',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: null,
    gate_context: null,
    incremental_update: buildIncrementalUpdateState(state, options, {
      updatedAt: now.toISOString(),
    }),
    auto_fix: buildNextAutoFixState(state, options, { active: false }),
    anchor,
    errors: updatedErrors,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
      finished_at: now.toISOString(),
    },
  };

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent,
    state: updatedState,
    checkpointEvent: 'fail',
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: persistedState,
    source: {
      task_anchor: taskAnchorPath,
      error: options.error || null,
    },
  };
}

function cancelRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;
  const { currentRunPath, historyRunPath, state, syncCurrent } = resolveRunStatePaths(targetDir, options.runId);
  const toRole = options.toRole || state.current_role || null;
  const taskAnchor = loadTaskAnchor(taskAnchorPath, options.taskAnchorData || null);
  const anchor = updateAnchorForRole(state.anchor || null, taskAnchor, toRole, options.nextRole);
  const now = new Date();
  const cancelMessage = options.message || 'run cancelled';
  const event = buildStateEvent({
    state,
    options: { ...options, toRole, clearPendingGate: true, message: cancelMessage },
    now,
    defaults: {
      status: 'cancelled',
      eventType: 'run-cancelled',
      message: cancelMessage,
      pendingGate: null,
    },
  });

  const updatedState = {
    ...state,
    status: options.status || 'cancelled',
    current_role: toRole,
    pending_input_update: false,
    pending_gate: null,
    gate_context: null,
    incremental_update: buildIncrementalUpdateState(state, options, {
      updatedAt: now.toISOString(),
    }),
    auto_fix: buildNextAutoFixState(state, options, { active: false }),
    anchor,
    events: [...(Array.isArray(state.events) ? state.events : []), event],
    timestamps: {
      ...(state.timestamps || {}),
      updated_at: now.toISOString(),
      finished_at: now.toISOString(),
    },
  };

  const persistedState = saveUpdatedRunState({
    targetDir,
    historyRunPath,
    currentRunPath,
    syncCurrent,
    state: updatedState,
    checkpointEvent: 'cancel',
  });

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_run: syncCurrent ? currentRunPath : null,
      run_history: historyRunPath,
    },
    state: persistedState,
    source: {
      task_anchor: taskAnchorPath,
    },
  };
}

function initRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const runPlanPath = path.resolve(process.cwd(), options.runPlan);
  const taskAnchorPath = options.taskAnchor
    ? path.resolve(process.cwd(), options.taskAnchor)
    : null;

  const runPlan = readJsonFile(runPlanPath, 'run-plan');
  assertRunPlan(runPlan, runPlanPath);

  const taskAnchor = taskAnchorPath
    ? readJsonFile(taskAnchorPath, 'task-anchor')
    : null;

  return writeRunState({
    targetDir,
    runPlan,
    taskAnchor,
    options,
    source: {
      runPlan: runPlanPath,
      taskAnchor: taskAnchorPath,
      bootstrapPayload: null,
    },
  });
}

function bootstrapRunState(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const inputCount = [
    Boolean(options.payload),
    Boolean(options.stdin),
    Boolean(options.payloadData),
  ].filter(Boolean).length;
  const hasInput = inputCount > 0;

  if (!hasInput) {
    throw new Error('Missing bootstrap input: use --payload <file> or --stdin');
  }
  if (inputCount > 1) {
    throw new Error('Use only one bootstrap input: --payload <file>, --stdin, or payloadData');
  }

  const payloadSource = options.payloadData
    ? 'memory-payload'
    : options.payload
    ? path.resolve(process.cwd(), options.payload)
    : 'stdin';
  const payload = options.payloadData
    ? options.payloadData
    : options.payload
    ? readJsonFile(payloadSource, 'bootstrap payload')
    : readJsonFromStdin('bootstrap payload');

  const { runPlan, taskAnchor } = normalizeBootstrapPayload(payload, payloadSource);
  assertRunPlan(runPlan, payloadSource);

  return writeRunState({
    targetDir,
    runPlan,
    taskAnchor,
    options,
    source: {
      runPlan: payloadSource,
      taskAnchor: payloadSource,
      bootstrapPayload: payloadSource,
    },
  });
}

function printPretty(result, action = 'init') {
  if (action === 'handoff') {
    console.log('run-state updated');
  } else if (action === 'approve') {
    console.log('run-state approved');
  } else if (action === 'resume') {
    console.log('run-state resumed');
  } else if (action === 'pause') {
    console.log('run-state paused');
  } else if (action === 'restore') {
    console.log('run-state restored');
  } else if (action === 'gate-blocked') {
    console.log('run-state blocked');
  } else if (action === 'status') {
    console.log('run-state status');
  } else if (action === 'complete') {
    console.log('run-state completed');
  } else if (action === 'fail') {
    console.log('run-state failed');
  } else if (action === 'cancel') {
    console.log('run-state cancelled');
  } else {
    console.log('run-state initialized');
  }
  console.log(`  target: ${result.target}`);
  console.log(`  run_id: ${result.state.run_id}`);
  console.log(`  current: ${result.artifacts.current_run}`);
  if (result.artifacts.run_history) {
    console.log(`  history: ${result.artifacts.run_history}`);
  }
  console.log(`  mode: ${result.state.mode || 'n/a'}`);
  console.log(`  review_policy: ${result.state.review_policy || 'n/a'}`);
  console.log(`  delivery_profile: ${result.state.delivery_profile || 'n/a'}`);
  console.log(`  artifact_profile: ${result.state.artifact_profile || 'n/a'}`);
  console.log(`  complexity: ${result.state.complexity || result.state.task?.complexity || 'n/a'}`);
  console.log(`  checkpoints: ${Number(result.state.checkpoint_count) || 0}`);
  if (result.state.last_checkpoint?.file) {
    console.log(`  last_checkpoint: ${result.state.last_checkpoint.file}`);
  }
  if (action === 'status') {
    console.log(`  status: ${result.state.status || 'n/a'}`);
    console.log(`  current_role: ${result.state.current_role || 'n/a'}`);
    console.log(`  pending_gate: ${result.state.pending_gate || 'n/a'}`);
    if (result.state.gate_context?.required_user_action) {
      console.log(`  required_user_action: ${result.state.gate_context.required_user_action}`);
    }
  } else if (action === 'handoff') {
    console.log(`  current_role: ${result.state.current_role || 'n/a'}`);
    console.log(`  from_role: ${result.handoff?.from_role || 'n/a'}`);
    console.log(`  to_role: ${result.handoff?.to_role || 'n/a'}`);
  } else if (
    action === 'pause' ||
    action === 'approve' ||
    action === 'resume' ||
    action === 'restore' ||
    action === 'gate-blocked' ||
    action === 'complete' ||
    action === 'fail'
  ) {
    console.log(`  status: ${result.state.status || 'n/a'}`);
    console.log(`  current_role: ${result.state.current_role || 'n/a'}`);
    console.log(`  pending_gate: ${result.state.pending_gate || 'n/a'}`);
  } else {
    console.log(`  first_handoff: ${result.state.plan.first_handoff || 'n/a'}`);
  }
  if (result.source.bootstrap_payload) {
    console.log(`  bootstrap_payload: ${result.source.bootstrap_payload}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === '--help' || command === '-h' || command === 'help') {
    printUsage();
    return 0;
  }

  if (command === 'init') {
    if (!options.runPlan) {
      throw new Error('Missing required argument: --run-plan <file>');
    }

    const result = initRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'init');
    }

    return 0;
  }

  if (command === 'bootstrap') {
    const result = bootstrapRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'bootstrap');
    }

    return 0;
  }

  if (command === 'handoff') {
    const result = handoffRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'handoff');
    }

    return 0;
  }

  if (command === 'approve') {
    const result = approveRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'approve');
    }

    return 0;
  }

  if (command === 'pause') {
    const result = pauseRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'pause');
    }

    return 0;
  }

  if (command === 'resume') {
    const result = resumeRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'resume');
    }

    return 0;
  }

  if (command === 'restore') {
    const result = restoreRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'restore');
    }

    return 0;
  }

  if (command === 'gate-blocked') {
    const result = gateBlockedRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'gate-blocked');
    }

    return 0;
  }

  if (command === 'status') {
    const result = statusRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'status');
    }

    return 0;
  }

  if (command === 'complete') {
    const result = completeRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'complete');
    }

    return 0;
  }

  if (command === 'fail') {
    const result = failRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'fail');
    }

    return 0;
  }

  if (command === 'cancel') {
    const result = cancelRunState(options);

    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, 'cancel');
    }

    return 0;
  }

  if (
    command !== 'init' &&
    command !== 'bootstrap' &&
    command !== 'handoff' &&
    command !== 'approve' &&
    command !== 'pause' &&
    command !== 'resume' &&
    command !== 'restore' &&
    command !== 'gate-blocked' &&
    command !== 'status' &&
    command !== 'complete' &&
    command !== 'fail' &&
    command !== 'cancel'
  ) {
    throw new Error(`Unsupported runtime-state command: ${command}`);
  }
}

if (require.main === module) {
  try {
    const exitCode = main();
    process.exit(exitCode);
  } catch (error) {
    console.error(`runtime-state error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  main,
  parseArgs,
  createRunId,
  normalizeSpecsArtifactPath,
  inferDeliveryProfile,
  inferArtifactProfile,
  inferComplexity,
  inferRiskLevel,
  inferArtifacts,
  buildRunState,
  recordRunInputUpdate,
  readRunStateFile,
  resolveRunStatePaths,
  initRunState,
  bootstrapRunState,
  normalizeBootstrapPayload,
  handoffRunState,
  approveRunState,
  pauseRunState,
  resumeRunState,
  restoreRunState,
  gateBlockedRunState,
  statusRunState,
  completeRunState,
  failRunState,
  cancelRunState,
};
