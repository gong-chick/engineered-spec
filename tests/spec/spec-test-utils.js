const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const repoRoot = path.join(__dirname, '..', '..');
const { sha256Text } = require('../../src/security/checksum');

function createTempDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

function writeText(filePath, content) {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, 'utf8');
}

function writeJson(filePath, value) {
  writeText(filePath, `${JSON.stringify(value, null, 2)}\n`);
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
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

function git(repo, args, options = {}) {
  return run('git', args, { ...options, cwd: repo });
}

function ensureGitAvailable() {
  const result = spawnSync('git', ['--version'], { encoding: 'utf8' });
  if (result.status !== 0) {
    console.log('当前环境未找到 git 命令，跳过 spec Git 测试');
    process.exit(0);
  }
}

function initGitRepo(prefix = 'ai-spec-run-repo-') {
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

function cacheAsset(cacheHome, kind, slug, content) {
  const checksum = sha256Text(content);
  const dir = kind === 'agent-profile'
    ? path.join(cacheHome, 'cache/agent-profiles', checksum)
    : path.join(cacheHome, 'cache/assets', checksum);
  writeText(path.join(dir, 'content.md'), content);
  return { kind, slug, version: '1.0.0', checksum };
}

function setupInitializedProject(root, cacheHome = createTempDir('ai-spec-run-cache-'), options = {}) {
  const role = cacheAsset(cacheHome, 'role', 'planner-role', '# 规划角色\n');
  const flow = cacheAsset(cacheHome, 'flow', 'planning-flow', '# 规划流程\n');
  writeJson(path.join(root, '.ai-spec/project.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_run',
    projectName: 'run-demo',
    projectType: 'single',
    techProfile: {},
    manifest: { slug: 'demo', version: '1.0.0' },
  });
  writeJson(path.join(root, '.ai-spec/policy.json'), {
    schemaVersion: '1.0.0',
    branchPolicy: {
      autoCreateBranch: true,
      autoCreateWorktree: true,
      baseBranch: 'main',
      branchPrefix: 'ai',
      worktreeRoot: options.worktreeRoot || '../.ai-worktrees',
      dirtyStrategy: 'block',
    },
    privacyPolicy: {
      uploadSourceCode: false,
      uploadRawPrompt: false,
      uploadRawResponse: false,
      uploadFileContent: false,
      uploadAbsolutePath: false,
    },
  });
  writeJson(path.join(root, '.ai-spec/ai-spec.lock.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_run',
    hub: { url: '' },
    manifest: { slug: 'demo', version: '1.0.0', checksum: sha256Text('manifest') },
    assets: [role, flow],
    overlays: [],
    sharedContracts: [],
  });
  writeJson(path.join(root, '.agents/registry.index.json'), {
    schemaVersion: '1.0.0',
    projectId: 'proj_run',
    source: 'local-init',
    manifest: { slug: 'demo', version: '1.0.0' },
    assets: {
      roles: [role],
      flows: [flow],
      rules: [],
      skills: [],
      agentProfiles: [],
    },
  });
  writeJson(path.join(root, '.ai-spec/context-index.json'), {
    schemaVersion: '1.0.0',
    contextStrategy: 'progressive',
    stageLoadRules: [
      { stage: 'planning', loadKinds: ['role', 'flow'], maxAssets: 5 },
      { stage: 'implementation', loadKinds: ['rule', 'skill', 'agent-profile'], maxAssets: 8 },
      { stage: 'verification', loadKinds: ['rule', 'flow'], maxAssets: 6 },
      { stage: 'diagnosing', loadKinds: ['rule', 'skill', 'agent-profile'], maxAssets: 6 },
    ],
    sharedContracts: [],
  });
  return { cacheHome, role, flow };
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
  cacheAsset,
  createTempDir,
  ensureGitAvailable,
  git,
  initGitRepo,
  readJson,
  repoRoot,
  runCli,
  setupInitializedProject,
  writeJson,
  writeText,
};
