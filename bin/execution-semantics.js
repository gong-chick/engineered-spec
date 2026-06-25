const fs = require('fs');
const path = require('path');
const runtimeState = require('./runtime-state');
const { resolveRuntimePaths, getCandidatePaths } = require('./runtime-paths');
const {
  getRoleRuntimeConfig,
  getFlowRuntimeConfig,
  resolveRuntimeProfileId,
} = require('./runtime-registry');

const AUTO_ADVANCE_EXECUTION_STATUSES = new Set(['done', 'success', 'completed']);
const DEFAULT_REVIEW_POLICY = 'none';

const FLOW_RUNTIME_TRANSITIONS = {
  'prd-to-delivery': {
    'requirement-analyst': {
      action: 'handoff',
      to_role: 'frontend-implementer',
      next_role: 'code-guardian',
      message: 'handoff to frontend-implementer after requirement convergence',
    },
    'design-collaborator': {
      action: 'handoff',
      to_role: 'frontend-implementer',
      next_role: 'code-guardian',
      message: 'handoff to frontend-implementer after design collaboration',
    },
    'api-contract-specialist': {
      action: 'handoff',
      to_role: 'frontend-implementer',
      next_role: 'code-guardian',
      message: 'handoff to frontend-implementer after API contract clarification',
    },
    'frontend-implementer': {
      action: 'handoff',
      to_role: 'code-guardian',
      next_role: null,
      message: 'handoff to code-guardian after implementation delivery',
    },
    'unit-test-specialist': {
      action: 'handoff',
      to_role: 'code-guardian',
      next_role: null,
      message: 'handoff to code-guardian after targeted test supplementation',
    },
    'verification-reviewer': {
      action: 'handoff',
      to_role: 'code-guardian',
      next_role: null,
      message: 'handoff to code-guardian after verification review',
    },
    'performance-auditor': {
      action: 'handoff',
      to_role: 'code-guardian',
      next_role: null,
      message: 'handoff to code-guardian after performance audit',
    },
    'code-guardian': {
      action: 'gate-blocked',
      to_role: 'code-guardian',
      next_role: 'archive-change',
      pending_gate: 'before-archive',
      status: 'waiting-approval',
      message: 'waiting for user decision before archive-change closeout',
    },
    'archive-change': {
      action: 'complete',
      to_role: 'archive-change',
      next_role: null,
      message: 'run completed after archive-change closeout',
    },
  },
  'bugfix-to-verification': {
    'frontend-implementer': {
      action: 'handoff',
      to_role: 'code-guardian',
      next_role: null,
      message: 'handoff to code-guardian after lightweight bugfix delivery',
    },
    'unit-test-specialist': {
      action: 'handoff',
      to_role: 'code-guardian',
      next_role: null,
      message: 'handoff to code-guardian after lightweight test supplementation',
    },
    'verification-reviewer': {
      action: 'handoff',
      to_role: 'code-guardian',
      next_role: null,
      message: 'handoff to code-guardian after lightweight verification review',
    },
    'performance-auditor': {
      action: 'handoff',
      to_role: 'code-guardian',
      next_role: null,
      message: 'handoff to code-guardian after lightweight performance review',
    },
    'code-guardian': {
      action: 'complete',
      to_role: 'code-guardian',
      next_role: null,
      message: 'run completed after lightweight verification closeout',
    },
  },
};

const ROLE_OPENSPEC_ACTIONS = {
  'requirement-analyst': 'propose',
  'frontend-implementer': 'apply',
  'code-guardian': 'verify',
  'archive-change': 'archive',
};

const ROLE_REQUIRED_INPUTS = {
  'frontend-implementer': ['proposal', 'specs', 'design', 'tasks'],
  'code-guardian': ['proposal', 'specs', 'design', 'tasks'],
  'archive-change': ['proposal', 'specs', 'design', 'tasks', 'checklist', 'iterations'],
};

const ROLE_REQUIRED_OUTPUTS = {
  'requirement-analyst': ['proposal', 'specs', 'design', 'tasks'],
  'code-guardian': ['checklist', 'iterations'],
};

