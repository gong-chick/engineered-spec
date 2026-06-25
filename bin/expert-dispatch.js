#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const {
  resolveRuntimePaths,
  getCandidatePaths,
  shouldPersistHistory,
} = require('./runtime-paths');

function printUsage() {
  console.log(`Usage:
  ai-spec-auto expert-dispatch apply --payload <file> [options]
  ai-spec-auto expert-dispatch apply --stdin [options]
  ai-spec-auto expert-dispatch clear [options]

Options:
  --target <dir>         Target project directory (default: .)
  --payload <file>       Path to expert-dispatch JSON file
  --stdin                Read expert-dispatch JSON from stdin
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

function createDispatchId(roleId, now = new Date()) {
  const iso = now.toISOString().replace(/[:.]/g, '-');
  return `${iso}__${roleId}`;
}

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return readJson(filePath, 'json');
}

function hydrateDispatchPayload(targetDir, payload) {
  const hydrated = JSON.parse(JSON.stringify(payload));
  const runtimePaths = resolveRuntimePaths(targetDir);
  const currentRun = readJsonIfExists(runtimePaths.currentRun.path);

  if (!hydrated.task || typeof hydrated.task !== 'object') {
    hydrated.task = {};
  }

  if (!hydrated.task.change_id) {
    const inferredChangeId =
      currentRun?.task?.change_id ||
      currentRun?.anchor?.task?.change_id ||
      null;

    if (inferredChangeId) {
      hydrated.task.change_id = inferredChangeId;
    }
  }

  return hydrated;
}

function validateDispatchPayload(payload, sourceLabel) {
  if (!payload || typeof payload !== 'object') {
    throw new Error(`Invalid dispatch payload: ${sourceLabel}`);
  }
  if (payload.kind !== 'expert-dispatch') {
    throw new Error(`Expected kind "expert-dispatch" but got "${payload.kind || 'undefined'}": ${sourceLabel}`);
  }
  if (!payload.run_id) {
    throw new Error(`Dispatch payload is missing run_id: ${sourceLabel}`);
  }
  if (!payload.role || typeof payload.role !== 'object' || !payload.role.id) {
    throw new Error(`Dispatch payload is missing role.id: ${sourceLabel}`);
  }
  if (
    payload.flow?.id === 'prd-to-delivery' &&
    ['requirement-analyst', 'frontend-implementer', 'code-guardian'].includes(payload.role.id) &&
    !payload.task?.change_id
  ) {
    throw new Error(`Dispatch payload is missing task.change_id for ${payload.role.id}: ${sourceLabel}`);
  }
}

function normalizeDispatchPayload(payload) {
  const normalized = JSON.parse(JSON.stringify(payload));
  normalized.schema_version = normalized.schema_version || 1;
  normalized.kind = 'expert-dispatch';
  normalized.dispatch_id = normalized.dispatch_id || createDispatchId(normalized.role.id);
  normalized.generated_at = normalized.generated_at || new Date().toISOString();
  return normalized;
}

function writeDispatchArtifacts(targetDir, payload) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const currentDispatchPath = runtimePaths.currentDispatch.path;
  const persistHistory = shouldPersistHistory();
  let dispatchRecordPath = null;
  if (persistHistory) {
    const dispatchesDir = path.join(runtimePaths.dispatchesDir.path, payload.run_id);
    ensureDir(dispatchesDir);
    dispatchRecordPath = path.join(dispatchesDir, `${payload.dispatch_id}.json`);
  }

  if (runtimePaths.currentDispatch.legacyPath && fs.existsSync(runtimePaths.currentDispatch.legacyPath)) {
    fs.unlinkSync(runtimePaths.currentDispatch.legacyPath);
  }
  writeJson(currentDispatchPath, payload);
  if (dispatchRecordPath) {
    writeJson(dispatchRecordPath, payload);
  }

  return {
    current_dispatch: currentDispatchPath,
    dispatch_record: dispatchRecordPath,
  };
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

function applyDispatch(options) {
  const targetDir = path.resolve(options.target || '.');
  const sourcePath = options.payload
    ? path.resolve(process.cwd(), options.payload)
    : 'stdin';

  const rawPayload = options.payload
    ? readJson(sourcePath, 'expert-dispatch')
    : readJsonFromStdin('expert-dispatch');

  const hydratedPayload = hydrateDispatchPayload(targetDir, rawPayload);
  validateDispatchPayload(hydratedPayload, sourcePath);
  const payload = normalizeDispatchPayload(hydratedPayload);
  const artifacts = writeDispatchArtifacts(targetDir, payload);
  const cleanedSource = cleanupTmpSource(targetDir, sourcePath);

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts,
    payload,
    cleaned_source: cleanedSource,
  };
}

function applyDispatchData(options) {
  const targetDir = path.resolve(options.target || '.');
  const sourcePath = options.source || 'memory-payload';
  const rawPayload = options.payloadData;

  const hydratedPayload = hydrateDispatchPayload(targetDir, rawPayload);
  validateDispatchPayload(hydratedPayload, sourcePath);
  const payload = normalizeDispatchPayload(hydratedPayload);
  const artifacts = writeDispatchArtifacts(targetDir, payload);

  return {
    status: 'success',
    target: targetDir,
    source: sourcePath,
    artifacts,
    payload,
  };
}

function clearDispatch(options) {
  const targetDir = path.resolve(options.target || '.');
  const runtimePaths = resolveRuntimePaths(targetDir);
  for (const currentDispatchPath of getCandidatePaths(runtimePaths.currentDispatch)) {
    if (fs.existsSync(currentDispatchPath)) {
      fs.unlinkSync(currentDispatchPath);
    }
  }

  return {
    status: 'success',
    target: targetDir,
    artifacts: {
      current_dispatch: runtimePaths.currentDispatch.path,
    },
  };
}

function printPretty(result, command) {
  console.log(`expert-dispatch ${command}`);
  console.log(`  target: ${result.target}`);
  if (result.payload) {
    console.log(`  run_id: ${result.payload.run_id}`);
    console.log(`  role: ${result.payload.role.id}`);
    console.log(`  dispatch_id: ${result.payload.dispatch_id}`);
    console.log(`  current_dispatch: ${result.artifacts.current_dispatch}`);
  } else {
    console.log(`  current_dispatch: ${result.artifacts.current_dispatch}`);
  }
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return 0;
  }

  if (command === 'apply') {
    const inputCount = [Boolean(options.payload), Boolean(options.stdin)].filter(Boolean).length;
    if (inputCount === 0) {
      throw new Error('Missing dispatch input: use --payload <file> or --stdin');
    }
    if (inputCount > 1) {
      throw new Error('Use either --payload <file> or --stdin, not both');
    }

    const result = applyDispatch(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  if (command === 'clear') {
    const result = clearDispatch(options);
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printPretty(result, command);
    }
    return 0;
  }

  throw new Error(`Unsupported expert-dispatch command: ${command}`);
}

module.exports = {
  main,
  applyDispatch,
  applyDispatchData,
  clearDispatch,
  validateDispatchPayload,
  normalizeDispatchPayload,
};

if (require.main === module) {
  try {
    process.exit(main());
  } catch (error) {
    console.error(`expert-dispatch error: ${error.message}`);
    process.exit(1);
  }
}
