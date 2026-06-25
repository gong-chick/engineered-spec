#!/usr/bin/env node
const fs = require('fs');
const path = require('path');
const runtimeState = require('./runtime-state');
const {
  resolveRuntimePaths,
  getCandidatePaths,
} = require('./runtime-paths');
const { pushVisualRuntimeStateSnapshot, drainVisualRuntimeStatePushes } = require('../internal/visual-hooks/runtime-state-pusher');

function printUsage() {
  console.log(`Usage:
  ai-spec-auto archive-change --target <dir> [--change-id <id>] [options]

Options:
  --target <dir>         Target project directory (default: .)
  --change-id <id>       OpenSpec change id; if omitted, infer from .ai-spec/current-run.json
  --complete-run         After archive, write runtime success and clear current inbox files
  --json                 Print JSON result only
  --pretty               Print readable summary (default)
  --help                 Show this help
`);
}

function parseArgs(argv) {
  const args = [...argv];
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
      case '--change-id':
        options.changeId = args.shift();
        break;
      case '--complete-run':
        options.completeRun = true;
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

function readJsonIfExists(filePath) {
  if (!fs.existsSync(filePath)) {
    return null;
  }
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function listFilesRecursive(rootDir) {
  if (!fs.existsSync(rootDir)) {
    return [];
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
      } else if (entry.isFile()) {
        files.push(nextPath);
      }
    }
  }

  return files.sort();
}

function countTaskCompletion(tasksPath) {
  if (!fs.existsSync(tasksPath)) {
    return { completed: 0, total: 0 };
  }

  const content = fs.readFileSync(tasksPath, 'utf8');
  const lines = content.split('\n');
  let completed = 0;
  let total = 0;

  for (const line of lines) {
    if (/^- \[[ xX]\]\s+/.test(line.trim())) {
      total += 1;
      if (/^- \[[xX]\]\s+/.test(line.trim())) {
        completed += 1;
      }
    }
  }

  return { completed, total };
}