function normalizeReviewPolicy(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized === 'none' || normalized === 'main-flow-blocking'
    ? normalized
    : DEFAULT_REVIEW_POLICY;
}

function isMainFlowBlocking(currentRun, flowId) {
  return flowId === 'prd-to-delivery' && normalizeReviewPolicy(currentRun?.review_policy || currentRun?.plan?.review_policy || null) === 'main-flow-blocking';
}

const FLOW_ROLE_REQUIRED_INPUTS = {
  'bugfix-to-verification': {
    'frontend-implementer': [],
    'code-guardian': ['bugfix', 'implementation_notes'],
    'unit-test-specialist': ['bugfix', 'implementation_notes'],
    'verification-reviewer': ['bugfix', 'implementation_notes'],
    'performance-auditor': ['bugfix', 'implementation_notes'],
  },
};

const FLOW_ROLE_REQUIRED_OUTPUTS = {
  'bugfix-to-verification': {
    'frontend-implementer': ['bugfix', 'implementation_notes'],
    'code-guardian': ['checklist', 'iterations'],
  },
};

function readJsonFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  try {
    return JSON.parse(raw);
  } catch (error) {
    throw new Error(`${label} is not valid JSON: ${filePath}`);
  }
}

function readCurrentRun(targetDir) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  if (!fs.existsSync(runtimePaths.currentRun.path)) {
    return null;
  }
  return readJsonFile(runtimePaths.currentRun.path, 'current run-state');
}

function readCurrentExecution(targetDir) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  for (const candidatePath of getCandidatePaths(runtimePaths.currentExecutionJson)) {
    if (fs.existsSync(candidatePath)) {
      return readJsonFile(candidatePath, 'current expert execution');
    }
  }
  return null;
}

function normalizeExecutionStatus(value) {
  return String(value || '').trim().toLowerCase();
}

function isCompletedExecutionStatus(value) {
  return AUTO_ADVANCE_EXECUTION_STATUSES.has(normalizeExecutionStatus(value));
}

function normalizeRuntimeAction(value) {
  const action = String(value || '').trim().toLowerCase();
  if (action === 'archive' || action === 'completed') {
    return 'complete';
  }
  if (action === 'blocked') {
    return 'gate-blocked';
  }
  return action;
}

function guardRuntimeActionForIncompleteExecution(targetDir, payload) {
  const runtimeAction = normalizeRuntimeAction(payload?.action || payload?.event);
  if (runtimeAction !== 'handoff' && runtimeAction !== 'complete') {
    return payload;
  }

  const currentExecution = readCurrentExecution(targetDir);
  if (!currentExecution) {
    return payload;
  }

  const status = normalizeExecutionStatus(currentExecution.status);
  if (isCompletedExecutionStatus(status)) {
    return payload;
  }

  const roleId = currentExecution.role?.id || payload?.from_role || payload?.to_role || null;
  if (!roleId) {
    return payload;
  }

  const originalToRole = payload?.to_role || payload?.toRole || null;
  const originalNextRole = payload?.next_role || payload?.nextRole || null;
  const nextRole = originalToRole && originalToRole !== roleId
    ? originalToRole
    : originalNextRole;
  const message = `当前专家状态为 ${status || 'unknown'}，尚未达到 done / success / completed，已留在 ${roleId} 继续补齐后再交接。`;

  return {
    ...(payload || {}),
    schema_version: payload?.schema_version || 1,
    kind: 'task-orchestrator-runtime-action',
    action: 'handoff',
    run_id: payload?.run_id || currentExecution.run_id || null,
    from_role: payload?.from_role || currentExecution.role?.id || roleId,
    to_role: roleId,
    next_role: nextRole || null,
    status: 'running',
    clear_pending_gate: true,
    message,
    blocked_reason: payload?.blocked_reason || message,
    source: payload?.source || 'incomplete-execution-guard',
    verification: payload?.verification || currentExecution.verification || null,
    auto_fix: payload?.auto_fix || null,
  };
}

function loadPackageManifest(targetDir) {
  const packagePath = path.join(targetDir, 'package.json');
  if (!fs.existsSync(packagePath)) {
    return null;
  }
  return readJsonFile(packagePath, 'package manifest');
}

