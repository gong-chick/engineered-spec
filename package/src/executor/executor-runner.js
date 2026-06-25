const { ExecutorRegistry } = require('./executor-registry');
const { normalizeExecutionResult } = require('./executor-result-parser');
const { ExecutorSelector } = require('./executor-selector');
const { withExecutorTimeout } = require('./executor-timeout');
const {
  DEFAULT_EXECUTOR_TIMEOUT_MS,
  ExecutorStatus,
  createExecutorErrorResult,
} = require('./types');

class ExecutorRunner {
  constructor(options = {}) {
    this.registry = options.registry || new ExecutorRegistry();
    this.selector = options.selector || new ExecutorSelector();
  }

  async run(input = {}) {
    let selection;
    let prepareResult = null;
    try {
      selection = await this.selector.select({
        cliExecutor: input.cliExecutor || null,
        agentProfile: input.agentProfile || null,
        policy: input.policy || null,
        mode: input.mode || 'local-assisted',
        registry: input.registry || this.registry,
        projectRoot: input.projectRoot,
        worktreePath: input.worktreePath || null,
        env: input.env || process.env,
        dryRun: input.dryRun === true,
      });
    } catch (error) {
      const result = createExecutorErrorResult(
        error.code || 'EXECUTOR_SELECT_FAILED',
        error.message,
        error.suggestion || '请执行 ai-spec-auto executor check 查看可用执行器。'
      );
      result.selection = null;
      result.prepare = null;
      persistExecutorResult(input, result);
      return result;
    }

    try {
      if (input.dryRun !== true) {
        const availability = await selection.provider.checkAvailability({
          projectRoot: input.projectRoot,
          worktreePath: input.worktreePath || null,
          env: input.env || process.env,
        });
        if (!availability.available) {
          const result = createExecutorErrorResult(
            'EXECUTOR_NOT_AVAILABLE',
            availability.reason || '执行器不可用。',
            availability.fixSuggestion || '请切换执行器后重试。'
          );
          result.selection = selection;
          result.prepare = null;
          return result;
        }
      }

      prepareResult = await selection.provider.prepare({
        run: input.run,
        contextBundle: input.contextBundle,
        projectRoot: input.projectRoot,
        worktreePath: input.worktreePath || null,
        requirement: input.requirement,
        stage: input.stage || 'implementation',
      });
      if (!prepareResult || prepareResult.prepared !== true || (prepareResult.errors || []).length > 0) {
        const message = prepareResult && prepareResult.errors && prepareResult.errors[0]
          ? prepareResult.errors[0].message
          : '执行器 prepare 阶段失败。';
        const result = createExecutorErrorResult('EXECUTOR_PREPARE_FAILED', message, '请检查执行器任务文件写入权限和项目初始化状态。');
        result.selection = selection;
        result.prepare = prepareResult;
        return result;
      }

      const rawResult = await withExecutorTimeout(() => selection.provider.execute({
        run: input.run,
        projectRoot: input.projectRoot,
        worktreePath: input.worktreePath || null,
        instructionFilePath: prepareResult.instructionFilePath,
        executorInputPath: prepareResult.executorInputPath,
        timeoutMs: input.timeoutMs || DEFAULT_EXECUTOR_TIMEOUT_MS,
        dryRun: input.dryRun === true,
        env: input.env || process.env,
      }), input.timeoutMs || DEFAULT_EXECUTOR_TIMEOUT_MS);

      const result = normalizeExecutionResult(rawResult);
      result.selection = selection;
      result.prepare = prepareResult;
      persistExecutorResult(input, result);
      return result;
    } catch (error) {
      const isTimeout = error.code === 'EXECUTOR_TIMEOUT';
      const result = createExecutorErrorResult(
        error.code || 'EXECUTOR_RUN_FAILED',
        error.message || '执行器执行失败。',
        error.suggestion || '请查看 run.json 事件和执行器输出摘要。',
        isTimeout ? ExecutorStatus.TIMEOUT : ExecutorStatus.FAILED
      );
      result.selection = selection;
      result.prepare = prepareResult;
      persistExecutorResult(input, result);
      return result;
    }
  }
}

function persistExecutorResult(input, result) {
  if (!input.runService || !input.run || !input.run.runId || !input.projectRoot) return;
  input.runService.updateExecutor(input.projectRoot, input.run.runId, {
    type: result.selection ? result.selection.executor : null,
    status: result.status,
    selectionReason: result.selection ? result.selection.reason : '',
    fallbackTried: result.selection ? result.selection.fallbackTried : [],
    warnings: [
      ...((result.selection && result.selection.warnings) || []),
      ...((result.prepare && result.prepare.warnings) || []),
    ],
    prepared: result.prepare ? {
      executorInputPath: result.prepare.executorInputPath,
      instructionFilePath: result.prepare.instructionFilePath,
    } : null,
    lastResult: {
      success: result.success,
      status: result.status,
      summary: result.summary,
      error: result.error,
      changedFiles: result.changedFiles || [],
      tokenUsage: result.tokenUsage || null,
    },
  });
}

module.exports = {
  ExecutorRunner,
};
