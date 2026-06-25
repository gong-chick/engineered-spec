const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { WorktreeManager } = require('../../src/git/worktree-manager');
const { createTempDir, git, initGitRepo } = require('./git-test-utils');

async function testWorktreeCreated() {
  const repo = initGitRepo('ai-spec-worktree-create-');
  const worktreeRoot = createTempDir('ai-spec-worktree-root-');
  const result = await new WorktreeManager().create({
    repoRoot: repo,
    baseBranch: 'main',
    branchPrefix: 'ai',
    worktreeRoot,
    runId: 'run-101',
    requirementSummary: '新增用户列表',
  });

  assert.strictEqual(result.created, true);
  assert(fs.existsSync(result.worktreePath));
  assert(fs.existsSync(path.join(result.worktreePath, '.git')));
  assert(result.branchName.startsWith('ai/run-101-'));
}

async function testWorktreePathExistingDoesNotOverwrite() {
  const repo = initGitRepo('ai-spec-worktree-existing-');
  const worktreeRoot = createTempDir('ai-spec-worktree-existing-root-');
  const manager = new WorktreeManager();
  const first = await manager.create({
    repoRoot: repo,
    baseBranch: 'main',
    branchPrefix: 'ai',
    worktreeRoot,
    runId: 'run-102',
    requirementSummary: '新增用户列表',
  });
  const second = await manager.create({
    repoRoot: repo,
    baseBranch: 'main',
    branchPrefix: 'ai',
    worktreeRoot,
    runId: 'run-102',
    requirementSummary: '新增用户列表',
  });

  assert.notStrictEqual(second.worktreePath, first.worktreePath);
  assert(fs.existsSync(first.worktreePath));
  assert(fs.existsSync(second.worktreePath));
}

async function testWorktreeCreateFailureReadable() {
  const repo = initGitRepo('ai-spec-worktree-failure-');
  const result = await new WorktreeManager().create({
    repoRoot: repo,
    baseBranch: 'missing-base',
    branchPrefix: 'ai',
    worktreeRoot: createTempDir('ai-spec-worktree-failure-root-'),
    runId: 'run-103',
    requirementSummary: '新增用户列表',
  });

  assert.strictEqual(result.created, false);
  assert(result.errors.some((item) => item.message.includes('baseBranch 不存在')));
}

async function testWorktreeAddFailureRollsBackBranch() {
  const repo = initGitRepo('ai-spec-worktree-add-failure-');
  const invalidRoot = path.join(createTempDir('ai-spec-worktree-invalid-root-'), 'not-directory');
  fs.writeFileSync(invalidRoot, 'this is a file', 'utf8');

  const result = await new WorktreeManager().create({
    repoRoot: repo,
    baseBranch: 'main',
    branchPrefix: 'ai',
    worktreeRoot: invalidRoot,
    runId: 'run-105',
    requirementSummary: '新增用户列表',
  });

  assert.strictEqual(result.created, false);
  assert(result.errors.some((item) => item.code === 'WORKTREE_CREATE_FAILED'));
  const branches = git(repo, ['branch', '--list', result.branchName]).stdout;
  assert(!branches.includes(result.branchName), 'worktree 创建失败后应回滚已创建 branch');
}

async function testPackageJsonNotModified() {
  const repo = initGitRepo('ai-spec-worktree-package-');
  const before = fs.readFileSync(path.join(repo, 'package.json'), 'utf8');
  await new WorktreeManager().create({
    repoRoot: repo,
    baseBranch: 'main',
    branchPrefix: 'ai',
    worktreeRoot: createTempDir('ai-spec-worktree-package-root-'),
    runId: 'run-104',
    requirementSummary: '新增用户列表',
  });
  assert.strictEqual(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'), before);
}

async function main() {
  await testWorktreeCreated();
  await testWorktreePathExistingDoesNotOverwrite();
  await testWorktreeCreateFailureReadable();
  await testWorktreeAddFailureRollsBackBranch();
  await testPackageJsonNotModified();
  console.log('worktree-manager tests passed');
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