function hasDependency(pkg, names) {
  if (!pkg) {
    return false;
  }
  const deps = {
    ...(pkg.dependencies || {}),
    ...(pkg.devDependencies || {}),
    ...(pkg.peerDependencies || {}),
  };
  return names.some((name) => Object.prototype.hasOwnProperty.call(deps, name));
}

function detectProjectProfile(targetDir) {
  const manifestPath = path.join(targetDir, '.ai-spec', 'manifest.json');
  if (fs.existsSync(manifestPath)) {
    try {
      const manifest = readJsonFile(manifestPath, 'runtime manifest');
      const manifestProfile = resolveRuntimeProfileId(targetDir, manifest?.profile);
      if (manifestProfile) {
        return manifestProfile;
      }
    } catch (_error) {
      // ignore invalid manifest and continue with package detection
    }
  }

  const pkg = loadPackageManifest(targetDir);
  if (hasDependency(pkg, ['vue', 'vue-router', 'pinia'])) {
    return 'vue';
  }
  if (hasDependency(pkg, ['react', 'react-dom', 'react-router-dom'])) {
    return 'react';
  }
  return 'default';
}

function resolveTransitionRoleValue(targetDir, transition, field) {
  const raw = transition?.[field];
  if (raw !== 'resolve-from-profile') {
    return raw || null;
  }

  const projectProfile = detectProjectProfile(targetDir);
  const profileMap = transition?.[`${field}_by_profile`];
  if (profileMap && typeof profileMap === 'object' && !Array.isArray(profileMap)) {
    return profileMap[projectProfile] || null;
  }

  return null;
}

function listMarkdownBullets(content) {
  return content
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^[-*]\s+/.test(line) || /^\d+\.\s+/.test(line));
}

function normalizeStringList(value) {
  if (!Array.isArray(value)) {
    return [];
  }
  return value.map((item) => String(item || '').trim()).filter(Boolean);
}

function trimExcerpt(value, maxLength = 240) {
  const text = String(value || '').trim();
  if (!text) {
    return null;
  }
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text;
}

function normalizeAutoFixState(value) {
  const merged = value && typeof value === 'object'
    ? value
    : {};
  const maxAttempts = Number.isFinite(Number(merged.max_attempts))
    ? Math.max(1, Number(merged.max_attempts))
    : 1;
  const attempts = Number.isFinite(Number(merged.attempts))
    ? Math.max(0, Math.min(Number(merged.attempts), maxAttempts))
    : 0;
  const lastFailedSteps = Array.isArray(merged.last_failed_steps)
    ? merged.last_failed_steps
      .map((step) => ({
        name: typeof step?.name === 'string' && step.name.trim() ? step.name.trim() : 'unknown',
        status: typeof step?.status === 'string' && step.status.trim() ? step.status.trim() : null,
        command: typeof step?.command === 'string' && step.command.trim() ? step.command.trim() : null,
        exit_code: typeof step?.exit_code === 'number' ? step.exit_code : null,
        reason: typeof step?.reason === 'string' && step.reason.trim() ? step.reason.trim() : null,
        error: typeof step?.error === 'string' && step.error.trim() ? step.error.trim() : null,
        stdout_excerpt: trimExcerpt(step?.stdout_excerpt),
        stderr_excerpt: trimExcerpt(step?.stderr_excerpt),
      }))
      .filter(Boolean)
    : [];

  return {
    attempts,
    max_attempts: maxAttempts,
    active: Boolean(merged.active),
    last_failed_steps: lastFailedSteps,
  };
}

function extractFailedVerificationSteps(verification) {
  if (!verification || !Array.isArray(verification.steps)) {
    return [];
  }

  return verification.steps
    .filter((step) => String(step?.status || '').trim().toLowerCase() === 'failed')
    .map((step) => ({
      name: typeof step?.name === 'string' && step.name.trim() ? step.name.trim() : 'unknown',
      status: 'failed',
      command: typeof step?.command === 'string' && step.command.trim() ? step.command.trim() : null,
      exit_code: typeof step?.exit_code === 'number' ? step.exit_code : null,
      reason: typeof step?.reason === 'string' && step.reason.trim() ? step.reason.trim() : null,
      error: typeof step?.error === 'string' && step.error.trim() ? step.error.trim() : null,
      stdout_excerpt: trimExcerpt(step?.stdout_excerpt),
      stderr_excerpt: trimExcerpt(step?.stderr_excerpt),
    }));
}

