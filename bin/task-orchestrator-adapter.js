#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const runtimeState = require('./runtime-state');
const expertDispatch = require('./expert-dispatch');
const expertExecutor = require('./expert-executor');
const { drainVisualRuntimeStatePushes } = require('../internal/visual-hooks/runtime-state-pusher');

function printUsage() {
  console.log(`Usage:
  ai-spec-auto task-orchestrator-adapter apply --payload <file> [options]
  ai-spec-auto task-orchestrator-adapter apply --stdin [options]

Options:
  --target <dir>         Target project directory (default: .)
  --payload <file>       Path to task-orchestrator runtime payload JSON file
  --stdin                Read task-orchestrator runtime payload JSON from stdin
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

function pick(payload, keys) {
  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(payload, key)) {
      return payload[key];
    }
  }
  return undefined;
}

function normalizePayload(rawPayload, sourceLabel) {
  if (!rawPayload || typeof rawPayload !== 'object') {
    throw new Error(`Invalid adapter payload: ${sourceLabel}`);
  }

  if (
    rawPayload.kind === 'task-orchestrator-bootstrap' ||
    rawPayload.kind === 'run-plan' ||
    rawPayload.run_plan ||
    rawPayload.runPlan
  ) {
    return {
      action: 'bootstrap',
      payload: rawPayload,
    };
  }

  const kind = rawPayload.kind || '';
  if (
    kind !== 'task-orchestrator-runtime-action' &&
    kind !== 'task-orchestrator-runtime-event'
  ) {
    throw new Error(`Unsupported adapter payload kind: ${kind || 'undefined'}`);
  }

  const action = pick(rawPayload, ['action', 'event']);
  if (!action) {
    throw new Error(`Adapter payload is missing action/event: ${sourceLabel}`);
  }

  return {
    action,
    payload: rawPayload,
  };
}

function buildRuntimeOptions(payload, cliOptions) {
  const options = {
    target: cliOptions.target,
  };

  const mappings = [
    ['runId', ['run_id', 'runId']],
    ['toRole', ['to_role', 'toRole']],
    ['nextRole', ['next_role', 'nextRole']],
    ['fromRole', ['from_role', 'fromRole']],
    ['gate', ['gate']],
    ['pendingGate', ['pending_gate', 'pendingGate']],
    ['message', ['message']],
    ['error', ['error']],
    ['eventType', ['event_type', 'eventType']],
    ['status', ['status']],
  ];

  for (const [targetKey, sourceKeys] of mappings) {
    const value = pick(payload, sourceKeys);
    if (value !== undefined) {
      options[targetKey] = value;
    }
  }

  const clearPendingGate = pick(payload, ['clear_pending_gate', 'clearPendingGate']);
  if (clearPendingGate !== undefined) {
    options.clearPendingGate = Boolean(clearPendingGate);
  }

  const taskAnchor = pick(payload, ['task_anchor', 'taskAnchor']);
  if (taskAnchor) {
    options.taskAnchorData = taskAnchor;
  }

  return options;
}

function applyPayload({ action, payload, options, payloadSource }) {
  const normalizedAction = action.toLowerCase();

  if (normalizedAction === 'bootstrap') {
    return {
      adapter_action: 'bootstrap',
      adapter_source: payloadSource,
      result: runtimeState.bootstrapRunState({
        target: options.target,
        payloadData: payload,
      }),
    };
  }

  const runtimeOptions = buildRuntimeOptions(payload, options);

  switch (normalizedAction) {
    case 'handoff':
      return {
        adapter_action: 'handoff',
        adapter_source: payloadSource,
        result: runtimeState.handoffRunState(runtimeOptions),
      };
    case 'approve':
      return {
        adapter_action: 'approve',
        adapter_source: payloadSource,
        result: runtimeState.approveRunState(runtimeOptions),
      };
    case 'resume':
      return {
        adapter_action: 'resume',
        adapter_source: payloadSource,
        result: runtimeState.resumeRunState(runtimeOptions),
      };
    case 'gate-blocked':
    case 'blocked':
      return {
        adapter_action: 'gate-blocked',
        adapter_source: payloadSource,
        result: runtimeState.gateBlockedRunState(runtimeOptions),
      };
    case 'status':
      return {
        adapter_action: 'status',
        adapter_source: payloadSource,
        result: runtimeState.statusRunState(runtimeOptions),
      };
    case 'complete':
    case 'completed':
      return {
        adapter_action: 'complete',
        adapter_source: payloadSource,
        result: runtimeState.completeRunState(runtimeOptions),
      };
    case 'fail':
    case 'failed':
      return {
        adapter_action: 'fail',
        adapter_source: payloadSource,
        result: runtimeState.failRunState(runtimeOptions),
      };
    case 'cancel':
    case 'cancelled':
      return {
        adapter_action: 'cancel',
        adapter_source: payloadSource,
        result: runtimeState.cancelRunState(runtimeOptions),
      };
    default:
      throw new Error(`Unsupported adapter action: ${action}`);
  }
}

function shouldClearExpertArtifacts(applied) {
  return ['bootstrap', 'handoff', 'approve', 'resume', 'gate-blocked', 'complete', 'fail', 'cancel'].includes(applied.adapter_action);
}

function attachDispatch(applied, options) {
  if (shouldClearExpertArtifacts(applied)) {
    const dispatch = expertDispatch.clearDispatch({
      target: options.target,
    });
    const execution = expertExecutor.clearExecution({
      target: options.target,
    });
    const runtimeAction = expertExecutor.clearRuntimeAction({
      target: options.target,
    });
    return {
      ...applied,
      dispatch,
      execution,
      runtime_action: runtimeAction,
    };
  }

  return applied;
}

function printPretty(applied) {
  console.log('task-orchestrator adapter applied');
  console.log(`  action: ${applied.adapter_action}`);
  console.log(`  source: ${applied.adapter_source}`);
  console.log(`  target: ${applied.result.target}`);
  console.log(`  run_id: ${applied.result.state.run_id}`);
  console.log(`  status: ${applied.result.state.status || 'n/a'}`);
  console.log(`  current_role: ${applied.result.state.current_role || 'n/a'}`);
  console.log(`  pending_gate: ${applied.result.state.pending_gate || 'n/a'}`);
}

async function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return 0;
  }

  if (command !== 'apply') {
    throw new Error(`Unsupported task-orchestrator-adapter command: ${command}`);
  }

  const inputCount = [Boolean(options.payload), Boolean(options.stdin)].filter(Boolean).length;
  if (inputCount === 0) {
    throw new Error('Missing adapter input: use --payload <file> or --stdin');
  }
  if (inputCount > 1) {
    throw new Error('Use either --payload <file> or --stdin, not both');
  }

  const payloadSource = options.payload
    ? path.resolve(process.cwd(), options.payload)
    : 'stdin';
  const rawPayload = options.payload
    ? readJsonFile(payloadSource, 'task-orchestrator adapter payload')
    : readJsonFromStdin('task-orchestrator adapter payload');

  const normalized = normalizePayload(rawPayload, payloadSource);
  const applied = attachDispatch(applyPayload({
    action: normalized.action,
    payload: normalized.payload,
    options,
    payloadSource,
  }), options);
  await drainVisualRuntimeStatePushes();

  if (options.json) {
    console.log(JSON.stringify(applied, null, 2));
  } else {
    printPretty(applied);
  }

  return 0;
}

if (require.main === module) {
  try {
    main().then((exitCode) => process.exit(exitCode));
  } catch (error) {
    console.error(`task-orchestrator-adapter error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  main,
  parseArgs,
  normalizePayload,
  buildRuntimeOptions,
  applyPayload,
  attachDispatch,
};
