const fs = require('fs');
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
  getExecutionRoot,
  renderCommonTaskMarkdown,
  runCommand,
  toRelative,
  writeText,
} = require('./base-provider-utils');

class ClaudeCodeExecutorProvider extends IExecutorProvider {
  get name() {
    return ExecutorType.CLAUDE_CODE;
  }

  get displayName() {
    return 'Claude Code';
  }

  get capabilities() {
    return [
      ExecutorCapability.READ,
      ExecutorCapability.WRITE,
      ExecutorCapability.SHELL,
      ExecutorCapability.TEST,
      ExecutorCapability.HEADLESS,
      ExecutorCapability.LONG_RUNNING,
    ];
  }

  async checkAvailability(input = {}) {
    const available = commandExists('claude', input.env || process.env);
    return {
      available,
      reason: available ? null : '未检测到 Claude Code CLI',
      fixSuggestion: available ? null : '请安装 Claude Code CLI，或切换为 codex / cursor。',
      version: available ? 'unknown' : null,
    };
  }

  async prepare(input = {}) {
    const executionRoot = getExecutionRoot(input.projectRoot, input.worktreePath);
    const runId = input.run && input.run.runId ? input.run.runId : 'unknown-run';
    const taskPath = path.join(executionRoot, '.ai-spec/runs', runId, 'claude-task.md');
    const warnings = [];
    if (!fs.existsSync(path.join(executionRoot, 'CLAUDE.md'))) {
      warnings.push({
        code: 'CLAUDE_POINTER_MISSING',
        message: '未检测到 CLAUDE.md，请先执行 init 或确认 Claude Code 指针文件。',
      });
    }
    writeText(taskPath, renderCommonTaskMarkdown(input, 'Claude Code'));
    return {
      prepared: true,
      executorInputPath: null,
      instructionFilePath: toRelative(executionRoot, taskPath),
      warnings,
      errors: [],
    };
  }

  async execute(input = {}) {
    if (input.dryRun) {
      return createExecutionResult({
        success: true,
        status: ExecutorStatus.SKIPPED,
        summary: 'Claude Code dry-run 已完成：仅生成任务文件，未调用真实外部命令。',
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

    const result = await runCommand('claude', ['--file', input.instructionFilePath], {
      cwd: getExecutionRoot(input.projectRoot, input.worktreePath),
      timeoutMs: input.timeoutMs,
      env: input.env || process.env,
    });
    if (!result.ok) {
      return createExecutionResult({
        success: false,
        status: result.timedOut ? ExecutorStatus.TIMEOUT : ExecutorStatus.FAILED,
        summary: result.timedOut ? 'Claude Code 执行超时。' : 'Claude Code 执行失败。',
        error: {
          code: result.timedOut ? 'EXECUTOR_TIMEOUT' : 'EXECUTOR_RUN_FAILED',
          message: result.stderr || result.message || 'Claude Code 执行失败。',
          suggestion: '请查看本地 Claude Code CLI 状态，或改用 dry-run / 其他执行器。',
        },
      });
    }
    return createExecutionResult({
      success: true,
      status: ExecutorStatus.SUCCEEDED,
      summary: 'Claude Code 执行完成。',
    });
  }

  async verify() {
    return { executed: false, passed: null, command: null, summary: '本轮未接入 Claude Code verify。' };
  }

  async cleanup() {
    return { cleaned: true, warnings: [] };
  }
}

module.exports = {
  ClaudeCodeExecutorProvider,
};
