#!/usr/bin/env node
const workflow = require('../internal/ai-protocol-workflow');
const runner = require('./task-orchestrator-runner');

function parseArgs(argv) {
  const args = [...argv];
  const options = {
    target: '.',
    userInput: null,
    mode: null,
    reviewPolicy: null,
    flowId: null,
    json: false,
    pretty: true,
  };

  while (args.length > 0) {
    const arg = args.shift();

    if (!arg.startsWith('-') && options.target === '.') {
      options.target = arg;
      continue;
    }

    switch (arg) {
      case '--target':
        options.target = args.shift();
        break;
      case '--user-input':
        options.userInput = args.shift();
        break;
      case '--mode':
        options.mode = args.shift();
        break;
      case '--review-policy':
        options.reviewPolicy = args.shift();
        break;
      case '--flow':
        options.flowId = args.shift();
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

  return options;
}

function printUsage(mode) {
  const command = mode === 'advance'
    ? 'protocol-advance'
    : mode === 'update'
    ? 'protocol-update'
    : mode === 'stop'
    ? 'protocol-stop'
    : mode === 'status'
    ? 'protocol-status'
    : 'protocol-step';
  console.log(`Usage:
  ai-spec-auto ${command} [target] [options]

Options:
  --target <dir>         Target project directory (default: .)
  --user-input <text>    User requirement or follow-up text
  --mode <mode>          Start mode: auto | suggest | manual (protocol-step only)
  --review-policy <id>   Review policy: none | main-flow-blocking (protocol-step only)
  --flow <flow-id>       Explicit flow id for manual mode (protocol-step only)
  --json                 Print JSON only
  --pretty               Print readable summary (default)
  --help                 Show this help
`);
}

function formatActor(actor) {
  if (!actor) {
    return '(none)';
  }
  const type = actor.type ? ` [${actor.type}]` : '';
  const label = actor.label ? ` | ${actor.label}` : '';
  return `${actor.id || '(unknown)'}${type}${label}`;
}

function formatTargets(items) {
  if (!Array.isArray(items) || items.length === 0) {
    return ['(none)'];
  }

  return items.map((item) => {
    if (item.kind === 'symbolic') {
      return item.value;
    }
    return item.rel_path || item.path || '(unknown)';
  });
}

function printTurn(turn) {
  console.log(`kind: ${turn.kind}`);
  console.log(`status: ${turn.status}`);
  console.log(`mode: ${turn.mode}`);
  console.log(`actor: ${formatActor(turn.actor)}`);
  if (turn.announcements?.enter) {
    console.log(`announce_enter: ${turn.announcements.enter}`);
  }
  if (turn.announcements?.exit) {
    console.log(`announce_exit: ${turn.announcements.exit}`);
  }
  console.log(`command: ${turn.command || '(none)'}`);
  console.log(`reason: ${turn.reason || '(none)'}`);
  console.log('summary:');
  for (const [key, value] of Object.entries(turn.summary || {})) {
    console.log(`  ${key}: ${value ?? '(none)'}`);
  }
  if (turn.input?.change_impact || turn.input?.reconcile_strategy) {
    console.log('input_reconcile:');
    console.log(`  change_impact: ${turn.input.change_impact || '(none)'}`);
    console.log(`  reconcile_strategy: ${turn.input.reconcile_strategy || '(none)'}`);
  }
  console.log('reads:');
  for (const item of formatTargets(turn.reads)) {
    console.log(`  - ${item}`);
  }
  console.log('writes:');
  for (const item of formatTargets(turn.writes)) {
    console.log(`  - ${item}`);
  }
  console.log('expected_output:');
  for (const item of turn.expected_output || ['(none)']) {
    console.log(`  - ${item}`);
  }
  if (turn.commands) {
    console.log('commands:');
    for (const [key, value] of Object.entries(turn.commands)) {
      console.log(`  ${key}: ${value}`);
    }
  }
  console.log(`requires_advance: ${turn.requires_advance ? 'yes' : 'no'}`);
  if (turn.finalize_contract) {
    console.log('finalize_contract:');
    console.log(`  required: ${turn.finalize_contract.required ? 'yes' : 'no'}`);
    console.log(`  advance_command: ${turn.finalize_contract.advance_command || '(none)'}`);
    console.log(`  update_command: ${turn.finalize_contract.update_command || '(none)'}`);
    console.log(`  when: ${turn.finalize_contract.when || '(none)'}`);
  }
  if (turn.guidance?.approval_gate) {
    console.log('approval_gate:');
    console.log(`  gate: ${turn.guidance.approval_gate.gate || '(none)'}`);
    console.log(`  status: ${turn.guidance.approval_gate.status || '(none)'}`);
    console.log(`  required_user_action: ${turn.guidance.approval_gate.required_user_action || '(none)'}`);
    console.log(`  blocked_rule: ${turn.guidance.approval_gate.blocked_rule || '(none)'}`);
    console.log(`  resume_to_role: ${turn.guidance.approval_gate.resume_to_role || '(none)'}`);
    console.log(`  resume_rule: ${turn.guidance.approval_gate.resume_rule || turn.guidance.approval_gate.next_step || '(none)'}`);
  }
  if (turn.execution_contract) {
    console.log('execution_contract:');
    console.log(`  kind: ${turn.execution_contract.kind || '(none)'}`);
    console.log(`  delivery_profile: ${turn.execution_contract.delivery_profile || '(none)'}`);
    console.log(`  artifact_profile: ${turn.execution_contract.artifact_profile || '(none)'}`);
    console.log(`  write_to: ${turn.execution_contract.write_to || '(none)'}`);
    console.log(`  next_advance_command: ${turn.execution_contract.next_advance_command || '(none)'}`);
    console.log('  required_fields:');
    for (const item of turn.execution_contract.required_fields || ['(none)']) {
      console.log(`    - ${item}`);
    }
    console.log('  required_artifacts:');
    for (const item of turn.execution_contract.required_artifacts || ['(none)']) {
      console.log(`    - ${item}`);
    }
  }
  if (turn.guidance) {
    if (turn.guidance.routing) {
      console.log(`guidance.routing.delivery_profile: ${turn.guidance.routing.delivery_profile || '(none)'}`);
      console.log(`guidance.routing.artifact_profile: ${turn.guidance.routing.artifact_profile || '(none)'}`);
      console.log(`guidance.routing.complexity: ${turn.guidance.routing.complexity || '(none)'}`);
    }
    if (turn.guidance.routing_constraints) {
      console.log(`guidance.routing_constraints.first_handoff: ${turn.guidance.routing_constraints.first_handoff || '(none)'}`);
      console.log(`guidance.routing_constraints.route_strategy: ${turn.guidance.routing_constraints.route_strategy || '(none)'}`);
      console.log(`guidance.routing_constraints.api_strategy: ${turn.guidance.routing_constraints.api_strategy || '(none)'}`);
    }
    if (turn.guidance.risk_contract) {
      console.log(`guidance.risk_contract.risk_level: ${turn.guidance.risk_contract.risk_level || '(none)'}`);
      if (Array.isArray(turn.guidance.risk_contract.drivers) && turn.guidance.risk_contract.drivers.length > 0) {
        console.log('guidance.risk_contract.drivers:');
        for (const item of turn.guidance.risk_contract.drivers) {
          console.log(`  - ${item}`);
        }
      }
    }
    if (turn.guidance.approval_contract) {
      console.log(`guidance.approval_contract.expected_gate: ${turn.guidance.approval_contract.expected_gate || '(none)'}`);
      console.log(`guidance.approval_contract.pending_gate: ${turn.guidance.approval_contract.pending_gate || '(none)'}`);
    }
    if (turn.guidance.update_contract) {
      console.log(`guidance.update_contract.change_impact: ${turn.guidance.update_contract.change_impact || '(none)'}`);
      console.log(`guidance.update_contract.reconcile_strategy: ${turn.guidance.update_contract.reconcile_strategy || '(none)'}`);
      console.log(`guidance.update_contract.target_role: ${turn.guidance.update_contract.target_role || '(none)'}`);
      if (Array.isArray(turn.guidance.update_contract.artifacts_to_update) && turn.guidance.update_contract.artifacts_to_update.length > 0) {
        console.log('guidance.update_contract.artifacts_to_update:');
        for (const item of turn.guidance.update_contract.artifacts_to_update) {
          console.log(`  - ${item}`);
        }
      }
    }
    if (turn.guidance.pause_contract) {
      console.log(`guidance.pause_contract.status: ${turn.guidance.pause_contract.status || '(none)'}`);
      console.log(`guidance.pause_contract.resume_rule: ${turn.guidance.pause_contract.resume_rule || '(none)'}`);
    }
    if (turn.guidance.confirm_gate) {
      console.log(`guidance.confirm_gate.status: ${turn.guidance.confirm_gate.status || '(none)'}`);
      console.log(`guidance.confirm_gate.gate: ${turn.guidance.confirm_gate.gate || '(none)'}`);
      console.log(`guidance.confirm_gate.resume_to_role: ${turn.guidance.confirm_gate.resume_to_role || '(none)'}`);
      console.log(`guidance.confirm_gate.required_user_action: ${turn.guidance.confirm_gate.required_user_action || '(none)'}`);
    }
    if (turn.guidance.orchestration_contract) {
      console.log(`guidance.orchestration_contract.handoff_policy: ${turn.guidance.orchestration_contract.handoff_policy || '(none)'}`);
      if (turn.guidance.orchestration_contract.handoff_gate_policy) {
        console.log('guidance.orchestration_contract.handoff_gate_policy:');
        for (const [pair, gate] of Object.entries(turn.guidance.orchestration_contract.handoff_gate_policy)) {
          console.log(`  ${pair}: ${gate}`);
        }
      }
      console.log('guidance.orchestration_contract.required_experts:');
      for (const item of turn.guidance.orchestration_contract.required_experts || []) {
        console.log(`  - ${item}`);
      }
      if (Array.isArray(turn.guidance.orchestration_contract.activated_optional_roles) && turn.guidance.orchestration_contract.activated_optional_roles.length > 0) {
        console.log('guidance.orchestration_contract.activated_optional_roles:');
        for (const item of turn.guidance.orchestration_contract.activated_optional_roles) {
          console.log(`  - ${item}`);
        }
      }
    }
    if (turn.guidance.role?.goal) {
      console.log(`guidance.goal: ${turn.guidance.role.goal}`);
    }
    if (turn.guidance.role?.delivery_profile) {
      console.log(`guidance.role.delivery_profile: ${turn.guidance.role.delivery_profile}`);
    }
    if (turn.guidance.role?.artifact_profile) {
      console.log(`guidance.role.artifact_profile: ${turn.guidance.role.artifact_profile}`);
    }
    if (Array.isArray(turn.guidance.rule_hints) && turn.guidance.rule_hints.length > 0) {
      console.log('guidance.rule_hints:');
      for (const item of turn.guidance.rule_hints) {
        console.log(`  - ${item}`);
      }
    }
    if (turn.guidance.project_context) {
      console.log(`guidance.project_context.framework: ${turn.guidance.project_context.framework || '(none)'}`);
      console.log(`guidance.project_context.language: ${turn.guidance.project_context.language || '(none)'}`);
      console.log(`guidance.project_context.routing: ${turn.guidance.project_context.routing || '(none)'}`);
      console.log(`guidance.project_context.api_layer: ${turn.guidance.project_context.api_layer || '(none)'}`);
    }
    if (turn.guidance.repo_conventions) {
      console.log(`guidance.repo_conventions.views_dir: ${turn.guidance.repo_conventions.views_dir || '(none)'}`);
      console.log(`guidance.repo_conventions.route_modules_dir: ${turn.guidance.repo_conventions.route_modules_dir || '(none)'}`);
      console.log(`guidance.repo_conventions.api_dir: ${turn.guidance.repo_conventions.api_dir || '(none)'}`);
      console.log(`guidance.repo_conventions.style_entry: ${turn.guidance.repo_conventions.style_entry || '(none)'}`);
    }
    if (turn.guidance.role_rule_contract) {
      console.log('guidance.role_rule_contract.source_rules:');
      for (const item of turn.guidance.role_rule_contract.source_rules || []) {
        console.log(`  - ${item.path}`);
      }
    }
    if (turn.guidance.role_skill_contract) {
      console.log('guidance.role_skill_contract.primary_skills:');
      for (const item of turn.guidance.role_skill_contract.primary_skills || []) {
        console.log(`  - ${item}`);
      }
    }
    if (turn.guidance.review_contract) {
      console.log(`guidance.review_contract.summary: ${turn.guidance.review_contract.summary || '(none)'}`);
      if (Array.isArray(turn.guidance.review_contract.evidence_targets) && turn.guidance.review_contract.evidence_targets.length > 0) {
        console.log('guidance.review_contract.evidence_targets:');
        for (const item of turn.guidance.review_contract.evidence_targets) {
          console.log(`  - ${item}`);
        }
      }
      if (Array.isArray(turn.guidance.review_contract.blocking_checks) && turn.guidance.review_contract.blocking_checks.length > 0) {
        console.log('guidance.review_contract.blocking_checks:');
        for (const item of turn.guidance.review_contract.blocking_checks) {
          console.log(`  - ${item}`);
        }
      }
      if (Array.isArray(turn.guidance.review_contract.verification_expectations) && turn.guidance.review_contract.verification_expectations.length > 0) {
        console.log('guidance.review_contract.verification_expectations:');
        for (const item of turn.guidance.review_contract.verification_expectations) {
          console.log(`  - ${item}`);
        }
      }
    }
    if (turn.guidance.openspec_rules?.source) {
      console.log(`guidance.openspec_rules.source: ${turn.guidance.openspec_rules.source}`);
    }
    if (Array.isArray(turn.guidance.openspec_rules?.sections) && turn.guidance.openspec_rules.sections.length > 0) {
      console.log('guidance.openspec_rules.sections:');
      for (const section of turn.guidance.openspec_rules.sections) {
        console.log(`  - ${section.name}`);
      }
    }
  }
}

function printStep(result) {
  console.log(`kind: ${result.kind}`);
  console.log(`target: ${result.target}`);
  console.log(`runner advanced: ${result.advanced ? 'yes' : 'no'}`);
  if (result.advanced) {
    console.log(`advanced status: ${result.advanced.status || '(none)'}`);
    console.log(`consumed kind: ${result.advanced.consumed?.kind || '(none)'}`);
  }
  console.log('runner_status:');
  console.log(`  run_id: ${result.runner_status?.current?.run_id || '(none)'}`);
  console.log(`  run_status: ${result.runner_status?.current?.run_status || '(none)'}`);
  console.log(`  current_role: ${result.runner_status?.current?.current_role || '(none)'}`);
  console.log(`  pending_inputs: ${(result.runner_status?.pending_inputs || []).length}`);
  console.log('turn:');
  printTurn(result.turn);
}

function printUpdate(result) {
  console.log(`kind: ${result.kind}`);
  console.log(`target: ${result.target}`);
  console.log(`updated: ${result.updated?.status || '(none)'}`);
  console.log(`run_id: ${result.updated?.state?.run_id || '(none)'}`);
  console.log(`latest_user_input: ${result.updated?.state?.trigger?.latest_user_input || '(none)'}`);
  if (result.fast_path) {
    console.log('fast_path:');
    console.log(`  executed: ${result.fast_path.executed ? 'yes' : 'no'}`);
    console.log(`  action: ${result.fast_path.action || '(none)'}`);
    console.log(`  run_status: ${result.fast_path.run_status || '(none)'}`);
    console.log(`  current_role: ${result.fast_path.current_role || '(none)'}`);
    console.log(`  archived_to: ${result.fast_path.archived_to || '(none)'}`);
    console.log(`  requires_followup_turn: ${result.fast_path.requires_followup_turn ? 'yes' : 'no'}`);
  }
  console.log('turn:');
  printTurn(result.turn);
}

function printStop(result) {
  console.log(`kind: ${result.kind}`);
  console.log(`target: ${result.target}`);
  console.log(`stopped: ${result.stopped?.status || '(none)'}`);
  console.log('turn:');
  printTurn(result.turn);
}

function buildStepPreview(options) {
  return {
    kind: 'ai-protocol-step-preview',
    target: options.target,
    runner_status: runner.buildStatus(options.target),
    turn: workflow.buildProtocolTurn({
      target: options.target,
      userInput: options.userInput || null,
      mode: options.mode || null,
      reviewPolicy: options.reviewPolicy || null,
      flowId: options.flowId || null,
    }),
  };
}

async function main(mode, argv) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage(mode);
    return 0;
  }

  const result = mode === 'advance'
    ? workflow.advanceProtocolStep({
      target: options.target,
      userInput: options.userInput || null,
      mode: options.mode || null,
      reviewPolicy: options.reviewPolicy || null,
      flowId: options.flowId || null,
    })
    : mode === 'update'
    ? workflow.updateProtocolInput({
      target: options.target,
      userInput: options.userInput || null,
    })
    : mode === 'stop'
    ? workflow.stopProtocolStep({
      target: options.target,
    })
    : mode === 'status'
    ? workflow.statusProtocolStep({
      target: options.target,
    })
    : buildStepPreview(options);

  // [visual-sync-aspect] 切面兜底：在 drain 之前无条件触发一次"当前 run 推送"。
  // 解决场景：某些协议分支不会经过 finalizeProtocolResult，典型如：
  //   - protocol-step（mode='step' / preview 分支）——只生成 turn 指令，不改 state，不推
  //   - protocol-advance 在门禁期无状态变化，pusher 可能 short-circuit
  //   - /spec-start 首轮由 IDE AI 间接走 advance，但某些提前返回的路径漏推
  // 本切面对所有外层模式无差别补推一次（幂等：推送模块读 current-run.json 快照；如 run 已
  // 存在则只是让 Visual 数据保持最新，无副作用；如不存在则 trace 记录 'missing-current-run'）。
  // 不改任何协议分支逻辑，失败完全吞掉。
  try {
    const {
      pushVisualRuntimeStateSnapshot,
    } = require('../internal/visual-hooks/runtime-state-pusher');
    pushVisualRuntimeStateSnapshot(options.target);
  } catch {
    // 静默兜底：任何加载/调用异常都不影响协议主流程
  }

  if (typeof workflow.drainVisualPushes === 'function') {
    await workflow.drainVisualPushes();
  }

  if (options.json) {
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
  } else {
    if (mode === 'advance') {
      printStep(result);
    } else if (mode === 'update') {
      printUpdate(result);
    } else if (mode === 'stop') {
      printStop(result);
    } else {
      printTurn(result.turn);
    }
  }

  return 0;
}

module.exports = {
  main,
};
