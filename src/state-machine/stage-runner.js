const path = require('path');
const { CheckService } = require('../check/check-service');
const { buildContext } = require('../context/context-builder');
const { ExecutorRunner } = require('../executor/executor-runner');
const { DirtyStrategyHandler } = require('../git/dirty-strategy-handler');
const { GitRepositoryDetector } = require('../git/git-repository-detector');
const { readBranchPolicy } = require('../git/policy');
const { WorktreeManager } = require('../git/worktree-manager');
const { RuntimeFeedbackReporter } = require('../hub/runtime-feedback-reporter');
const { readProjectState } = require('../project/project-files');
const { RunService, summarizeRequirement } = require('../run/run-service');
const { VisualReporter } = require('../visual/visual-reporter');
const { StateMachine } = require('./state-machine');

class StageRunner {
  constructor(options = {}) {
    this.runService = options.runService || new RunService();
    this.stateMachine = options.stateMachine || new StateMachine({ runService: this.runService });
    this.checkService = options.checkService || new CheckService();
    this.gitDetector = options.gitDetector || new GitRepositoryDetector();
    this.dirtyStrategyHandler = options.dirtyStrategyHandler || new DirtyStrategyHandler();
    this.worktreeManager = options.worktreeManager || new WorktreeManager();
    this.executorRunner = options.executorRunner || new ExecutorRunner();
    this.runtimeFeedbackReporter = options.runtimeFeedbackReporter || new RuntimeFeedbackReporter();
    this.visualReporter = options.visualReporter || new VisualReporter();
  }

  async runToHumanReview(input = {}) {
    const rootDir = path.resolve(input.rootDir || process.cwd());
    const runId = input.runId;
    let run = this.runService.loadRun(rootDir, runId);

    if (run.state === 'initialized') {
      run = await this.runPlanning({ rootDir, run });
    }
    if (run.state === 'planning') {
      run = await this.stateMachine.transition({ rootDir, runId, to: 'branch_preparing', reason: '规划完成，进入分支准备' });
    }
    if (run.state === 'branch_preparing') {
      run = await this.runBranchPreparing({ rootDir, run, options: input.options || {} });
    }
    if (run.state === 'context_building') {
      run = await this.runContextBuilding({ rootDir, run, options: input.options || {} });
    }
    return run;
  }

  async runPlanning(input) {
    const summary = summarizeRequirement(input.run.requirement?.rawText || '');
    let run = await this.stateMachine.transition({
      rootDir: input.rootDir,
      runId: input.run.runId,
      to: 'planning',
      reason: '需求已创建，进入规划阶段',
    });
    run = this.runService.updateRun(input.rootDir, input.run.runId, (current) => {
      current.requirement.summary = summary;
      current.events.push({
        type: 'planning_completed',
        message: `已生成需求摘要：${summary}`,
        detail: { summary },
        createdAt: new Date().toISOString(),
      });
      return current;
    });
    return run;
  }

  async runBranchPreparing(input) {
    const rootDir = input.rootDir;
    const run = input.run;
    const options = input.options || {};
    const policy = readBranchPolicy(rootDir);
    const detector = this.gitDetector.detect({ rootDir });

    if (options.noWorktree) {
      this.runService.updateBranch(rootDir, run.runId, {
        enabled: false,
        baseBranch: policy.baseBranch || detector.currentBranch || '',
        branchName: '',
        worktreeEnabled: false,
        worktreePath: '',
      }, rootDir);
      this.runService.appendEvent(rootDir, run.runId, 'branch_preparing_skipped', '已按 --no-worktree 跳过 branch / worktree 创建');
      return this.stateMachine.transition({
        rootDir,
        runId: run.runId,
        to: 'context_building',
        reason: '已跳过 worktree 创建，进入上下文构建',
      });
    }

    if (!detector.isGitRepository) {
      throw new Error('目标目录不是 Git 仓库，无法创建 branch / worktree');
    }

    const dirtyResult = await this.dirtyStrategyHandler.handle({
      repoRoot: detector.repoRoot,
      strategy: options.dirtyStrategy || policy.dirtyStrategy,
      runId: run.runId,
      requirementSummary: run.requirement.summary,
    });
    this.runService.appendEvent(rootDir, run.runId, 'dirty_strategy_handled', dirtyResult.message, {
      strategy: dirtyResult.strategy,
      patchPath: dirtyResult.patchPath,
      wipCommitHash: dirtyResult.wipCommitHash,
    });
    if (!dirtyResult.canContinue) {
      throw new Error(dirtyResult.message);
    }

    const worktreeResult = await this.worktreeManager.create({
      repoRoot: detector.repoRoot,
      baseBranch: options.baseBranch || policy.baseBranch || detector.currentBranch,
      branchPrefix: options.branchPrefix || policy.branchPrefix,
      worktreeRoot: options.worktreeRoot || policy.worktreeRoot,
      runId: run.runId,
      requirementSummary: run.requirement.summary,
    });
    if (!worktreeResult.created) {
      throw new Error((worktreeResult.errors[0] && worktreeResult.errors[0].message) || 'worktree 创建失败');
    }
    this.runService.updateBranch(rootDir, run.runId, {
      enabled: true,
      baseBranch: options.baseBranch || policy.baseBranch || detector.currentBranch,
      branchName: worktreeResult.branchName,
      worktreeEnabled: true,
      worktreePath: worktreeResult.worktreePath,
    }, rootDir);
    this.runService.appendEvent(rootDir, run.runId, 'worktree_created', 'branch / worktree 已创建', {
      branchName: worktreeResult.branchName,
    });
    return this.stateMachine.transition({
      rootDir,
      runId: run.runId,
      to: 'context_building',
      reason: 'branch / worktree 准备完成',
    });
  }

