#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const adapter = require('./task-orchestrator-adapter');
const { resolveRuntimePaths, getCandidatePaths } = require('./runtime-paths');

function printUsage() {
  console.log(`Usage:
  ai-spec-auto task-orchestrator-extractor extract --payload <file> [options]
  ai-spec-auto task-orchestrator-extractor extract --stdin [options]
  ai-spec-auto task-orchestrator-extractor apply --payload <file> [options]
  ai-spec-auto task-orchestrator-extractor apply --stdin [options]

Options:
  --target <dir>         Target project directory (default: .; apply only)
  --payload <file>       Path to task-orchestrator text response file
  --stdin                Read task-orchestrator text response from stdin
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

function readTextFile(filePath, label) {
  const raw = fs.readFileSync(filePath, 'utf8');
  if (!raw.trim()) {
    throw new Error(`${label} is empty: ${filePath}`);
  }
  return raw;
}

function readTextFromStdin(label) {
  const raw = fs.readFileSync(0, 'utf8');
  if (!raw.trim()) {
    throw new Error(`${label} stdin is empty`);
  }
  return raw;
}

function tryParseJson(raw) {
  try {
    return JSON.parse(raw);
  } catch (error) {
    return null;
  }
}

function extractCandidates(text) {
  const candidates = [];
  const trimmed = text.trim();

  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    candidates.push({
      source: 'raw-json',
      raw: trimmed,
      index: 0,
    });
  }

  const fencePattern = /```(?:json|JSON)?\s*([\s\S]*?)```/g;
  let match;
  let fenceIndex = 0;
  while ((match = fencePattern.exec(text)) !== null) {
    const raw = (match[1] || '').trim();
    if (!raw) {
      fenceIndex += 1;
      continue;
    }
    candidates.push({
      source: 'fenced-json',
      raw,
      index: fenceIndex,
    });
    fenceIndex += 1;
  }

  return candidates;
}

function extractPayloadFromText(text, sourceLabel) {
  const candidates = extractCandidates(text);
  if (candidates.length === 0) {
    throw new Error(`No JSON code block found in task-orchestrator output: ${sourceLabel}`);
  }

  const errors = [];

  for (const candidate of candidates) {
    const parsed = tryParseJson(candidate.raw);
    if (!parsed) {
      errors.push(`${candidate.source}#${candidate.index}: invalid JSON`);
      continue;
    }

    try {
      const normalized = adapter.normalizePayload(parsed, `${sourceLabel}:${candidate.source}#${candidate.index}`);
      return {
        payload: normalized.payload,
        action: normalized.action,
        extraction: {
          source: candidate.source,
          index: candidate.index,
          kind: parsed.kind || null,
        },
      };
    } catch (error) {
      errors.push(`${candidate.source}#${candidate.index}: ${error.message}`);
    }
  }

  throw new Error(`No supported task-orchestrator payload found: ${errors.join('; ')}`);
}

function printExtractPretty(result) {
  console.log('task-orchestrator payload extracted');
  console.log(`  source: ${result.source}`);
  console.log(`  extraction: ${result.extraction.source}#${result.extraction.index}`);
  console.log(`  kind: ${result.extraction.kind || 'n/a'}`);
  console.log(`  action: ${result.action}`);
}

function printApplyPretty(result) {
  console.log('task-orchestrator extractor applied');
  console.log(`  source: ${result.source}`);
  console.log(`  extraction: ${result.extraction.source}#${result.extraction.index}`);
  console.log(`  action: ${result.applied.adapter_action}`);
  console.log(`  target: ${result.applied.result.target}`);
  console.log(`  run_id: ${result.applied.result.state.run_id}`);
  console.log(`  status: ${result.applied.result.state.status || 'n/a'}`);
}

function cleanupTmpSource(targetDir, sourcePath) {
  if (!sourcePath || sourcePath === 'stdin' || !fs.existsSync(sourcePath)) {
    return null;
  }

  const runtimePaths = resolveRuntimePaths(path.resolve(process.cwd(), targetDir || '.'));
  for (const candidate of getCandidatePaths(runtimePaths.tmpDir)) {
    const relative = path.relative(candidate, sourcePath);
    if (!relative.startsWith('..') && !path.isAbsolute(relative)) {
      fs.unlinkSync(sourcePath);
      return sourcePath;
    }
  }
  return null;
}

function main(argv = process.argv.slice(2)) {
  const { command, options } = parseArgs(argv);

  if (!command || options.help || command === 'help' || command === '--help' || command === '-h') {
    printUsage();
    return 0;
  }

  if (command !== 'extract' && command !== 'apply') {
    throw new Error(`Unsupported task-orchestrator-extractor command: ${command}`);
  }

  const inputCount = [Boolean(options.payload), Boolean(options.stdin)].filter(Boolean).length;
  if (inputCount === 0) {
    throw new Error('Missing extractor input: use --payload <file> or --stdin');
  }
  if (inputCount > 1) {
    throw new Error('Use either --payload <file> or --stdin, not both');
  }

  const source = options.payload
    ? path.resolve(process.cwd(), options.payload)
    : 'stdin';
  const text = options.payload
    ? readTextFile(source, 'task-orchestrator output')
    : readTextFromStdin('task-orchestrator output');

  const extracted = extractPayloadFromText(text, source);

  if (command === 'extract') {
    const result = {
      status: 'success',
      source,
      extraction: extracted.extraction,
      action: extracted.action,
      payload: extracted.payload,
    };
    if (options.json) {
      console.log(JSON.stringify(result, null, 2));
    } else {
      printExtractPretty(result);
    }
    return 0;
  }

  const applied = adapter.attachDispatch(adapter.applyPayload({
    action: extracted.action,
    payload: extracted.payload,
    options,
    payloadSource: source,
  }), options);
  const cleanedSource = cleanupTmpSource(options.target, source);
  const result = {
    status: 'success',
    source,
    extraction: extracted.extraction,
    action: extracted.action,
    applied,
    cleaned_source: cleanedSource,
  };

  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printApplyPretty(result);
  }

  return 0;
}

if (require.main === module) {
  try {
    const exitCode = main();
    process.exit(exitCode);
  } catch (error) {
    console.error(`task-orchestrator-extractor error: ${error.message}`);
    process.exit(1);
  }
}

module.exports = {
  main,
  parseArgs,
  extractCandidates,
  extractPayloadFromText,
};