function listMarkdownFilesRecursive(rootDir) {
  if (!rootDir || !fs.existsSync(rootDir)) {
    return [];
  }

  const rootStat = fs.statSync(rootDir);
  if (!rootStat.isDirectory()) {
    return rootDir.endsWith('.md') ? [rootDir] : [];
  }

  const files = [];
  const stack = [rootDir];
  while (stack.length > 0) {
    const current = stack.pop();
    const entries = fs.readdirSync(current, { withFileTypes: true });
    for (const entry of entries) {
      const nextPath = path.join(current, entry.name);
      if (entry.isDirectory()) {
        stack.push(nextPath);
      } else if (entry.isFile() && entry.name.endsWith('.md')) {
        files.push(nextPath);
      }
    }
  }

  return files.sort();
}

function readMarkdownArtifactContent(artifactPath) {
  if (!artifactPath || !fs.existsSync(artifactPath)) {
    return {
      files: [],
      content: '',
    };
  }

  const files = listMarkdownFilesRecursive(artifactPath);
  return {
    files,
    content: files
      .map((filePath) => fs.readFileSync(filePath, 'utf8').trim())
      .filter(Boolean)
      .join('\n\n'),
  };
}

function getRoleArtifactRequirements(targetDir, roleId, flowId = null) {
  const flowRequiredInputs = normalizeStringList(FLOW_ROLE_REQUIRED_INPUTS[flowId]?.[roleId]);
  const flowRequiredOutputs = normalizeStringList(FLOW_ROLE_REQUIRED_OUTPUTS[flowId]?.[roleId]);
  if (flowRequiredInputs.length > 0 || flowRequiredOutputs.length > 0) {
    return {
      required_inputs: flowRequiredInputs,
      required_outputs: flowRequiredOutputs,
    };
  }

  const registryEntry = getRoleRuntimeConfig(targetDir, roleId);
  const requiredInputs = normalizeStringList(registryEntry?.required_inputs);
  const requiredOutputs = normalizeStringList(registryEntry?.required_outputs);

  return {
    required_inputs: requiredInputs.length > 0 ? requiredInputs : (ROLE_REQUIRED_INPUTS[roleId] || []),
    required_outputs: requiredOutputs.length > 0 ? requiredOutputs : (ROLE_REQUIRED_OUTPUTS[roleId] || []),
  };
}

function inferExecutionOpenSpecAction(payload, targetDir = null) {
  if (payload?.openspec_action) {
    return String(payload.openspec_action).trim().toLowerCase();
  }

  if (targetDir && payload?.role?.id) {
    const registryEntry = getRoleRuntimeConfig(targetDir, payload.role.id);
    const configuredActions = normalizeStringList(registryEntry?.openspec_actions);
    if (configuredActions.length > 0) {
      return configuredActions[0].toLowerCase();
    }
  }

  return ROLE_OPENSPEC_ACTIONS[payload?.role?.id] || null;
}

function inferRuntimeActionOpenSpecAction(payload) {
  if (payload?.openspec_action) {
    return String(payload.openspec_action).trim().toLowerCase();
  }

  const action = String(payload?.action || '').trim().toLowerCase();
  if (action === 'archive' || action === 'complete' || action === 'completed') {
    return 'archive';
  }

  return null;
}