  async runContextBuilding(input) {
    const rootDir = input.rootDir;
    const run = this.runService.loadRun(rootDir, input.run.runId);
    const contextRoot = rootDir;
    const bundle = await buildContext({
      rootDir: contextRoot,
      stage: 'planning',
      options: { allowMissingOptionalAssets: true },
    });
    this.runService.updateContext(rootDir, run.runId, {
      stage: bundle.stage,
      tokenEstimate: bundle.tokenEstimate,
    });
    this.runService.appendEvent(rootDir, run.runId, 'context_built', 'planning ContextBundle 已构建', {
      inputTokens: bundle.tokenEstimate.inputTokens,
      warnings: bundle.warnings.length,
      errors: bundle.errors.length,
    });
    if (bundle.errors.length > 0) {
      throw new Error(`ContextBuilder 构建失败：${bundle.errors[0].message}`);
    }
    return this.stateMachine.transition({
      rootDir,
      runId: run.runId,
      to: 'human_review',
      reason: '上下文构建完成，当前等待人工审核',
    });
  }

  async runExecuting(input) {
    const rootDir = path.resolve(input.rootDir || process.cwd());
    const options = input.options || {};
    let run = this.runService.loadRun(rootDir, input.run.runId);
    if (run.state === 'human_review') {
      run = await this.stateMachine.transition({
        rootDir,
        runId: run.runId,
        to: 'executing',
        reason: '人工审核确认，进入执行器阶段',
      });
    }

    if (run.state !== 'executing') {
      throw new Error(`当前状态 ${run.state} 不能进入执行器阶段`);
    }

    const projectState = readProjectState(rootDir);
    const policy = projectState.policy || {};
    const worktreePath = resolveRecordedWorktreePath(rootDir, run.branch && run.branch.worktreePath);
    const bundle = await buildContext({
      rootDir,
      stage: 'implementation',
      options: { allowMissingOptionalAssets: true },
    });
    this.runService.updateContext(rootDir, run.runId, {
      stage: bundle.stage,
      tokenEstimate: bundle.tokenEstimate,
    });
    if (bundle.errors.length > 0) {
      this.runService.appendEvent(rootDir, run.runId, 'executor_context_failed', '执行器上下文构建失败', {
        error: bundle.errors[0].message,
      });
      return this.stateMachine.transition({
        rootDir,
        runId: run.runId,
        to: 'diagnosing',
        reason: `执行器上下文构建失败：${bundle.errors[0].message}`,
      });
    }

    run = this.runService.loadRun(rootDir, run.runId);
    const result = await this.executorRunner.run({
      run,
      projectRoot: rootDir,
      worktreePath,
      contextBundle: bundle,
      requirement: run.requirement.summary,
      stage: 'implementation',
      policy,
      mode: policy.execution?.mode || 'local-assisted',
      cliExecutor: options.executor || null,
      timeoutMs: options.timeoutMs,
      dryRun: options.dryRun === true,
      env: options.env || process.env,
      runService: this.runService,
    });
    const feedback = await this.runtimeFeedbackReporter.report(rootDir, this.runService.loadRun(rootDir, run.runId), result, {
      hubUrl: options.hubUrl,
    });
    if (feedback.warning) {
      this.runService.appendEvent(rootDir, run.runId, 'runtime_feedback_report_warning', feedback.warning, {
        code: feedback.code || 'RUNTIME_FEEDBACK_SKIPPED',
      });
    }
    this.runService.appendEvent(rootDir, run.runId, 'executor_finished', result.summary || '执行器阶段完成', {
      executor: result.selection ? result.selection.executor : null,
      status: result.status,
    });
    await this.visualReporter.reportHistory(rootDir, this.runService.loadRun(rootDir, run.runId), {
      visualUrl: options.visualUrl,
      historyId: `history:${run.runId}:executor_finished`,
      summary: result.summary || '执行器阶段完成',
      changedFiles: result.changedFiles || [],
    });

    if (result.success === true && result.status === 'succeeded') {
      return this.stateMachine.transition({
        rootDir,
        runId: run.runId,
        to: 'verifying',
        reason: '执行器执行成功，进入验证阶段',
      });
    }

    if (result.status === 'human_review_required' || result.status === 'skipped') {
      return this.stateMachine.transition({
        rootDir,
        runId: run.runId,
        to: 'human_review',
        reason: '执行器未执行真实编码，返回人工审核',
      });
    }

    return this.stateMachine.transition({
      rootDir,
      runId: run.runId,
      to: 'diagnosing',
      reason: result.error ? result.error.message : '执行器执行失败，进入诊断阶段',
    });
  }
}

function resolveRecordedWorktreePath(rootDir, recordedPath) {
  if (!recordedPath || recordedPath === '<external-path>') return null;
  if (path.isAbsolute(recordedPath)) return recordedPath;
  return path.resolve(rootDir, recordedPath);
}

module.exports = {
  StageRunner,
};
