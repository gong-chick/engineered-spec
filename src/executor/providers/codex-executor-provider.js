const path = require('path');
const {
  ExecutorCapability,
  ExecutorStatus,
  ExecutorType,
  IExecutorProvider,
  createExecutionResult,
} = require('../types');
const {
  commandExists,
  createCommonExecutorInput,
  getExecutionRoot,
  renderCommonTaskMarkdown,
  runCommand,
  toRelative,
  writeJson,
  writeText,
} = require('./base-provider-utils');

class CodexExecutorProvider extends IExecutorProvider {
  get name() {
    return ExecutorType.CODEX;
  }

  get displayName() {
    return 'Codex';
  }

  get capabilities() {
    return [
      ExecutorCapability.READ,
      ExecutorCapability.WRITE,
      ExecutorCapability.SHELL,
      ExecutorCapability.TEST,
      ExecutorCapability.HEADLESS,
      ExecutorCapability.LONG_RUNNING,
      ExecutorCapability.STRUCTURED_OUTPUT,
    ];
  }

  async checkAvailability(input = {}) {
    const available = commandExists('codex', input.env || process.env);
    return {
      available,
      reason: available ? null : '未检测到 Codex CLI',
      fixSuggestion: available ? null : '请安装 Codex CLI，或切换为 cursor / claude-code。',
      version: available ? 'unknown' : null,
    };
  }

  async prepare(input = {}) {
    const executionRoot = getExecutionRoot(input.projectRoot, input.worktreePath);
    const runId = input.run && input.run.runId ? input.run.runId : 'unknown-run';
    const dir = path.join(executionRoot, '.codex/tmp', runId);
    const executorInputPath = path.join(dir, 'executor-input.json');
    const instructionFilePath = path.join(dir, 'instructions.md');
    writeJson(executorInputPath, createCommonExecutorInput(input, this.name));
    writeText(instructionFilePath, renderCommonTaskMarkdown(input, 'Codex'));
    return {
      prepared: true,
      executorInputPath: toRelative(executionRoot, executorInputPath),
      instructionFilePath: toRelative(executionRoot, instructionFilePath),
      warnings: [],
      errors: [],
    };
  }

  async execute(input = {}) {
    if (input.dryRun) {
      return createExecutionResult({
        success: true,
        status: ExecutorStatus.SKIPPED,
        summary: 'Codex dry-run 已完成：仅生成任务文件，未调用真实外部命令。',
      });
    }

    const availability = await this.checkAvailability(input);
    if (!availability.available) {
      return createExecutionResult({
        success: false,
        status: ExecutorStatus.FAILED,
        summary: availability.reason,
        error: {
          code: 'EXECUTOR_NOT_AVAILABLE',
          message: availability.reason,
          suggestion: availability.fixSuggestion,
        },
      });
    }

    const result = await runCommand('codex', ['exec', '--input', input.executorInputPath || input.instructionFilePath], {
      cwd: getExecutionRoot(input.projectRoot, input.worktreePath),
      timeoutMs: input.timeoutMs,
      env: input.env || process.env,
    });
    if (!result.ok) {
      return createExecutionResult({
        success: false,
        status: result.timedOut ? ExecutorStatus.TIMEOUT : ExecutorStatus.FAILED,
        summary: result.timedOut ? 'Codex 执行超时。' : 'Codex 执行失败。',
        error: {
          code: result.timedOut ? 'EXECUTOR_TIMEOUT' : 'EXECUTOR_RUN_FAILED',
          message: result.stderr || result.message || 'Codex 执行失败。',
          suggestion: '请查看本地 Codex CLI 状态，或改用 dry-run / 其他执行器。',
        },
      });
    }
    return createExecutionResult({
      success: true,
      status: ExecutorStatus.SUCCEEDED,
      summary: 'Codex 执行完成。',
    });
  }

  async verify() {
    return { executed: false, passed: null, command: null, summary: '本轮未接入执行器 verify。' };
  }

  async cleanup() {
    return { cleaned: true, warnings: [] };
  }
}

module.exports = {
  CodexExecutorProvider,
};