function validatePreImplementationGate(targetDir, currentRun, executionPayload) {
  if (!currentRun || currentRun.flow?.id !== 'prd-to-delivery') {
    return { ok: true, reasons: [] };
  }

  if (executionPayload.role?.id !== 'requirement-analyst') {
    return { ok: true, reasons: [] };
  }

  const deliveryProfile = currentRun.delivery_profile || 'standard';
  const riskLevel = String(currentRun.task?.risk_level || '').trim().toLowerCase();
  const rawInput = String(currentRun.trigger?.raw_input || '');
  const proposalPath = currentRun.artifacts?.proposal
    ? path.join(targetDir, currentRun.artifacts.proposal)
    : null;
  const specsPath = currentRun.artifacts?.specs
    ? path.join(targetDir, runtimeState.normalizeSpecsArtifactPath(currentRun.artifacts.specs))
    : null;
  const designPath = currentRun.artifacts?.design
    ? path.join(targetDir, currentRun.artifacts.design)
    : null;
  const tasksPath = currentRun.artifacts?.tasks
    ? path.join(targetDir, currentRun.artifacts.tasks)
    : null;
  const reasons = [];

  if (!proposalPath || !fs.existsSync(proposalPath)) {
    reasons.push('proposal.md 缺失');
  }
  if (!specsPath || !fs.existsSync(specsPath)) {
    reasons.push('specs/ 缺失');
  }
  if (!designPath || !fs.existsSync(designPath)) {
    reasons.push('design.md 缺失');
  }
  if (!tasksPath || !fs.existsSync(tasksPath)) {
    reasons.push('tasks.md 缺失');
  }

  if (reasons.length > 0) {
    return { ok: false, reasons };
  }

  const proposalContent = fs.readFileSync(proposalPath, 'utf8').trim();
  const specsArtifact = readMarkdownArtifactContent(specsPath);
  const designContent = fs.readFileSync(designPath, 'utf8').trim();
  const tasksContent = fs.readFileSync(tasksPath, 'utf8').trim();
  const taskItems = listMarkdownBullets(tasksContent);

  if (specsArtifact.files.length === 0) {
    reasons.push('specs/ 缺少 spec 文件');
  }

  if (riskLevel === 'high') {
    reasons.push('当前任务涉及支付/认证/安全/合规等高风险领域，进入实现前必须人工审批');
  }

  if (/先不说|先不提供|暂不说|暂不提供|暂未确定|未明确|待定|后续再说|后面再说/.test(rawInput)) {
    reasons.push('原始需求已明确存在未说明的关键流程或安全约束，进入实现前必须人工审批');
  }

  const missingInputs = Array.isArray(currentRun.missing_inputs)
    ? currentRun.missing_inputs.map((item) => String(item || ''))
    : [];
  if (
    riskLevel === 'high' &&
    missingInputs.some((item) => /支付|认证|oauth|短信|权限|安全|合规|风控|收款|交易/.test(item))
  ) {
    reasons.push('高风险任务仍存在关键缺失输入，进入实现前必须人工审批');
  }

  if (deliveryProfile === 'micro') {
    if (proposalContent.length < 60) {
      reasons.push('proposal.md 过短，未达到 compact 最小信息量');
    }
    if (specsArtifact.content.length < 40) {
      reasons.push('specs/ 过短，未达到 compact 最小信息量');
    }
    if (designContent.length < 40) {
      reasons.push('design.md 过短，未达到 compact 最小信息量');
    }
    if (taskItems.length < 3) {
      reasons.push('tasks.md 任务条目不足 3 条');
    }
  } else {
    const headingCount = proposalContent
      .split('\n')
      .filter((line) => /^#{1,6}\s+/.test(line.trim()))
      .length;
    if (proposalContent.length < 120) {
      reasons.push('proposal.md 过短，未达到 standard 最小信息量');
    }
    if (specsArtifact.content.length < 80) {
      reasons.push('specs/ 过短，未达到 standard 最小信息量');
    }
    if (designContent.length < 80) {
      reasons.push('design.md 过短，未达到 standard 最小信息量');
    }
    if (headingCount < 2) {
      reasons.push('proposal.md 缺少足够的小节结构');
    }
    if (taskItems.length < 4) {
      reasons.push('tasks.md 任务条目不足 4 条');
    }
  }

  return {
    ok: reasons.length === 0,
    reasons,
  };
}

function getRuntimeTransition(targetDir, flowId, roleId) {
  const flowConfig = getFlowRuntimeConfig(targetDir, flowId);
  const flowTransition = flowConfig?.runtime_transitions?.[roleId];
  if (flowTransition && typeof flowTransition === 'object' && flowTransition.action) {
    return {
      ...flowTransition,
      to_role: resolveTransitionRoleValue(targetDir, flowTransition, 'to_role'),
      next_role: resolveTransitionRoleValue(targetDir, flowTransition, 'next_role'),
    };
  }

  const roleConfig = getRoleRuntimeConfig(targetDir, roleId);
  const roleTransition = roleConfig?.runtime_transition;
  if (roleTransition && typeof roleTransition === 'object' && roleTransition.action) {
    return {
      ...roleTransition,
      to_role: resolveTransitionRoleValue(targetDir, roleTransition, 'to_role'),
      next_role: resolveTransitionRoleValue(targetDir, roleTransition, 'next_role'),
    };
  }

  return FLOW_RUNTIME_TRANSITIONS[flowId]?.[roleId] || null;
}

function buildAutoRuntimeAction(targetDir, executionPayload) {
  const currentRun = readCurrentRun(targetDir);
  if (!currentRun) {
    return null;
  }

  if (!AUTO_ADVANCE_EXECUTION_STATUSES.has(String(executionPayload.status || '').toLowerCase())) {
    return null;
  }

  if (currentRun.pending_gate) {
    return null;
  }

  const flowId = executionPayload.flow?.id || currentRun.flow?.id || null;
  const roleId = executionPayload.role?.id || null;
  if (!flowId || !roleId) {
    return null;
  }
  const mainFlowBlocking = isMainFlowBlocking(currentRun, flowId);

  const transition = getRuntimeTransition(targetDir, flowId, roleId);
  if (!transition) {
    return null;
  }

  if (roleId === 'frontend-implementer') {
    const verification = executionPayload.verification || currentRun.verification || null;
    const failedSteps = extractFailedVerificationSteps(verification);
    const autoFixState = normalizeAutoFixState(currentRun.auto_fix);

    if (failedSteps.length > 0) {
      if (autoFixState.attempts < autoFixState.max_attempts) {
        const nextAttempts = autoFixState.attempts + 1;
        return {
          schema_version: 1,
          kind: 'task-orchestrator-runtime-action',
          action: 'handoff',
          run_id: executionPayload.run_id,
          from_role: roleId,
          to_role: roleId,
          next_role: transition.to_role || 'code-guardian',
          status: 'running',
          clear_pending_gate: true,
          message: `verification failed; retry frontend-implementer auto-fix (${nextAttempts}/${autoFixState.max_attempts})`,
          source: 'expert-executor-auto-transition',
          verification,
          auto_fix: {
            attempts: nextAttempts,
            max_attempts: autoFixState.max_attempts,
            active: true,
            last_failed_steps: failedSteps,
          },
        };
      }

      return {
        schema_version: 1,
        kind: 'task-orchestrator-runtime-action',
        action: 'handoff',
        run_id: executionPayload.run_id,
        from_role: roleId,
        to_role: transition.to_role || 'code-guardian',
        next_role: transition.next_role || null,
        status: 'running',
        clear_pending_gate: true,
        message: 'verification still failed after auto-fix; handoff to code-guardian for blocking review',
        source: 'expert-executor-auto-transition',
        verification,
        auto_fix: {
          attempts: autoFixState.attempts,
          max_attempts: autoFixState.max_attempts,
          active: false,
          last_failed_steps: failedSteps,
        },
      };
    }
  }

  if (transition.action === 'handoff' && roleId === 'requirement-analyst') {
    const gateCheck = validatePreImplementationGate(targetDir, currentRun, executionPayload);
    if (mainFlowBlocking || !gateCheck.ok) {
      const blockedReason = gateCheck.ok
        ? '内测阶段启用 main-flow-blocking 审核策略，需求收敛完成后需要先人工审核再进入实现。'
        : gateCheck.reasons.join('；');
      return {
        schema_version: 1,
        kind: 'task-orchestrator-runtime-action',
        action: 'gate-blocked',
        run_id: executionPayload.run_id,
        from_role: roleId,
        to_role: roleId,
        next_role: transition.to_role,
        pending_gate: 'before-implementation',
        blocked_by_role: roleId,
        resume_to_role: transition.to_role || null,
        required_user_action: '明确批准或拒绝当前 proposal / specs / design / tasks 的实现范围与限制条件。',
        blocked_reason: blockedReason,
        status: 'waiting-approval',
        clear_pending_gate: false,
        message: `requirement gate blocked: ${blockedReason}`,
        source: 'expert-executor-auto-transition',
      };
    }
  }

  if (transition.action === 'handoff' && roleId === 'frontend-implementer' && mainFlowBlocking) {
    return {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'gate-blocked',
      run_id: executionPayload.run_id,
      from_role: roleId,
      to_role: roleId,
      next_role: transition.to_role || 'code-guardian',
      pending_gate: 'before-guardian',
      blocked_by_role: roleId,
      resume_to_role: transition.to_role || 'code-guardian',
      required_user_action: '明确批准当前实现结果进入 code-guardian 守护审查，或说明需要回退修正的方向。',
      blocked_reason: '内测阶段启用 main-flow-blocking 审核策略，前端实现完成后需要先人工审核再进入守护阶段。',
      status: 'waiting-approval',
      clear_pending_gate: false,
      message: 'frontend delivery is waiting for manual review before code-guardian',
      source: 'expert-executor-auto-transition',
      verification: executionPayload.verification || null,
    };
  }

  if (transition.action === 'gate-blocked' && roleId === 'code-guardian' && !mainFlowBlocking) {
    return {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'handoff',
      run_id: executionPayload.run_id,
      from_role: roleId,
      to_role: transition.next_role || 'archive-change',
      next_role: null,
      status: 'running',
      clear_pending_gate: true,
      message: 'handoff to archive-change after code-guardian closeout',
      source: 'expert-executor-auto-transition',
    };
  }

  if (transition.action === 'gate-blocked') {
    return {
      schema_version: 1,
      kind: 'task-orchestrator-runtime-action',
      action: 'gate-blocked',
      run_id: executionPayload.run_id,
      from_role: roleId,
      to_role: transition.to_role || roleId,
      next_role: transition.next_role || null,
      pending_gate: transition.pending_gate || 'before-archive',
      blocked_by_role: roleId,
      resume_to_role: transition.next_role || null,
      required_user_action: '明确告诉系统是否执行归档；同意则进入归档专家，不归档则直接结束本次运行。',
      blocked_reason: executionPayload.next_action || transition.message,
      status: transition.status || 'waiting-approval',
      clear_pending_gate: false,
      message: executionPayload.next_action || transition.message,
      source: 'expert-executor-auto-transition',
    };
  }

  const nextRole = executionPayload.next_role !== undefined
    ? executionPayload.next_role
    : transition.next_role;
  const toRole = executionPayload.next_role || transition.to_role || null;
  const action = transition.action;
  const currentAutoFix = roleId === 'frontend-implementer'
    ? normalizeAutoFixState(currentRun.auto_fix)
    : null;
  const normalizedAutoFix = currentAutoFix && (currentAutoFix.active || currentAutoFix.attempts > 0 || currentAutoFix.last_failed_steps.length > 0)
    ? {
        ...currentAutoFix,
        active: false,
      }
    : null;

  return {
    schema_version: 1,
    kind: 'task-orchestrator-runtime-action',
    action,
    run_id: executionPayload.run_id,
    from_role: roleId,
    to_role: action === 'handoff' ? toRole : transition.to_role || roleId,
    next_role: nextRole,
    status: action === 'complete' ? 'success' : 'running',
    clear_pending_gate: true,
    message: executionPayload.next_action || transition.message,
    source: 'expert-executor-auto-transition',
    openspec_action: action === 'complete' ? 'archive' : null,
    skip_artifact_check: action === 'complete' && roleId === 'archive-change',
    verification: executionPayload.verification || null,
    auto_fix: normalizedAutoFix,
  };
}

module.exports = {
  AUTO_ADVANCE_EXECUTION_STATUSES,
  FLOW_RUNTIME_TRANSITIONS,
  ROLE_OPENSPEC_ACTIONS,
  getRoleArtifactRequirements,
  getRuntimeTransition,
  inferExecutionOpenSpecAction,
  inferRuntimeActionOpenSpecAction,
  validatePreImplementationGate,
  guardRuntimeActionForIncompleteExecution,
  buildAutoRuntimeAction,
  readCurrentRun,
};
