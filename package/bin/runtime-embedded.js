const fs = require('fs');
const os = require('os');
const path = require('path');

function resolveHomeDir(env = process.env) {
  return env.HOME || env.USERPROFILE || os.homedir();
}

function resolveAiSpecHome(env = process.env) {
  return env.AI_SPEC_HOME || path.join(resolveHomeDir(env), '.ai-spec-auto');
}

function getEmbeddedPaths(env = process.env) {
  const aiSpecHome = resolveAiSpecHome(env);
  const rootDir = path.join(aiSpecHome, 'runtime', 'embedded');
  return {
    aiSpecHome,
    rootDir,
    packageDir: path.join(rootDir, 'package'),
    binDir: path.join(rootDir, 'bin'),
    entryFile: path.join(rootDir, 'bin', 'ai-spec-auto'),
    entryCmdFile: path.join(rootDir, 'bin', 'ai-spec-auto.cmd'),
  };
}

function renderEmbeddedEntry() {
  return `#!/usr/bin/env node
const path = require('path');

process.env.AI_SPEC_SKIP_RUNTIME_REFRESH = '1';
process.env.AI_SPEC_SKIP_LAUNCHER_SYNC = '1';

require(path.join(__dirname, '..', 'package', 'bin', 'cli.js'));
`;
}

function renderEmbeddedEntryCmd() {
  return `@echo off
node "%~dp0ai-spec-auto" %*
`;
}

function ensureExecutable(filePath) {
  try {
    fs.chmodSync(filePath, 0o755);
  } catch (_error) {
    // ignore
  }
}

function syncEmbeddedRuntime({
  pkgRoot,
  env = process.env,
} = {}) {
  const embeddedPaths = getEmbeddedPaths(env);
  fs.mkdirSync(embeddedPaths.packageDir, { recursive: true });
  fs.mkdirSync(embeddedPaths.binDir, { recursive: true });

  for (const relPath of ['bin', 'internal', '.agents', 'openspec', 'configs']) {
    const sourcePath = path.join(pkgRoot, relPath);
    if (!fs.existsSync(sourcePath)) {
      continue;
    }
    fs.cpSync(sourcePath, path.join(embeddedPaths.packageDir, relPath), {
      recursive: true,
      force: true,
    });
  }

  const packageJsonPath = path.join(pkgRoot, 'package.json');
  if (fs.existsSync(packageJsonPath)) {
    fs.copyFileSync(packageJsonPath, path.join(embeddedPaths.packageDir, 'package.json'));
  }

  fs.writeFileSync(embeddedPaths.entryFile, renderEmbeddedEntry(), 'utf8');
  ensureExecutable(embeddedPaths.entryFile);
  fs.writeFileSync(embeddedPaths.entryCmdFile, renderEmbeddedEntryCmd(), 'utf8');

  return embeddedPaths;
}

function resolveEmbeddedEntry(env = process.env) {
  const embeddedPaths = getEmbeddedPaths(env);
  if (fs.existsSync(embeddedPaths.entryFile)) {
    return embeddedPaths.entryFile;
  }
  if (process.platform === 'win32' && fs.existsSync(embeddedPaths.entryCmdFile)) {
    return embeddedPaths.entryCmdFile;
  }
  return null;
}

module.exports = {
  syncEmbeddedRuntime,
  resolveEmbeddedEntry,
  __test__: {
    getEmbeddedPaths,
    renderEmbeddedEntry,
    renderEmbeddedEntryCmd,
  },
};
