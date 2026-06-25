const path = require('path');
const { BranchManager } = require('../src/git/branch-manager');
const { DirtyChecker } = require('../src/git/dirty-checker');
const { DirtyStrategyHandler } = require('../src/git/dirty-strategy-handler');
const { GitRepositoryDetector } = require('../src/git/git-repository-detector');
const { readBranchPolicy } = require('../src/git/policy');
const { createBranchName, createWorktreeName, normalizeDirtyStrategy } = require('../src/git/types');
const { WorktreeManager, resolveWorktreeRoot } = require('../src/git/worktree-manager');

function parseArgs(argv) {
  const options = {
    command: argv[0],
    target: '.',
    summary: '',
    runId: `run-${Date.now()}`,
    dirtyStrategy: null,
  };

  for (let index = 1; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
    } else if (arg === '--summary') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --summary 参数值');
      options.summary = value;
      index += 1;
    } else if (arg === '--run-id') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --run-id 参数值');
      options.runId = value;
      index += 1;
    } else if (arg === '--dirty-strategy') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --dirty-strategy 参数值');
      options.dirtyStrategy = normalizeDirtyStrategy(value);
      index += 1;
    } else if (arg === '--base-branch') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --base-branch 参数值');
      options.baseBranch = value;
      index += 1;
    } else if (arg === '--branch-prefix') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --branch-prefix 参数值');
      options.branchPrefix = value;
      index += 1;
    } else if (arg === '--worktree-root') {
      const value = argv[index + 1];
      if (!value || value.startsWith('-')) throw new Error('缺少 --worktree-root 参数值');
      options.worktreeRoot = value;
      index += 1;
    } else if (!arg.startsWith('-')) {
      options.target = arg;
    } else {
      throw new Error(`未知 worktree 参数：${arg}`);
    }
  }
  return options;
}

function printUsage() {
  console.log(`ai-spec-auto worktree <dirty|plan|create> <目录>

说明：
  调试 Git branch / worktree 隔离能力。

示例：
  ai-spec-auto worktree dirty .
  ai-spec-auto worktree plan . --summary "新增用户列表"
  ai-spec-auto worktree create . --summary "新增用户列表" --dirty-strategy block`);
}

function resolveExecutionContext(options) {
  const targetDir = path.resolve(process.cwd(), options.target || '.');
  const detector = new GitRepositoryDetector().detect({ rootDir: targetDir });
  if (!detector.isGitRepository) {
    return { targetDir, detector, policy: null };
  }
  const policy = readBranchPolicy(detector.repoRoot);
  return { targetDir, detector, policy };
}

function printDirty(result) {
  console.log('dirty 检测完成：');
  console.log(`- clean：${result.clean ? '是' : '否'}`);
  console.log(`- staged：${result.summary.stagedCount}`);
  console.log(`- unstaged：${result.summary.unstagedCount}`);
  console.log(`- untracked：${result.summary.untrackedCount}`);
  if (result.changedFiles.length > 0) {
    console.log('变更文件：');
    for (const file of result.changedFiles) {
      console.log(`- ${file.status} ${file.path}`);
    }
  }
}

function createPlan(options, detector, policy) {
  const baseBranch = options.baseBranch || policy.baseBranch || detector.currentBranch;
  const branchPrefix = options.branchPrefix || policy.branchPrefix || 'ai';
  const worktreeRoot = options.worktreeRoot || policy.worktreeRoot || '../.ai-worktrees';
  const requirementSummary = options.summary || '需求执行';
  const branchName = createBranchName({
    branchPrefix,
    runId: options.runId,
    requirementSummary,
  });
  const worktreePath = path.join(resolveWorktreeRoot(detector.repoRoot, worktreeRoot), createWorktreeName({
    runId: options.runId,
    requirementSummary,
  }));
  return {
    runId: options.runId,
    repoRoot: detector.repoRoot,
    baseBranch,
    branchName,
    worktreePath,
    dirtyStrategy: options.dirtyStrategy || policy.dirtyStrategy || 'block',
  };
}

function printPlan(plan) {
  console.log('worktree 规划完成：');
  console.log(`- runId：${plan.runId}`);
  console.log(`- baseBranch：${plan.baseBranch}`);
  console.log(`- branch：${plan.branchName}`);
  console.log(`- worktreePath：${plan.worktreePath}`);
  console.log(`- dirtyStrategy：${plan.dirtyStrategy}`);
}

async function main(argv) {
  const options = parseArgs(argv);
  if (options.help || !options.command) {
    printUsage();
    return 0;
  }

  const { detector, policy } = resolveExecutionContext(options);
  if (!detector.isGitRepository) {
    console.log('目标目录不是 Git 仓库，无法执行 worktree 命令');
    return 1;
  }

  if (options.command === 'dirty') {
    const result = new DirtyChecker().check({ repoRoot: detector.repoRoot });
    printDirty(result);
    return 0;
  }

  if (options.command === 'plan') {
    const plan = createPlan(options, detector, policy);
    printPlan(plan);
    return 0;
  }

  if (options.command === 'create') {
    const plan = createPlan(options, detector, policy);
    const dirtyResult = await new DirtyStrategyHandler().handle({
      repoRoot: detector.repoRoot,
      strategy: plan.dirtyStrategy,
      runId: plan.runId,
      requirementSummary: options.summary || '需求执行',
    });
    console.log(dirtyResult.message);
    if (dirtyResult.warning) console.log(`警告：${dirtyResult.warning}`);
    if (!dirtyResult.canContinue) return 1;

    const result = await new WorktreeManager({ branchManager: new BranchManager() }).create({
      repoRoot: detector.repoRoot,
      baseBranch: plan.baseBranch,
      branchPrefix: options.branchPrefix || policy.branchPrefix || 'ai',
      worktreeRoot: options.worktreeRoot || policy.worktreeRoot || '../.ai-worktrees',
      runId: plan.runId,
      requirementSummary: options.summary || '需求执行',
    });
    if (!result.created) {
      console.log('worktree 创建失败：');
      for (const item of result.errors) console.log(`- [${item.code}] ${item.message}`);
      return 1;
    }
    console.log('worktree 创建完成：');
    console.log(`- branch：${result.branchName}`);
    console.log(`- worktreePath：${result.worktreePath}`);
    return 0;
  }

  throw new Error(`未知 worktree 子命令：${options.command}`);
}

module.exports = {
  createPlan,
  main,
  parseArgs,
};