function normalizeMarkdown(content) {
  return String(content || '').replace(/\r\n/g, '\n').trim();
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

function mergeSpecFile(targetPath, incomingContent, changeId) {
  if (!fs.existsSync(targetPath)) {
    fs.writeFileSync(targetPath, `${incomingContent.trim()}\n`, 'utf8');
    return 'added';
  }

  const existingContent = fs.readFileSync(targetPath, 'utf8');
  const normalizedExisting = normalizeMarkdown(existingContent);
  const normalizedIncoming = normalizeMarkdown(incomingContent);

  if (!normalizedIncoming || normalizedExisting === normalizedIncoming || normalizedExisting.includes(normalizedIncoming)) {
    return 'unchanged';
  }

  const merged = [
    existingContent.trimEnd(),
    '',
    `<!-- merged from change: ${changeId} -->`,
    '',
    normalizedIncoming,
    '',
  ].join('\n');
  fs.writeFileSync(targetPath, merged, 'utf8');
  return 'updated';
}

function resolveChangeId(targetDir, explicitChangeId) {
  if (explicitChangeId) {
    return explicitChangeId;
  }

  const currentRun = readJsonIfExists(path.join(targetDir, '.ai-spec', 'current-run.json'));
  return currentRun?.task?.change_id || currentRun?.anchor?.task?.change_id || null;
}

function buildArchiveDestination(baseArchiveDir, changeId, now = new Date()) {
  const day = now.toISOString().slice(0, 10);
  const baseName = `${day}-${changeId}`;
  let candidate = path.join(baseArchiveDir, baseName);
  let suffix = 1;

  while (fs.existsSync(candidate)) {
    suffix += 1;
    candidate = path.join(baseArchiveDir, `${baseName}-${suffix}`);
  }

  return candidate;
}

function buildAlreadyArchivedResult(targetDir, changeId) {
  const currentRun = readJsonIfExists(path.join(targetDir, '.ai-spec', 'current-run.json'));
  const proposalPath = currentRun?.artifacts?.proposal
    ? path.join(targetDir, currentRun.artifacts.proposal)
    : null;
  const specsPath = currentRun?.artifacts?.specs
    ? path.join(targetDir, normalizeSpecsArtifactPath(currentRun.artifacts.specs))
    : null;
  const designPath = currentRun?.artifacts?.design
    ? path.join(targetDir, currentRun.artifacts.design)
    : null;

  if (!proposalPath || !specsPath || !designPath) {
    return null;
  }
  if (!proposalPath.includes(`${path.sep}openspec${path.sep}changes${path.sep}archive${path.sep}`)) {
    return null;
  }
  if (!fs.existsSync(proposalPath) || !fs.existsSync(specsPath) || !fs.existsSync(designPath)) {
    return null;
  }
  if ((currentRun?.task?.change_id || currentRun?.anchor?.task?.change_id || null) !== changeId) {
    return null;
  }

  const archivedDir = path.dirname(proposalPath);
  const archivedRel = path.relative(targetDir, archivedDir);
  return {
    kind: 'archive-change-result',
    status: 'success',
    target: targetDir,
    change_id: changeId,
    archived_to: archivedRel,
    archived_artifacts: {
      proposal: path.relative(targetDir, proposalPath),
      specs: path.relative(targetDir, specsPath),
      design: path.relative(targetDir, designPath),
      tasks: currentRun?.artifacts?.tasks || null,
      checklist: currentRun?.artifacts?.checklist || null,
      iterations: currentRun?.artifacts?.iterations || null,
    },
    merged: {
      added_domains: [],
      added_specs: [],
      updated_specs: [],
      unchanged_specs: [],
    },
    task_completion: countTaskCompletion(path.join(archivedDir, 'tasks.md')),
    already_archived: true,
  };
}

function clearCurrentRuntimeArtifacts(targetDir) {
  const runtimePaths = resolveRuntimePaths(targetDir);
  const entries = [
    runtimePaths.currentDispatch,
    runtimePaths.currentExecutionJson,
    runtimePaths.currentExecutionMd,
    runtimePaths.currentRuntimeActionJson,
    runtimePaths.currentRuntimeActionMd,
    runtimePaths.tmpCurrentDispatch,
    runtimePaths.tmpCurrentExecution,
    runtimePaths.tmpCurrentRuntimeAction,
  ];

  const cleared = {};
  for (const entry of entries) {
    let count = 0;
    for (const candidate of getCandidatePaths(entry)) {
      if (!fs.existsSync(candidate)) {
        continue;
      }
      fs.unlinkSync(candidate);
      count += 1;
    }
    cleared[entry.relPath] = count;
  }

  return cleared;
}

function completeRunAfterArchive(targetDir, archiveResult) {
  const currentRun = readJsonIfExists(path.join(targetDir, '.ai-spec', 'current-run.json'));
  if (!currentRun?.run_id) {
    return null;
  }

  const runtimeResult = runtimeState.completeRunState({
    target: targetDir,
    runId: currentRun.run_id,
    fromRole: currentRun.current_role || 'archive-change',
    toRole: 'archive-change',
    status: 'success',
    message: '归档完成，增量规范已合并并已写入归档目录。',
    artifactsData: archiveResult.archived_artifacts,
    skipArtifactCheck: true,
    clearPendingGate: true,
  });
  const cleared = clearCurrentRuntimeArtifacts(targetDir);

  return {
    ...runtimeResult,
    cleared_runtime_artifacts: cleared,
  };
}

function buildArchivedAdditionalArtifacts(currentArtifacts, changeId, archivedRelBase) {
  const currentAdditional = Array.isArray(currentArtifacts?.additional) ? currentArtifacts.additional : [];
  if (currentAdditional.length === 0) {
    return [];
  }

  const activeBase = `openspec/changes/${changeId}`;
  return currentAdditional
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .map((item) => item.replace(/[\\/]+$/, ''))
    .map((item) => {
      if (item === activeBase || item.startsWith(`${activeBase}/`)) {
        return item.replace(activeBase, archivedRelBase);
      }
      return item;
    });
}

function archiveChange(options = {}) {
  const targetDir = path.resolve(options.target || '.');
  const changeId = resolveChangeId(targetDir, options.changeId);
  if (!changeId) {
    throw new Error('Missing change id: use --change-id or ensure .ai-spec/current-run.json contains task.change_id');
  }

  const changeDir = path.join(targetDir, 'openspec', 'changes', changeId);
  if (!fs.existsSync(changeDir)) {
    const alreadyArchived = buildAlreadyArchivedResult(targetDir, changeId);
    if (!alreadyArchived) {
      throw new Error(`OpenSpec change directory does not exist: ${path.relative(targetDir, changeDir)}`);
    }
    if (options.completeRun) {
      alreadyArchived.runtime_transition = completeRunAfterArchive(targetDir, alreadyArchived);
    }
    return alreadyArchived;
  }

  const proposalPath = path.join(changeDir, 'proposal.md');
  const tasksPath = path.join(changeDir, 'tasks.md');
  const designPath = path.join(changeDir, 'design.md');
  const checklistPath = path.join(changeDir, 'checklist.md');
  const iterationsPath = path.join(changeDir, 'iterations.md');
  const specsDir = path.join(changeDir, 'specs');

  if (!fs.existsSync(proposalPath)) {
    throw new Error(`proposal.md is missing for change ${changeId}`);
  }
  if (!fs.existsSync(tasksPath)) {
    throw new Error(`tasks.md is missing for change ${changeId}`);
  }
  if (!fs.existsSync(designPath)) {
    throw new Error(`design.md is missing for change ${changeId}`);
  }
  if (!fs.existsSync(specsDir)) {
    throw new Error(`specs/ is missing for change ${changeId}`);
  }

  const targetSpecsDir = path.join(targetDir, 'openspec', 'specs');
  ensureDir(targetSpecsDir);

  const merged = {
    added_domains: [],
    added_specs: [],
    updated_specs: [],
    unchanged_specs: [],
  };
  const seenDomains = new Set();
  const sourceSpecFiles = listFilesRecursive(specsDir);
  for (const sourceFile of sourceSpecFiles) {
    const relFromSpecs = path.relative(specsDir, sourceFile);
    const domain = relFromSpecs.split(path.sep)[0] || null;
    const targetFile = path.join(targetSpecsDir, relFromSpecs);
    const targetDomainDir = path.dirname(targetFile);
    const domainRel = domain ? path.join('openspec', 'specs', domain) : null;

    if (domainRel && !fs.existsSync(targetDomainDir) && !seenDomains.has(domainRel)) {
      ensureDir(targetDomainDir);
      merged.added_domains.push(domainRel);
      seenDomains.add(domainRel);
    } else {
      ensureDir(targetDomainDir);
    }

    const mergeStatus = mergeSpecFile(targetFile, fs.readFileSync(sourceFile, 'utf8'), changeId);
    const relTargetFile = path.relative(targetDir, targetFile);
    if (mergeStatus === 'added') {
      merged.added_specs.push(relTargetFile);
    } else if (mergeStatus === 'updated') {
      merged.updated_specs.push(relTargetFile);
    } else {
      merged.unchanged_specs.push(relTargetFile);
    }
  }

  const archiveRoot = path.join(targetDir, 'openspec', 'changes', 'archive');
  ensureDir(archiveRoot);
  const archivedPath = buildArchiveDestination(archiveRoot, changeId, options.now || new Date());
  fs.renameSync(changeDir, archivedPath);
  const archivedRelBase = path.relative(targetDir, archivedPath);
  const currentRun = readJsonIfExists(path.join(targetDir, '.ai-spec', 'current-run.json'));

  const result = {
    kind: 'archive-change-result',
    status: 'success',
    target: targetDir,
    change_id: changeId,
    archived_to: archivedRelBase,
    archived_artifacts: {
      proposal: path.relative(targetDir, path.join(archivedPath, 'proposal.md')),
      specs: path.relative(targetDir, path.join(archivedPath, 'specs')),
      design: path.relative(targetDir, path.join(archivedPath, 'design.md')),
      tasks: path.relative(targetDir, path.join(archivedPath, 'tasks.md')),
      checklist: fs.existsSync(path.join(archivedPath, 'checklist.md'))
        ? path.relative(targetDir, path.join(archivedPath, 'checklist.md'))
        : null,
      iterations: fs.existsSync(path.join(archivedPath, 'iterations.md'))
        ? path.relative(targetDir, path.join(archivedPath, 'iterations.md'))
        : null,
      additional: buildArchivedAdditionalArtifacts(currentRun?.artifacts || null, changeId, archivedRelBase),
    },
    merged,
    task_completion: countTaskCompletion(path.join(archivedPath, 'tasks.md')),
  };

  if (options.completeRun) {
    result.runtime_transition = completeRunAfterArchive(targetDir, result);
  }

  pushVisualRuntimeStateSnapshot(targetDir);

  return result;
}

function printPretty(result) {
  console.log('archive-change');
  console.log(`  target: ${result.target}`);
  console.log(`  change_id: ${result.change_id}`);
  console.log(`  archived_to: ${result.archived_to}`);
  console.log(`  added_domains: ${result.merged.added_domains.length}`);
  console.log(`  added_specs: ${result.merged.added_specs.length}`);
  console.log(`  updated_specs: ${result.merged.updated_specs.length}`);
  console.log(`  unchanged_specs: ${result.merged.unchanged_specs.length}`);
  console.log(`  tasks: ${result.task_completion.completed}/${result.task_completion.total}`);
  if (result.runtime_transition?.state?.status) {
    console.log(`  run_status: ${result.runtime_transition.state.status}`);
  }
}

async function main(argv = process.argv.slice(2)) {
  const options = parseArgs(argv);
  if (options.help) {
    printUsage();
    return 0;
  }

  const result = archiveChange(options);
  await drainVisualRuntimeStatePushes();
  if (options.json) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    printPretty(result);
  }
  return 0;
}

if (require.main === module) {
  try {
    main().then((code) => process.exit(code));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}

module.exports = {
  archiveChange,
  main,
  parseArgs,
};
