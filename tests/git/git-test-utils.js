const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, {
    cwd: options.cwd || repoRoot,
    encoding: 'utf8',
    env: { ...process.env, ...(options.env || {}) },
  });
  if (options.allowFailure) return result;
  assert.strictEqual(result.status, 0, result.stderr || result.stdout);
  return result;
}

function ensureGitAvailable() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.log('当前环境未找到 git 命令，跳过 Git / Worktree 测试');
    process.exit(0);
  }
}

function git(repo, args, options = {}) {
  return run('git', args, { ...options, cwd: repo });
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function initGitRepo(prefix = 'ai-spec-git-repo-') {
  ensureGitAvailable();
  const repo = createTempDir(prefix);
  git(repo, ['init', '-b', 'main']);
  git(repo, ['config', 'user.email', 'ai-spec@example.com']);
  git(repo, ['config', 'user.name', 'AI Spec Test']);
  writeText(path.join(repo, 'README.md'), '# demo\n');
  writeJson(path.join(repo, 'package.json'), { name: 'demo' });
  git(repo, ['add', 'README.md', 'package.json']);
  git(repo, ['commit', '-m', 'init']);
  return repo;
}

function runCli(args, env = {}) {
  return spawnSync('node', ['./bin/cli.js', ...args], {
    cwd: repoRoot,
    encoding: 'utf8',
    env: {
      ...process.env,
      AI_SPEC_SKIP_LAUNCHER_SYNC: '1',
      ...env,
    },
  });
}

module.exports = {
  createTempDir,
  ensureGitAvailable,
  git,
  initGitRepo,
  repoRoot,
  run,
  runCli,
  writeJson,
  writeText,
};
